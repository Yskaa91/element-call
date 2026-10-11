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
import { flushPromises } from "../../utils/test.ts";
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

function fakeParticipant(): {
  participant: LocalParticipant;
  emit: (event: ParticipantEvent) => void;
  setPublication: (publication: LocalTrackPublication | undefined) => void;
} {
  const handlers = new Map<ParticipantEvent, () => void>();
  let publication: LocalTrackPublication | undefined;
  const participant = {
    on: vi.fn((event: ParticipantEvent, handler: () => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
    getTrackPublication: vi.fn(() => publication),
    isMicrophoneEnabled: true,
    isCameraEnabled: false,
    isScreenShareEnabled: false,
  } as unknown as LocalParticipant;

  return {
    participant,
    emit: (event) => handlers.get(event)?.(),
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
    const room = { localParticipant: participant } as unknown as LivekitRoom;

    observeSoundboardProcessor(scope, room, logger);
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
    const room = { localParticipant: participant } as unknown as LivekitRoom;

    observeSoundboardProcessor(scope, room, logger);
    await flushPromises();
    expect(soundboardProcessor$.value).not.toBeNull();

    setPublication(undefined);
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
    const room = { localParticipant: participant } as unknown as LivekitRoom;

    observeSoundboardProcessor(scope, room, logger);
    await flushPromises();

    expect(soundboardProcessor$.value).toBeNull();
  });
});
