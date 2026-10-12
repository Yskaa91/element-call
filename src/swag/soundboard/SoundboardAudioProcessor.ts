/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type {
  AudioProcessorOptions,
  Track,
  TrackProcessor,
} from "livekit-client";

import { attachDenoiseStage, type DenoiseStage } from "../nc/denoiseStage.ts";
import { readNoiseCancellationMode } from "../nc/mode.ts";

/**
 * Mixes soundboard pads into the outgoing microphone audio.
 *
 * A LiveKit audio `TrackProcessor`. The graph is
 *
 *   mic  ->  micGain  --.
 *                        '-->  destination
 *   pad  ->  padGain  --'
 *
 * where `destination` is a `MediaStreamAudioDestinationNode`; its first audio
 * track becomes the processed track the SDK publishes in place of the raw
 * microphone. Each `playPad` gets its own source and gain, so pads mix with
 * the voice and with each other.
 *
 * LiveKit's mute only disables the *source* microphone track, so the mixed
 * output keeps streaming while the user appears muted: pads stay audible.
 *
 * When the noise-cancellation mode is `gtcrn` an optional GTCRN denoise stage
 * is spliced between `micGain` and `destination`, so only the microphone is
 * denoised — pads connect straight to `destination` and stay out of the stage.
 */

/** The gain a pad plays at when the caller does not pick one. */
export const DEFAULT_PAD_GAIN = 0.8;

/** How many pads may play at once; further triggers are ignored. */
const MAX_CONCURRENT_PADS = 3;

export class SoundboardAudioProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  public readonly name = "soundboard-audio-processor";

  public processedTrack?: MediaStreamTrack;

  private audioContext?: AudioContext;
  private micSource?: MediaStreamAudioSourceNode;
  private micGain?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private readonly pads = new Set<{
    source: AudioBufferSourceNode;
    gain: GainNode;
  }>();

  private denoiseStage?: DenoiseStage;
  private denoiseGeneration = 0;

  public async init(opts: AudioProcessorOptions): Promise<void> {
    const { track, audioContext } = opts;
    // Remember the context: LiveKit's restart path (LocalTrack's
    // setMediaStreamTrack) calls restart() without one.
    this.audioContext = audioContext;

    // A new init invalidates any stage held or still attaching from an older
    // graph, so dispose it now; the attach below starts a fresh attempt.
    this.denoiseGeneration++;
    this.denoiseStage?.dispose();
    this.denoiseStage = undefined;

    this.destination = audioContext.createMediaStreamDestination();
    this.micSource = audioContext.createMediaStreamSource(
      new MediaStream([track]),
    );
    this.micGain = audioContext.createGain();
    this.micGain.gain.value = 1;
    this.micSource.connect(this.micGain);
    this.micGain.connect(this.destination);

    this.processedTrack = this.destination.stream.getAudioTracks()[0];

    // Start the denoise attach without awaiting it: the wasm fetch must not
    // delay the published track or the join. The generation counter lets the
    // resolution handler discard a stage whose graph has since been torn down
    // or rebuilt (a destroy() or a newer init()/restart()).
    if (readNoiseCancellationMode() === "gtcrn") {
      const generation = this.denoiseGeneration;
      void attachDenoiseStage(audioContext, this.micGain, this.destination).then(
        (stage) => {
          if (!stage) return;
          if (generation !== this.denoiseGeneration) {
            stage.dispose();
            return;
          }
          this.denoiseStage = stage;
        },
      );
    }
  }

  public async restart(opts: AudioProcessorOptions): Promise<void> {
    // The options LiveKit passes on restart omit the audioContext, so fall
    // back to the one from init before it is cleared by destroy().
    const audioContext = this.audioContext ?? opts.audioContext;
    await this.destroy();
    await this.init({ ...opts, audioContext });
  }

  public async destroy(): Promise<void> {
    // Any stage still attaching now resolves against a graph that is about to
    // be torn down; bumping the generation first makes it dispose itself.
    this.denoiseGeneration++;
    this.denoiseStage?.dispose();
    this.denoiseStage = undefined;

    this.stopAllPads();
    this.micSource?.disconnect();
    this.micGain?.disconnect();
    this.destination?.disconnect();
    this.processedTrack?.stop();
    this.micSource = undefined;
    this.micGain = undefined;
    this.destination = undefined;
    this.processedTrack = undefined;
    this.audioContext = undefined;
  }

  /**
   * Plays one pad into the outgoing mix.
   *
   * Does nothing before {@link init} or after {@link destroy}: with no graph
   * there is nothing to mix into. The UI checks for the processor itself. At
   * most {@link MAX_CONCURRENT_PADS} pads play at once; further triggers are
   * dropped so a user cannot flood the call.
   */
  public playPad(buffer: AudioBuffer, gain: number = DEFAULT_PAD_GAIN): void {
    const context = this.audioContext;
    const destination = this.destination;
    if (!context || !destination) return;
    if (this.pads.size >= MAX_CONCURRENT_PADS) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    const padGain = context.createGain();
    padGain.gain.value = gain;
    source.connect(padGain);
    padGain.connect(destination);

    const pad = { source, gain: padGain };
    this.pads.add(pad);
    source.onended = (): void => this.disconnectPad(pad);
    source.start();
  }

  /** Stops and disconnects every pad currently playing. */
  public stopAllPads(): void {
    for (const pad of [...this.pads]) {
      pad.source.stop();
      this.disconnectPad(pad);
    }
  }

  private disconnectPad(pad: {
    source: AudioBufferSourceNode;
    gain: GainNode;
  }): void {
    if (!this.pads.delete(pad)) return;
    pad.source.onended = null;
    pad.source.disconnect();
    pad.gain.disconnect();
  }
}
