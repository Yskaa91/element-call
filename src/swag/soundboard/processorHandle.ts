/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";

import { type Behavior } from "../../state/Behavior.ts";
import { type SoundboardAudioProcessor } from "./SoundboardAudioProcessor.ts";

/**
 * The handle the pads UI plays through.
 *
 * The processor lives on the microphone track, which only the Publisher can
 * reach, so the Publisher publishes it here. React reads this observable and
 * never touches LiveKit itself. It is null whenever there is no microphone
 * track to mix into (and so nothing for a pad to be heard through).
 *
 * Deliberately module-level, like the other cross-cutting state in
 * `src/state/`: there is one local microphone per client.
 */
const processorSubject = new BehaviorSubject<SoundboardAudioProcessor | null>(
  null,
);

/** The soundboard processor to play pads through, or null when there is none. */
export const soundboardProcessor$: Behavior<SoundboardAudioProcessor | null> =
  processorSubject;

/** Called by the Publisher as it installs and removes the processor. */
export function setSoundboardProcessor(
  processor: SoundboardAudioProcessor | null,
): void {
  processorSubject.next(processor);
}

/**
 * Clears the handle only if it still holds this processor.
 *
 * With more than one connection (multi-SFU) several processors exist; an
 * unpublish on a stale connection must not clear a live processor belonging to
 * another connection.
 */
export function releaseSoundboardProcessor(
  processor: SoundboardAudioProcessor,
): void {
  if (processorSubject.value === processor) processorSubject.next(null);
}
