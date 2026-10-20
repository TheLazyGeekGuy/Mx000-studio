# Mx000 Studio

An offline browser editor for the **TC Electronic M3000** (Studio Reverb Processor) and **M2000** (Studio Effects
Processor), built on the MIDI Studio platform. This is an independent community project, not an official TC Electronic
product.

**[Open the editor](https://thelazygeekguy.github.io/Mx000-studio/)** · [Français](README.fr.md) · [Device notes and sources](docs/instruments/TC-M-SERIES.md)

Alpha release. **MIDI exchange with the hardware is disabled in this version**: the editor never sends anything to a
device, and neither model has been validated on hardware. It prepares settings and files you play or load yourself.

## Use

1. Open the editor in a recent browser. MIDI permission is not needed.
2. Pick the device with the **M3000 / M2000** slider (arrows, click or drag; the mouse wheel never switches device).
   Each device keeps its own draft; switching never converts or drops anything, and can be undone.
3. Edit the two engines, the preset type (single or combined) and the routing. A plain click never changes a value:
   drag a knob, use the arrow keys, the wheel on the focused knob, or double-click the value to type it.

Drafts stay in the browser. Export them as `.json` to keep or move them.

## What each device supports

| | M3000 | M2000 |
| --- | --- | --- |
| Published MIDI | SysEx specification V1.01 (SW 2.03) | MIDI CC guide only, no SysEx |
| Algorithms / parameters | 21 algorithms, 274 engine parameters, raw ranges from the spec | 10 algorithms, 85 parameters from the manual |
| Values shown | Manual units where the manuals confirm the scale (143 of 308 rows); otherwise the raw value, marked | Raw 0–127 controller values; printed ends shown exactly, dB ranges approximately ("≈") |
| Export | `.syx` with one Parameter Data message per parameter (for the algorithm already running on the unit) | `.mid` with Control Change messages; only Mix (CC 10) and Out Level (CC 11) have published controller numbers |
| Import | `.syx` (Parameter Data applied; Preset Data dumps kept byte for byte, not decoded) and `.json` | `.json` |

**Copy between devices.** TC states that M2000 presets cannot be loaded into an M3000, and no TC document says that
an M2000 algorithm is identical to an M3000 one. For algorithms with a documented counterpart, a "Copier vers…" button
copies the values in manual units and reports which ones were confirmed, carried as a hypothesis or not carried. An
opt-in option also carries values without a published scale at the same relative position. The result is a draft to
listen to, not an equivalence. Details: [device notes](docs/instruments/TC-M-SERIES.md).

Known limits: device ID, signed 14-bit encoding and checksum reading of the M3000 are unverified; M3000 preset dumps
are not decoded; no documented message selects an algorithm; M2000 controller numbers beyond Mix and Out Level are
not published.

## Local data and privacy

Drafts and preferences stay in the browser's local storage unless you export them. There is no application backend,
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

`npm test` runs the offline suites (codecs, validators, display rules, conversions, exact export bytes, sessions);
they never open a MIDI port. The parameter maps are generated from `docs/instruments/tc-m3000/*.json` and
`docs/instruments/tc-m2000/*.json` (`npm run maps:generate`; the build checks they are current).
[Architecture](docs/ARCHITECTURE.md) describes the host/module boundary. The pinned GitHub Actions workflow tests,
builds, checks the publication files and deploys `dist` to Pages on pushes to `main`.

## License

MIT; see [LICENSE](LICENSE). Third-party code: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). M3000, M2000 and
TC Electronic names identify the supported hardware and remain the property of their respective owners.
