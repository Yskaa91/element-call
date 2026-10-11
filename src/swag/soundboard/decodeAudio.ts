/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * One lazily created context for decoding pad audio.
 *
 * Decoding does not need the graph the processor builds, and the board's files
 * are small, so a single shared context is enough. Keeping it out of the
 * processor means a pad can be measured (for the duration limit) even before a
 * microphone track exists.
 */
let context: AudioContext | undefined;

/** Decodes encoded audio data for the soundboard. */
export function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  context ??= new AudioContext();
  return context.decodeAudioData(data);
}
