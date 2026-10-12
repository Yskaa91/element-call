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
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
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
import { DEFAULT_PAD_GAIN } from "./SoundboardAudioProcessor";
import { soundboardProcessor$ } from "./processorHandle";
import { useSoundboardWidget } from "./SoundboardWidgetContext";
import styles from "./SoundboardPanel.module.css";

export interface SoundboardPanelProps {
  /** The call room whose space owns the board. */
  roomId: string;
  /**
   * Prefix for the panel's `data-testid`s. The panel is rendered twice — once
   * in the wide footer slot and once in the narrow centre group — so the two
   * instances need distinct ids.
   */
  testIdPrefix?: string;
}

const MAX_NAME_LENGTH = 40;

// Names are free text from whoever uploads; cap what is stored so one paste
// cannot wedge the board event, while displayName truncates what renders.
const MAX_STORED_NAME_LENGTH = 100;

function displayName(name: string): string {
  return name.length > MAX_NAME_LENGTH
    ? `${name.slice(0, MAX_NAME_LENGTH)}…`
    : name;
}

function defaultPadName(fileName: string): string {
  const stripped = fileName.replace(/\.[^/.]+$/, "");
  return (stripped.length > 0 ? stripped : fileName).slice(
    0,
    MAX_STORED_NAME_LENGTH,
  );
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
export const SoundboardPanel: FC<SoundboardPanelProps> = ({
  roomId,
  testIdPrefix = "soundboard",
}) => {
  const widget = useSoundboardWidget();
  const hostBridge = useHostBridge();
  const { client: matrixClient } = useClient();
  const processor = useBehavior(soundboardProcessor$);
  const { t } = useTranslation();

  const [client, setClient] = useState<SoundboardClient | null>(null);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [sounds, setSounds] = useState<SoundboardSound[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [padGain, setPadGain] = useState(DEFAULT_PAD_GAIN);
  const [playingIds, setPlayingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // The name for the next upload, typed before picking the file. Empty means
  // "use the file name".
  const [pendingName, setPendingName] = useState("");

  // Decoded buffers, so a repeated trigger does not re-download and re-decode.
  const buffers = useRef(new Map<string, AudioBuffer>());

  useEffect(() => {
    if (widget === null) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const refresh = async (soundboard: SoundboardClient): Promise<void> => {
      try {
        const board = await soundboard.load();
        if (!cancelled) setSounds(board);
      } catch (e) {
        if (!cancelled) setError(messageOf(e, t("soundboard.read_failed")));
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
        setError(messageOf(e, t("soundboard.reach_failed")));
        setVisible(true);
      });

    return (): void => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [widget, roomId, t]);

  // Closing the panel stops anything it started.
  useEffect(() => {
    if (!open) processor?.stopAllPads();
  }, [open, processor]);

  const download = useCallback(
    async (mxc: string): Promise<Blob> => {
      if (!hostBridge.downloadMedia) {
        throw new Error(t("soundboard.download_unsupported"));
      }
      return hostBridge.downloadMedia(mxc);
    },
    [hostBridge, t],
  );

  const play = useCallback(
    async (sound: SoundboardSound): Promise<void> => {
      setError(null);
      if (processor === null) {
        setError(t("soundboard.microphone_not_ready"));
        return;
      }
      try {
        let buffer = buffers.current.get(sound.mxc);
        if (buffer === undefined) {
          const blob = await download(sound.mxc);
          buffer = await decodeAudio(await blob.arrayBuffer());
          buffers.current.set(sound.mxc, buffer);
        }
        processor.playPad(buffer, padGain);

        // A transient "playing" marker, so a trigger does not look like a no-op.
        setPlayingIds((previous) => new Set(previous).add(sound.id));
        const duration = Number.isFinite(buffer.duration) ? buffer.duration : 0;
        window.setTimeout(() => {
          setPlayingIds((previous) => {
            const next = new Set(previous);
            next.delete(sound.id);
            return next;
          });
        }, Math.max(300, duration * 1000));
      } catch (e) {
        setError(messageOf(e, t("soundboard.play_failed")));
      }
    },
    [processor, download, padGain, t],
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
        setError(messageOf(e, t("soundboard.save_failed")));
      }
    },
    [client, sounds, t],
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
        setError(t("soundboard.full"));
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
        const typed = pendingName.trim();
        const sound: SoundboardSound = {
          id: newId(),
          name: (typed.length > 0 ? typed : defaultPadName(file.name)).slice(
            0,
            MAX_STORED_NAME_LENGTH,
          ),
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
        setPendingName("");
      } catch (e) {
        setError(messageOf(e, t("soundboard.add_failed")));
      }
    },
    [client, sounds, matrixClient, pendingName, t],
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
      <Tooltip label={t("soundboard.title")}>
        <IconButton
          kind={open ? "primary" : "secondary"}
          aria-label={t("soundboard.title")}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          data-testid={`${testIdPrefix}-toggle`}
        >
          <AudioIcon aria-hidden />
        </IconButton>
      </Tooltip>
      {open && (
        <div className={styles.panel} data-testid={`${testIdPrefix}-panel`}>
          {error !== null && (
            <p
              className={styles.error}
              role="alert"
              data-testid={`${testIdPrefix}-error`}
            >
              {error}
            </p>
          )}
          <label className={styles.gain}>
            <span>{t("soundboard.volume")}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={padGain}
              onChange={(event) => setPadGain(Number(event.target.value))}
              data-testid={`${testIdPrefix}-gain`}
            />
          </label>
          {sounds.length === 0 ? (
            <p className={styles.empty}>{t("soundboard.empty")}</p>
          ) : (
            <ul className={styles.pads}>
              {sounds.map((sound) => (
                <li className={styles.pad} key={sound.id}>
                  <button
                    type="button"
                    className={styles.padButton}
                    data-playing={String(playingIds.has(sound.id))}
                    onClick={() => void play(sound)}
                    data-testid={`${testIdPrefix}-pad-${sound.id}`}
                  >
                    {displayName(sound.name)}
                  </button>
                  <IconButton
                    kind="secondary"
                    aria-label={t("soundboard.delete", {
                      name: displayName(sound.name),
                    })}
                    onClick={() => void deletePad(sound.id)}
                    data-testid={`${testIdPrefix}-delete-${sound.id}`}
                  >
                    <DeleteIcon aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <label className={styles.add}>
            <span>{t("soundboard.name_label")}</span>
            <input
              type="text"
              value={pendingName}
              maxLength={MAX_STORED_NAME_LENGTH}
              placeholder={t("soundboard.name_placeholder")}
              onChange={(event) => setPendingName(event.target.value)}
              data-testid={`${testIdPrefix}-name`}
            />
          </label>
          <label className={styles.add}>
            <input
              type="file"
              accept="audio/*"
              onChange={onFileChange}
              data-testid={`${testIdPrefix}-file`}
            />
            {t("soundboard.add")}
          </label>
        </div>
      )}
    </div>
  );
};
