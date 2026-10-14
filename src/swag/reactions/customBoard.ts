/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactionOption } from "../../reactions";
import { type SoundboardSound } from "../soundboard/board";

/** A board pad as the menu renders it: the pad id survives the merge. */
export interface CustomReactionOption extends ReactionOption {
  padId: string;
}

/**
 * Suffixes a pad name until it is unique on the board.
 *
 * Names key menu rows, delete matching and receipt playback, so two pads
 * must never share one. The result never exceeds the 100-character
 * stored-name cap, suffix included.
 */
export function uniquePadName(pads: { name: string }[], name: string): string {
  const taken = new Set(pads.map((existing) => existing.name));
  const cap = 100;
  let n = 1;
  let candidate = name.slice(0, cap);
  while (taken.has(candidate)) {
    n += 1;
    const suffix = ` (${n})`;
    candidate = `${name.slice(0, cap - suffix.length)}${suffix}`;
  }
  return candidate;
}

/**
 * Merges space-board pads after the built-in reactions.
 *
 * Pads without an emoji (v1 boards predate the field) are hidden: they stay
 * in the event untouched, and appear once re-added with an emoji. Custom
 * audio resolution lives in `customSoundCache.ts`; entries here carry name +
 * emoji so the send path (`useReactionsSender`) needs no changes. The pad id
 * is kept so delete/playback never confuse two pads with the same name.
 */
export function mergeCustomReactions(
  builtin: ReactionOption[],
  customs: SoundboardSound[],
): (ReactionOption | CustomReactionOption)[] {
  const pads: CustomReactionOption[] = [];
  for (const pad of customs) {
    if (pad.emoji === "") continue;
    pads.push({ emoji: pad.emoji, name: pad.name, padId: pad.id });
  }
  return [...builtin, ...pads];
}
