/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isNoiseCancellationMode,
  micProcessingOptions,
  NOISE_CANCELLATION_MODES,
  type NoiseCancellationMode,
} from "./mode.ts";

const STORAGE_KEY = "matrix-setting-noise-cancellation-mode";

const allOn = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const allOff = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/**
 * `Setting` reads `localStorage` once, when the module-level instance is
 * constructed, so a test that writes the raw key first must go through a
 * fresh module instance to be observed.
 */
async function importMode() {
  vi.resetModules();
  return await import("./mode.ts");
}

afterEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("isNoiseCancellationMode", () => {
  it("accepts the three mode literals", () => {
    expect(NOISE_CANCELLATION_MODES).toEqual(["browser", "gtcrn", "off"]);
    expect(NOISE_CANCELLATION_MODES.map(isNoiseCancellationMode)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("rejects everything else", () => {
    expect(isNoiseCancellationMode("gtcrn ")).toBe(false);
    expect(isNoiseCancellationMode("")).toBe(false);
    expect(isNoiseCancellationMode(null)).toBe(false);
    expect(isNoiseCancellationMode(1)).toBe(false);
    expect(isNoiseCancellationMode({})).toBe(false);
    expect(isNoiseCancellationMode(["browser"])).toBe(false);
  });
});

describe("readNoiseCancellationMode", () => {
  it("returns a valid stored value", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("gtcrn"));
    const { readNoiseCancellationMode } = await importMode();
    expect(readNoiseCancellationMode()).toBe("gtcrn");
  });

  it("falls back to the default for an unknown or drifted stored value", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("nope"));
    const { readNoiseCancellationMode } = await importMode();
    expect(readNoiseCancellationMode()).toBe("gtcrn");

    localStorage.setItem(STORAGE_KEY, JSON.stringify("gtcrn "));
    const { readNoiseCancellationMode: readDrifted } = await importMode();
    expect(readDrifted()).toBe("gtcrn");
  });

  it("falls back to the default for a hostile stored value", async () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    const { readNoiseCancellationMode } = await importMode();
    expect(readNoiseCancellationMode()).toBe("gtcrn");
  });
});

describe("micProcessingOptions", () => {
  const cases: [NoiseCancellationMode, typeof allOn, typeof allOn][] = [
    ["browser", allOn, allOn],
    ["browser", allOff, allOff],
    ["gtcrn", allOn, { echoCancellation: true, noiseSuppression: false, autoGainControl: true }],
    ["gtcrn", allOff, allOff],
    ["off", allOn, allOff],
    ["off", allOff, allOff],
  ];

  it.each(cases)("%s with %j", (mode, toggles, expected) => {
    expect(micProcessingOptions(mode, { ...toggles })).toEqual(expected);
  });
});
