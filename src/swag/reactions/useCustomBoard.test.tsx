/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { randomUploadName, useCustomBoard } from "./useCustomBoard";
import type { SoundboardBoard } from "../soundboard/board";

const { fakeClient, mockCreateClient, mockWidget } = vi.hoisted(() => {
  const fakeClient = {
    load: vi.fn(),
    upload: vi.fn(),
    save: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
  return {
    fakeClient,
    mockCreateClient: vi.fn(async () => {
      await Promise.resolve();
      return fakeClient;
    }),
    mockWidget: { api: {} },
  };
});

vi.mock("../soundboard/boardClient", () => ({
  createSoundboardClient: mockCreateClient,
}));

vi.mock("../soundboard/SoundboardWidgetContext", () => ({
  useSoundboardWidget: (): unknown => mockWidget,
}));

vi.mock("../../ClientContext.tsx", () => ({
  useClient: (): unknown => ({
    client: { getUserId: (): string => "@alice:example.org" },
  }),
}));

vi.mock("../soundboard/decodeAudio", () => ({
  decodeAudio: vi.fn(async () => {
    await Promise.resolve();
    return { duration: 1.5 };
  }),
}));

function soundFile(name = "my-horn.ogg"): File {
  const file = new File([new Uint8Array([1, 2, 3])], name, {
    type: "audio/ogg",
  });
  // jsdom's File has no arrayBuffer: the hook reads the bytes to measure
  // duration, so stub the read on the instance.
  file.arrayBuffer = async (): Promise<ArrayBuffer> => {
    await Promise.resolve();
    return new Uint8Array([1, 2, 3]).buffer as ArrayBuffer;
  };
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  const board: SoundboardBoard = { sounds: [], hiddenBuiltins: [] };
  fakeClient.load.mockResolvedValue(board);
  fakeClient.upload.mockResolvedValue({
    mxc: "mxc://example.org/uploaded",
    mimetype: "audio/ogg",
    size: 3,
  });
  fakeClient.save.mockResolvedValue(undefined);
});

describe("randomUploadName", () => {
  it("keeps the original extension", () => {
    expect(randomUploadName("my-horn.ogg")).toMatch(/^[0-9a-f-]{36}\.ogg$/);
  });

  it("has no extension when the original has none", () => {
    expect(randomUploadName("hornfile")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("drops a trailing dot", () => {
    expect(randomUploadName("horn.")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("is random per call", () => {
    expect(randomUploadName("a.ogg")).not.toBe(randomUploadName("a.ogg"));
  });
});

describe("useCustomBoard", () => {
  it("uploads a randomly named file keeping type and size; the pad name comes from the dialog", async () => {
    const { result } = renderHook(() => useCustomBoard("!room:example.org"));
    await waitFor(() => expect(result.current.editable).toBe(true));

    await result.current.add({ name: "Horn", emoji: "📯", file: soundFile() });

    expect(fakeClient.upload).toHaveBeenCalledTimes(1);
    const uploaded: File = fakeClient.upload.mock.calls[0][0];
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded.name).not.toBe("my-horn.ogg");
    expect(uploaded.name.endsWith(".ogg")).toBe(true);
    expect(uploaded.type).toBe("audio/ogg");
    expect(uploaded.size).toBe(3);

    const saved: SoundboardBoard = fakeClient.save.mock.calls[0][0];
    expect(saved.sounds).toHaveLength(1);
    expect(saved.sounds[0].name).toBe("Horn");
  });

  it("reserves built-in reaction names for new pads", async () => {
    const { result } = renderHook(() => useCustomBoard("!room:example.org"));
    await waitFor(() => expect(result.current.editable).toBe(true));

    await result.current.add({ name: "party", emoji: "📯", file: soundFile() });

    const saved: SoundboardBoard = fakeClient.save.mock.calls[0][0];
    expect(saved.sounds[0].name).not.toBe("party");
    expect(saved.sounds[0].name).toBe("party (2)");
  });

  it("hideBuiltin saves the board with the name hidden", async () => {
    const { result } = renderHook(() => useCustomBoard("!room:example.org"));
    await waitFor(() => expect(result.current.editable).toBe(true));

    await act(async () => {
      await result.current.hideBuiltin("thumbsup");
    });

    expect(result.current.hiddenBuiltins).toEqual(["thumbsup"]);
    const saved: SoundboardBoard = fakeClient.save.mock.calls[0][0];
    expect(saved.hiddenBuiltins).toEqual(["thumbsup"]);
  });
});
