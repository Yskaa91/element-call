/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

const STORAGE_KEY = "swag.playbackVolumes";

/**
 * Receiver-side per-user volumes, remembered between call sessions on this
 * device. A plain localStorage map from Matrix user ID to the last committed
 * slider volume (0 to 1). Receiver preference is local by nature, so it does
 * not sync across devices.
 */
function readAll(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * The stored volume for a user, or 1 (full) when nothing valid was stored.
 */
export function readStoredVolume(userId: string): number {
  const stored = readAll()[userId];
  return typeof stored === "number" && stored >= 0 && stored <= 1 ? stored : 1;
}

/**
 * Remembers a user's committed slider volume. Mute-for-me stays session-local
 * by design: only the slider value is stored, never the muted state.
 */
export function writeStoredVolume(userId: string, volume: number): void {
  if (!Number.isFinite(volume) || volume <= 0 || volume > 1) return;
  try {
    const all = readAll();
    all[userId] = volume;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full or unavailable (private mode): volume just won't persist.
  }
}
