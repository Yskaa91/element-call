# Noise cancellation (swag)

Splices a vendored GTCRN denoiser worklet into the call's microphone graph.

## Vendored assets

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
