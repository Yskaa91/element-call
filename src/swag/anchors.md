# Swag anchors — Element Call

The swag rule: every feature lives in its own directory, `src/swag/<feature>/`. Upstream files are
touched only by *anchors*: a registration line, a capability request, a render slot. No anchor hunk
should be larger than about 20 lines. This file records every anchor and why it exists, and is updated
in the same commit as the anchor. Rebases should conflict here, and in the anchors, and nowhere else.

## Anchors added by phase 3 (speaking ring)

| Upstream file  | Anchor | Why |
| -------------- | ------ | --- |
| `src/widget.ts` | `ElementWidgetActions.Speaking = "io.element.call.speaking"` enum entry | Phase 3 speaking ring: the outward widget action that carries `{ roomId, userIds, ts }` to the host. The action name is the contract a stock Element Web host listens (or rejects) for. |
| `src/HostBridge.ts` | `SpeakingState` type, `notifySpeaking` on `HostBridge`, in `nullHostBridge` and `createWidgetHostBridge` | Phase 3 speaking ring: `src/swag/speaking` calls `hostBridge.notifySpeaking(...)` to reach the Element Web host; the null bridge keeps standalone Element Call unaffected. |

---

## Anchors added by phase 2 (soundboard)

| Upstream file  | Anchor                                                                                                                    | Why                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/widget.ts` | `{ eventType: EventType.SpaceParent }` added to `receiveState`                                                             | The soundboard's space room is the state key of the call room's `m.space.parent` event, so the widget has to be allowed to receive it.                    |
| `src/widget.ts` | `api.requestCapability(MatrixCapabilities.MSC4039UploadFile)`                                                              | Pad audio is uploaded to the media repository through the widget API; Element Call had no code calling `uploadFile` before.                              |
| `src/widget.ts` | `api.requestCapabilityForRoomTimeline(roomId)` and `api.requestCapabilityToReceiveState(EventType.SpaceParent)`             | The raw widget API only reads state for rooms whose timeline it has been granted, and the space parent lives in the call's own room.                     |
| `src/state/CallViewModel/localMember/Publisher.ts` | `observeSoundboardProcessor(this.scope, room, this.logger)` in the constructor (plus its import) | Mixes soundboard pads into the outgoing microphone track, so every other participant hears them, including while the sender is muted. The plumbing lives in `src/swag/soundboard/observeSoundboardProcessor.ts`; the Publisher only calls it, and the UI reads the processor through `src/swag/soundboard/processorHandle.ts`.
| `src/App.tsx` | `<SoundboardWidgetProvider widget={widget}>` around `{content}` (plus its import) | The widget API exists only in the app shell, and the pads panel (deep in the call view) needs it to reach the board. Passing it through a provider keeps it out of a module global.
| `src/room/InCallView.tsx` | `<SoundboardPanel roomId={matrixRoom.roomId} />` as a `CallFooter` child, plus a `testIdPrefix="soundboard-narrow"` copy as `narrowChildren` (plus its import) | The entry point. `CallFooter` renders a `children` slot in its bottom-left cluster and a `narrowChildren` slot in the centre button group (the settings slot is hidden below 500 px). The panel hides itself when there is no widget or no space parent. |
| `src/state/CallViewModel/localMember/Publisher.ts` | `createAndSetupTracks` creates the microphone track even when joining muted, then mutes it | The soundboard needs a published microphone track to mix pads into; without it a muted joiner has no processor and their pads reach nobody. The camera still follows the mute state, to avoid an unnecessary permission prompt. |
| `src/components/CallFooter.tsx` | `narrowChildren` prop, rendered in the centre button group wrapped in the existing narrow-only class | The settings slot is hidden below 500 px, so the panel needs a narrow-screen entry point mirroring the settings button. |

The space room's own timeline and the board's state capabilities are requested from
`src/swag/soundboard/boardClient.ts` once `m.space.parent` has been read, and renegotiated with
`api.updateRequestedCapabilities()` (MSC2974). That is swag code, not an anchor.

The board module (`src/swag/soundboard/board.ts`) and the check workflow
(`.github/workflows/swag-check.yaml`) add no anchor.

The soundboard's own tests (`SoundboardAudioProcessor.test.ts`,
`observeSoundboardProcessor.test.ts`, `SoundboardPanel.test.tsx`) are tests, not anchors.
