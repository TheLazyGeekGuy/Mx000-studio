# Mx000 Studio

A browser editor for the **M3000** (Studio Reverb Processor) and the **M2000** (Studio Effects Processor), built on the
MIDI Studio platform. This is an independent community project, not affiliated with the maker of the units.

**[Open the editor](https://thelazygeekguy.github.io/Mx000-studio/)** · [Français](README.fr.md) · [Device notes and sources](docs/instruments/TC-M-SERIES.md)

Alpha release. **The M3000 is edited live over MIDI** (SysEx); the M2000, whose SysEx is not published, is edited
offline and exported as files. Hardware behaviour was checked on one M3000 running software 2.04; other units and
software versions are not validated.

## Use

1. Open the editor in a browser with Web MIDI (Chromium-based browsers) and allow MIDI with SysEx. Without MIDI the
   editor still works offline with files.
2. Pick the device with the **M3000 / M2000** slider (arrows, click or drag; the mouse wheel never switches device).
   Each device keeps its own draft; switching never converts or drops anything, and can be undone.
3. M3000: open **Appareil (MIDI)** (or the MIDI icon beside the connection status) and choose the ports. The editor
   sends a universal Identity Request and accepts only an M3000 answer; it then reads the running state. Edits are
   sent to the edit buffer as you make them; a preset is stored in a user slot only after an explicit confirmation.
4. Edit the two engines, the preset type (single or combined), the routing and Dynamic Morphing. A plain click never
   changes a value: drag a knob, use the arrow keys, the wheel on the focused knob, or double-click the value to type it.

Drafts stay in the browser. Export them as `.json` or `.syx` to keep or move them.

## What each device supports

| | M3000 | M2000 |
| --- | --- | --- |
| Published MIDI | SysEx specification V1.01 (SW 2.03) | MIDI CC guide only, no SysEx |
| Connection | Identity Request, state and memory reading, recall, live edits, whole preset sent to the edit buffer, STORE into user slots after confirmation | none (files only) |
| Algorithms / parameters | 21 algorithms (423 parameters over the 17 published engine tables); preset dumps decoded for every algorithm (single and combined, combined header included) | 10 algorithms, 85 parameters from the manual |
| Values shown | Manual units where the manuals confirm the scale; otherwise the raw value, marked | Raw 0–127 controller values; printed ends shown exactly, dB ranges approximately ("≈") |
| Library | Separate window: unit memory, local copies, `.syx` import, banks and notes; engine presets chosen per engine, also inside a combined preset | — |
| Files | `.syx` Preset Data (whole draft) or Parameter Data; `.json` | `.mid` with Control Change messages; only Mix (CC 10) and Out Level (CC 11) have published controller numbers; `.json` |

Also: a drawn routing page (six routings), seeded variations of one engine or both, and the interface in English,
French, Italian, German, Japanese, Spanish, Russian and Chinese.

**Copy between devices.** The manufacturer states that M2000 presets cannot be loaded into an M3000, and no
manufacturer document says that an M2000 algorithm is identical to an M3000 one. For algorithms with a documented
counterpart, a "Copier vers…" button copies the values in manual units and reports which ones were confirmed, carried
as a hypothesis or not carried. The result is a draft to listen to, not an equivalence. Details:
[device notes](docs/instruments/TC-M-SERIES.md).

Known limits: user single presets are read one slot at a time (the unit answers no single Bank Request); a value equal
to the last one the unit received is ignored by the unit, so the editor sends it through a neighbouring value; two
parameters accept a narrower range on the unit than published; M2000 controller numbers beyond Mix and Out Level are
not published.

## Local data and privacy

Drafts, the local library and preferences stay in the browser unless you export them. There is no application backend,
analytics or upload. GitHub serves the site and may process normal hosting/access data under its own policies.

This repository is a clean source snapshot: no upstream Git history, private captures, research logs, personal paths
or vendor manuals. Parameter data cite the manufacturer documents by title, edition and page. See
[publication and privacy](docs/PUBLICATION.md).

## Development

Use Node.js 22.12 or later.

```sh
npm ci
npm test
npm run dev
```

```sh
META_CSP=1 npm run build
npm run leak-gate -- --ci --artifact dist
npm run preview
```

`npm test` runs the offline suites (codecs, validators, display rules, conversions, exact export bytes, sessions,
a simulated unit); they never open a MIDI port. The parameter maps are generated from `docs/instruments/tc-m3000/*.json` and
`docs/instruments/tc-m2000/*.json` (`npm run maps:generate`; the build checks they are current).
[Architecture](docs/ARCHITECTURE.md) describes the host/module boundary. The pinned GitHub Actions workflow tests,
builds, checks the publication files and deploys `dist` to Pages on pushes to `main`.

## License

MIT; see [LICENSE](LICENSE). Third-party code: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The M3000 and
M2000 names identify the supported hardware and remain the property of their owner.
