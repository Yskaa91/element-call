/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { useTranslation } from "react-i18next";

import { CURATED_EMOJIS } from "./emojiList";
import styles from "./EmojiGrid.module.css";

/**
 * The 100 offered emojis as a 5-wide scrollable grid (20 rows max).
 *
 * Plain buttons, not CpdButton: 100 compound buttons would each mount a
 * tooltip + ripple. The surrounding dialog labels the grid instead.
 */
export const EmojiGrid: FC<{
  value: string;
  onPick: (emoji: string) => void;
}> = ({ value, onPick }) => {
  const { t } = useTranslation();
  return (
    <div
      role="listbox"
      aria-label={t("action.emoji", "Emoji")}
      className={styles.grid}
    >
      {CURATED_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="option"
          aria-selected={value === emoji}
          data-selected={value === emoji}
          onClick={() => onPick(emoji)}
          data-testid={`emoji-pick-${emoji}`}
          className={styles.pick}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
