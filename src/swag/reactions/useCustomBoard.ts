/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useEffect, useState } from "react";

import { useClient } from "../../ClientContext.tsx";
import {
  SOUNDBOARD_LIMITS,
  addSound,
  removeSound,
  validateSoundFile,
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

/**
 * The space board behind the Reactions menu.
 *
 * Loads the board for the call room's space, refreshes it live while the menu
 * is open, and writes adds/removes back. Returns an empty board (not an
 * error) when Element Call runs standalone or the room has no space parent:
 * the menu then shows built-ins only, with no edit controls.
 */
export function useCustomBoard(roomId: string): {
  pads: SoundboardSound[];
  error: string | null;
  editable: boolean;
  add: (pad: NewPad) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const widget = useSoundboardWidget();
  const { client: matrixClient } = useClient();
  const [client, setClient] = useState<SoundboardClient | null>(null);
  const [pads, setPads] = useState<SoundboardSound[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (widget === null) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const refresh = async (board: SoundboardClient): Promise<void> => {
      try {
        const sounds = await board.load();
        if (!cancelled) setPads(sounds);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not read the board");
      }
    };
    createSoundboardClient(widget.api, roomId)
      .then((board) => {
        if (cancelled || board === null) return;
        setClient(board);
        unsubscribe = board.subscribe(() => void refresh(board));
        void refresh(board);
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
      if (pads.length >= SOUNDBOARD_LIMITS.maxSounds) {
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
        const uploaded = await client.upload(pad.file);
        const sound: SoundboardSound = {
          id: newId(),
          name: uniquePadName(pads, pad.name),
          emoji: pad.emoji,
          mxc: uploaded.mxc,
          mimetype: uploaded.mimetype,
          size: uploaded.size,
          durationMs,
          addedBy: matrixClient?.getUserId() ?? "",
          addedTs: Date.now(),
        };
        const next = addSound(pads, sound);
        await client.save(next);
        setPads(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add the sound");
      }
    },
    [client, pads, matrixClient],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (client === null) return;
      setError(null);
      const next = removeSound(pads, id);
      try {
        await client.save(next);
        setPads(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete the sound");
      }
    },
    [client, pads],
  );

  return { pads, error, editable: client !== null, add, remove };
}
