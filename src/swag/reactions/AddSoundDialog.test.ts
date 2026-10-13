/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { validateNewPad } from "./AddSoundDialog";
import { CURATED_EMOJIS } from "./emojiList";
import { SOUNDBOARD_LIMITS } from "../soundboard/board";

function file(size: number): File {
  return new File([new Uint8Array(size)], "horn.ogg", { type: "audio/ogg" });
}

describe("validateNewPad", () => {
  it("accepts a curated emoji, a name and a small file", () => {
    expect(
      validateNewPad({
        emoji: CURATED_EMOJIS[0],
        name: "Horn",
        file: file(1000),
        durationMs: 1000,
        full: false,
      }),
    ).toBeNull();
  });

  it("rejects an emoji outside the curated list", () => {
    expect(
      validateNewPad({
        emoji: "not-an-emoji",
        name: "Horn",
        file: file(1000),
        durationMs: 1000,
        full: false,
      }),
    ).toMatch(/emoji/i);
  });

  it("rejects an empty name", () => {
    expect(
      validateNewPad({
        emoji: CURATED_EMOJIS[0],
        name: "   ",
        file: file(1000),
        durationMs: 1000,
        full: false,
      }),
    ).toMatch(/name/i);
  });

  it("rejects an over-size file without decoding it", () => {
    expect(
      validateNewPad({
        emoji: CURATED_EMOJIS[0],
        name: "Horn",
        file: file(SOUNDBOARD_LIMITS.maxBytes + 1),
        durationMs: 0,
        full: false,
      }),
    ).toMatch(/2 MB/);
  });

  it("rejects an over-duration file", () => {
    expect(
      validateNewPad({
        emoji: CURATED_EMOJIS[0],
        name: "Horn",
        file: file(1000),
        durationMs: SOUNDBOARD_LIMITS.maxDurationMs + 1,
        full: false,
      }),
    ).toMatch(/30 seconds/);
  });

  it("rejects a new pad when the board is full", () => {
    expect(
      validateNewPad({
        emoji: CURATED_EMOJIS[0],
        name: "Horn",
        file: file(1000),
        durationMs: 1000,
        full: true,
      }),
    ).toMatch(/full/i);
  });
});
