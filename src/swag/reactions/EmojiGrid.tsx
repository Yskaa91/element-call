/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";

import { CURATED_EMOJIS } from "./emojiList";

/**
 * The 100 offered emojis as a 5-wide scrollable grid (20 rows max).
 *
 * Plain buttons, not CpdButton: 100 compound buttons would each mount a
 * tooltip + ripple. The surrounding dialog labels the grid instead.
 */
export const EmojiGrid: FC<{
  value: string;
  onPick: (emoji: string) => void;
}> = ({ value, onPick }) => (
  <div
    role="listbox"
    aria-label="Emoji"
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 4,
      maxHeight: 240,
      overflowY: "auto",
    }}
  >
    {CURATED_EMOJIS.map((emoji) => (
      <button
        key={emoji}
        type="button"
        role="option"
        aria-selected={value === emoji}
        onClick={() => onPick(emoji)}
        data-testid={`emoji-pick-${emoji}`}
        style={{
          fontSize: 24,
          padding: 6,
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          background:
            value === emoji
              ? "var(--cpd-color-bg-action-primary-rest)"
              : "transparent",
        }}
      >
        {emoji}
      </button>
    ))}
  </div>
);
