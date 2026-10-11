/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The soundboard's board state event and its schema.
 *
 * The board lives as one custom state event in the *space* room, with the
 * empty state key. Pad audio lives in the media repository and is referenced
 * by MXC URI. This module owns the wire schema and the limits; it holds no
 * network code, so it can be parsed and tested on its own.
 */

/** The board's event type, in the space room, with the empty state key. */
export const SOUNDBOARD_EVENT_TYPE = "io.element.call.soundboard";

/** One pad: an uploaded sound and who added it. */
export interface SoundboardSound {
  id: string;
  name: string;
  mxc: string;
  mimetype: string;
  size: number;
  durationMs: number;
  addedBy: string;
  addedTs: number;
}

/** What the board will accept. Enforced on add and when parsing. */
export const SOUNDBOARD_LIMITS = {
  maxSounds: 32,
  maxBytes: 2 * 1024 * 1024,
  maxDurationMs: 30_000,
} as const;

/** The on-the-wire entry, in the spec's snake_case. */
interface WireSound {
  id: string;
  name: string;
  mxc: string;
  mimetype: string;
  size: number;
  duration_ms: number;
  added_by: string;
  added_ts: number;
}

/** The on-the-wire board content. */
export interface SoundboardBoardContent {
  version: 1;
  sounds: WireSound[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseSound(entry: unknown): SoundboardSound | null {
  if (typeof entry !== "object" || entry === null) return null;
  const {
    id,
    name,
    mxc,
    mimetype,
    size,
    duration_ms: durationMs,
    added_by: addedBy,
    added_ts: addedTs,
  } = entry as Record<string, unknown>;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof name !== "string") return null;
  if (typeof mxc !== "string") return null;
  if (typeof mimetype !== "string") return null;
  if (!isFiniteNumber(size) || size < 0) return null;
  if (!isFiniteNumber(durationMs) || durationMs < 0) return null;
  // A hostile board entry must not survive parsing just because its numbers
  // are well-typed: a 50 MB / 10 minute pad is exactly the attack the limits
  // exist for, and the download/play path trusts what parseBoard returns.
  if (size > SOUNDBOARD_LIMITS.maxBytes) return null;
  if (durationMs > SOUNDBOARD_LIMITS.maxDurationMs) return null;
  if (typeof addedBy !== "string") return null;
  if (!isFiniteNumber(addedTs)) return null;
  return { id, name, mxc, mimetype, size, durationMs, addedBy, addedTs };
}

/**
 * Reads a board from an unknown state event content.
 *
 * Never throws: anything that is not a board, any entry that does not have
 * every field with the right type, and any entry over the byte or duration
 * limit is dropped. Names are deliberately not length-checked here — a hostile
 * name must not take the board down, and the UI truncates what it renders.
 */
export function parseBoard(content: unknown): SoundboardSound[] {
  if (typeof content !== "object" || content === null) return [];
  const sounds = (content as { sounds?: unknown }).sounds;
  if (!Array.isArray(sounds)) return [];

  const parsed: SoundboardSound[] = [];
  for (const entry of sounds) {
    const sound = parseSound(entry);
    if (sound !== null) parsed.push(sound);
    if (parsed.length >= SOUNDBOARD_LIMITS.maxSounds) break;
  }
  return parsed;
}

/** Writes a board in the shape `parseBoard` reads back. */
export function serializeBoard(sounds: SoundboardSound[]): SoundboardBoardContent {
  return {
    version: 1,
    sounds: sounds.map((sound) => ({
      id: sound.id,
      name: sound.name,
      mxc: sound.mxc,
      mimetype: sound.mimetype,
      size: sound.size,
      duration_ms: sound.durationMs,
      added_by: sound.addedBy,
      added_ts: sound.addedTs,
    })),
  };
}

/**
 * Adds a pad, replacing any pad with the same id.
 *
 * Returns the board unchanged when it is already full and the pad is new, so
 * the caller can tell that the pad was rejected.
 */
export function addSound(board: SoundboardSound[], sound: SoundboardSound): SoundboardSound[] {
  const existing = board.findIndex((candidate) => candidate.id === sound.id);
  if (existing >= 0) {
    const next = [...board];
    next[existing] = sound;
    return next;
  }
  if (board.length >= SOUNDBOARD_LIMITS.maxSounds) return board;
  return [...board, sound];
}

/** Removes a pad by id; unknown ids are ignored. */
export function removeSound(board: SoundboardSound[], id: string): SoundboardSound[] {
  return board.filter((sound) => sound.id !== id);
}

/**
 * Checks a chosen file against the board's limits.
 *
 * Returns a reason to show the user, or null when the file is acceptable.
 */
export function validateSoundFile(file: { size: number; durationMs: number }): string | null {
  if (file.size > SOUNDBOARD_LIMITS.maxBytes) return "Sound files must be 2 MB or smaller";
  if (file.durationMs > SOUNDBOARD_LIMITS.maxDurationMs) return "Sound files must be 30 seconds or shorter";
  return null;
}
