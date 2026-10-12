/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { TestScheduler } from "rxjs/testing";
import { type Observable } from "rxjs";

import { speakingUserIds$, type SpeakingUserMedia } from "./speakingUsers";

function scheduler(): TestScheduler {
  return new TestScheduler((actual, expected) =>
    expect(actual).toEqual(expected),
  );
}

describe("speakingUserIds$", () => {
  it("returns empty array for empty media list", () => {
    scheduler().run(({ cold, expectObservable }) => {
      // Use cold to stay inside virtual time
      const userMedia$ = cold("a-", { a: [] as SpeakingUserMedia[] });
      const result$ = speakingUserIds$(userMedia$);
      expectObservable(result$).toBe("a-", { a: [] });
    });
  });

  it("yields the userId when one user speaks", () => {
    scheduler().run(({ cold, expectObservable }) => {
      const speaking$ = cold("a-", {
        a: true,
      }) as unknown as Observable<boolean>;
      const media: SpeakingUserMedia[] = [{ userId: "@alice:hs", speaking$ }];
      const userMedia$ = cold("a-", { a: media });
      const result$ = speakingUserIds$(userMedia$);
      expectObservable(result$).toBe("a-", { a: ["@alice:hs"] });
    });
  });

  it("yields both ids sorted when both speak", () => {
    scheduler().run(({ cold, expectObservable }) => {
      const alice$ = cold("a-", {
        a: true,
      }) as unknown as Observable<boolean>;
      const bob$ = cold("a-", {
        a: true,
      }) as unknown as Observable<boolean>;
      const media: SpeakingUserMedia[] = [
        { userId: "@bob:hs", speaking$: bob$ },
        { userId: "@alice:hs", speaking$: alice$ },
      ];
      const userMedia$ = cold("a-", { a: media });
      const result$ = speakingUserIds$(userMedia$);
      expectObservable(result$).toBe("a-", {
        a: ["@alice:hs", "@bob:hs"],
      });
    });
  });

  it("removes a user who goes silent", () => {
    scheduler().run(({ cold, expectObservable }) => {
      // Both start speaking at frame 0, alice goes silent at frame 2, bob at frame 3
      const alice$ = cold("a-b", {
        a: true,
        b: false,
      }) as unknown as Observable<boolean>;
      const bob$ = cold("a-b", {
        a: true,
        b: false,
      }) as unknown as Observable<boolean>;
      const media: SpeakingUserMedia[] = [
        { userId: "@alice:hs", speaking$: alice$ },
        { userId: "@bob:hs", speaking$: bob$ },
      ];
      const userMedia$ = cold("a-", { a: media });
      const result$ = speakingUserIds$(userMedia$);
      expectObservable(result$).toBe("a-(bc)", {
        a: ["@alice:hs", "@bob:hs"],
        b: ["@bob:hs"],
        c: [],
      });
    });
  });

  it("deduplicates identical consecutive sets", () => {
    scheduler().run(({ cold, expectObservable }) => {
      const alice$ = cold("aa-", {
        a: true,
      }) as unknown as Observable<boolean>;
      const media: SpeakingUserMedia[] = [
        { userId: "@alice:hs", speaking$: alice$ },
      ];
      const userMedia$ = cold("a-", { a: media });
      const result$ = speakingUserIds$(userMedia$);
      // Only one emission: distinctUntilChanged suppresses the duplicate
      expectObservable(result$).toBe("a-", { a: ["@alice:hs"] });
    });
  });
});