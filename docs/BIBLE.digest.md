AUTHORITATIVE - full detail in docs/BIBLE.md
<!-- generatedFrom: docs/BIBLE.md -->

# Claudia - Codex digest

## 1. The one sentence
Claudia is a buildable, vendor-neutral guide + deployable landing page for an always-on,
privacy-respecting voice assistant — a Raspberry Pi Zero 2 WH plus a Hiwonder WonderEcho I²C
voice module wired straight to the Claude API — that a non-expert can assemble in an afternoon.

## What it is NOT
- **NOT an application or library with compiled source.** This repo is documentation + config +
  Pi-side shell scripts. The actual assistant runtime is upstream
  [`PiSugar/whisplay-ai-chatbot`](https://github.com/PiSugar/whisplay-ai-chatbot), cloned on the
  Pi — Claudia does not vendor or fork it.
- **NOT a wake-word trainer.** Wake-word ("Claudia") runs on the WonderEcho's on-device CI1302
  chip over I²C; there is no Pi-side listener, no openWakeWord, no training step.
- **NOT a Whisplay-HAT project.** The upstream repo is named for the Whisplay HAT, but Claudia
  deliberately uses only its LLM/ASR/TTS plumbing and routes audio + wake events through the
  WonderEcho instead.
- **NOT tied to one cloud vendor for speech.** ASR and TTS are builder-selectable (local Whisper /
  Piper, or OpenAI / Google / ElevenLabs). The LLM brain is Claude by design — that is the point
  of the project, not an incidental choice.
- **NOT the deploy pipeline.** Rendering `README.md` into `mindattic.com/claudia.htm` is owned by
  the sibling **MindAttic.Deploy** repo; Claudia only supplies the source `README.md` + catalog.

## The Laws
Claudia inherits the org-wide [MindAttic House Rules](../../MindAttic.HouseRules.md). Those laws
are authoritative and are **not** restated here; reference them by id:

- [HOUSE-LAW-1 — Whole-number versioning](../../MindAttic.HouseRules.md#HOUSE-LAW-1)
- [HOUSE-LAW-3 — Credentials never committed](../../MindAttic.HouseRules.md#HOUSE-LAW-3)
- [HOUSE-LAW-8 — Done is verified, not asserted](../../MindAttic.HouseRules.md#HOUSE-LAW-8)
- [HOUSE-LAW-9 — `psst` only on explicit request](../../MindAttic.HouseRules.md#HOUSE-LAW-9)

Project-specific laws (apply to Claudia only):

### {#CLA-LAW-1} Local-first, cloud-by-choice.
The only mandatory cloud dependency is the Claude API (the assistant's brain). Every other stage
(ASR, TTS, wake word, smart-home control) MUST have a fully local option, and cloud alternatives
MUST be opt-in via a config axis — never the silent default. No surveillance, no account, no
subscription beyond the builder's own Claude key.

### {#CLA-LAW-2} Upstream is cloned, never vendored.
The assistant runtime (`PiSugar/whisplay-ai-chatbot`) is cloned on the Pi at build time. This repo
does not fork, copy, or pin upstream source. Guidance that depends on upstream internals (env-key
names, file paths, register opcodes) MUST cite the upstream/vendor source of truth and warn that
it can drift.

### {#CLA-LAW-3} Prices and versions are non-authoritative and dated.
Every price in [`config/parts.json`](../config/parts.json) carries a top-level `pricesAsOf` date;
every pinned label in [`config/versions.json`](../config/versions.json) carries `versionsAsOf`.
Stale-by-design data must always say when it was last verified — never present an estimate as a
live fact.

### {#CLA-LAW-4} Configurator axes are a single contract.
An axis `key=value` is valid only if it agrees in all three places: the `configAxes` block in
`config/parts.json`, the part `when` gates, and the README `<!-- when: -->` markers. Adding or
renaming an axis value means updating all three together; a value present in one but not the
others is a defect.

### {#CLA-LAW-5} No hardware claim ships unverified against the vendor.
I²C addresses, register opcodes, pin mappings, SKUs, and "in the box" contents are asserted only
with a vendor citation, and firmware-dependent specifics (e.g. the WonderEcho `0x52` address and
`0x10` set-trigger opcode) MUST carry an explicit "verify against your firmware revision" caveat.

## Glossary
- **WonderEcho** — Hiwonder I²C voice module (CI1302 chip) carrying mic + speaker + on-device
  wake-word detection; default I²C address `0x52` on bus 1. Catalog id `part.hiwonder-wonderecho`.
- **Pi Zero 2 WH** — Raspberry Pi Zero 2 with pre-soldered headers (the "H"); required so the
  4-pin WonderEcho link needs no soldering. Catalog id `part.pi-zero-2-wh`.
- **I²C** — two-wire serial bus (SDA/SCL) the Pi uses to talk to the WonderEcho on bus 1.
- **whisplay-ai-chatbot** — upstream PiSugar repo providing the ASR→LLM→TTS runtime, cloned on the
  Pi (see [CLA-LAW-2](#CLA-LAW-2)).
- **ASR / TTS** — automatic speech recognition (speech→text) / text-to-speech (text→speech); each
  builder-selectable via a config axis.
- **Config axis** — a landing-page `<select>` choice (`battery`/`asr`/`tts`/`case`/`smarthome`)
  governed by [CLA-LAW-4](#CLA-LAW-4).
- **Wake event** — the WonderEcho flagging, over I²C, that it heard "Claudia"; the Pi polls this
  register and starts a recording session.
- **MindAttic.Deploy** — sibling repo that renders this README into the public landing page; not
  part of Claudia's own scope.

## Story status index
- done: 8
- partial: 5
- planned: 0
- cut: 0

## Latest amendment
## CLA-A1 — Adopt the Codex documentation standard (supersedes —)
**What changed.** Installed the MindAttic Codex canon for this repo: added `docs/BIBLE.md` (L0),
`docs/USER_STORIES.md` (L2), this `docs/AMENDMENTS.md` (L1), `docs/rfc/0001-config-axis-contract.md`,
the L5 data registry `docs/data/parts.index.json` + `docs/data/_schema/part.schema.json`,
`tools/codex.ps1` (doctor + digest), and the `.claude/hooks/inject-digest.ps1` SessionStart hook
