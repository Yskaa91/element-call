/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import wasmUrl from "./assets/gtcrn.wasm?url";
import workletUrl from "./assets/gtcrn-worklet.js?url";
import {
  attachDenoiseStage,
  type DenoiseStage,
  GTCRN_PROCESSOR_ID,
} from "./denoiseStage.ts";

interface FakeNode {
  node: AudioNode;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function fakeNode(): FakeNode {
  const connect = vi.fn();
  const disconnect = vi.fn();
  return {
    node: { connect, disconnect } as unknown as AudioNode,
    connect,
    disconnect,
  };
}

/**
 * A stand-in for the pieces of Web Audio the stage touches: the context's
 * `audioWorklet.addModule`, the `AudioWorkletNode` global constructor, and
 * the two graph nodes. jsdom has none of these natively.
 */
function setup() {
  const wasmBinary = new ArrayBuffer(8);
  const fetchMock = vi.fn(
    async (): Promise<{ arrayBuffer: () => Promise<unknown> }> => ({
      arrayBuffer: async () => wasmBinary,
    }),
  );
  const addModule = vi.fn(async () => {});
  const workletNode = {
    port: { postMessage: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const AudioWorkletNodeMock = vi.fn(function () {
    return workletNode;
  });
  const audioContext = {
    audioWorklet: { addModule },
  } as unknown as AudioContext;
  const input = fakeNode();
  const output = fakeNode();

  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("AudioWorkletNode", AudioWorkletNodeMock);

  return {
    wasmBinary,
    fetchMock,
    addModule,
    workletNode,
    AudioWorkletNodeMock,
    audioContext,
    input,
    output,
  };
}

/**
 * Every failure path must behave identically: resolve to `null`, warn once,
 * and leave the caller's direct `input → output` connection untouched.
 */
function expectIntactFailure(stage: DenoiseStage | null, mocks: ReturnType<typeof setup>): void {
  expect(stage).toBeNull();
  expect(mocks.input.disconnect).not.toHaveBeenCalled();
  expect(mocks.input.connect).not.toHaveBeenCalled();
  expect(mocks.workletNode.connect).not.toHaveBeenCalled();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("attachDenoiseStage", () => {
  it("rewires input through the GTCRN worklet on success", async () => {
    const mocks = setup();

    const stage = await attachDenoiseStage(
      mocks.audioContext,
      mocks.input.node,
      mocks.output.node,
    );

    expect(stage).not.toBeNull();
    expect(mocks.fetchMock).toHaveBeenCalledWith(wasmUrl);
    expect(mocks.addModule).toHaveBeenCalledWith(workletUrl);
    expect(mocks.AudioWorkletNodeMock).toHaveBeenCalledWith(
      mocks.audioContext,
      GTCRN_PROCESSOR_ID,
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
        processorOptions: { maxChannels: 1, wasmBinary: mocks.wasmBinary },
      },
    );
    expect(mocks.input.disconnect).toHaveBeenCalledWith(mocks.output.node);
    expect(mocks.input.connect).toHaveBeenCalledWith(mocks.workletNode);
    expect(mocks.workletNode.connect).toHaveBeenCalledWith(mocks.output.node);
  });

  it("returns null and keeps the direct connection when addModule rejects", async () => {
    const mocks = setup();
    mocks.addModule.mockRejectedValue(new Error("module load failed"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    const stage = await attachDenoiseStage(
      mocks.audioContext,
      mocks.input.node,
      mocks.output.node,
    );

    expectIntactFailure(stage, mocks);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null and keeps the direct connection when fetch rejects", async () => {
    const mocks = setup();
    mocks.fetchMock.mockRejectedValue(new Error("network down"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    const stage = await attachDenoiseStage(
      mocks.audioContext,
      mocks.input.node,
      mocks.output.node,
    );

    expectIntactFailure(stage, mocks);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null and keeps the direct connection when the AudioWorkletNode constructor throws", async () => {
    const mocks = setup();
    mocks.AudioWorkletNodeMock.mockImplementation(function () {
      throw new Error("Unsupported sample rate: 44100.");
    });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    const stage = await attachDenoiseStage(
      mocks.audioContext,
      mocks.input.node,
      mocks.output.node,
    );

    expectIntactFailure(stage, mocks);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns null and keeps the direct connection when the wasm body is not an ArrayBuffer", async () => {
    const mocks = setup();
    mocks.fetchMock.mockResolvedValue({
      arrayBuffer: async () => new Uint8Array(8),
    });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    const stage = await attachDenoiseStage(
      mocks.audioContext,
      mocks.input.node,
      mocks.output.node,
    );

    expectIntactFailure(stage, mocks);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("registers the worklet module once per context across restarts", async () => {
    const mocks = setup();
    const input2 = fakeNode();
    const output2 = fakeNode();

    const first = await attachDenoiseStage(
      mocks.audioContext,
      mocks.input.node,
      mocks.output.node,
    );
    const second = await attachDenoiseStage(
      mocks.audioContext,
      input2.node,
      output2.node,
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(mocks.addModule).toHaveBeenCalledTimes(1);
    expect(mocks.input.disconnect).toHaveBeenCalledWith(mocks.output.node);
    expect(input2.disconnect).toHaveBeenCalledWith(output2.node);

    first!.dispose();
    second!.dispose();
    expect(mocks.workletNode.port.postMessage).toHaveBeenCalledTimes(2);
    expect(mocks.input.connect).toHaveBeenLastCalledWith(mocks.output.node);
    expect(input2.connect).toHaveBeenLastCalledWith(output2.node);

    // Idempotent after the shared-context re-attach.
    first!.dispose();
    expect(mocks.workletNode.port.postMessage).toHaveBeenCalledTimes(2);
  });

  it("dispose() destroys the worklet, restores the direct connection, and is idempotent", async () => {
    const mocks = setup();

    const stage = await attachDenoiseStage(
      mocks.audioContext,
      mocks.input.node,
      mocks.output.node,
    );
    expect(stage).not.toBeNull();

    stage!.dispose();
    expect(mocks.workletNode.port.postMessage).toHaveBeenCalledWith("destroy");
    expect(mocks.workletNode.disconnect).toHaveBeenCalled();
    expect(mocks.input.disconnect).toHaveBeenCalledWith(mocks.workletNode);
    expect(mocks.input.connect).toHaveBeenLastCalledWith(mocks.output.node);

    stage!.dispose();
    expect(mocks.workletNode.port.postMessage).toHaveBeenCalledTimes(1);
  });
});
