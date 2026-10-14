/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { playReactionsSound, useSetting } from "../settings/settings";
import { GenericReaction, ReactionSet } from "../reactions";
import { useAudioContext } from "../useAudioContext";
import { prefetchSounds } from "../soundUtils";
import { useLatest } from "../useLatest";
import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import { useHostBridge } from "../HostBridge";
import { useCustomBoard } from "../swag/reactions/useCustomBoard";
import {
  fetchCustomSounds,
  resolveCustomSound,
} from "../swag/reactions/customSoundCache";

const soundMap = Object.fromEntries([
  ...ReactionSet.filter((v) => v.sound !== undefined).map((v) => [
    v.name,
    v.sound!,
  ]),
  [GenericReaction.name, GenericReaction.sound],
]);

export function ReactionsAudioRenderer({
  vm,
  muted,
  roomId,
}: {
  vm: CallViewModel;
  muted?: boolean;
  /** The call room: custom board sounds resolve from its space board. */
  roomId?: string;
}): ReactNode {
  const [shouldPlay] = useSetting(playReactionsSound);
  const [bundledCache, setBundledCache] = useState<ReturnType<
    typeof prefetchSounds
  > | null>(null);
  const [customCache, setCustomCache] = useState<Record<
    string,
    ArrayBuffer
  > | null>(null);
  const hostBridge = useHostBridge();
  const { pads } = useCustomBoard(roomId ?? "");
  // The combined promise identity must stay stable across renders: it feeds
  // `useAudioContext`, which rebuilds the AudioContext whenever it changes.
  const sounds = useMemo((): Promise<Record<string, ArrayBuffer>> | null => {
    if (bundledCache === null) return null;
    if (customCache === null) return bundledCache;
    return Promise.all([bundledCache, Promise.resolve(customCache)]).then(
      ([bundled, customs]) => ({ ...bundled, ...customs }),
    );
  }, [bundledCache, customCache]);
  const audioEngineCtx = useAudioContext({
    sounds,
    latencyHint: "interactive",
    muted,
  });
  const audioEngineRef = useLatest(audioEngineCtx);

  const download = useCallback(
    async (mxc: string): Promise<ArrayBuffer> =>
      (await hostBridge.downloadMedia!(mxc)).arrayBuffer(),
    [hostBridge],
  );

  useEffect(() => {
    if (!shouldPlay || bundledCache) {
      return;
    }
    // This is fine even if we load the component multiple times,
    // as the browser's cache should ensure once the media is loaded
    // once that future fetches come via the cache.
    setBundledCache(prefetchSounds(soundMap));
  }, [bundledCache, shouldPlay]);

  // Custom board pads merge into their own cache, never into the state this
  // effect depends on: setting the same promise state the effect reads back
  // retriggers the effect forever and rebuilds the AudioContext each pass.
  // Unknown names still fall back to the generic sound below.
  const fetchedPadsKey = useRef("");
  useEffect(() => {
    if (!shouldPlay) return;
    if (!hostBridge.downloadMedia) return;
    const key = pads
      .map((pad) => pad.mxc)
      .sort()
      .join("\n");
    if (key === fetchedPadsKey.current) return;
    fetchedPadsKey.current = key;
    if (pads.length === 0) {
      setCustomCache(null);
      return;
    }
    let cancelled = false;
    void (async (): Promise<void> => {
      const customs = await fetchCustomSounds(download, pads);
      if (cancelled || fetchedPadsKey.current !== key) return;
      setCustomCache(customs);
    })();
    return (): void => {
      cancelled = true;
    };
  }, [shouldPlay, pads, download, hostBridge]);

  useEffect(() => {
    const sub = vm.audibleReactions$.subscribe((newReactions) => {
      for (const reactionName of newReactions) {
        if (soundMap[reactionName]) {
          void audioEngineRef.current?.playSound(reactionName);
        } else if (roomId && resolveCustomSound(reactionName, pads)) {
          void audioEngineRef.current?.playSound(reactionName);
        } else {
          // Fallback sounds.
          void audioEngineRef.current?.playSound("generic");
        }
      }
    });
    return (): void => {
      sub.unsubscribe();
    };
  }, [vm, audioEngineRef, pads, roomId]);
  return null;
}
