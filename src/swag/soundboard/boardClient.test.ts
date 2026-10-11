/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { EventType } from "matrix-js-sdk";
import {
  WidgetApiToWidgetAction,
  type IRoomEvent,
  type IWidgetApiRequest,
  type WidgetApi,
} from "matrix-widget-api";

import { SOUNDBOARD_EVENT_TYPE, type SoundboardSound } from "./board";
import {
  SoundboardClient,
  SoundboardError,
  createSoundboardClient,
  resolveSpaceRoomId,
} from "./boardClient";

const ROOM_ID = "!call:example.org";
const SPACE_ID = "!space:example.org";

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

function boardEvent(): IRoomEvent {
  return {
    type: SOUNDBOARD_EVENT_TYPE,
    sender: "@alice:example.org",
    event_id: "$board",
    room_id: SPACE_ID,
    state_key: "",
    origin_server_ts: 1_700_000_000_000,
    content: {
      version: 1,
      sounds: [
        {
          id: SOUND.id,
          name: SOUND.name,
          mxc: SOUND.mxc,
          mimetype: SOUND.mimetype,
          size: SOUND.size,
          duration_ms: SOUND.durationMs,
          added_by: SOUND.addedBy,
          added_ts: SOUND.addedTs,
        },
      ],
    },
    unsigned: {},
  };
}

function spaceParentEvent(): IRoomEvent {
  return {
    type: EventType.SpaceParent,
    sender: "@alice:example.org",
    event_id: "$parent",
    room_id: ROOM_ID,
    state_key: SPACE_ID,
    origin_server_ts: 1,
    content: { via: ["example.org"], canonical: true },
    unsigned: {},
  };
}

interface MockApi {
  readStateEvents: ReturnType<typeof vi.fn>;
  uploadFile: ReturnType<typeof vi.fn>;
  sendStateEvent: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  transport: { reply: ReturnType<typeof vi.fn> };
  requestCapabilityForRoomTimeline: ReturnType<typeof vi.fn>;
  requestCapabilityToReceiveState: ReturnType<typeof vi.fn>;
  requestCapabilityToSendState: ReturnType<typeof vi.fn>;
  updateRequestedCapabilities: ReturnType<typeof vi.fn>;
}

function mockApi(overrides: Partial<MockApi> = {}): MockApi & WidgetApi {
  return {
    readStateEvents: vi.fn(),
    uploadFile: vi.fn(),
    sendStateEvent: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    transport: { reply: vi.fn() },
    requestCapabilityForRoomTimeline: vi.fn(),
    requestCapabilityToReceiveState: vi.fn(),
    requestCapabilityToSendState: vi.fn(),
    updateRequestedCapabilities: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MockApi & WidgetApi;
}

function updateStateEvent(state: IRoomEvent[]): CustomEvent<IWidgetApiRequest> {
  return {
    detail: { data: { state } },
    preventDefault: vi.fn(),
  } as unknown as CustomEvent<IWidgetApiRequest>;
}

describe("SoundboardClient.load", () => {
  it("reads the board from the space room and parses it", async () => {
    const api = mockApi();
    api.readStateEvents.mockResolvedValue([boardEvent()]);

    const client = new SoundboardClient(api, ROOM_ID, SPACE_ID);
    await expect(client.load()).resolves.toEqual([SOUND]);
    expect(api.readStateEvents).toHaveBeenCalledWith(SOUNDBOARD_EVENT_TYPE, undefined, undefined, [SPACE_ID]);
  });

  it("returns an empty board when the space has no board event", async () => {
    const api = mockApi();
    api.readStateEvents.mockResolvedValue([]);

    const client = new SoundboardClient(api, ROOM_ID, SPACE_ID);
    await expect(client.load()).resolves.toEqual([]);
  });

  it("surfaces a refused read as a typed error, not an empty board", async () => {
    const api = mockApi();
    api.readStateEvents.mockRejectedValue(new Error("Unable to access room timeline"));

    const client = new SoundboardClient(api, ROOM_ID, SPACE_ID);
    await expect(client.load()).rejects.toBeInstanceOf(SoundboardError);
  });
});

describe("SoundboardClient.upload", () => {
  it("returns the mxc and the file's type and size", async () => {
    const api = mockApi();
    api.uploadFile.mockResolvedValue({ content_uri: "mxc://example.org/uploaded" });

    const file = new File([new Uint8Array(1234)], "horn.ogg", { type: "audio/ogg" });
    const client = new SoundboardClient(api, ROOM_ID, SPACE_ID);

    await expect(client.upload(file)).resolves.toEqual({
      mxc: "mxc://example.org/uploaded",
      mimetype: "audio/ogg",
      size: 1234,
    });
    expect(api.uploadFile).toHaveBeenCalledWith(file);
  });

  it("surfaces a failed upload as a typed error", async () => {
    const api = mockApi();
    api.uploadFile.mockRejectedValue(new Error("nope"));

    const client = new SoundboardClient(api, ROOM_ID, SPACE_ID);
    await expect(client.upload(new File([], "horn.ogg", { type: "audio/ogg" }))).rejects.toBeInstanceOf(
      SoundboardError,
    );
  });
});

describe("SoundboardClient.save", () => {
  it("sends the board to the space room with the empty state key", async () => {
    const api = mockApi();
    api.sendStateEvent.mockResolvedValue({ room_id: SPACE_ID, event_id: "$saved" });

    const client = new SoundboardClient(api, ROOM_ID, SPACE_ID);
    await client.save([SOUND]);

    expect(api.sendStateEvent).toHaveBeenCalledWith(
      SOUNDBOARD_EVENT_TYPE,
      "",
      {
        version: 1,
        sounds: [
          {
            id: SOUND.id,
            name: SOUND.name,
            mxc: SOUND.mxc,
            mimetype: SOUND.mimetype,
            size: SOUND.size,
            duration_ms: SOUND.durationMs,
            added_by: SOUND.addedBy,
            added_ts: SOUND.addedTs,
          },
        ],
      },
      SPACE_ID,
    );
  });

  it("surfaces a failed save as a typed error", async () => {
    const api = mockApi();
    api.sendStateEvent.mockRejectedValue(new Error("nope"));

    const client = new SoundboardClient(api, ROOM_ID, SPACE_ID);
    await expect(client.save([])).rejects.toBeInstanceOf(SoundboardError);
  });
});

describe("SoundboardClient.subscribe", () => {
  it("fires on an update_state event for the board", () => {
    const api = mockApi();
    const client = new SoundboardClient(api, ROOM_ID, SPACE_ID);
    const callback = vi.fn();

    client.subscribe(callback);
    expect(api.on).toHaveBeenCalledWith(
      `action:${WidgetApiToWidgetAction.UpdateState}`,
      expect.any(Function),
    );

    const handler = api.on.mock.calls[0][1] as (ev: CustomEvent<IWidgetApiRequest>) => void;
    const event = updateStateEvent([boardEvent()]);
    handler(event);

    expect(callback).toHaveBeenCalledTimes(1);
    // The host's action must be acknowledged, or it replies with an error.
    expect(event.preventDefault).toHaveBeenCalled();
    expect(api.transport.reply).toHaveBeenCalledWith(event.detail, {});
  });

  it("ignores update_state events for other event types", () => {
    const api = mockApi();
    const client = new SoundboardClient(api, ROOM_ID, SPACE_ID);
    const callback = vi.fn();

    client.subscribe(callback);
    const handler = api.on.mock.calls[0][1] as (ev: CustomEvent<IWidgetApiRequest>) => void;
    handler(updateStateEvent([{ ...boardEvent(), type: "m.room.name" }]));

    expect(callback).not.toHaveBeenCalled();
  });

  it("stops listening when unsubscribed", () => {
    const api = mockApi();
    const client = new SoundboardClient(api, ROOM_ID, SPACE_ID);

    const unsubscribe = client.subscribe(vi.fn());
    unsubscribe();

    expect(api.off).toHaveBeenCalledWith(
      `action:${WidgetApiToWidgetAction.UpdateState}`,
      api.on.mock.calls[0][1],
    );
  });
});

describe("resolveSpaceRoomId", () => {
  it("reads the space room id from the state key", async () => {
    const api = mockApi();
    api.readStateEvents.mockResolvedValue([spaceParentEvent()]);

    await expect(resolveSpaceRoomId(api, ROOM_ID)).resolves.toBe(SPACE_ID);
    expect(api.readStateEvents).toHaveBeenCalledWith(EventType.SpaceParent, undefined, undefined, [ROOM_ID]);
  });

  it("returns null when the room has no space parent", async () => {
    const api = mockApi();
    api.readStateEvents.mockResolvedValue([]);

    await expect(resolveSpaceRoomId(api, ROOM_ID)).resolves.toBeNull();
  });
});

describe("createSoundboardClient", () => {
  it("returns null when the room has no space parent, and requests nothing", async () => {
    const api = mockApi();
    api.readStateEvents.mockResolvedValue([]);

    await expect(createSoundboardClient(api, ROOM_ID)).resolves.toBeNull();
    expect(api.requestCapabilityForRoomTimeline).not.toHaveBeenCalled();
  });

  it("requests the space timeline and the board state capabilities", async () => {
    const api = mockApi();
    api.readStateEvents.mockResolvedValue([spaceParentEvent()]);

    const client = await createSoundboardClient(api, ROOM_ID);

    expect(client).toBeInstanceOf(SoundboardClient);
    expect(client?.spaceRoomId).toBe(SPACE_ID);
    expect(api.requestCapabilityForRoomTimeline).toHaveBeenCalledWith(SPACE_ID);
    expect(api.requestCapabilityToReceiveState).toHaveBeenCalledWith(SOUNDBOARD_EVENT_TYPE);
    expect(api.requestCapabilityToSendState).toHaveBeenCalledWith(SOUNDBOARD_EVENT_TYPE);
    expect(api.updateRequestedCapabilities).toHaveBeenCalled();
  });
});
