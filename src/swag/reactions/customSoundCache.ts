/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type SoundboardSound } from "../soundboard/board";

/** Finds the custom pad behind a received reaction name, if any. */
export function resolveCustomSound(
  name: string,
  pads: SoundboardSound[],
): SoundboardSound | undefined {
  return pads.find((pad) => pad.emoji !== "" && pad.name === name);
}

const bufferCache = new Map<string, ArrayBuffer>();

/**
 * Downloads custom pads into name-keyed raw buffers for the audio engine.
 *
 * The download returns raw bytes (the caller adapts `downloadMedia`'s Blob),
 * which keeps this free of DOM APIs and trivially testable. Buffers are
 * cached by MXC URI, so a re-render or a repeated reaction never
 * re-downloads. A pad that fails to download is skipped: its reaction falls
 * back to the generic sound in the renderer.
 */
export async function fetchCustomSounds(
  download: (mxc: string) => Promise<ArrayBuffer>,
  pads: SoundboardSound[],
): Promise<Record<string, ArrayBuffer>> {
  const buffers: Record<string, ArrayBuffer> = {};
  await Promise.all(
    pads
      .filter((pad) => pad.emoji !== "")
      .map(async (pad) => {
        try {
          let raw = bufferCache.get(pad.mxc);
          if (raw === undefined) {
            raw = await download(pad.mxc);
            bufferCache.set(pad.mxc, raw);
          }
          buffers[pad.name] = raw;
        } catch {
          // Skip: the renderer falls back to the generic sound.
        }
      }),
  );
  return buffers;
}
