/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The 100 emojis the add-sound dialog offers, rendered as a 5-wide grid.
 * The built-in reaction emojis come first so the board feels familiar.
 */
export const CURATED_EMOJIS: string[] = [
  "👋", "👍", "🎉", "👏", "🐶",
  "🐱", "💡", "🦗", "👎", "👌",
  "😵‍💫", "🥰", "😄", "🦌", "🤘",
  "🥁", "😂", "🤣", "😍", "😎",
  "🤔", "😭", "😡", "🥳", "😴",
  "🔥", "❤️", "💔", "⭐", "🌟",
  "🎶", "🎵", "🎸", "🎤", "🎺",
  "📯", "🔔", "🎁", "🏆", "⚽",
  "🏀", "🎮", "🚀", "✈️", "🚗",
  "⏰", "💰", "📣", "🍕", "🍔",
  "🍩", "☕", "🍺", "🎂", "🍎",
  "🐕", "🐈", "🦁", "🐸", "🐵",
  "🦄", "🐝", "🦋", "🐙", "🐳",
  "🌈", "☀️", "❄️", "🌙", "⚡",
  "💧", "🌸", "🌵", "🍀", "🎃",
  "🎄", "💀", "👻", "🤖", "👽",
  "💩", "🙈", "🙉", "🙊", "💯",
  "✅", "❌", "‼️", "💤", "💭",
  "👀", "🧠", "🎯", "🧨", "🛎️",
  "🥊", "🏓", "⛳", "🎲", "🧸",
];

/** True when the value is one of the 100 offered emojis. */
export function isCuratedEmoji(value: string): boolean {
  return CURATED_EMOJIS.includes(value);
}
