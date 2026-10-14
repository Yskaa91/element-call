/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
  HIDDEN_BUILTINS_LIMIT,
  SOUNDBOARD_EVENT_TYPE,
  SOUNDBOARD_LIMITS,
  addSound,
  hideBuiltin,
  parseBoard,
  removeSound,
  serializeBoard,
  validateSoundFile,
  type SoundboardBoard,
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

function board(overrides: Partial<SoundboardBoard> = {}): SoundboardBoard {
  return { sounds: [sound()], hiddenBuiltins: [], ...overrides };
}

/** The on-the-wire shape: snake_case, as the spec's `sounds[]` entries. */
function wireSound(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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

function wireBoard(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 3,
    sounds: [wireSound()],
    hidden_builtins: [],
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
    expect(SOUNDBOARD_LIMITS).toEqual({
      maxSounds: 32,
      maxBytes: 2 * 1024 * 1024,
      maxDurationMs: 30_000,
    });
  });
});

describe("parseBoard", () => {
  it("parses a valid board and maps the wire names", () => {
    expect(parseBoard({ version: 3, sounds: [wireSound()] })).toEqual(board());
  });

  it("ignores unknown extra fields", () => {
    expect(
      parseBoard({
        version: 3,
        future: { anything: true },
        sounds: [wireSound({ colour: "red" })],
      }),
    ).toEqual(board());
  });

  it("drops entries with the wrong field types", () => {
    expect(
      parseBoard({
        version: 3,
        sounds: [
          wireSound({ size: "1234" }),
          wireSound({ duration_ms: null }),
          wireSound({ added_ts: Number.NaN }),
          wireSound({ id: 7 }),
          wireSound({ name: 42 }),
        ],
      }),
    ).toEqual(board({ sounds: [] }));
  });

  it("drops entries with missing fields", () => {
    const withoutName = wireSound();
    delete withoutName.name;
    const withoutMxc = wireSound();
    delete withoutMxc.mxc;
    expect(
      parseBoard({ version: 3, sounds: [withoutName, withoutMxc] }),
    ).toEqual(board({ sounds: [] }));
  });

  it("returns an empty board when sounds is not an array", () => {
    const empty = board({ sounds: [] });
    expect(parseBoard({ version: 3, sounds: "nope" })).toEqual(empty);
    expect(parseBoard({ version: 3, sounds: {} })).toEqual(empty);
    expect(parseBoard({ version: 3 })).toEqual(empty);
  });

  it("never throws on hostile content", () => {
    const empty = board({ sounds: [] });
    expect(parseBoard(null)).toEqual(empty);
    expect(parseBoard(undefined)).toEqual(empty);
    expect(parseBoard("board")).toEqual(empty);
    expect(parseBoard(42)).toEqual(empty);
    expect(parseBoard([])).toEqual(empty);
  });

  it("keeps a hostile oversized name (the UI truncates it later)", () => {
    const name = "a".repeat(1024 * 1024);
    const parsed = parseBoard({ version: 3, sounds: [wireSound({ name })] });
    expect(parsed.sounds).toHaveLength(1);
    expect(parsed.sounds[0].name).toHaveLength(name.length);
  });

  it("drops entries over the byte or duration limit and keeps the rest", () => {
    const parsed = parseBoard({
      version: 3,
      sounds: [
        wireSound({ id: "ok" }),
        wireSound({ id: "huge", size: SOUNDBOARD_LIMITS.maxBytes + 1 }),
        wireSound({
          id: "long",
          duration_ms: SOUNDBOARD_LIMITS.maxDurationMs + 1,
        }),
      ],
    });
    expect(parsed.sounds.map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("keeps entries exactly at the limits", () => {
    const parsed = parseBoard({
      version: 3,
      sounds: [
        wireSound({
          size: SOUNDBOARD_LIMITS.maxBytes,
          duration_ms: SOUNDBOARD_LIMITS.maxDurationMs,
        }),
      ],
    });
    expect(parsed.sounds).toHaveLength(1);
  });

  it("caps the board at the pad limit", () => {
    const sounds = Array.from(
      { length: SOUNDBOARD_LIMITS.maxSounds + 1 },
      (_, i) => wireSound({ id: `pad-${i}` }),
    );
    expect(parseBoard({ version: 3, sounds }).sounds).toHaveLength(
      SOUNDBOARD_LIMITS.maxSounds,
    );
  });

  it("round-trips the emoji through serialize and parse", () => {
    const expected = board({ sounds: [sound({ emoji: "🥁" })] });
    expect(parseBoard(serializeBoard(expected))).toEqual(expected);
  });

  it("maps a missing emoji (v1 board) to an empty string", () => {
    const withoutEmoji = wireSound();
    delete withoutEmoji.emoji;
    const parsed = parseBoard({ version: 1, sounds: [withoutEmoji] });
    expect(parsed.sounds).toHaveLength(1);
    expect(parsed.sounds[0].emoji).toBe("");
  });

  it("drops entries with a non-string or over-long emoji", () => {
    const parsed = parseBoard({
      version: 2,
      sounds: [
        wireSound({ id: "bad-type", emoji: 42 }),
        wireSound({ id: "too-long", emoji: "a".repeat(9) }),
        wireSound({ id: "ok", emoji: "👍" }),
      ],
    });
    expect(parsed.sounds.map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("still parses version 1 content", () => {
    const parsed = parseBoard({
      version: 1,
      sounds: [wireSound({ emoji: "📯" })],
    });
    expect(parsed.sounds).toHaveLength(1);
    expect(parsed.sounds[0].emoji).toBe("📯");
  });

  it("parses hidden built-ins", () => {
    expect(
      parseBoard(wireBoard({ hidden_builtins: ["thumbsup", "party"] })),
    ).toEqual(board({ hiddenBuiltins: ["thumbsup", "party"] }));
  });

  it("defaults hidden built-ins to empty when missing", () => {
    const content = wireBoard();
    delete content.hidden_builtins;
    expect(parseBoard(content)).toEqual(board());
  });

  it("drops hostile hidden built-ins without throwing", () => {
    const empty = board({ sounds: [] });
    expect(
      parseBoard({ version: 3, sounds: [], hidden_builtins: "nope" }),
    ).toEqual(empty);
    expect(parseBoard({ version: 3, sounds: [], hidden_builtins: 42 })).toEqual(
      empty,
    );
    expect(
      parseBoard({
        version: 3,
        sounds: [],
        hidden_builtins: ["ok", "", 42, null, "a".repeat(65), "ok"],
      }),
    ).toEqual({ sounds: [], hiddenBuiltins: ["ok"] });
  });

  it("dedupes and caps hidden built-ins", () => {
    const hidden = Array.from(
      { length: HIDDEN_BUILTINS_LIMIT + 10 },
      (_, i) => `reaction-${i}`,
    );
    const parsed = parseBoard({
      version: 3,
      sounds: [],
      hidden_builtins: [...hidden, "reaction-0"],
    });
    expect(parsed.hiddenBuiltins).toHaveLength(HIDDEN_BUILTINS_LIMIT);
    expect(new Set(parsed.hiddenBuiltins).size).toBe(HIDDEN_BUILTINS_LIMIT);
  });
});

describe("serializeBoard", () => {
  it("round-trips through parseBoard", () => {
    const expected = board({
      sounds: [sound(), sound({ id: "two", name: "Buzzer" })],
      hiddenBuiltins: ["thumbsup"],
    });
    expect(parseBoard(serializeBoard(expected))).toEqual(expected);
  });

  it("writes the agreed content shape", () => {
    expect(serializeBoard(board())).toEqual(wireBoard());
  });

  it("rounds a fractional duration to an integer: Matrix content must not contain floats", () => {
    // Decoded audio durations are fractional seconds, so durationMs is
    // fractional too — and Synapse answers M_BAD_JSON to a float in event
    // content. The wire value must be an integer for any input.
    const serialized = serializeBoard(
      board({ sounds: [sound({ durationMs: 1234.56789 })] }),
    );
    expect(serialized.sounds[0].duration_ms).toBe(1235);
    expect(Number.isInteger(serialized.sounds[0].duration_ms)).toBe(true);
  });
});

describe("hideBuiltin", () => {
  it("hides a built-in name", () => {
    expect(hideBuiltin(board(), "thumbsup")).toEqual(
      board({ hiddenBuiltins: ["thumbsup"] }),
    );
  });

  it("is idempotent", () => {
    const hidden = hideBuiltin(board(), "thumbsup");
    expect(hideBuiltin(hidden, "thumbsup")).toEqual(hidden);
  });

  it("ignores misshapen names", () => {
    expect(hideBuiltin(board(), "")).toEqual(board());
    expect(hideBuiltin(board(), "a".repeat(65))).toEqual(board());
  });

  it("stops at the cap", () => {
    const full = board({
      hiddenBuiltins: Array.from(
        { length: HIDDEN_BUILTINS_LIMIT },
        (_, i) => `reaction-${i}`,
      ),
    });
    expect(hideBuiltin(full, "one-more")).toEqual(full);
  });
});

describe("addSound", () => {
  it("appends a new sound", () => {
    expect(addSound([], sound())).toEqual([sound()]);
  });

  it("replaces a sound with the same id", () => {
    const updated = addSound([sound()], sound({ name: "Louder air horn" }));
    expect(updated).toHaveLength(1);
    expect(updated[0].name).toBe("Louder air horn");
  });

  it("rejects a 33rd pad", () => {
    const full = Array.from({ length: SOUNDBOARD_LIMITS.maxSounds }, (_, i) =>
      sound({ id: `pad-${i}` }),
    );
    const updated = addSound(full, sound({ id: "one-too-many" }));
    expect(updated).toHaveLength(SOUNDBOARD_LIMITS.maxSounds);
    expect(updated.some((s) => s.id === "one-too-many")).toBe(false);
  });

  it("still replaces by id when the board is full", () => {
    const full = Array.from({ length: SOUNDBOARD_LIMITS.maxSounds }, (_, i) =>
      sound({ id: `pad-${i}` }),
    );
    const updated = addSound(full, sound({ id: "pad-0", name: "Changed" }));
    expect(updated).toHaveLength(SOUNDBOARD_LIMITS.maxSounds);
    expect(updated.find((s) => s.id === "pad-0")?.name).toBe("Changed");
  });
});

describe("removeSound", () => {
  it("removes by id and leaves the rest", () => {
    expect(removeSound([sound(), sound({ id: "two" })], "one")).toEqual([
      sound({ id: "two" }),
    ]);
  });

  it("is a no-op for an unknown id", () => {
    expect(removeSound([sound()], "missing")).toEqual([sound()]);
  });
});

describe("validateSoundFile", () => {
  it("rejects an over-size file", () => {
    expect(
      validateSoundFile({
        size: SOUNDBOARD_LIMITS.maxBytes + 1,
        durationMs: 1000,
      }),
    ).toMatch(/2 MB/);
  });

  it("rejects an over-duration file", () => {
    expect(
      validateSoundFile({
        size: 1000,
        durationMs: SOUNDBOARD_LIMITS.maxDurationMs + 1,
      }),
    ).toMatch(/30 seconds/);
  });

  it("accepts a file at the limits", () => {
    expect(
      validateSoundFile({
        size: SOUNDBOARD_LIMITS.maxBytes,
        durationMs: SOUNDBOARD_LIMITS.maxDurationMs,
      }),
    ).toBeNull();
  });
});
