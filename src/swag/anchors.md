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
| `component/host.ts` | optional `notifySpeaking` on `ElementCallHostBridge`, forwarded in `useComponentHostBridge` | Phase 3 speaking ring: keeps the component host adapter type-complete for the new `HostBridge` member, mirroring `notifyDeviceMute` (a component host may opt in like it opts into mute updates). |
| `src/state/CallViewModel/CallViewModel.ts` | `sendSpeakingUpdates(scope, matrixRoom.roomId, speakingUserIds$(userMedia$), hostBridge)` immediately after `userMedia$` (plus imports for `speakingUserIds$`, `sendSpeakingUpdates`) | Phase 3 speaking ring: the single anchor that wires the per-user speaking signal into the throttled, heartbeating host notification. |

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

---

## Anchors added by phase 4 (noise cancellation)

| Upstream file | Anchor | Why |
| ------------- | ------ | --- |
| `src/state/CallViewModel/remoteMembers/ConnectionFactory.ts` | the three `…Setting.getValue()` mic-processing reads wrapped in `micProcessingOptions(readNoiseCancellationMode(), toggles)`, spread into `audioCaptureDefaults` (plus its imports) | Phase 4 noise cancellation: the single place LiveKit's microphone capture options are built. The mode setting (`src/swag/nc/mode.ts`) maps onto the toggles here — `browser` passes the toggles through, `gtcrn` forces browser noise suppression off (the GTCRN stage replaces it, Task 3), `off` disables all browser processing. `voiceIsolation` stays unset, so LiveKit's default `true` keeps the OS-level isolation. Everything the user stored as raw localStorage resolves to `browser` on an unknown value, so upgrades stay safe. |
| `src/settings/SettingsModal.tsx` | `<NoiseCancellationSettings />` rendered inside `audioTab`'s `<Form>` (plus its import) | Phase 4 noise cancellation: promotes the mode selector and the three mic-processing toggles into the normal Audio tab. The UI itself lives in `src/swag/nc/NoiseCancellationSettings.tsx`; this is just the render slot. |
| `src/settings/DeveloperSettingsTab.tsx` | the local `AudioProcessingSettings` component and its render site removed (plus the now-unused toggle-setting imports) | Promoted per spec §6.4; the logic now lives in `src/swag/nc/`, and the dev tab keeping its own copy would be two sources of truth. |

Naming note (not an anchor): the microphone graph that phase 4 splices its GTCRN stage
into lives in `src/swag/soundboard/SoundboardAudioProcessor.ts` — the module is named for
the soundboard because phase 2 built it there. The graph is now shared between the
soundboard and noise cancellation. Renaming the module is deliberately deferred to phase 5;
do not be surprised that noise-cancellation code touches a "soundboard" file.

| `vite.config.ts` | `base: "./"` at the top of the returned config (plus its comment) | Build fix, not a feature: Element Web always loads the *embedded* copy under `/widgets/element-call/`, where the default absolute `/assets/` paths 404 and the widget never boots ("stuck on loading"). A relative base serves both that path and the standalone app at the domain root — the same approach as `vite-embedded.config.ts`. |

---

