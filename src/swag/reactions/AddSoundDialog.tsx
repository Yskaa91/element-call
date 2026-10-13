/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ChangeEvent, type FC, useState } from "react";

import { Modal } from "../../Modal";
import { isCuratedEmoji } from "./emojiList";
import { validateSoundFile } from "../soundboard/board";
import { EmojiGrid } from "./EmojiGrid";

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
  const [emoji, setEmoji] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const picked = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (picked) setFile(picked);
  };

  const canSubmit = emoji !== "" && name.trim() !== "" && file !== null;

  return (
    <Modal open={open} title="Add sound" onDismiss={onClose}>
      <EmojiGrid value={emoji} onPick={setEmoji} />
      <label>
        <span>Name</span>
        <input
          type="text"
          value={name}
          maxLength={100}
          placeholder="Horn"
          onChange={(event) => setName(event.target.value)}
          data-testid="add-sound-name"
        />
      </label>
      <label>
        <input
          type="file"
          accept="audio/*"
          onChange={onFileChange}
          data-testid="add-sound-file"
        />
        <span>{file?.name ?? "Choose audio file"}</span>
      </label>
      {error !== null && (
        <p role="alert" data-testid="add-sound-error">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => {
          if (file) onSubmit({ emoji, name: name.trim(), file });
        }}
        data-testid="add-sound-submit"
      >
        Add
      </button>
    </Modal>
  );
};
