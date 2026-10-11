/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { LocalAudioTrack, type Room as LivekitRoom, Track } from "livekit-client";
import { map } from "rxjs";
import { type Logger } from "matrix-js-sdk/lib/logger";

import { observeTrackReference$ } from "../../state/observeTrackReference.ts";
import { type ObservableScope } from "../../state/ObservableScope.ts";
import { SoundboardAudioProcessor } from "./SoundboardAudioProcessor.ts";
import {
  releaseSoundboardProcessor,
  setSoundboardProcessor,
} from "./processorHandle.ts";

/**
 * Keeps a {@link SoundboardAudioProcessor} installed on the microphone track.
 *
 * Mirrors the video processor plumbing in
 * `src/livekit/TrackProcessorContext.tsx` + `Publisher.observeTrackProcessors`,
 * but for `Track.Source.Microphone` and with its own processor rather than the
 * background-blur one. The processor is installed when the microphone track
 * appears, survives LiveKit's Chrome device-change restart (which calls the
 * processor's own `restart`), and is removed when the track is unpublished.
 *
 * The instance is published to `processorHandle.ts` for the pads UI, so React
 * never reaches into LiveKit.
 *
 * @param scope - The publisher's scope; installation is torn down with it.
 */
export function observeSoundboardProcessor(
  scope: ObservableScope,
  room: LivekitRoom,
  logger: Logger,
): void {
  const processor = new SoundboardAudioProcessor();

  const micTrack$ = scope.behavior(
    observeTrackReference$(room.localParticipant, Track.Source.Microphone).pipe(
      map((trackRef) => {
        const track = trackRef?.publication.track;
        return track instanceof LocalAudioTrack ? track : null;
      }),
    ),
    null,
  );

  scope.reconcile(micTrack$, async (track) => {
    if (track === null) {
      releaseSoundboardProcessor(processor);
      return;
    }

    try {
      await track.setProcessor(processor);
      setSoundboardProcessor(processor);
    } catch (e) {
      logger.error("Failed to install the soundboard audio processor", e);
      releaseSoundboardProcessor(processor);
    }

    return async () => {
      releaseSoundboardProcessor(processor);
      try {
        await track.stopProcessor();
      } catch (e) {
        logger.error("Failed to stop the soundboard audio processor", e);
      }
    };
  });
}
