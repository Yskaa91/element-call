/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Track,
  type AudioProcessorOptions,
  type TrackProcessor,
} from "livekit-client";

/** The LiveKit processor name for the DeepFilterNet3 denoiser. */
export const DEEPFILTERNET_PROCESSOR_NAME = "swag-deepfilternet3";

/**
 * Whether this browser can run the DeepFilterNet3 worklet.
 *
 * The model runs in an AudioWorklet over WebAssembly; the loader streams the
 * model through CompressionStream and requires a secure context. Anything
 * missing rejects in `init` so the caller can fall back to browser noise
 * suppression.
 */
export function isDeepFilterNetSupported(): boolean {
  try {
    if (typeof WebAssembly === "undefined") return false;
    if (typeof CompressionStream === "undefined") return false;
    if (typeof AudioWorkletNode === "undefined") return false;
    if (
      typeof globalThis.isSecureContext === "boolean" &&
      !globalThis.isSecureContext
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

interface DeepFilterNetHandle {
  node: AudioWorkletNode;
  ready: Promise<unknown>;
  dispose(): void;
}

class DeepFilterNetProcessor implements TrackProcessor<
  Track.Kind.Audio,
  AudioProcessorOptions
> {
  public readonly name = DEEPFILTERNET_PROCESSOR_NAME;
  public processedTrack?: MediaStreamTrack;

  private context?: AudioContext;
  private ownsContext = false;
  private source?: MediaStreamAudioSourceNode;
  private handle?: DeepFilterNetHandle;

  public async init(opts: AudioProcessorOptions): Promise<void> {
    if (!isDeepFilterNetSupported()) {
      throw new Error(
        `${DEEPFILTERNET_PROCESSOR_NAME}: WebAssembly, AudioWorklet or CompressionStream unavailable`,
      );
    }
    await this.attach(opts);
  }

  public async restart(opts: AudioProcessorOptions): Promise<void> {
    this.teardown();
    await this.attach(opts);
  }

  public async destroy(): Promise<void> {
    const context = this.context;
    const ownsContext = this.ownsContext;
    this.teardown();
    this.context = undefined;
    this.ownsContext = false;
    if (context !== undefined && ownsContext) {
      await context.close();
    }
  }

  /**
   * Builds `mic track → DeepFilterNet worklet → destination` and publishes
   * the destination's track as the processed track.
   *
   * Only the `/deepfilternet` entrypoint is ever imported, and only here, so
   * the ~11 MB WASM/model stays out of the initial bundle until this mode is
   * actually used.
   */
  private async attach(opts: AudioProcessorOptions): Promise<void> {
    const { createDeepFilterNetAudioWorklet, DEEPFILTERNET_SAMPLE_RATE } =
      await import("@workadventure/noise-suppression/deepfilternet");

    const provided = opts.audioContext;
    if (provided !== undefined && provided !== null) {
      if (provided.sampleRate !== DEEPFILTERNET_SAMPLE_RATE) {
        throw new Error(
          `${DEEPFILTERNET_PROCESSOR_NAME}: AudioContext must run at ${DEEPFILTERNET_SAMPLE_RATE} Hz, got ${provided.sampleRate} Hz`,
        );
      }
      this.context = provided;
      this.ownsContext = false;
    } else {
      this.context = new AudioContext({
        sampleRate: DEEPFILTERNET_SAMPLE_RATE,
      });
      this.ownsContext = true;
    }
    const context = this.context;
    await context.resume();

    const source = new MediaStreamAudioSourceNode(context, {
      mediaStream: new MediaStream([opts.track]),
    });
    const destination = context.createMediaStreamDestination();
    const handle = (await createDeepFilterNetAudioWorklet(context, {
      bypassUntilReady: true,
    })) as DeepFilterNetHandle;
    source.connect(handle.node);
    handle.node.connect(destination);
    await handle.ready;

    this.source = source;
    this.handle = handle;
    const [processed] = destination.stream.getAudioTracks();
    if (processed === undefined) {
      throw new Error(`${DEEPFILTERNET_PROCESSOR_NAME}: no processed track`);
    }
    this.processedTrack = processed;
  }

  /**
   * Tears the graph down: disposes the worklet, disconnects the nodes, and
   * stops only the processed track. The original mic track is never stopped,
   * and a caller-provided context is never closed here.
   */
  private teardown(): void {
    try {
      this.handle?.dispose();
    } catch {
      // Best effort: teardown must not throw.
    }
    try {
      this.source?.disconnect();
      this.handle?.node.disconnect();
    } catch {
      // Best effort: teardown must not throw.
    }
    try {
      this.processedTrack?.stop();
    } catch {
      // Best effort: teardown must not throw.
    }
    this.handle = undefined;
    this.source = undefined;
    this.processedTrack = undefined;
  }
}

/** A LiveKit audio track processor running DeepFilterNet3 denoising. */
export function createDeepFilterNetProcessor(): TrackProcessor<
  Track.Kind.Audio,
  AudioProcessorOptions
> {
  return new DeepFilterNetProcessor();
}
