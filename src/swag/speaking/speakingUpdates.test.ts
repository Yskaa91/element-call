/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TestScheduler } from "rxjs/testing";
import { Subject } from "rxjs";

import {
  sendSpeakingUpdates,
  SPEAKING_THROTTLE_MS,
} from "./speakingUpdates";
import { type HostBridge, type SpeakingState } from "../../HostBridge";
import { ObservableScope } from "../../state/ObservableScope";
import { logger } from "matrix-js-sdk/lib/logger";

function mockHostBridge(): HostBridge & { sent: SpeakingState[] } {
  const sent: SpeakingState[] = [];
  const bridge = {
    notifySpeaking: vi.fn(async (state: SpeakingState) => {
      sent.push(state);
    }),
    notifyJoined: vi.fn(),
    notifyHungUp: vi.fn(),
    notifyDeviceMute: vi.fn(),
    setAlwaysOnScreen: vi.fn(),
    contentLoaded: vi.fn(),
    themeChange$: new Subject(),
    join$: new Subject(),
    hangUp$: new Subject(),
    deviceMute$: new Subject(),
    supportsProfileChanges: false,
    canReact: false,
    canSendEncrypted: false,
  } as unknown as HostBridge;
  return Object.assign(bridge, { sent });
}

function makeScheduler(): TestScheduler {
  return new TestScheduler((actual, expected) =>
    expect(actual).toEqual(expected),
  );
}

/** Flush virtual time to a specific frame (TestScheduler type omits the arg). */
function flushTo(s: TestScheduler, frame: number): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TestScheduler type omits maxFrame param
  (s as any).flush(frame);
}

describe("sendSpeakingUpdates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the first non-empty set immediately (leading edge)", () => {
    const s = makeScheduler();
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge, s);
    speaking$.next(["@alice:hs"]);
    flushTo(s, 100);
    scope.end();

    const nonEmpty = hostBridge.sent.filter((x) => x.userIds.length > 0);
    expect(nonEmpty[0].userIds).toEqual(["@alice:hs"]);
    expect(nonEmpty[0].roomId).toBe("!room:test");
    expect(nonEmpty[0].ts).toBeTypeOf("number");
  });

  it("throttles rapid updates: leading + trailing within one SPEAKING_THROTTLE_MS window", () => {
    const s = makeScheduler();
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge, s);

    speaking$.next(["@alice:hs"]);
    speaking$.next(["@alice:hs", "@bob:hs"]);
    speaking$.next(["@bob:hs"]);
    flushTo(s, SPEAKING_THROTTLE_MS);
    scope.end();

    expect(hostBridge.sent.length).toBeGreaterThanOrEqual(1);
    expect(hostBridge.sent.length).toBeLessThanOrEqual(2);
  });

  it("re-sends a non-empty set via the heartbeat timer", () => {
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);
    speaking$.next(["@alice:hs"]);

    // Real time: timer(0, 10000) re-emits after 10 s. Virtual time with
    // timer(0, 10000) causes infinite reschedule in TestScheduler (OOM),
    // so this test uses real timers.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        scope.end();
        const nonEmpty = hostBridge.sent.filter((x) => x.userIds.length > 0);
        expect(nonEmpty.length).toBeGreaterThanOrEqual(2);
        resolve();
      }, 10_500);
    });
  }, 15_000);

  it("sends the empty set via leading edge, then silence (no heartbeat while idle)", () => {
    const s = makeScheduler();
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge, s);

    speaking$.next(["@alice:hs"]);
    flushTo(s, SPEAKING_THROTTLE_MS);

    speaking$.next([]);
    flushTo(s, SPEAKING_THROTTLE_MS);

    const countAfterEmpty = hostBridge.sent.length;
    flushTo(s, SPEAKING_THROTTLE_MS);
    expect(hostBridge.sent.length).toBe(countAfterEmpty);

    scope.end();
  });

  it("rejects notifySpeaking: logs once then swallows", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const s = makeScheduler();
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    (hostBridge.notifySpeaking as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        throw new Error("widget rejected");
      },
    );

    const speaking$ = new Subject<string[]>();
    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge, s);

    speaking$.next(["@alice:hs"]);
    speaking$.next(["@bob:hs"]);
    flushTo(s, SPEAKING_THROTTLE_MS);
    scope.end();

    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe(
      "notifySpeaking failed, further errors swallowed",
    );
  });

  it("sends a final empty set on scope disposal", () => {
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);
    speaking$.next(["@alice:hs"]);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        scope.end();

        const emptySends = hostBridge.sent.filter(
          (x) => x.userIds.length === 0,
        );
        expect(emptySends).toHaveLength(1);
        expect(emptySends[0].roomId).toBe("!room:test");
        resolve();
      }, 50);
    });
  });
});