/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ChangeEvent, type FC, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button as CpdButton } from "@vector-im/compound-web";
import { AttachmentIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { Modal } from "../../Modal";
import { FieldRow, InputField } from "../../input/Input";
import { isCuratedEmoji } from "./emojiList";
import { validateSoundFile } from "../soundboard/board";
import { EmojiGrid } from "./EmojiGrid";
import styles from "./AddSoundDialog.module.css";

export interface NewPad {
  emoji: string;
  name: string;
  file: File;
}

/**
 * Checks an add-dialog submission before anything is uploaded.
 *
 * Returns a reason to show the user, or null when the pad is acceptable.
 * The size check runs on the raw file so an over-size pick is rejected
 * without decoding it first.
 */
export function validateNewPad(input: {
  emoji: string;
  name: string;
  file: File;
  durationMs: number;
  full: boolean;
}): string | null {
  if (!isCuratedEmoji(input.emoji)) return "Pick an emoji for the sound";
  if (input.name.trim().length === 0) return "Give the sound a name";
  if (input.full) return "The board is full";
  return validateSoundFile({
    size: input.file.size,
    durationMs: input.durationMs,
  });
}

/**
 * The add-sound dialog: emoji grid, name field, audio file picker.
 *
 * Uploading and duration-measuring happen in the caller (`useCustomBoard`),
 * so this stays a dumb form: it reports the validated triple on submit.
 */
export const AddSoundDialog: FC<{
  open: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (pad: NewPad) => void;
}> = ({ open, error, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const [emoji, setEmoji] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const picked = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (picked) setFile(picked);
  };

  const canSubmit = emoji !== "" && name.trim() !== "" && file !== null;

  return (
    <Modal open={open} title={t("action.add_sound")} onDismiss={onClose}>
      <div className={styles.form}>
        <EmojiGrid value={emoji} onPick={setEmoji} />
        <FieldRow>
          <InputField
            type="text"
            id="add-sound-name"
            label={t("action.sound_name", "Sound name")}
            value={name}
            placeholder="Horn"
            onChange={(event) => setName(event.target.value)}
            data-testid="add-sound-name"
          />
        </FieldRow>
        <div className={styles.fileRow}>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            aria-label={t("action.sound_file", "Sound file")}
            onChange={onFileChange}
            data-testid="add-sound-file"
            className={styles.fileInput}
          />
          <CpdButton
            kind="secondary"
            Icon={AttachmentIcon}
            onClick={() => fileInput.current?.click()}
          >
            {t("action.choose_audio_file", "Choose audio file")}
          </CpdButton>
          <span className={styles.fileName}>
            {file?.name ?? t("action.choose_audio_file", "Choose audio file")}
          </span>
        </div>
        {error !== null && (
          <p
            role="alert"
            data-testid="add-sound-error"
            className={styles.error}
          >
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <CpdButton
            kind="tertiary"
            onClick={onClose}
            data-testid="add-sound-cancel"
          >
            {t("action.cancel", "Cancel")}
          </CpdButton>
          <CpdButton
            kind="primary"
            disabled={!canSubmit}
            onClick={() => {
              if (file) onSubmit({ emoji, name: name.trim(), file });
            }}
            data-testid="add-sound-submit"
          >
            {t("action.add", "Add")}
          </CpdButton>
        </div>
      </div>
    </Modal>
  );
};
