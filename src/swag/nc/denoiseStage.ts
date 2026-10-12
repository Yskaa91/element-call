/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";

import wasmUrl from "./assets/gtcrn.wasm?url";
import workletUrl from "./assets/gtcrn-worklet.js?url";

/** The worklet processor id registered by the vendored GTCRN module. */
export const GTCRN_PROCESSOR_ID = "@sapphi-red/web-noise-suppressor/gtcrn";

/**
 * Contexts where `addModule` has already completed successfully. Re-registering
 * a processor id on one context throws, and `SoundboardAudioProcessor`
 * reuses its `AudioContext` across restarts, so the second attach in `gtcrn`
 * mode would otherwise fail and silently leave the mic undenoised.
 */
const registeredWorkletContexts = new WeakSet<AudioContext>();

export interface DenoiseStage {
  dispose(): void;
}

/**
 * Splice the GTCRN denoiser between `input` and `output`, which arrive
 * already connected to each other. On success the direct connection is
 * replaced by `input → worklet → output`; on any failure the direct
 * connection is left exactly as it was and `null` is returned. Never throws.
 */
export async function attachDenoiseStage(
  audioContext: AudioContext,
  input: AudioNode,
  output: AudioNode,
): Promise<DenoiseStage | null> {
  try {
    const wasmBinary = await (await fetch(wasmUrl)).arrayBuffer();
    if (!(wasmBinary instanceof ArrayBuffer)) {
      throw new Error("GTCRN wasm binary did not resolve to an ArrayBuffer");
    }
    if (!registeredWorkletContexts.has(audioContext)) {
      await audioContext.audioWorklet.addModule(workletUrl);
      registeredWorkletContexts.add(audioContext);
    }
    const node = new AudioWorkletNode(audioContext, GTCRN_PROCESSOR_ID, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      processorOptions: { maxChannels: 1, wasmBinary },
    });

    try {
      input.disconnect(output);
      input.connect(node);
      node.connect(output);
    } catch (err) {
      // Rewiring failed part-way: undo whatever stuck, then put the direct
      // connection back before the outer catch reports the failure.
      try {
        node.disconnect();
        input.disconnect(node);
      } catch {
        // best effort; the restored direct connection below is the guarantee
      }
      input.connect(output);
      throw err;
    }

    let disposed = false;
    return {
      dispose(): void {
        if (disposed) return;
        disposed = true;
        node.port.postMessage("destroy");
        node.disconnect();
        input.disconnect(node);
        input.connect(output);
      },
    };
  } catch (err) {
    logger.warn("attachDenoiseStage failed; microphone left undenoised", err);
    return null;
  }
}
