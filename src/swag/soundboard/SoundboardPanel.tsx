/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ChangeEvent,
  type FC,
  useCallback,
  useEffect,
  useState,
} from "react";
import { IconButton, Tooltip } from "@vector-im/compound-web";
import {
  AudioIcon,
  DeleteIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { useClient } from "../../ClientContext.tsx";
import { useHostBridge } from "../../HostBridge.ts";
import { useBehavior } from "../../useBehavior.ts";
import {
  SOUNDBOARD_LIMITS,
  addSound,
  removeSound,
  validateSoundFile,
  type SoundboardSound,
} from "./board";
import { createSoundboardClient, type SoundboardClient } from "./boardClient";
import { decodeAudio } from "./decodeAudio";
import { soundboardProcessor$ } from "./processorHandle";
import { useSoundboardWidget } from "./SoundboardWidgetContext";
import styles from "./SoundboardPanel.module.css";

export interface SoundboardPanelProps {
  /** The call room whose space owns the board. */
  roomId: string;
}

const MAX_NAME_LENGTH = 40;

function displayName(name: string): string {
  return name.length > MAX_NAME_LENGTH
    ? `${name.slice(0, MAX_NAME_LENGTH)}…`
    : name;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : fallback;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The soundboard: a footer button opening the space's pads.
 *
 * The board is one state event in the space room, reached through the widget
 * API; pads are played into the outgoing microphone mix by the processor the
 * Publisher installs (see `processorHandle.ts`). The panel hides itself when
 * Element Call is not a widget, and when the call room has no space parent.
 */
export const SoundboardPanel: FC<SoundboardPanelProps> = ({ roomId }) => {
  const widget = useSoundboardWidget();
  const hostBridge = useHostBridge();
  const { client: matrixClient } = useClient();
  const processor = useBehavior(soundboardProcessor$);

  const [client, setClient] = useState<SoundboardClient | null>(null);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [sounds, setSounds] = useState<SoundboardSound[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (widget === null) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const refresh = async (soundboard: SoundboardClient): Promise<void> => {
      try {
        const board = await soundboard.load();
        if (!cancelled) setSounds(board);
      } catch (e) {
        if (!cancelled) setError(messageOf(e, "Could not read the soundboard"));
      }
    };

    createSoundboardClient(widget.api, roomId)
      .then((soundboard) => {
        if (cancelled) return;
        if (soundboard === null) return; // No space parent: stay hidden.
        setClient(soundboard);
        setVisible(true);
        unsubscribe = soundboard.subscribe(() => void refresh(soundboard));
        return refresh(soundboard);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(messageOf(e, "Could not reach the soundboard"));
        setVisible(true);
      });

    return (): void => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [widget, roomId]);

  const download = useCallback(
    async (mxc: string): Promise<Blob> => {
      if (!hostBridge.downloadMedia) {
        throw new Error("This host cannot download sounds");
      }
      return hostBridge.downloadMedia(mxc);
    },
    [hostBridge],
  );

  const play = useCallback(
    async (sound: SoundboardSound): Promise<void> => {
      setError(null);
      if (processor === null) {
        setError("The microphone is not ready yet");
        return;
      }
      try {
        const blob = await download(sound.mxc);
        const buffer = await decodeAudio(await blob.arrayBuffer());
        processor.playPad(buffer);
      } catch (e) {
        setError(messageOf(e, "Could not play the sound"));
      }
    },
    [processor, download],
  );

  const deletePad = useCallback(
    async (id: string): Promise<void> => {
      if (client === null) return;
      setError(null);
      const next = removeSound(sounds, id);
      try {
        await client.save(next);
        setSounds(next);
      } catch (e) {
        setError(messageOf(e, "Could not save the soundboard"));
      }
    },
    [client, sounds],
  );

  const addFile = useCallback(
    async (file: File): Promise<void> => {
      if (client === null) return;
      setError(null);

      // Check the size before decoding: there is no point decoding a file we
      // are going to reject anyway.
      const sizeReason = validateSoundFile({ size: file.size, durationMs: 0 });
      if (sizeReason !== null) {
        setError(sizeReason);
        return;
      }
      if (sounds.length >= SOUNDBOARD_LIMITS.maxSounds) {
        setError("The soundboard is full");
        return;
      }

      try {
        const durationMs =
          (await decodeAudio(await file.arrayBuffer())).duration * 1000;
        const reason = validateSoundFile({ size: file.size, durationMs });
        if (reason !== null) {
          setError(reason);
          return;
        }

        const uploaded = await client.upload(file);
        const sound: SoundboardSound = {
          id: newId(),
          name: file.name,
          mxc: uploaded.mxc,
          mimetype: uploaded.mimetype,
          size: uploaded.size,
          durationMs,
          addedBy: matrixClient?.getUserId() ?? "",
          addedTs: Date.now(),
        };
        const next = addSound(sounds, sound);
        await client.save(next);
        setSounds(next);
      } catch (e) {
        setError(messageOf(e, "Could not add the sound"));
      }
    },
    [client, sounds, matrixClient],
  );

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      // Let the user pick the same file again after a failure.
      event.target.value = "";
      if (file) void addFile(file);
    },
    [addFile],
  );

  if (!visible) return null;

  return (
    <div className={styles.container}>
      <Tooltip label="Soundboard">
        <IconButton
          kind={open ? "primary" : "secondary"}
          aria-label="Soundboard"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          data-testid="soundboard-toggle"
        >
          <AudioIcon aria-hidden />
        </IconButton>
      </Tooltip>
      {open && (
        <div
          className={styles.panel}
          role="dialog"
          aria-label="Soundboard"
          data-testid="soundboard-panel"
        >
          {error !== null && (
            <p
              className={styles.error}
              role="alert"
              data-testid="soundboard-error"
            >
              {error}
            </p>
          )}
          {sounds.length === 0 ? (
            <p className={styles.empty}>No sounds yet</p>
          ) : (
            <ul className={styles.pads}>
              {sounds.map((sound) => (
                <li className={styles.pad} key={sound.id}>
                  <button
                    type="button"
                    className={styles.padButton}
                    onClick={() => void play(sound)}
                    data-testid={`soundboard-pad-${sound.id}`}
                  >
                    {displayName(sound.name)}
                  </button>
                  <IconButton
                    kind="secondary"
                    aria-label={`Delete ${displayName(sound.name)}`}
                    onClick={() => void deletePad(sound.id)}
                    data-testid={`soundboard-delete-${sound.id}`}
                  >
                    <DeleteIcon aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <label className={styles.add}>
            <input
              type="file"
              accept="audio/*"
              onChange={onFileChange}
              data-testid="soundboard-file"
            />
            Add sound
          </label>
        </div>
      )}
    </div>
  );
};
