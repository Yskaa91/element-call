/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useEffect, useState } from "react";

import { useClient } from "../../ClientContext.tsx";
import { ReactionSet } from "../../reactions";
import {
  SOUNDBOARD_LIMITS,
  addSound,
  hideBuiltin as hideBuiltinInBoard,
  removeSound,
  validateSoundFile,
  type SoundboardBoard,
  type SoundboardSound,
} from "../soundboard/board";
import {
  createSoundboardClient,
  type SoundboardClient,
} from "../soundboard/boardClient";
import { decodeAudio } from "../soundboard/decodeAudio";
import { uniquePadName } from "./customBoard";
import { useSoundboardWidget } from "../soundboard/SoundboardWidgetContext";
import { type NewPad } from "./AddSoundDialog";

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const EMPTY_BOARD: SoundboardBoard = { sounds: [], hiddenBuiltins: [] };

/**
 * A random upload name keeping the original extension.
 *
 * The media repository stores the file under this name, so the user's
 * filename (which may identify them) never reaches the server. The pad's
 * display name still comes from the dialog input.
 */
export function randomUploadName(original: string): string {
  const dot = original.lastIndexOf(".");
  const ext = dot < 0 || dot === original.length - 1 ? "" : original.slice(dot);
  return `${crypto.randomUUID()}${ext}`;
}

/**
 * The space board behind the Reactions menu.
 *
 * Loads the board for the call room's space, refreshes it live while the menu
 * is open, and writes adds/removes/hides back. Returns an empty board (not an
 * error) when Element Call runs standalone or the room has no space parent:
 * the menu then shows built-ins only, with no edit controls.
 */
export function useCustomBoard(roomId: string): {
  pads: SoundboardSound[];
  hiddenBuiltins: string[];
  error: string | null;
  editable: boolean;
  add: (pad: NewPad) => Promise<void>;
  remove: (id: string) => Promise<void>;
  hideBuiltin: (name: string) => Promise<void>;
} {
  const widget = useSoundboardWidget();
  const { client: matrixClient } = useClient();
  const [client, setClient] = useState<SoundboardClient | null>(null);
  const [board, setBoard] = useState<SoundboardBoard>(EMPTY_BOARD);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (widget === null) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const refresh = async (boardClient: SoundboardClient): Promise<void> => {
      try {
        const next = await boardClient.load();
        if (!cancelled) setBoard(next);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not read the board");
      }
    };
    createSoundboardClient(widget.api, roomId)
      .then((boardClient) => {
        if (cancelled || boardClient === null) return;
        setClient(boardClient);
        unsubscribe = boardClient.subscribe(() => void refresh(boardClient));
        void refresh(boardClient);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not reach the board",
          );
      });
    return (): void => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [widget, roomId]);

  const add = useCallback(
    async (pad: NewPad): Promise<void> => {
      if (client === null) return;
      setError(null);
      const sizeReason = validateSoundFile({
        size: pad.file.size,
        durationMs: 0,
      });
      if (sizeReason !== null) {
        setError(sizeReason);
        return;
      }
      if (board.sounds.length >= SOUNDBOARD_LIMITS.maxSounds) {
        setError("The board is full");
        return;
      }
      try {
        const durationMs =
          (await decodeAudio(await pad.file.arrayBuffer())).duration * 1000;
        const reason = validateSoundFile({ size: pad.file.size, durationMs });
        if (reason !== null) {
          setError(reason);
          return;
        }
        const uploadFile = new File(
          [pad.file],
          randomUploadName(pad.file.name),
          { type: pad.file.type, lastModified: pad.file.lastModified },
        );
        const uploaded = await client.upload(uploadFile);
        const sound: SoundboardSound = {
          id: newId(),
          // Built-in names are taken too: a custom pad sharing one would be
          // unplayable by name and unhittable by the receipt lookup.
          name: uniquePadName([...ReactionSet, ...board.sounds], pad.name),
          emoji: pad.emoji,
          mxc: uploaded.mxc,
          mimetype: uploaded.mimetype,
          size: uploaded.size,
          durationMs,
          addedBy: matrixClient?.getUserId() ?? "",
          addedTs: Date.now(),
        };
        const next: SoundboardBoard = {
          ...board,
          sounds: addSound(board.sounds, sound),
        };
        await client.save(next);
        setBoard(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add the sound");
      }
    },
    [client, board, matrixClient],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (client === null) return;
      setError(null);
      const next: SoundboardBoard = {
        ...board,
        sounds: removeSound(board.sounds, id),
      };
      try {
        await client.save(next);
        setBoard(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete the sound");
      }
    },
    [client, board],
  );

  const hideBuiltin = useCallback(
    async (name: string): Promise<void> => {
      if (client === null) return;
      setError(null);
      const next = hideBuiltinInBoard(board, name);
      if (next === board) return;
      try {
        await client.save(next);
        setBoard(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete the sound");
      }
    },
    [client, board],
  );

  return {
    pads: board.sounds,
    hiddenBuiltins: board.hiddenBuiltins,
    error,
    editable: client !== null,
    add,
    remove,
    hideBuiltin,
  };
}
