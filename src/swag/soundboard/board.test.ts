/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  SOUNDBOARD_EVENT_TYPE,
  SOUNDBOARD_LIMITS,
  addSound,
  parseBoard,
  removeSound,
  serializeBoard,
  validateSoundFile,
  type SoundboardSound,
} from "./board";

function sound(overrides: Partial<SoundboardSound> = {}): SoundboardSound {
  return {
    id: "one",
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

/** The on-the-wire shape: snake_case, as the spec's `sounds[]` entries. */
function wireSound(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "one",
    name: "Air horn",
    emoji: "📯",
    mxc: "mxc://example.org/airhorn",
    mimetype: "audio/ogg",
    size: 1234,
    duration_ms: 1500,
    added_by: "@alice:example.org",
    added_ts: 1_700_000_000_000,
    ...overrides,
  };
}

describe("SOUNDBOARD_EVENT_TYPE", () => {
  it("is the agreed event type", () => {
    expect(SOUNDBOARD_EVENT_TYPE).toBe("io.element.call.soundboard");
  });
});

describe("SOUNDBOARD_LIMITS", () => {
  it("holds the agreed limits", () => {
    expect(SOUNDBOARD_LIMITS).toEqual({ maxSounds: 32, maxBytes: 2 * 1024 * 1024, maxDurationMs: 30_000 });
  });
});

describe("parseBoard", () => {
  it("parses a valid board and maps the wire names", () => {
    const board = parseBoard({ version: 1, sounds: [wireSound()] });
    expect(board).toEqual([sound()]);
  });

  it("ignores unknown extra fields", () => {
    const board = parseBoard({
      version: 1,
      future: { anything: true },
      sounds: [wireSound({ colour: "red" })],
    });
    expect(board).toEqual([sound()]);
  });

  it("drops entries with the wrong field types", () => {
    const board = parseBoard({
      version: 1,
      sounds: [
        wireSound({ size: "1234" }),
        wireSound({ duration_ms: null }),
        wireSound({ added_ts: Number.NaN }),
        wireSound({ id: 7 }),
        wireSound({ name: 42 }),
      ],
    });
    expect(board).toEqual([]);
  });

  it("drops entries with missing fields", () => {
    const { name: _name, ...withoutName } = wireSound();
    const { mxc: _mxc, ...withoutMxc } = wireSound();
    const board = parseBoard({ version: 1, sounds: [withoutName, withoutMxc] });
    expect(board).toEqual([]);
  });

  it("returns an empty board when sounds is not an array", () => {
    expect(parseBoard({ version: 1, sounds: "nope" })).toEqual([]);
    expect(parseBoard({ version: 1, sounds: {} })).toEqual([]);
    expect(parseBoard({ version: 1 })).toEqual([]);
  });

  it("never throws on hostile content", () => {
    expect(parseBoard(null)).toEqual([]);
    expect(parseBoard(undefined)).toEqual([]);
    expect(parseBoard("board")).toEqual([]);
    expect(parseBoard(42)).toEqual([]);
    expect(parseBoard([])).toEqual([]);
  });

  it("keeps a hostile oversized name (the UI truncates it later)", () => {
    const name = "a".repeat(1024 * 1024);
    const board = parseBoard({ version: 1, sounds: [wireSound({ name })] });
    expect(board).toHaveLength(1);
    expect(board[0].name).toHaveLength(name.length);
  });

  it("drops entries over the byte or duration limit and keeps the rest", () => {
    const board = parseBoard({
      version: 1,
      sounds: [
        wireSound({ id: "ok" }),
        wireSound({ id: "huge", size: SOUNDBOARD_LIMITS.maxBytes + 1 }),
        wireSound({ id: "long", duration_ms: SOUNDBOARD_LIMITS.maxDurationMs + 1 }),
      ],
    });
    expect(board.map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("keeps entries exactly at the limits", () => {
    const board = parseBoard({
      version: 1,
      sounds: [
        wireSound({
          size: SOUNDBOARD_LIMITS.maxBytes,
          duration_ms: SOUNDBOARD_LIMITS.maxDurationMs,
        }),
      ],
    });
    expect(board).toHaveLength(1);
  });

  it("caps the board at the pad limit", () => {
    const sounds = Array.from({ length: SOUNDBOARD_LIMITS.maxSounds + 1 }, (_, i) =>
      wireSound({ id: `pad-${i}` }),
    );
    expect(parseBoard({ version: 1, sounds })).toHaveLength(SOUNDBOARD_LIMITS.maxSounds);
  });

  it("round-trips the emoji through serialize and parse", () => {
    const board = [sound({ emoji: "🥁" })];
    expect(parseBoard(serializeBoard(board))).toEqual(board);
  });

  it("maps a missing emoji (v1 board) to an empty string", () => {
    const { emoji: _emoji, ...withoutEmoji } = wireSound();
    const board = parseBoard({ version: 1, sounds: [withoutEmoji] });
    expect(board).toHaveLength(1);
    expect(board[0].emoji).toBe("");
  });

  it("drops entries with a non-string or over-long emoji", () => {
    const board = parseBoard({
      version: 2,
      sounds: [
        wireSound({ id: "bad-type", emoji: 42 }),
        wireSound({ id: "too-long", emoji: "a".repeat(9) }),
        wireSound({ id: "ok", emoji: "👍" }),
      ],
    });
    expect(board.map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("still parses version 1 content", () => {
    const board = parseBoard({ version: 1, sounds: [wireSound({ emoji: "📯" })] });
    expect(board).toHaveLength(1);
    expect(board[0].emoji).toBe("📯");
  });
});

describe("serializeBoard", () => {
  it("round-trips through parseBoard", () => {
    const board = [sound(), sound({ id: "two", name: "Buzzer" })];
    expect(parseBoard(serializeBoard(board))).toEqual(board);
  });

  it("writes the agreed content shape", () => {
    expect(serializeBoard([sound()])).toEqual({ version: 2, sounds: [wireSound()] });
  });

  it("rounds a fractional duration to an integer: Matrix content must not contain floats", () => {
    // Decoded audio durations are fractional seconds, so durationMs is
    // fractional too — and Synapse answers M_BAD_JSON to a float in event
    // content. The wire value must be an integer for any input.
    const serialized = serializeBoard([sound({ durationMs: 1234.56789 })]);
    expect(serialized.sounds[0].duration_ms).toBe(1235);
    expect(Number.isInteger(serialized.sounds[0].duration_ms)).toBe(true);
  });
});

describe("addSound", () => {
  it("appends a new sound", () => {
    const board = addSound([], sound());
    expect(board).toEqual([sound()]);
  });

  it("replaces a sound with the same id", () => {
    const board = addSound([sound()], sound({ name: "Louder air horn" }));
    expect(board).toHaveLength(1);
    expect(board[0].name).toBe("Louder air horn");
  });

  it("rejects a 33rd pad", () => {
    const full = Array.from({ length: SOUNDBOARD_LIMITS.maxSounds }, (_, i) => sound({ id: `pad-${i}` }));
    const board = addSound(full, sound({ id: "one-too-many" }));
    expect(board).toHaveLength(SOUNDBOARD_LIMITS.maxSounds);
    expect(board.some((s) => s.id === "one-too-many")).toBe(false);
  });

  it("still replaces by id when the board is full", () => {
    const full = Array.from({ length: SOUNDBOARD_LIMITS.maxSounds }, (_, i) => sound({ id: `pad-${i}` }));
    const board = addSound(full, sound({ id: "pad-0", name: "Changed" }));
    expect(board).toHaveLength(SOUNDBOARD_LIMITS.maxSounds);
    expect(board.find((s) => s.id === "pad-0")?.name).toBe("Changed");
  });
});

describe("removeSound", () => {
  it("removes by id and leaves the rest", () => {
    const board = removeSound([sound(), sound({ id: "two" })], "one");
    expect(board).toEqual([sound({ id: "two" })]);
  });

  it("is a no-op for an unknown id", () => {
    expect(removeSound([sound()], "missing")).toEqual([sound()]);
  });
});

describe("validateSoundFile", () => {
  it("rejects an over-size file", () => {
    expect(validateSoundFile({ size: SOUNDBOARD_LIMITS.maxBytes + 1, durationMs: 1000 })).toMatch(/2 MB/);
  });

  it("rejects an over-duration file", () => {
    expect(validateSoundFile({ size: 1000, durationMs: SOUNDBOARD_LIMITS.maxDurationMs + 1 })).toMatch(
      /30 seconds/,
    );
  });

  it("accepts a file at the limits", () => {
    expect(
      validateSoundFile({ size: SOUNDBOARD_LIMITS.maxBytes, durationMs: SOUNDBOARD_LIMITS.maxDurationMs }),
    ).toBeNull();
  });
});
