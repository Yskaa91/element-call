/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Track, type AudioProcessorOptions } from "livekit-client";

import { SoundboardAudioProcessor } from "./SoundboardAudioProcessor";
import { attachDenoiseStage, type DenoiseStage } from "../nc/denoiseStage.ts";
import { readNoiseCancellationMode } from "../nc/mode.ts";

vi.mock("../nc/denoiseStage.ts", () => ({
  attachDenoiseStage: vi.fn(),
}));
vi.mock("../nc/mode.ts", () => ({
  readNoiseCancellationMode: vi.fn(() => "browser"),
}));

/**
 * jsdom has no Web Audio API at all, so the processor is exercised against a
 * hand-rolled fake that records the calls the real API would receive. The fake
 * nodes deliberately do not resemble the real ones beyond connect/disconnect.
 */
class FakeNode {
  public readonly connect = vi.fn();
  public readonly disconnect = vi.fn();
}

class FakeGainNode extends FakeNode {
  public readonly gain = { value: 1 };
}

class FakeBufferSourceNode extends FakeNode {
  public buffer: AudioBuffer | null = null;
  public onended: (() => void) | null = null;
  public readonly start = vi.fn();
  public readonly stop = vi.fn();
}

interface FakeDestination extends FakeNode {
  stream: { getAudioTracks: () => MediaStreamTrack[] };
}

class FakeAudioContext {
  private destinationCount = 0;

  public readonly createMediaStreamSource = vi.fn(
    (_stream: MediaStream) => new FakeNode(),
  );
  public readonly createGain = vi.fn(() => new FakeGainNode());
  public readonly createBufferSource = vi.fn(() => new FakeBufferSourceNode());
  public readonly createMediaStreamDestination = vi.fn((): FakeDestination => {
    const track = {
      id: `processed-${this.destinationCount++}`,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    return {
      ...new FakeNode(),
      stream: { getAudioTracks: () => [track] },
    };
  });
}

function fakeContext(): FakeAudioContext {
  return new FakeAudioContext();
}

function initOptions(
  context: FakeAudioContext,
  track: MediaStreamTrack = { id: "mic" } as unknown as MediaStreamTrack,
): AudioProcessorOptions {
  return {
    kind: Track.Kind.Audio,
    track,
    audioContext: context as unknown as AudioContext,
  };
}

function sourceOf(context: FakeAudioContext, call = 0): FakeNode {
  return context.createMediaStreamSource.mock.results[call].value;
}

function gainOf(context: FakeAudioContext, call = 0): FakeGainNode {
  return context.createGain.mock.results[call].value as unknown as FakeGainNode;
}

function bufferSourceOf(context: FakeAudioContext, call = 0): FakeBufferSourceNode {
  return context.createBufferSource.mock.results[call]
    .value as unknown as FakeBufferSourceNode;
}

function destinationOf(context: FakeAudioContext, call = 0): FakeDestination {
  return context.createMediaStreamDestination.mock.results[call]
    .value as unknown as FakeDestination;
}

function padBuffer(): AudioBuffer {
  return { duration: 1 } as AudioBuffer;
}

let context: FakeAudioContext;

beforeEach(() => {
  context = fakeContext();
  // jsdom has no MediaStream either; the processor only wraps the source track
  // in one to hand to createMediaStreamSource.
  vi.stubGlobal(
    "MediaStream",
    class {
      public constructor(public readonly tracks: MediaStreamTrack[]) {}
    },
  );
});

describe("SoundboardAudioProcessor", () => {
  it("wires mic -> micGain -> destination and exposes the processed track", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));

    const source = sourceOf(context);
    const micGain = gainOf(context);
    const destination = destinationOf(context);

    expect(context.createMediaStreamSource).toHaveBeenCalledOnce();
    expect(source.connect).toHaveBeenCalledWith(micGain);
    expect(micGain.connect).toHaveBeenCalledWith(destination);
    expect(processor.processedTrack).toBe(
      destination.stream.getAudioTracks()[0],
    );
  });

  it("builds the source from the microphone track", async () => {
    const micTrack = { id: "mic" } as unknown as MediaStreamTrack;
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context, micTrack));

    const arg = context.createMediaStreamSource.mock.calls[0][0] as unknown as {
      tracks: MediaStreamTrack[];
    };
    expect(arg.tracks).toEqual([micTrack]);
  });

  it("connects a pad's source into its own gain and starts it", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));

    const buffer = padBuffer();
    processor.playPad(buffer, 0.5);

    const padGain = gainOf(context, 1);
    const padSource = bufferSourceOf(context);
    expect(context.createBufferSource).toHaveBeenCalledOnce();
    expect(padSource.buffer).toBe(buffer);
    expect(padSource.connect).toHaveBeenCalledWith(padGain);
    expect(padGain.gain.value).toBe(0.5);
    expect(padGain.connect).toHaveBeenCalledWith(destinationOf(context));
    expect(padSource.start).toHaveBeenCalledOnce();
  });

  it("plays a pad at the default gain when none is given", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));
    processor.playPad(padBuffer());
    expect(gainOf(context, 1).gain.value).toBe(0.8);
  });

  it("does nothing when a pad is played before init", () => {
    const processor = new SoundboardAudioProcessor();
    expect(() => processor.playPad(padBuffer())).not.toThrow();
    expect(context.createBufferSource).not.toHaveBeenCalled();
  });

  it("does nothing when a pad is played after destroy", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));
    await processor.destroy();

    expect(() => processor.playPad(padBuffer())).not.toThrow();
    expect(context.createBufferSource).not.toHaveBeenCalled();
  });

  it("plays at most three pads at once", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));

    for (let i = 0; i < 5; i++) processor.playPad(padBuffer());

    expect(context.createBufferSource).toHaveBeenCalledTimes(3);
  });

  it("allows a new pad once an earlier one has ended", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));

    processor.playPad(padBuffer());
    processor.playPad(padBuffer());
    processor.playPad(padBuffer());
    bufferSourceOf(context, 0).onended?.();

    processor.playPad(padBuffer());

    expect(context.createBufferSource).toHaveBeenCalledTimes(4);
  });

  it("stops and disconnects every pad on stopAllPads", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));

    processor.playPad(padBuffer());
    processor.playPad(padBuffer());
    const first = bufferSourceOf(context, 0);
    const second = bufferSourceOf(context, 1);

    processor.stopAllPads();

    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledOnce();
    expect(gainOf(context, 1).disconnect).toHaveBeenCalled();
    expect(gainOf(context, 2).disconnect).toHaveBeenCalled();
  });

  it("disconnects a pad when it ends on its own", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));

    processor.playPad(padBuffer());
    const padSource = bufferSourceOf(context);
    const padGain = gainOf(context, 1);

    padSource.onended?.();

    expect(padGain.disconnect).toHaveBeenCalled();
    // A later stopAllPads must not try to stop it again.
    processor.stopAllPads();
    expect(padSource.stop).not.toHaveBeenCalled();
  });

  it("rebuilds the graph on restart, even without an audioContext in the options", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));
    const oldSource = sourceOf(context);
    const oldMicGain = gainOf(context);
    const oldDestination = destinationOf(context);
    const oldProcessed = processor.processedTrack;

    const newMic = { id: "mic-2" } as unknown as MediaStreamTrack;
    // LiveKit's restart path (LocalTrack.setMediaStreamTrack) calls restart
    // without an audioContext, so the processor has to remember its own.
    await processor.restart({
      kind: Track.Kind.Audio,
      track: newMic,
    } as AudioProcessorOptions);

    expect(oldSource.disconnect).toHaveBeenCalled();
    expect(oldMicGain.disconnect).toHaveBeenCalled();
    expect(oldDestination.disconnect).toHaveBeenCalled();
    expect(context.createMediaStreamSource).toHaveBeenCalledTimes(2);
    const newArg = context.createMediaStreamSource.mock.calls[1][0] as unknown as {
      tracks: MediaStreamTrack[];
    };
    expect(newArg.tracks).toEqual([newMic]);
    expect(processor.processedTrack).not.toBe(oldProcessed);
  });

  it("stops pads, stops the processed track and disconnects on destroy", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));
    processor.playPad(padBuffer());
    const padSource = bufferSourceOf(context);
    const destination = destinationOf(context);
    const processed = processor.processedTrack!;

    await processor.destroy();

    expect(padSource.stop).toHaveBeenCalledOnce();
    expect(destination.disconnect).toHaveBeenCalled();
    expect(processed.stop).toHaveBeenCalledOnce();
    expect(processor.processedTrack).toBeUndefined();
  });
});

/** Runs pending microtasks so a resolved attach promise can be observed. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A fake denoise stage whose dispose posts "destroy", like the real one. */
function fakeStage(): {
  stage: DenoiseStage;
  dispose: ReturnType<typeof vi.fn>;
  port: { postMessage: ReturnType<typeof vi.fn> };
} {
  const port = { postMessage: vi.fn() };
  const dispose = vi.fn(() => port.postMessage("destroy"));
  return { stage: { dispose }, dispose, port };
}

describe("SoundboardAudioProcessor noise cancellation", () => {
  beforeEach(() => {
    vi.mocked(readNoiseCancellationMode).mockReturnValue("browser");
    vi.mocked(attachDenoiseStage).mockReset().mockResolvedValue(null);
  });

  it("with gtcrn, init attaches the stage between micGain and destination", async () => {
    vi.mocked(readNoiseCancellationMode).mockReturnValue("gtcrn");

    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));

    expect(attachDenoiseStage).toHaveBeenCalledOnce();
    expect(attachDenoiseStage).toHaveBeenCalledWith(
      context,
      gainOf(context),
      destinationOf(context),
    );
  });

  it("with browser and off, init does not attach a stage", async () => {
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));
    await processor.destroy();

    vi.mocked(readNoiseCancellationMode).mockReturnValue("off");
    const offProcessor = new SoundboardAudioProcessor();
    await offProcessor.init(initOptions(context));

    expect(attachDenoiseStage).not.toHaveBeenCalled();
  });

  it("destroy disposes exactly the held stage", async () => {
    vi.mocked(readNoiseCancellationMode).mockReturnValue("gtcrn");
    const { stage, dispose, port } = fakeStage();
    vi.mocked(attachDenoiseStage).mockResolvedValue(stage);

    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));
    await flush();
    expect(dispose).not.toHaveBeenCalled();

    await processor.destroy();

    expect(dispose).toHaveBeenCalledOnce();
    expect(port.postMessage).toHaveBeenCalledWith("destroy");
  });

  it("disposes a stage that resolves after destroy instead of holding it", async () => {
    vi.mocked(readNoiseCancellationMode).mockReturnValue("gtcrn");
    let resolveStage!: (stage: DenoiseStage | null) => void;
    const pending = new Promise<DenoiseStage | null>((resolve) => {
      resolveStage = resolve;
    });
    vi.mocked(attachDenoiseStage).mockReturnValue(pending);

    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));
    await processor.destroy();

    const { stage, dispose } = fakeStage();
    resolveStage(stage);
    await flush();

    expect(dispose).toHaveBeenCalledOnce();
    // Not held: a second destroy has nothing left to dispose.
    await processor.destroy();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("restart leaves exactly one live stage and no leak", async () => {
    vi.mocked(readNoiseCancellationMode).mockReturnValue("gtcrn");

    const first = fakeStage();
    vi.mocked(attachDenoiseStage).mockResolvedValue(first.stage);
    const processor = new SoundboardAudioProcessor();
    await processor.init(initOptions(context));
    await flush();
    expect(first.dispose).not.toHaveBeenCalled();

    const second = fakeStage();
    vi.mocked(attachDenoiseStage).mockResolvedValue(second.stage);
    await processor.restart({
      kind: Track.Kind.Audio,
      track: { id: "mic-2" } as unknown as MediaStreamTrack,
    } as AudioProcessorOptions);
    await flush();

    expect(attachDenoiseStage).toHaveBeenCalledTimes(2);
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).not.toHaveBeenCalled();

    await processor.destroy();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(first.dispose).toHaveBeenCalledOnce();
  });
});
