/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@vector-im/compound-web";
import { type WidgetApi } from "matrix-widget-api";

import { SoundboardPanel } from "./SoundboardPanel";
import { SoundboardWidgetProvider } from "./SoundboardWidgetContext";
import { setSoundboardProcessor } from "./processorHandle";
import { decodeAudio } from "./decodeAudio";
import { createSoundboardClient } from "./boardClient";
import { type SoundboardSound } from "./board";
import { type SoundboardAudioProcessor } from "./SoundboardAudioProcessor";
import {
  HostBridgeProvider,
  nullHostBridge,
  type HostBridge,
} from "../../HostBridge.ts";
import { type WidgetHelpers } from "../../widget.ts";

vi.mock("./boardClient", () => ({ createSoundboardClient: vi.fn() }));
vi.mock("./decodeAudio", () => ({ decodeAudio: vi.fn() }));

const ROOM_ID = "!call:example.org";

const SOUND: SoundboardSound = {
  id: "one",
  name: "Air horn",
  mxc: "mxc://example.org/airhorn",
  mimetype: "audio/ogg",
  size: 1234,
  durationMs: 1500,
  addedBy: "@alice:example.org",
  addedTs: 1_700_000_000_000,
};

function fakeWidget(): WidgetHelpers {
  return { api: {} as WidgetApi } as unknown as WidgetHelpers;
}

interface FakeClient {
  load: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    load: vi.fn().mockResolvedValue([SOUND]),
    upload: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

const processor = { playPad: vi.fn() } as unknown as SoundboardAudioProcessor;

let downloadMedia: ReturnType<typeof vi.fn>;
let hostBridge: HostBridge;

beforeEach(() => {
  vi.resetAllMocks();
  downloadMedia = vi.fn().mockResolvedValue(downloadedBlob());
  hostBridge = { ...nullHostBridge, downloadMedia } as HostBridge;
  vi.mocked(decodeAudio).mockResolvedValue({ duration: 1 } as AudioBuffer);
  vi.mocked(createSoundboardClient).mockResolvedValue(makeClient() as never);
  setSoundboardProcessor(processor);
});

afterEach(() => setSoundboardProcessor(null));

function renderPanel(widget: WidgetHelpers | null = fakeWidget()): void {
  render(
    <TooltipProvider>
      <HostBridgeProvider value={hostBridge}>
        <SoundboardWidgetProvider widget={widget}>
          <SoundboardPanel roomId={ROOM_ID} />
        </SoundboardWidgetProvider>
      </HostBridgeProvider>
    </TooltipProvider>,
  );
}

async function openPanel(): Promise<void> {
  await userEvent.click(await screen.findByTestId("soundboard-toggle"));
}

function soundFile(name = "small.ogg", size = 10): File {
  // jsdom's Blob/File have no arrayBuffer(), so give the file one.
  return Object.assign(
    new File([new Uint8Array(size)], name, { type: "audio/ogg" }),
    { arrayBuffer: async (): Promise<ArrayBuffer> => new ArrayBuffer(8) },
  ) as unknown as File;
}

/** A downloaded pad; jsdom's Blob has no arrayBuffer(), so supply one. */
function downloadedBlob(): Blob {
  return {
    arrayBuffer: async (): Promise<ArrayBuffer> => new ArrayBuffer(8),
  } as unknown as Blob;
}

describe("SoundboardPanel", () => {
  it("lists the board's pads", async () => {
    renderPanel();
    await openPanel();
    expect(screen.getByTestId("soundboard-pad-one")).toHaveTextContent(
      "Air horn",
    );
  });

  it("plays a pad exactly once with the decoded buffer", async () => {
    const buffer = { duration: 1 } as AudioBuffer;
    vi.mocked(decodeAudio).mockResolvedValue(buffer);
    renderPanel();
    await openPanel();

    await userEvent.click(screen.getByTestId("soundboard-pad-one"));

    await waitFor(() => expect(processor.playPad).toHaveBeenCalledTimes(1));
    expect(processor.playPad).toHaveBeenCalledWith(buffer);
    expect(downloadMedia).toHaveBeenCalledWith(SOUND.mxc);
  });

  it("rejects an over-size file with the limit reason and never uploads it", async () => {
    const client = makeClient();
    vi.mocked(createSoundboardClient).mockResolvedValue(client as never);
    renderPanel();
    await openPanel();

    await userEvent.upload(
      screen.getByTestId("soundboard-file"),
      soundFile("big.ogg", 2 * 1024 * 1024 + 1),
    );

    expect(await screen.findByTestId("soundboard-error")).toHaveTextContent(
      "Sound files must be 2 MB or smaller",
    );
    expect(client.upload).not.toHaveBeenCalled();
    expect(decodeAudio).not.toHaveBeenCalled();
  });

  it("rejects an over-long file with the limit reason", async () => {
    const client = makeClient();
    vi.mocked(createSoundboardClient).mockResolvedValue(client as never);
    vi.mocked(decodeAudio).mockResolvedValue({ duration: 31 } as AudioBuffer);
    renderPanel();
    await openPanel();

    await userEvent.upload(screen.getByTestId("soundboard-file"), soundFile());

    expect(await screen.findByTestId("soundboard-error")).toHaveTextContent(
      "Sound files must be 30 seconds or shorter",
    );
    expect(client.upload).not.toHaveBeenCalled();
  });

  it("shows an error and leaves the board unchanged when the upload fails", async () => {
    const client = makeClient({
      upload: vi.fn().mockRejectedValue(new Error("Could not upload the sound")),
    });
    vi.mocked(createSoundboardClient).mockResolvedValue(client as never);
    renderPanel();
    await openPanel();
    expect(screen.getByTestId("soundboard-pad-one")).toBeTruthy();

    await userEvent.upload(screen.getByTestId("soundboard-file"), soundFile());

    expect(await screen.findByTestId("soundboard-error")).toHaveTextContent(
      "Could not upload the sound",
    );
    expect(client.save).not.toHaveBeenCalled();
    expect(screen.getAllByTestId(/^soundboard-pad-/)).toHaveLength(1);
  });

  it("uploads and saves a new pad", async () => {
    const client = makeClient({
      upload: vi.fn().mockResolvedValue({
        mxc: "mxc://example.org/new",
        mimetype: "audio/ogg",
        size: 10,
      }),
    });
    vi.mocked(createSoundboardClient).mockResolvedValue(client as never);
    renderPanel();
    await openPanel();

    await userEvent.upload(
      screen.getByTestId("soundboard-file"),
      soundFile("new.ogg"),
    );

    await waitFor(() => expect(client.save).toHaveBeenCalledTimes(1));
    const saved = client.save.mock.calls[0][0] as SoundboardSound[];
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject({
      name: "new.ogg",
      mxc: "mxc://example.org/new",
      mimetype: "audio/ogg",
      durationMs: 1000,
    });
  });

  it("removes a pad and saves the shortened board", async () => {
    const client = makeClient();
    vi.mocked(createSoundboardClient).mockResolvedValue(client as never);
    renderPanel();
    await openPanel();

    await userEvent.click(screen.getByTestId("soundboard-delete-one"));

    await waitFor(() => expect(client.save).toHaveBeenCalledWith([]));
    expect(screen.queryByTestId("soundboard-pad-one")).toBeNull();
  });

  it("renders no pads for a malformed board without crashing", async () => {
    const client = makeClient({ load: vi.fn().mockResolvedValue([]) });
    vi.mocked(createSoundboardClient).mockResolvedValue(client as never);
    renderPanel();
    await openPanel();

    expect(screen.getByTestId("soundboard-panel")).toBeTruthy();
    expect(screen.queryAllByTestId(/^soundboard-pad-/)).toHaveLength(0);
  });

  it("hides itself when the room has no space parent", async () => {
    vi.mocked(createSoundboardClient).mockResolvedValue(null);
    renderPanel();

    await waitFor(() => expect(createSoundboardClient).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("soundboard-toggle")).toBeNull();
  });

  it("hides itself outside a widget", () => {
    renderPanel(null);
    expect(screen.queryByTestId("soundboard-toggle")).toBeNull();
    expect(createSoundboardClient).not.toHaveBeenCalled();
  });

  it("shows an error rather than hiding when the board cannot be reached", async () => {
    vi.mocked(createSoundboardClient).mockRejectedValue(
      new Error("Could not reach the soundboard"),
    );
    renderPanel();

    await openPanel();
    expect(screen.getByTestId("soundboard-error")).toHaveTextContent(
      "Could not reach the soundboard",
    );
  });
});
