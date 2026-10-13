/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { type ReactionOption } from "../../reactions";
import { CURATED_EMOJIS, isCuratedEmoji } from "./emojiList";
import { mergeCustomReactions } from "./customBoard";
import { type SoundboardSound } from "../soundboard/board";

function builtin(): ReactionOption[] {
  return [
    { emoji: "👍", name: "thumbsup" },
    { emoji: "🎉", name: "party" },
  ];
}

function custom(overrides: Partial<SoundboardSound> = {}): SoundboardSound {
  return {
    id: "pad-1",
    name: "Air horn",
    emoji: "📯",
    mxc: "mxc://example.org/airhorn",
    mimetype: "audio/ogg",
    size: 1234,
    durationMs: 1500,
    addedBy: "@alice:example.org",
    addedTs: 1_700_000_000_000,
    ...overrides,
  };
}

describe("CURATED_EMOJIS", () => {
  it("holds exactly 100 unique emojis", () => {
    expect(CURATED_EMOJIS).toHaveLength(100);
    expect(new Set(CURATED_EMOJIS).size).toBe(100);
  });
});

describe("isCuratedEmoji", () => {
  it("accepts list members and rejects the rest", () => {
    expect(isCuratedEmoji(CURATED_EMOJIS[0])).toBe(true);
    expect(isCuratedEmoji("not-an-emoji")).toBe(false);
    expect(isCuratedEmoji("")).toBe(false);
  });
});

describe("mergeCustomReactions", () => {
  it("appends custom pads after the built-ins, in board order", () => {
    const merged = mergeCustomReactions(builtin(), [
      custom({ emoji: "📯", name: "Air horn" }),
      custom({ id: "pad-2", emoji: "🥁", name: "Drum" }),
    ]);
    expect(merged.map((r) => r.name)).toEqual([
      "thumbsup",
      "party",
      "Air horn",
      "Drum",
    ]);
    expect(merged[2].emoji).toBe("📯");
  });

  it("hides v1 pads without an emoji", () => {
    const merged = mergeCustomReactions(builtin(), [custom({ emoji: "" })]);
    expect(merged).toEqual(builtin());
  });
});
