/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";

import { resolveCustomSound, fetchCustomSounds } from "./customSoundCache";
import { type SoundboardSound } from "../soundboard/board";

function pad(overrides: Partial<SoundboardSound> = {}): SoundboardSound {
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

describe("resolveCustomSound", () => {
  it("finds a pad by reaction name", () => {
    expect(resolveCustomSound("Air horn", [pad()])?.mxc).toBe("mxc://example.org/airhorn");
  });

  it("returns undefined for built-in names and v1 pads", () => {
    expect(resolveCustomSound("dog", [pad()])).toBeUndefined();
    expect(resolveCustomSound("Air horn", [pad({ emoji: "" })])).toBeUndefined();
  });
});

describe("fetchCustomSounds", () => {
  it("downloads each pad once and keys buffers by name", async () => {
    const download = vi.fn(() => Promise.resolve(new Uint8Array([1, 2]).buffer as ArrayBuffer));
    const pads = [pad(), pad({ id: "pad-2", name: "Drum", emoji: "🥁", mxc: "mxc://example.org/drum" })];
    const first = await fetchCustomSounds(download, pads);
    expect(Object.keys(first).sort()).toEqual(["Air horn", "Drum"]);
    expect(download).toHaveBeenCalledTimes(2);
    await fetchCustomSounds(download, pads);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("skips pads without an emoji and survives a failed download", async () => {
    const download = vi.fn((mxc: string) => {
      if (mxc.includes("bad")) return Promise.reject(new Error("nope"));
      return Promise.resolve(new Uint8Array([1]).buffer as ArrayBuffer);
    });
    const buffers = await fetchCustomSounds(download, [
      pad({ emoji: "" }),
      pad({ id: "bad", name: "Bad", mxc: "mxc://example.org/bad" }),
      pad({ id: "good", name: "Good", mxc: "mxc://example.org/good" }),
    ]);
    expect(Object.keys(buffers)).toEqual(["Good"]);
  });
});
