/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  asyncScheduler,
  finalize,
  map,
  type Observable,
  of,
  type SchedulerLike,
  switchMap,
  throttleTime,
  timer,
} from "rxjs";

import { type HostBridge } from "../../HostBridge";
import { type ObservableScope } from "../../state/ObservableScope";
import { logger } from "matrix-js-sdk/lib/logger";

/** At most one update per 2 seconds. */
export const SPEAKING_THROTTLE_MS = 2000;
/** Re-send the current speaker set every 10 s while it is non-empty. */
export const SPEAKING_HEARTBEAT_MS = 10_000;

/**
 * Pipe `speaking$` (the user-ID list) to the host bridge with throttling,
 * heartbeating, and a final empty set on teardown.
 *
 * The heartbeat sits **downstream** of the throttle so it is never throttled
 * away. A rejected `notifySpeaking` is logged once; every later rejection is
 * swallowed.
 *
 * @param scheduler - Optional scheduler for `throttleTime` and `timer`.
 *   Defaults to `asyncScheduler` (real clock). Tests can inject a virtual
 *   scheduler to avoid real-time delays.
 */
export function sendSpeakingUpdates(
  scope: ObservableScope,
  roomId: string,
  speaking$: Observable<string[]>,
  hostBridge: HostBridge,
  scheduler: SchedulerLike = asyncScheduler,
): void {
  let errorLogged = false;

  function send(userIds: string[]): void {
    hostBridge
      .notifySpeaking({ roomId, userIds, ts: Date.now() })
      .catch((err: unknown) => {
        if (!errorLogged) {
          errorLogged = true;
          logger.warn("notifySpeaking failed, further errors swallowed", err);
        }
      });
  }

  speaking$
    .pipe(
      throttleTime(SPEAKING_THROTTLE_MS, scheduler, {
        leading: true,
        trailing: true,
      }),
      switchMap((userIds) =>
        userIds.length === 0
          ? of(userIds)
          : timer(0, SPEAKING_HEARTBEAT_MS, scheduler).pipe(map(() => userIds)),
      ),
      scope.bind(),
      finalize(() => { send([]); }),
    )
    .subscribe((userIds) => send(userIds));
}