---
codex: 1
project: Claudia
code: CLA
layer: rfc
status: planned
updated: 2026-06-07
---

# RFC 0001 — Make the configurator axis contract machine-enforced

## Problem

A build option ("axis") such as `tts=elevenlabs` must agree in three independent places:

1. the `configAxes` block in `config/parts.json` (the page `<select>` options),
2. each part's `when` gate (which parts appear for that value), and
3. the `<!-- when: key=value -->` markers in `README.md` (which guide prose appears).

Today this is enforced by human discipline ([CLA-LAW-4](../BIBLE.md#CLA-LAW-4)). A value added to
one place but not the others produces a silently broken landing page: a `<select>` option that
shows no parts, or guide prose that never appears. `codex.ps1 doctor` currently validates
`parts.json` against the schema and checks that `configAxes` values are internally consistent with
part `when` gates, but it does **not** yet parse `README.md` markers.

## Options compared

- **A — Status quo (manual).** Cheap; relies on review. Breakage reaches deploy undetected.
- **B — Doctor parses README markers (recommended).** Extend `codex.ps1 doctor` to extract every
  `<!-- when: key=value[,value] -->` from `README.md` and assert each `key` and `value` exists in
  `configAxes`, and warn on `configAxes` values that no marker or part ever references (dead axes).
- **C — Single source generates the others.** Generate README markers from `parts.json`. Most
  robust but invasive: changes how authors edit prose, and README is also hand-tuned for the page
  render. Too heavy for the benefit.

## Decision

Pursue **Option B**: add a marker-consistency check to `doctor` as a non-blocking **warning**
first, then promote to a hard error once `README.md` is clean. Keep authors editing README prose
by hand.

## What NOT to do

- Do **not** auto-generate or rewrite `README.md` from `parts.json` (Option C) — README is also
  the human-facing build guide and the deploy source; mechanical edits would fight the prose.
- Do **not** move or restructure `config/parts.json` — MindAttic.Deploy reads it in place
  ([CLA-LAW-2](../BIBLE.md#CLA-LAW-2) spirit; deploy is out of scope).

## Phased plan (with risk)

1. **Phase 1 (low risk):** doctor extracts README markers and emits warnings for unknown
   key/value and for dead axes. Ship as warning-only.
2. **Phase 2 (medium risk):** once README warnings are zero, flip the check to a hard error in
   `doctor`. Risk: a legitimate marker the regex misses → keep the regex conservative and
   documented.
3. **Phase 3 (optional):** a `codex.ps1 axes` subcommand that prints the cross-tab of axis × parts
   × markers for review.

## Graduates into

- BIBLE [§5 CLA-LAW-4](../BIBLE.md#CLA-LAW-4) (tighten "is a defect" once enforced)
- Stories [CLA-US-A1](../USER_STORIES.md#stories)
