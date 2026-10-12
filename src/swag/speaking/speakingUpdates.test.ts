/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";

import {
  sendSpeakingUpdates,
  SPEAKING_HEARTBEAT_MS,
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
  } as unknown as HostBridge;
  return Object.assign(bridge, { sent });
}

describe("sendSpeakingUpdates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends the first non-empty set immediately (leading edge)", async () => {
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);
    speaking$.next(["@alice:hs"]);

    await vi.advanceTimersByTimeAsync(1);

    const nonEmpty = hostBridge.sent.filter((x) => x.userIds.length > 0);
    expect(nonEmpty).toHaveLength(1);
    expect(nonEmpty[0].userIds).toEqual(["@alice:hs"]);
    expect(nonEmpty[0].roomId).toBe("!room:test");
    expect(nonEmpty[0].ts).toBeTypeOf("number");

    scope.end();
  });

  it("throttles rapid toggling to one leading and one trailing send per window", async () => {
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);

    speaking$.next(["@alice:hs"]);
    speaking$.next(["@alice:hs", "@bob:hs"]);
    speaking$.next(["@bob:hs"]);

    await vi.advanceTimersByTimeAsync(SPEAKING_THROTTLE_MS + 1);

    const nonEmpty = hostBridge.sent.filter((x) => x.userIds.length > 0);
    // Leading edge emits the first value immediately; trailing edge emits the
    // last value once the throttle window closes. No per-toggle sends.
    expect(nonEmpty).toHaveLength(2);
    expect(nonEmpty[0].userIds).toEqual(["@alice:hs"]);
    expect(nonEmpty[1].userIds).toEqual(["@bob:hs"]);

    scope.end();
  });

  it("re-sends a non-empty set every SPEAKING_HEARTBEAT_MS", async () => {
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);
    speaking$.next(["@alice:hs"]);

    await vi.advanceTimersByTimeAsync(3 * SPEAKING_HEARTBEAT_MS + 1);

    const nonEmpty = hostBridge.sent.filter((x) => x.userIds.length > 0);
    // Leading edge plus one heartbeat per 10 s: t=0, 10 s, 20 s, 30 s.
    expect(nonEmpty).toHaveLength(4);
    for (let i = 1; i < nonEmpty.length; i++) {
      const gap = nonEmpty[i].ts - nonEmpty[i - 1].ts;
      expect(gap).toBeGreaterThanOrEqual(SPEAKING_HEARTBEAT_MS - 1000);
      expect(gap).toBeLessThanOrEqual(SPEAKING_HEARTBEAT_MS + 1000);
    }

    scope.end();
  });

  it("sends the empty set exactly once, then stays silent while idle", async () => {
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);

    speaking$.next(["@alice:hs"]);
    // Let the throttle window close so the empty set arrives as a fresh
    // leading edge rather than a suppressed trailing value.
    await vi.advanceTimersByTimeAsync(SPEAKING_THROTTLE_MS + 1);

    speaking$.next([]);
    // Sixty idle seconds: a heartbeat firing on an empty set would show up as
    // a second empty send here.
    await vi.advanceTimersByTimeAsync(60_000);

    const emptySends = hostBridge.sent.filter((x) => x.userIds.length === 0);
    expect(emptySends).toHaveLength(1);

    scope.end();
  });

  it("logs once when notifySpeaking rejects twice", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const notifySpeaking = vi.mocked(hostBridge.notifySpeaking);
    notifySpeaking.mockRejectedValue(new Error("widget rejected"));
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);

    // Leading edge rejects immediately; trailing edge rejects at window close.
    speaking$.next(["@alice:hs"]);
    speaking$.next(["@bob:hs"]);
    await vi.advanceTimersByTimeAsync(SPEAKING_THROTTLE_MS);

    await Promise.resolve();
    await Promise.resolve();

    expect(notifySpeaking).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe(
      "notifySpeaking failed, further errors swallowed",
    );

    scope.end();
  });

  it("sends a final empty set on scope disposal", async () => {
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);
    speaking$.next(["@alice:hs"]);
    await vi.advanceTimersByTimeAsync(1);

    scope.end();

    const emptySends = hostBridge.sent.filter((x) => x.userIds.length === 0);
    expect(emptySends).toHaveLength(1);
    expect(emptySends[0].roomId).toBe("!room:test");
    expect(emptySends[0].userIds).toEqual([]);
  });
});
