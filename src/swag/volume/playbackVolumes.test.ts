/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, beforeEach } from "vitest";

import { readStoredVolume, writeStoredVolume } from "./playbackVolumes";

beforeEach(() => localStorage.clear());

describe("playback volume storage", () => {
  test("defaults to full volume for unknown users", () => {
    expect(readStoredVolume("@nobody:example.org")).toBe(1);
  });

  test("round-trips a committed volume", () => {
    writeStoredVolume("@alice:example.org", 0.4);
    expect(readStoredVolume("@alice:example.org")).toBe(0.4);
    // Other users are unaffected.
    expect(readStoredVolume("@bob:example.org")).toBe(1);
  });

  test("ignores out-of-range and non-numeric stored values", () => {
    localStorage.setItem(
      "swag.playbackVolumes",
      JSON.stringify({ "@a:x": -1, "@b:x": 2, "@c:x": "loud" }),
    );
    expect(readStoredVolume("@a:x")).toBe(1);
    expect(readStoredVolume("@b:x")).toBe(1);
    expect(readStoredVolume("@c:x")).toBe(1);
  });

  test("never stores muting (zero) or garbage", () => {
    writeStoredVolume("@alice:example.org", 0.4);
    writeStoredVolume("@alice:example.org", 0);
    writeStoredVolume("@alice:example.org", NaN);
    expect(readStoredVolume("@alice:example.org")).toBe(0.4);
  });
});
