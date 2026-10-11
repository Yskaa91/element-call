/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  WidgetApiToWidgetAction,
  type IRoomEvent,
  type IUpdateStateToWidgetRequestData,
  type IWidgetApiRequest,
  type WidgetApi,
} from "matrix-widget-api";
import { EventType } from "matrix-js-sdk";

import {
  SOUNDBOARD_EVENT_TYPE,
  parseBoard,
  serializeBoard,
  type SoundboardSound,
} from "./board";

/** An upload's result, in the board's terms. */
export interface UploadedSound {
  mxc: string;
  mimetype: string;
  size: number;
}

/**
 * A failure the soundboard should show rather than swallow.
 *
 * `load` and `save` would otherwise return an empty board when the host
 * refuses the read, which is indistinguishable from "no pads yet".
 */
export class SoundboardError extends Error {
  public constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SoundboardError";
  }
}

const UPDATE_STATE_ACTION = `action:${WidgetApiToWidgetAction.UpdateState}`;
const NOTIFY_CAPABILITIES_ACTION = `action:${WidgetApiToWidgetAction.NotifyCapabilities}`;

/**
 * How long to wait for the host's capability notification before giving up.
 *
 * The renegotiate reply only means the host *received* the request; the
 * capabilities are actually granted a step later, when the host validates them
 * and sends `notify_capabilities`. Waiting for that is what stops an immediate
 * `load()`/`save()` from being refused. The bound keeps a host that never
 * notifies from hanging the panel forever.
 */
const CAPABILITIES_TIMEOUT_MS = 5_000;

/** Resolves when the host next reports the widget's approved capabilities. */
function waitForCapabilitiesNotification(api: WidgetApi): Promise<void> {
  return new Promise((resolve) => {
    const onNotify = (): void => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, CAPABILITIES_TIMEOUT_MS);
    const cleanup = (): void => {
      clearTimeout(timer);
      api.off(NOTIFY_CAPABILITIES_ACTION, onNotify);
    };
    api.on(NOTIFY_CAPABILITIES_ACTION, onNotify);
  });
}

/**
 * Reads and writes one space's soundboard through the raw widget API.
 *
 * The board lives in the space room, not the call room, so this must use
 * `api.readStateEvents`/`api.sendStateEvent` directly: the injected
 * `MatrixClient` only sees the room the widget is in.
 */
export class SoundboardClient {
  public constructor(
    public readonly api: WidgetApi,
    /** The call room the widget is in. */
    public readonly roomId: string,
    /** The space room that owns the board. */
    public readonly spaceRoomId: string,
  ) {}

  /** Reads the board from the space room. Rejects with {@link SoundboardError}. */
  public async load(): Promise<SoundboardSound[]> {
    let events: IRoomEvent[];
    try {
      events = await this.api.readStateEvents(SOUNDBOARD_EVENT_TYPE, undefined, undefined, [this.spaceRoomId]);
    } catch (cause) {
      throw new SoundboardError("Could not read the soundboard", cause);
    }
    return parseBoard(events[0]?.content);
  }

  /** Uploads pad audio to the media repository. Rejects with {@link SoundboardError}. */
  public async upload(file: File): Promise<UploadedSound> {
    let contentUri: string;
    try {
      ({ content_uri: contentUri } = await this.api.uploadFile(file));
    } catch (cause) {
      throw new SoundboardError("Could not upload the sound", cause);
    }
    return { mxc: contentUri, mimetype: file.type, size: file.size };
  }

  /** Writes the board to the space room. Rejects with {@link SoundboardError}. */
  public async save(sounds: SoundboardSound[]): Promise<void> {
    try {
      await this.api.sendStateEvent(SOUNDBOARD_EVENT_TYPE, "", serializeBoard(sounds), this.spaceRoomId);
    } catch (cause) {
      throw new SoundboardError("Could not save the soundboard", cause);
    }
  }

  /**
   * Calls back whenever the host reports a change to the board.
   *
   * The host sends the board's state event as an `update_state` widget action;
   * this acknowledges it and forwards board changes to the subscriber.
   *
   * @returns A function that stops listening.
   */
  public subscribe(callback: () => void): () => void {
    const handler = (ev: CustomEvent<IWidgetApiRequest>): void => {
      const data = ev.detail.data as IUpdateStateToWidgetRequestData;
      ev.preventDefault();
      this.api.transport.reply(ev.detail, {});
      if (data.state?.some((event) => event.type === SOUNDBOARD_EVENT_TYPE)) callback();
    };
    this.api.on(UPDATE_STATE_ACTION, handler);
    return () => this.api.off(UPDATE_STATE_ACTION, handler);
  }
}

/**
 * Finds the space that owns the call room's soundboard.
 *
 * The space room id is the state key of the call room's `m.space.parent`
 * state event. A room can be in several spaces; the canonical parent
 * (`content.canonical === true`) wins, falling back to the first parent when
 * none is marked canonical. Returns null when the room is in no space.
 */
export async function resolveSpaceRoomId(api: WidgetApi, roomId: string): Promise<string | null> {
  let events: IRoomEvent[];
  try {
    events = await api.readStateEvents(EventType.SpaceParent, undefined, undefined, [roomId]);
  } catch (cause) {
    throw new SoundboardError("Could not read the room's space parent", cause);
  }
  const parents = events.filter(
    (event) => typeof event.state_key === "string" && event.state_key.length > 0,
  );
  const canonical = parents.find(
    (event) => (event.content as { canonical?: unknown } | undefined)?.canonical === true,
  );
  return (canonical ?? parents[0])?.state_key ?? null;
}

/**
 * Builds a client for the call room's space, or null when it has none.
 *
 * Requesting the space's timeline and the board's state capabilities happens
 * here, once the space room is known, and renegotiates the widget's
 * capabilities (MSC2974) so the host can approve them. The returned client only
 * resolves once the host has actually granted them (its `notify_capabilities`
 * action), so a `load()` issued straight afterwards is not refused.
 */
export async function createSoundboardClient(api: WidgetApi, roomId: string): Promise<SoundboardClient | null> {
  const spaceRoomId = await resolveSpaceRoomId(api, roomId);
  if (spaceRoomId === null) return null;

  api.requestCapabilityForRoomTimeline(spaceRoomId);
  api.requestCapabilityToReceiveState(SOUNDBOARD_EVENT_TYPE);
  api.requestCapabilityToSendState(SOUNDBOARD_EVENT_TYPE);

  // Register before asking, so a fast notification is not missed.
  const capabilitiesGranted = waitForCapabilitiesNotification(api);
  try {
    await api.updateRequestedCapabilities();
  } catch (cause) {
    throw new SoundboardError("Could not request the soundboard capabilities", cause);
  }
  await capabilitiesGranted;

  return new SoundboardClient(api, roomId, spaceRoomId);
}
