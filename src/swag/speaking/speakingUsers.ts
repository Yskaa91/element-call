/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  of,
  switchMap,
} from "rxjs";

/** A user media view-model subset: enough to read the speaking state. */
export interface SpeakingUserMedia {
  userId: string;
  speaking$: Observable<boolean>;
}

/**
 * The sorted, deduplicated list of user IDs currently speaking.
 *
 * `switchMap` on the incoming media list, so membership changes re-subscribe
 * immediately. An empty media list emits `[]` once.
 */
export function speakingUserIds$(
  userMedia$: Observable<readonly SpeakingUserMedia[]>,
): Observable<string[]> {
  return userMedia$.pipe(
    switchMap((media) => {
      if (media.length === 0) return of<string[]>([]);

      return combineLatest(
        media.map((m) =>
          m.speaking$.pipe(
            map((speaking) => (speaking ? m.userId : null)),
          ),
        ),
      ).pipe(
        map((entries) => entries.filter(Boolean) as string[]),
        map((ids) => [...ids].sort()),
        distinctUntilChanged(
          (prev, curr) =>
            prev.length === curr.length &&
            prev.every((id, i) => id === curr[i]),
        ),
      );
    }),
  );
}