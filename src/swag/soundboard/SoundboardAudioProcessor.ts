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
 */
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

  public async init(opts: AudioProcessorOptions): Promise<void> {
    const { track, audioContext } = opts;
    // Remember the context: LiveKit's restart path (LocalTrack's
    // setMediaStreamTrack) calls restart() without one.
    this.audioContext = audioContext;

    this.destination = audioContext.createMediaStreamDestination();
    this.micSource = audioContext.createMediaStreamSource(
      new MediaStream([track]),
    );
    this.micGain = audioContext.createGain();
    this.micGain.gain.value = 1;
    this.micSource.connect(this.micGain);
    this.micGain.connect(this.destination);

    this.processedTrack = this.destination.stream.getAudioTracks()[0];
  }

  public async restart(opts: AudioProcessorOptions): Promise<void> {
    // The options LiveKit passes on restart omit the audioContext, so fall
    // back to the one from init before it is cleared by destroy().
    const audioContext = this.audioContext ?? opts.audioContext;
    await this.destroy();
    await this.init({ ...opts, audioContext });
  }

  public async destroy(): Promise<void> {
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
   * there is nothing to mix into. The UI checks for the processor itself.
   */
  public playPad(buffer: AudioBuffer, gain = 1): void {
    const context = this.audioContext;
    const destination = this.destination;
    if (!context || !destination) return;

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

  /** Sets how loud the microphone is in the mix. */
  public setMicGain(value: number): void {
    if (!Number.isFinite(value)) return;
    if (this.micGain) this.micGain.gain.value = Math.max(0, value);
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
