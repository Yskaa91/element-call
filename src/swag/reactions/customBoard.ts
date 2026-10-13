/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactionOption } from "../../reactions";
import { type SoundboardSound } from "../soundboard/board";

/**
 * Merges space-board pads after the built-in reactions.
 *
 * Pads without an emoji (v1 boards predate the field) are hidden: they stay
 * in the event untouched, and appear once edited with an emoji. Custom audio
 * resolution lives in `customSoundCache.ts`; entries here carry name + emoji
 * so the send path (`useReactionsSender`) needs no changes.
 */
export function mergeCustomReactions(
  builtin: ReactionOption[],
  customs: SoundboardSound[],
): ReactionOption[] {
  const pads: ReactionOption[] = [];
  for (const pad of customs) {
    if (pad.emoji === "") continue;
    pads.push({ emoji: pad.emoji, name: pad.name });
  }
  return [...builtin, ...pads];
}
