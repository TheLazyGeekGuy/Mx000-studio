# M3000 and M2000 — device notes

What the editor relies on, with the manufacturer source for each claim. Source identifiers (M3K-SYX, M2K-EN…) refer to
the ledger at the end; page numbers are the printed ones. Vendor documents are not redistributed here.

## M3000 (Studio Reverb Processor)

**SysEx frame** (M3K-SYX p.1): `F0 00 20 1F dd 42 tt … F7` — manufacturer ID `00 20 1F`, device ID `dd`, model
`42` (M3000), message type `tt`.

| Type | Message (M3K-SYX pp.2–4) | Used by the editor |
| --- | --- | --- |
| `45` | Preset Request | State and memory reading |
| `20` | Preset Data: 80 (single) or 142 (dual) data bytes sent as nibbles, frames of 172/296 bytes, checksum `(−sum) & 0x7F` | Decoded and encoded (layout measured on the unit, below); sent whole to the edit buffer; STORE into user slots after confirmation |
| `47` | Parameter Request (base ID, count 1–64) | Running state (status, routing, engines) |
| `22` | Parameter Data: signed 14-bit values, MSB first, always on the edit buffer | Live edits and export: one single-value message per engine parameter; import applies values that fit the current algorithm |
| `40`, `44` | Bank Request, Recall | Combined user bank reading; recall of single and combined presets, and of a single into one engine |

Preset numbers (M3K-SYX p.1; M3K-EN pp.11, 21): single 1–512 factory, 513–768 user, 769–1024 card; dual 1–128 factory, 129–256 user,
257–384 snapshots, 385–512 card; 0 = edit buffer. Target field 0/1 = engine 1/2, 2 = system.

Parameter tables (M3K-SYX pp.4–11): 21 algorithm types, 17 engine tables (274 rows), 34 system parameters; each engine
parameter is also Control Change `ID + 10` on its engine channel. Display units and scales come from the manuals
(M3K-EN, M3K-FR, M3K-ADD): 143 of 308 rows confirmed, 33 in conflict, 132 unknown (`docs/instruments/tc-m3000/DISPLAY-MAP.json`).
The editor renders only confirmed linear and list scales; endpoint-only tables show their printed ends and never
interpolate; lists whose value order is not printed are marked "ordre présumé".

**Checked on one unit (software 2.04).** The universal Identity Request (`F0 7E 7F 06 01 F7`) answers family `0x42`,
software version and device ID (default 0). The checksum is `(−sum of the decoded bytes) & 0x7F`. Negative values are
two's complement on 14 bits. A combined dump carries **144** data bytes (the specification prints 142). Preset Data
layout, not published, measured on the unit: header (own number, name, algorithms; for a combined preset the source
singles, routing and Dynamic Morphing mode, speed and threshold), then one 54-byte engine block per engine (single:
bytes 26–79; combined: +10 and +64); each parameter is one byte or one big-endian word, signed when its range is. The
unit ignores a Parameter Data value equal to the last one it received for that parameter, and answers no single-preset
Bank Request. **Not documented:** a message that selects an algorithm; the editor changes an algorithm by sending the
whole preset to the edit buffer.

## M2000 (Studio Effects Processor)

The manufacturer publishes no SysEx specification for the M2000; its MIDI document is the one-page CC guide (M2K-CC): engine
parameters on each engine's channel, **CC 10 = Mix, CC 11 = Out Level, CC 12 = first parameter of the EDIT page,
13 = second…**, and "MIDI CC values are scaled to parameter values"; system controllers 10–31 and 35 (routing) on the
Combined channel.

The manual (M2K-EN, M2K-FR, SW 2.06) describes 10 algorithms and 85 parameters
(`docs/instruments/tc-m2000/M2000-PARAMETERS.json`), but never prints a complete EDIT page: the controller numbers of
parameters other than Mix and Out Level, and the resolution of every parameter, are unknown. The editor therefore edits
raw 0–127 controller values, shows printed ends exactly (CC 0 and 127), shows dB ranges approximately ("≈", linear
hypothesis), and exports a Standard MIDI File containing only the controllers whose number is published. Global
controllers (routing, inputs, clock…) are never exported.

## Compatibility between the two, and the family

- **Presets:** the manufacturer's support states that M2000 presets cannot be transferred to the M3000 (KB-M2K-M3K-PRESETS).
- **Algorithms:** no manufacturer document states that an M2000 algorithm is identical to an M3000 one. Its support says the
  M2000 reverbs come from the M5000 (KB-M2K-VSS3); the M3000 manual says its C.O.R.E. and Reverb 3 algorithms come
  from the M5000 (M3K-EN pp.45–46). The manufacturer's comparison sheet lists "Rev2, Rev3" for the M2000 and "VSS3, Rev2, Rev3" for
  the M3000 (TC-REVCMP), while the M3000's own documents list no Rev 2. VSS3 is not in the M2000 (KB-M2K-VSS3).
- **Text overlap:** about a quarter of the wording of the M3000 C.O.R.E. and Reverb 3 parameter descriptions appears
  word for word in the M2000 reverb pages (Room shape, Size, Rev diff on one side; Distance, Diffuser type, Diffuse,
  Mod depth on the other). This is a lead on shared lineage, not proof of identical algorithms or ranges.
- **Other algorithms** (Chorus, Flanger, Delay, Phaser, Pitch, EQ, Tremolo, Dynamics) share names only; VSS
  algorithms exist only on the M3000, Stereo only on the M2000.

The candidate correspondences (`docs/instruments/tc-m2000/MAPPING-M2000-M3000.json`, 15 algorithm pairs: 19 confirmed,
109 hypothesis, 60 without counterpart) drive the editor's "Copier vers…" buttons. Each copy reports confirmed values,
values read through a scaling hypothesis, values carried by the opt-in same-range assumption, and values not carried.

## Hardware checks still open

The M2000 has not been connected: its controller numbers beyond Mix and Out Level, and its scaling, would be read by
listening passively while turning parameters on the unit. On the M3000, card memory and units other than one running
software 2.04 are untested.

## Sources

| ID | Document | Edition | Retrieved from | SHA-256 |
| --- | --- | --- | --- | --- |
| M3K-SYX | TC Electronic M3000 MIDI specification | V1.01, 1999/08/10, "Updated for software version 2.03" (V1.00 1998/12/11 first release) | <https://web.archive.org/web/20160415232036id_/http://cdn-downloads.tcelectronic.com/media/217652/tc_electronic_m3000_midi_sysex_specifications.pdf> | `2122a1b1a8cb…` |
| M3K-EN | M3000 Studio Reverb Processor Users Manual | English version, Rev 3 - SW - V 2.04, Prod. No: 606067513 (footer printed p.3); PDF created 2003-08-21 | <https://web.archive.org/web/20150922010340id_/http://cdn-downloads.tcelectronic.com/media/217610/tc_electronic_m3000_manual_english.pdf> | `49e8465d4ca5…` |
| M3K-FR | M3000 Mode d'emploi | Version Française, Rev 2 - SW - V 2.04, Prod. No: 606068712; PDF created 2003-08-21 | <https://web.archive.org/web/20070101140220id_/http://www.tcelectronic.com/media/M300_FR.pdf> | `8695971e8b68…` |
| M3K-ADD | M3000 Addendum For Film and Post Production | English Version REV 1.3; PDF created 1999-09-17 | <https://web.archive.org/web/20160415171032id_/http://cdn-downloads.tcelectronic.com/media/217635/tc_electronic_m3000_manual_addendum_english.pdf> | `179370cff6d8…` |
| M2K-CC | M2000 MIDI CC GUIDE | Undated on page; PDF created 2002-08-29 ("Microsoft Word - M2k_M3k CC.DOC") | <https://web.archive.org/web/20160415171047id_/http://cdn-downloads.tcelectronic.com/media/217462/tc_electronic_m2000_midi_cc_specifications.pdf> | `2513152b7e02…` |
| M2K-EN | M2000 Studio Effects Processor User's Manual | Rev 4 - SW - V 2.06 (printed p.3); PDF created 2000-08-30 | <https://web.archive.org/web/20160415171248id_/http://cdn-downloads.tcelectronic.com/media/217364/tc_electronic_m2000_manual_english.pdf> | `eefae2d58c29…` |
| M2K-FR | M2000 Mode d'emploi | Version française Rev 4 - SW - V 2.06; PDF created 2000-10-02 | — | `ce99c81b489a…` |
| TC-REVCMP | Reverb Comparison sheet | PDF created 2004-11-29 ("Reverb_Comparison_02.qxd") | <https://web.archive.org/web/20110101150413id_/http://www.tcelectronic.com/media/Rev_Comparison_02b(1).pdf> | `e5837da3962d…` |
| KB-M2K-M3K-PRESETS | M2000: Can presets be transferred to M3000 | Staff, 2016-09-28 | <https://web.archive.org/web/20161028023506id_/http://support.tcelectronic.com/hc/en-us/articles/228311368> | `7097cda97a2a…` |
| KB-M2K-VSS3 | M2000: Does it have the VSS3 algorithm? |  | <https://web.archive.org/web/20170115100829id_/http://support.tcelectronic.com/hc/en-us/articles/228313868> | `3cbc415d5e05…` |
