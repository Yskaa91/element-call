/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocalAudioTrack,
  type LocalParticipant,
  type LocalTrackPublication,
  ParticipantEvent,
  type Room as LivekitRoom,
  Track,
} from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";

import { ObservableScope } from "../../state/ObservableScope.ts";
import { flushPromises, mockEmitter } from "../../utils/test.ts";
import { SoundboardAudioProcessor } from "./SoundboardAudioProcessor.ts";
import { observeSoundboardProcessor } from "./observeSoundboardProcessor.ts";
import { setSoundboardProcessor, soundboardProcessor$ } from "./processorHandle.ts";

/**
 * A track that passes the `instanceof LocalAudioTrack` check the wiring uses,
 * but whose constructor never runs (jsdom has neither a real MediaStreamTrack
 * nor Web Audio). Only `setProcessor`/`stopProcessor` are ever reached, so the
 * stubs on the instance are all that matters.
 */
function fakeAudioTrack(): LocalAudioTrack {
  return Object.assign(Object.create(LocalAudioTrack.prototype), {
    setProcessor: vi.fn().mockResolvedValue(undefined),
    stopProcessor: vi.fn().mockResolvedValue(undefined),
  }) as unknown as LocalAudioTrack;
}

/**
 * A participant backed by a real event emitter, so the wiring is exercised
 * through the same `ParticipantEvent`s the SDK emits rather than a hand-rolled
 * handler map. `getTrackPublication` is read on every event, mirroring the SDK.
 */
function fakeParticipant(): {
  participant: LocalParticipant;
  emit: (event: ParticipantEvent) => void;
  setPublication: (publication: LocalTrackPublication | undefined) => void;
} {
  let publication: LocalTrackPublication | undefined;
  const participant = {
    ...mockEmitter(),
    getTrackPublication: vi.fn(() => publication),
    isMicrophoneEnabled: true,
    isCameraEnabled: false,
    isScreenShareEnabled: false,
  } as unknown as LocalParticipant;

  return {
    participant,
    emit: (event) => {
      (participant as unknown as { emit: (e: ParticipantEvent) => void }).emit(
        event,
      );
    },
    setPublication: (next) => {
      publication = next;
    },
  };
}

function publicationFor(track: LocalAudioTrack): LocalTrackPublication {
  return {
    track,
    source: Track.Source.Microphone,
  } as unknown as LocalTrackPublication;
}

function roomWith(participant: LocalParticipant): LivekitRoom {
  return { localParticipant: participant } as unknown as LivekitRoom;
}

let scope: ObservableScope;

beforeEach(() => {
  scope = new ObservableScope();
});

afterEach(() => {
  scope.end();
  setSoundboardProcessor(null);
});

describe("observeSoundboardProcessor", () => {
  it("installs the processor on the microphone track and publishes it", async () => {
    const track = fakeAudioTrack();
    const { participant, setPublication } = fakeParticipant();
    setPublication(publicationFor(track));

    observeSoundboardProcessor(scope, roomWith(participant), logger);
    await flushPromises();

    expect(
      (track as unknown as { setProcessor: ReturnType<typeof vi.fn> })
        .setProcessor,
    ).toHaveBeenCalledOnce();
    expect(soundboardProcessor$.value).toBeInstanceOf(SoundboardAudioProcessor);
  });

  it("clears the handle and stops the processor when the track is unpublished", async () => {
    const track = fakeAudioTrack();
    const { participant, emit, setPublication } = fakeParticipant();
    setPublication(publicationFor(track));

    observeSoundboardProcessor(scope, roomWith(participant), logger);
    await flushPromises();
    expect(soundboardProcessor$.value).not.toBeNull();

    setPublication(undefined);
    // The real event the SDK emits on unpublish; a wrong event name would not
    // reach the subscription, because this is a real emitter.
    emit(ParticipantEvent.LocalTrackUnpublished);
    await flushPromises();

    expect(soundboardProcessor$.value).toBeNull();
    expect(
      (track as unknown as { stopProcessor: ReturnType<typeof vi.fn> })
        .stopProcessor,
    ).toHaveBeenCalledOnce();
  });

  it("stays hidden while there is no microphone track", async () => {
    const { participant } = fakeParticipant();

    observeSoundboardProcessor(scope, roomWith(participant), logger);
    await flushPromises();

    expect(soundboardProcessor$.value).toBeNull();
  });

  it("does not clear another connection's live processor", async () => {
    // Two connections (multi-SFU) each install their own processor; the module
    // handle keeps the last one. Unpublishing the stale connection must not
    // clear the live one.
    const firstTrack = fakeAudioTrack();
    const first = fakeParticipant();
    first.setPublication(publicationFor(firstTrack));

    const secondTrack = fakeAudioTrack();
    const second = fakeParticipant();
    second.setPublication(publicationFor(secondTrack));

    const firstScope = new ObservableScope();
    const secondScope = new ObservableScope();
    try {
      observeSoundboardProcessor(firstScope, roomWith(first.participant), logger);
      await flushPromises();
      observeSoundboardProcessor(
        secondScope,
        roomWith(second.participant),
        logger,
      );
      await flushPromises();
      expect(soundboardProcessor$.value).not.toBeNull();

      first.setPublication(undefined);
      first.emit(ParticipantEvent.LocalTrackUnpublished);
      await flushPromises();

      // The second connection is still live, so its processor must survive.
      expect(soundboardProcessor$.value).not.toBeNull();
    } finally {
      firstScope.end();
      secondScope.end();
    }
  });
});
