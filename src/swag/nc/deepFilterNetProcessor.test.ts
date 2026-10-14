/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { Track } from "livekit-client";

const { mockCreateWorklet } = vi.hoisted(() => ({
  mockCreateWorklet: vi.fn(),
}));

vi.mock("@workadventure/noise-suppression/deepfilternet", () => ({
  createDeepFilterNetAudioWorklet: mockCreateWorklet,
  DEEPFILTERNET_SAMPLE_RATE: 48000,
}));

import {
  createDeepFilterNetProcessor,
  isDeepFilterNetSupported,
} from "./deepFilterNetProcessor";

const closedContexts: StubAudioContext[] = [];

class StubAudioContext {
  public readonly sampleRate: number;
  public readonly destination = {};
  public resume = vi.fn(async () => {
    await Promise.resolve();
  });
  public close = vi.fn(async (): Promise<void> => {
    await Promise.resolve();
    closedContexts.push(this);
  });
  public createMediaStreamDestination = vi.fn(() => ({
    stream: { getAudioTracks: (): MediaStreamTrack[] => [processedTrack] },
  }));
  public constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 48000;
  }
}

class StubSourceNode {
  public connect = vi.fn();
  public disconnect = vi.fn();
  public constructor(_ctx: unknown, _opts: unknown) {}
}

const processedTrack = {
  stop: vi.fn(),
} as unknown as MediaStreamTrack;

function micTrack(): MediaStreamTrack {
  return { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack;
}

function stubBrowser(): void {
  vi.stubGlobal("AudioWorkletNode", class {});
  vi.stubGlobal("AudioContext", StubAudioContext);
  vi.stubGlobal(
    "MediaStreamAudioSourceNode",
    StubSourceNode as unknown as typeof MediaStreamAudioSourceNode,
  );
  vi.stubGlobal(
    "MediaStream",
    class {
      public constructor(public readonly tracks: unknown[] = []) {}
    },
  );
  if (typeof globalThis.CompressionStream === "undefined") {
    vi.stubGlobal("CompressionStream", class {});
  }
}

function stubWorklet(): void {
  const node = { connect: vi.fn(), disconnect: vi.fn() };
  mockCreateWorklet.mockResolvedValue({
    node,
    ready: Promise.resolve({}),
    dispose: vi.fn(),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  closedContexts.length = 0;
});

describe("isDeepFilterNetSupported", () => {
  it("is true when the platform has worklets, wasm and compression streams", () => {
    stubBrowser();
    expect(isDeepFilterNetSupported()).toBe(true);
  });

  it("is false without AudioWorkletNode", () => {
    stubBrowser();
    vi.stubGlobal("AudioWorkletNode", undefined);
    expect(isDeepFilterNetSupported()).toBe(false);
  });
});

describe("deepFilterNetProcessor", () => {
  it("init sets processedTrack from the denoised destination", async () => {
    stubBrowser();
    stubWorklet();
    const processor = createDeepFilterNetProcessor();
    const track = micTrack();

    await processor.init({
      kind: Track.Kind.Audio,
      track,
      audioContext: new StubAudioContext() as unknown as AudioContext,
    });

    expect(mockCreateWorklet).toHaveBeenCalledTimes(1);
    expect(processor.processedTrack).toBe(processedTrack);
    // The original mic track is never stopped by the processor.
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("restart rebuilds for a new track and stops the old processed track", async () => {
    stubBrowser();
    stubWorklet();
    const processor = createDeepFilterNetProcessor();
    const ctx = new StubAudioContext() as unknown as AudioContext;

    await processor.init({
      kind: Track.Kind.Audio,
      track: micTrack(),
      audioContext: ctx,
    });
    const first = processor.processedTrack;
    await processor.restart({
      kind: Track.Kind.Audio,
      track: micTrack(),
      audioContext: ctx,
    });

    expect(mockCreateWorklet).toHaveBeenCalledTimes(2);
    expect(first?.stop).toHaveBeenCalled();
    expect(processor.processedTrack).toBeDefined();
  });

  it("destroy disposes the worklet and closes only a processor-created context", async () => {
    stubBrowser();
    stubWorklet();
    const processor = createDeepFilterNetProcessor();

    await processor.init({
      kind: Track.Kind.Audio,
      track: micTrack(),
      audioContext: undefined as unknown as AudioContext,
    });
    const handle = await mockCreateWorklet.mock.results[0].value;
    await processor.destroy();

    expect(handle.dispose).toHaveBeenCalled();
    expect(processedTrack.stop).toHaveBeenCalled();
    // Only the processor-created context is closed, exactly once.
    expect(closedContexts).toHaveLength(1);
  });

  it("destroy leaves a caller-provided context open", async () => {
    stubBrowser();
    stubWorklet();
    const processor = createDeepFilterNetProcessor();
    const ctx = new StubAudioContext() as unknown as AudioContext;

    await processor.init({
      kind: Track.Kind.Audio,
      track: micTrack(),
      audioContext: ctx,
    });
    await processor.destroy();

    expect(ctx.close).not.toHaveBeenCalled();
  });

  it("rejects when the platform is unsupported so the caller can fall back", async () => {
    stubBrowser();
    vi.stubGlobal("AudioWorkletNode", undefined);
    const processor = createDeepFilterNetProcessor();

    await expect(
      processor.init({
        kind: Track.Kind.Audio,
        track: micTrack(),
        audioContext: new StubAudioContext() as unknown as AudioContext,
      }),
    ).rejects.toThrow();
    expect(mockCreateWorklet).not.toHaveBeenCalled();
  });

  it("rejects a caller-provided context at the wrong sample rate", async () => {
    stubBrowser();
    stubWorklet();
    const processor = createDeepFilterNetProcessor();

    await expect(
      processor.init({
        kind: Track.Kind.Audio,
        track: micTrack(),
        audioContext: new StubAudioContext({
          sampleRate: 44100,
        }) as unknown as AudioContext,
      }),
    ).rejects.toThrow(/48/);
  });
});
