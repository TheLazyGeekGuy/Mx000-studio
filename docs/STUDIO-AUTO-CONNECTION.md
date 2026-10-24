# First-use automatic MIDI binding

The previous hardware link restored only a previously remembered port name. A fresh browser therefore had no pair to bind, so automatic identification/current-state reading never started.

The module now chooses one unambiguous, available, connected same-name input/output pair whose label suggests an M-series device when no remembered route exists. A remembered route remains authoritative: missing, busy or ambiguous remembered ports do not silently fall back. Labels identify candidates only; the universal Identity Reply still establishes that the unit is an M3000 before model-specific reads. Successful identification remembers the selected route. Existing auto-apply preference, state schemas, grants, and explicit STORE policy are unchanged.

Tests cover unique candidates, remembered routes, ambiguity, busy/disconnected endpoints, unrelated device names and no fallback. The standalone offline suites and production build passed. Physical identity was read from a connected M3000, firmware 2.04; no parameter/buffer/STORE write was performed for this diagnosis.

Trace: repository TheLazyGeekGuy/Mx000-studio, read base commit `53da5a3a9d638f598b6627c7d05296dfa73726f3`, plus changes to `src/editors/tc-m3000/hardware-link.ts`, `device-panel.tsx`, new `device-ports.ts` and corresponding offline test/runner. Reader: primary Codex, no delegated reader. Exact serving model identifier and reasoning effort are unavailable; model-version traceability is incomplete. Read/validation: 2026-10-24 21:29–21:46 Europe/Paris. This is a corrective branch, not a main merge or deployment.
