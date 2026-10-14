/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Setting } from "../../settings/settings.ts";

export const NOISE_CANCELLATION_MODES = [
  "deepfilternet",
  "browser",
  "gtcrn",
  "off",
] as const;

export type NoiseCancellationMode = (typeof NOISE_CANCELLATION_MODES)[number];

export const noiseCancellationSetting = new Setting<NoiseCancellationMode>(
  "noise-cancellation-mode",
  "deepfilternet",
);

export function isNoiseCancellationMode(
  value: unknown,
): value is NoiseCancellationMode {
  return (
    typeof value === "string" &&
    (NOISE_CANCELLATION_MODES as readonly unknown[]).includes(value)
  );
}

/**
 * Raw localStorage values survive upgrades, so anything unknown, legacy or
 * hostile resolves to the default rather than throwing.
 */
export function readNoiseCancellationMode(): NoiseCancellationMode {
  const value: unknown = noiseCancellationSetting.getValue();
  return isNoiseCancellationMode(value) ? value : "deepfilternet";
}

export interface MicProcessingToggles {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

/**
 * The contract the settings-UI copy describes: `browser` keeps the three
 * toggles, `deepfilternet` and `gtcrn` replace browser noise suppression with
 * their denoiser stage, `off` disables all browser processing.
 */
export function micProcessingOptions(
  mode: NoiseCancellationMode,
  toggles: MicProcessingToggles,
): MicProcessingToggles {
  switch (mode) {
    case "browser":
      return { ...toggles };
    case "deepfilternet":
    case "gtcrn":
      return { ...toggles, noiseSuppression: false };
    case "off":
      return {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      };
  }
}
