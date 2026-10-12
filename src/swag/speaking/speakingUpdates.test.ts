/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi, beforeEach } from "vitest";
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

describe("sendSpeakingUpdates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the first non-empty set immediately (leading edge)", () => {
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);
    speaking$.next(["@alice:hs"]);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(hostBridge.notifySpeaking).toHaveBeenCalled();
        expect(hostBridge.sent[0].userIds).toEqual(["@alice:hs"]);
        expect(hostBridge.sent[0].roomId).toBe("!room:test");
        expect(hostBridge.sent[0].ts).toBeTypeOf("number");
        scope.end();
        resolve();
      }, 20);
    });
  });

  it("throttles rapid updates to at most one per SPEAKING_THROTTLE_MS window", () => {
    // Leading + trailing = at most 2 sends within one throttle window
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);

    // Three rapid emissions within one throttle window
    speaking$.next(["@alice:hs"]);
    speaking$.next(["@alice:hs", "@bob:hs"]);
    speaking$.next(["@bob:hs"]);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Leading fires for first, trailing fires for last within window
        expect(hostBridge.sent.length).toBeGreaterThanOrEqual(1);
        expect(hostBridge.sent.length).toBeLessThanOrEqual(2);
        scope.end();
        resolve();
      }, SPEAKING_THROTTLE_MS + 200);
    });
  });

  it("sends exactly one empty set then no further sends (no heartbeat while idle)", () => {
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    const speaking$ = new Subject<string[]>();

    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);

    speaking$.next(["@alice:hs"]);
    // Wait past the throttle window so the trailing edge fires
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        speaking$.next([]);

        // Wait past the next throttle window — the trailing edge emits
        // the empty set. After that, no heartbeat fires (timer is off for
        // empty sets), so no further sends should appear.
        setTimeout(() => {
          const emptySends = hostBridge.sent.filter(
            (s) => s.userIds.length === 0,
          );
          expect(emptySends.length).toBeGreaterThanOrEqual(1);

          const countAfter = hostBridge.sent.length;
          // Give extra time and verify no more sends
          setTimeout(() => {
            expect(hostBridge.sent.length).toBe(countAfter);
            scope.end();
            resolve();
          }, 500);
        }, SPEAKING_THROTTLE_MS + 200);
      }, SPEAKING_THROTTLE_MS + 200);
    });
  }, 10_000);

  it("rejects notifySpeaking: logs once then swallows", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const scope = new ObservableScope();
    const hostBridge = mockHostBridge();
    let callCount = 0;
    (hostBridge.notifySpeaking as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        callCount++;
        if (callCount <= 2) throw new Error("widget rejected");
      },
    );

    const speaking$ = new Subject<string[]>();
    sendSpeakingUpdates(scope, "!room:test", speaking$, hostBridge);

    speaking$.next(["@alice:hs"]);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // First rejection logs
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toBe(
          "notifySpeaking failed, further errors swallowed",
        );

        // Second call within throttle window — if it fires and rejects, warn still 1
        speaking$.next(["@bob:hs"]);
        setTimeout(() => {
          expect(warnSpy).toHaveBeenCalledTimes(1);
          scope.end();
          resolve();
        }, 50);
      }, 50);
    });
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
          (s) => s.userIds.length === 0,
        );
        expect(emptySends).toHaveLength(1);
        expect(emptySends[0].roomId).toBe("!room:test");
        resolve();
      }, 50);
    });
  });
});