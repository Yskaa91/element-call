/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ReactNode, useCallback, useEffect, useState } from "react";

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
  const [soundCache, setSoundCache] = useState<ReturnType<
    typeof prefetchSounds
  > | null>(null);
  const hostBridge = useHostBridge();
  const { pads } = useCustomBoard(roomId ?? "");
  const audioEngineCtx = useAudioContext({
    sounds: soundCache,
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
    if (!shouldPlay || soundCache) {
      return;
    }
    // This is fine even if we load the component multiple times,
    // as the browser's cache should ensure once the media is loaded
    // once that future fetches come via the cache.
    setSoundCache(prefetchSounds(soundMap));
  }, [soundCache, shouldPlay]);

  // Custom board pads arrive after the bundled prefetch: merge their buffers
  // into a fresh promise so the engine rebuilds with every name playable.
  // Unknown names still fall back to the generic sound below.
  useEffect(() => {
    if (!shouldPlay || !soundCache || pads.length === 0) return;
    if (!hostBridge.downloadMedia) return;
    let cancelled = false;
    void (async (): Promise<void> => {
      const customs = await fetchCustomSounds(download, pads);
      if (cancelled || Object.keys(customs).length === 0) return;
      const bundled = await soundCache;
      setSoundCache(Promise.resolve({ ...bundled, ...customs }));
    })();
    return (): void => {
      cancelled = true;
    };
  }, [shouldPlay, soundCache, pads, download, hostBridge]);

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
