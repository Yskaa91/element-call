# Swag anchors — Element Call

The swag rule: every feature lives in its own directory, `src/swag/<feature>/`. Upstream files are
touched only by *anchors*: a registration line, a capability request, a render slot. No anchor hunk
should be larger than about 20 lines. This file records every anchor and why it exists, and is updated
in the same commit as the anchor. Rebases should conflict here, and in the anchors, and nowhere else.

## Anchors added by phase 2 (soundboard)

| Upstream file  | Anchor                                                                                                                    | Why                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/widget.ts` | `{ eventType: EventType.SpaceParent }` added to `receiveState`                                                             | The soundboard's space room is the state key of the call room's `m.space.parent` event, so the widget has to be allowed to receive it.                    |
| `src/widget.ts` | `api.requestCapability(MatrixCapabilities.MSC4039UploadFile)`                                                              | Pad audio is uploaded to the media repository through the widget API; Element Call had no code calling `uploadFile` before.                              |
| `src/widget.ts` | `api.requestCapabilityForRoomTimeline(roomId)` and `api.requestCapabilityToReceiveState(EventType.SpaceParent)`             | The raw widget API only reads state for rooms whose timeline it has been granted, and the space parent lives in the call's own room.                     |

The space room's own timeline and the board's state capabilities are requested from
`src/swag/soundboard/boardClient.ts` once `m.space.parent` has been read, and renegotiated with
`api.updateRequestedCapabilities()` (MSC2974). That is swag code, not an anchor.

The board module (`src/swag/soundboard/board.ts`) and the check workflow
(`.github/workflows/swag-check.yaml`) add no anchor.
