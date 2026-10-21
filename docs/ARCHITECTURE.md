# Architecture

Mx000 Studio is a standalone edition of MIDI Studio, not a second MIDI implementation. The entry point selects one
registered editor (`tc-electronic-m3000-editor`); the host provides shared browser services.

| Layer | Location | Responsibility |
| --- | --- | --- |
| Entry/build | `src/main.tsx`, `vite.config.mts`, `build/` | One-editor selection, relative assets, CSP and offline cache |
| Host | `src/editor-host/` | Installation, lifecycle, MIDI access/broker, leases, permissions, history and shared presentation |
| Shared services | `src/i18n.tsx`, `src/themes.ts` | Language, host theme |
| Workspace | `src/editors/tc-m3000/workspace.ts`, `module.ts` | One sub-workspace per device, session, undo history, lock |
| M3000 | `model.ts`, `protocol.ts`, `parameter-map.ts`, `format.ts`, `preset-codec.ts`, `engine-layout.ts` | SysEx framing and requests, Parameter Data, Preset Data codec (engine blocks and combined header), display rules |
| M3000 hardware | `hardware.ts`, `device-link.ts`, `device-panel.tsx` | Identity, reading, recall, live edits, whole-draft upload, confirmed STORE |
| Library | `librarian.tsx`, `librarian-model.ts`, `engine-presets.ts` | Library window, engine presets, origin of combined engines |
| M2000 | `m2000-model.ts`, `m2000-map.ts`, `m2000-format.ts` | Raw controller values, printed ends, Standard MIDI File export |
| Conversion | `conversion.ts` | Explicit, reported M2000 ⇄ M3000 engine copy through documented correspondences |
| UI | `view.tsx`, `m2000-view.tsx`, `panel.tsx`, `knob.tsx`, `device-slider.tsx`, `m3000.css` | Reconstructed front panel (M3000/M2000 skins), pages, device slider |

`parameter-map.ts` and `m2000-map.ts` are generated from the JSON data under `docs/instruments/` by
`scripts/build-tc-m3000-map.mjs` and `scripts/build-tc-m2000-map.mjs`; the build fails if they are stale.
The catalog preview `public/editor-previews/tc-electronic-m3000.svg` is rendered from the panel component itself.

## Hardware policy

The view never associates a MIDI port by name alone: port names do not identify the model. Candidate ports receive a
universal Identity Request and only an M3000 answer (family 0x42) is accepted. Every outgoing message goes through the
host broker and the module's validators: read requests, edit-buffer writes (Parameter Data, whole Preset Data to the
edit buffer, routing and the three Dynamic Morphing system parameters) and recall. STORE writes only user slots, after
an explicit confirmation. Nothing else of the system page is written. The M2000 is never sent anything.

## Device slider and CSP

The device selector uses toolcool-range-slider 4.0.28 unmodified. That library writes an inline `<style>` into its
shadow root, which the shipped Content-Security-Policy (`style-src 'self'`) refuses; a subclass removes it before
parsing and the library's own `css-links` hook loads `device-slider-shadow.css` from the same origin. The wheel is
disabled on the slider.

## Validation boundary

`npm test` runs the offline suites: exact request and Parameter Data bytes from the specification examples, signed
14-bit round trip, Preset Data parsing, strict state validation, `.syx` export ⇄ import, opaque dump preservation at
full-backup scale, display rules (confirmed values only, no interpolation, presumed orders flagged), M2000 exact
Standard MIDI File bytes, workspace migration, conversions in both directions, sessions and history. It uses
generated data, fake ports and a simulated unit. It is not hardware qualification. The distribution verifier checks that only the
selected editor implementation is bundled.

This repository is a clean standalone source snapshot; changes here do not update the upstream workspace.
