# Noise cancellation (swag)

Default: DeepFilterNet3 (`deepfilternet`), via `@workadventure/noise-suppression`
pinned to `0.2.0` in devDependencies (everything is bundled, matching this
repo's pattern). The package is MIT; the DeepFilterNet model upstream is
MIT/Apache-2.0.

Only the `/deepfilternet` entrypoint is ever imported, and only through a
dynamic `import()` in `src/swag/nc/deepFilterNetProcessor.ts`, so the ~11 MB
WASM/model stays out of the initial bundle and loads lazily on first use in
`deepfilternet` mode. The shared Vite plugin config (`vitePluginsConfig` in
`vite.config.ts`, reused by the embedded/component builds) includes
`noiseSuppressionAudioWorkletVitePlugin()`, which serves the worklet, WASM and
model in dev; production builds emit them through Vite's native
`new URL(..., import.meta.url)` asset handling. The background-noise and DTLN
entrypoints are never imported.

## DeepFilterNet3 wiring

- `mode.ts`: `NOISE_CANCELLATION_MODES = ["deepfilternet", "browser", "gtcrn", "off"]`,
  default `deepfilternet`. Explicitly stored `browser`/`gtcrn`/`off` values keep
  working; only unset/unknown values become the new default.
  `micProcessingOptions` treats `deepfilternet` like `gtcrn`: browser
  `noiseSuppression` forced off, echo cancellation and AGC follow the toggles.
- `deepFilterNetProcessor.ts`: a LiveKit `TrackProcessor` (`swag-deepfilternet3`).
  Uses the provided `AudioContext` (must be 48 kHz) or creates one, resumes it,
  connects mic source → worklet → destination, waits for `ready`, and publishes
  the destination's track. `restart` rebuilds for a new mic track; `destroy`
  disposes the worklet, disconnects, stops only the processed track, and closes
  only a self-created context. Never stops the original mic track.
- `Publisher.ts` (`onLocalTrackPublished`): in `deepfilternet` mode ensures a
  48 kHz context on the mic track and attaches the processor (async
  fire-and-forget). On capability/attach failure it logs and falls back to
  `track.applyConstraints({ noiseSuppression: true })`, so users are never left
  with no denoiser. Attached processors are destroyed in `stopTracks`/`destroy`.
- `ConnectionFactory.ts` needs no structural change: `micProcessingOptions`
  already centralizes the capture toggles.

## Vendored assets (GTCRN, still selectable)

| File | sha256 | Size |
| ---- | ------ | ---- |
| `assets/gtcrn-worklet.js` | `343322257ef82a421ab9dd795b4afe18c1aa5b48a0ff65bc040a308c78893da8` | 8 916 bytes |
| `assets/gtcrn.wasm` | `01a5286ddaa1ce6d0dd5510bd9241f3bf0cc727a05d5767ae6881d85d9983719` | 196 884 bytes |

Upstream: [`@sapphi-red/web-noise-suppressor`](https://github.com/sapphi-red/web-noise-suppressor), MIT licence. The GTCRN model itself is by Rong Xiaobin, also MIT (see the header of `gtcrn-worklet.js`). The upstream package version is not stamped into the vendored copies; the files are pinned by the hashes above.

Provenance: copied byte-for-byte from the live production container at `/data/matrix/denoiser/` on 2026-10-11. These are the exact files proven in production behind the overlay shim.

Why vendored instead of an npm dependency: the deployed copies are the ones proven in production, and adding the dependency would require a local install to update the lockfile.

## Contract

- Register processor id `@sapphi-red/web-noise-suppressor/gtcrn` (exported as `GTCRN_PROCESSOR_ID`).
- Construct with `numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: "explicit", processorOptions: { maxChannels: 1, wasmBinary }`, where `wasmBinary` is `await (await fetch(wasmUrl)).arrayBuffer()`.
- `node.port.postMessage("destroy")` frees the wasm state.
- The worklet supports only 16 kHz and 48 kHz `AudioContext`s and throws otherwise; `attachDenoiseStage` turns that into `null` and leaves the graph untouched.
