---
codex: 1
project: Claudia
code: CLA
layer: bible
status: living
updated: 2026-06-07
---

# Claudia — Project Bible

> Single source of truth for what Claudia IS, is NOT, and the rules that keep it coherent.
> `README.md` says how to build/run the device; this says how to think about the system.

## 1. The one sentence {#CLA-§1}

Claudia is a buildable, vendor-neutral guide + deployable landing page for an always-on,
privacy-respecting voice assistant — a Raspberry Pi Zero 2 WH plus a Hiwonder WonderEcho I²C
voice module wired straight to the Claude API — that a non-expert can assemble in an afternoon.

## 2. The product promise {#CLA-§2}

- **No Alexa account, no surveillance, no subscription** — only a Claude API key and hardware you
  own. Only Claude (and an optional cloud TTS/ASR, if the builder opts in) ever leaves the device.
- **An afternoon, no soldering.** The build uses the **WH** (pre-soldered-header) Pi and a 4-wire
  Dupont link to the WonderEcho. Total assembly time ~3 minutes; the slow parts are downloads/builds.
- **Configurable to the builder's taste, not ours.** A landing-page configurator (driven by the
  config axes in [`config/parts.json`](../config/parts.json)) lets the reader pick battery vs.
  wall power, local vs. cloud ASR/TTS, case, and smart-home plug; the shopping list and guide
  sections adapt to the choices via `<!-- when: key=value -->` markers in `README.md`.
- **Honest about cost and stock.** Prices are flagged non-authoritative; the Pi Zero 2 WH's
  supply constraints and 2.4 GHz-only Wi-Fi are called out up front.

## 3. What it is NOT {#CLA-§3}

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

## 4. Architecture canon {#CLA-§4}

```
  ┌─────────────────────── This repo (Claudia) ───────────────────────┐
  │  README.md ............ the build guide (source of the landing page)│
  │  config/parts.json .... L5 catalog + configurator axes  ──┐         │
  │  config/versions.json . pinned upstream dep version labels │        │
  │  config/env.template .. example .env for the Pi            │        │
  │  config/asoundrc.usbmic optional USB-mic ALSA profile      │        │
  │  scripts/pi/*.sh ...... Pi-side installer + healthcheck    │        │
  │  docs/ ................ Codex canon (this bible, etc.)     │        │
  └───────────────────────────────────────────────────────────┼────────┘
            │ README.md + parts.json                            │
            ▼ (rendered by sibling MindAttic.Deploy)            │
     mindattic.com/claudia.htm  ◄── configurator reads ─────────┘
            │ builder follows guide
            ▼
  ┌────────────────────────── On the Pi ──────────────────────────────┐
  │  Raspberry Pi OS 64-bit                                            │
  │  whisplay-ai-chatbot (cloned upstream) ── systemd chatbot.service  │
  │      ASR → LLM → TTS pipeline                                      │
  │        ASR: whisper-cpp (local) | openai | google                 │
  │        LLM: Anthropic Claude  ◄── the brain (always cloud)         │
  │        TTS: openai | piper (local) | elevenlabs (patch)           │
  └───────┬──────────────────────────────────────────────────┬────────┘
          │ I²C bus 1 (4 wires: SDA/SCL/5V/GND)               │ HTTPS
          ▼                                                   ▼
   Hiwonder WonderEcho (0x52)                          api.anthropic.com
   wake word "Claudia" + mic + speaker, on-device CI1302
```

### 4.1 Components

- **`README.md`** — the canonical build guide (12 numbered parts + troubleshooting). It is also
  the source document the landing page is rendered from. Conditional blocks use
  `<!-- when: key=value -->` / `<!-- end -->` matched against configurator axis values.
- **`config/parts.json`** — L5 canon-as-data: the shopping catalog AND the `configAxes` that drive
  the page configurator. See [§4.2](#CLA-§4) and [`docs/data/parts.index.json`](data/parts.index.json).
- **`config/versions.json`** — pinned upstream dependency version *labels* (Node, Python, default
  Claude model). README hardcodes these; kept in sync by hand.
- **`config/env.template`** — example `.env` for `~/whisplay-ai-chatbot/.env` on the Pi.
- **`config/asoundrc.usbmic`** — optional ALSA `~/.asoundrc` for builders who swap the WonderEcho
  audio path for a USB mic.
- **`scripts/pi/install-claudia.sh`** — idempotent Pi-side installer automating README parts 5–10.
- **`scripts/pi/healthcheck.sh`** — 3-layer smoke test (WonderEcho on I²C · network reaches
  Anthropic · API key + model return 200). Also embedded verbatim in README part 09.

### 4.2 Domain model (NOUNS)

- **Part** — one catalog entry (`id`, `category` ∈ core|portable|smarthome, `price`, `tiers`,
  `specs`, optional `when` gate). Canonical store [`config/parts.json`](../config/parts.json);
  schema [`part.schema.json`](data/_schema/part.schema.json); ids registered in
  [`parts.index.json`](data/parts.index.json) as `part.<slug>`.
- **Config axis** — a builder choice surfaced as a `<select>` on the landing page:
  `battery` (no|yes), `asr` (whisper-cpp|openai|google), `tts` (openai|elevenlabs|piper),
  `case` (none|fdm|sla), `smarthome` (none|kasa|shelly|sonoff). Values MUST match README
  `<!-- when: -->` markers and each part's `when` field exactly.
- **Build guide** — `README.md` parts 01–12; the artifact a builder follows end to end.
- **The device** — assembled stack: WonderEcho ↔ Pi Zero 2 WH (→ optional PiSugar 3 battery).

### 4.3 Key services (VERBS)

- **Configure** — reader picks axis values on the page; catalog + guide blocks adapt.
- **Install** — `scripts/pi/install-claudia.sh` provisions the Pi (apt, I²C, clone, build, service).
- **Healthcheck** — `scripts/pi/healthcheck.sh` proves I²C + network + Claude API before launch.
- **Wake / converse** — WonderEcho detects "Claudia" on-device, flags a wake event on I²C; the
  chatbot service records, runs ASR → Claude → TTS, and speaks the reply.
- **Deploy** — sibling MindAttic.Deploy renders `README.md` → `mindattic.com/claudia.htm` (external).

## 5. The Laws {#CLA-§5}

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

## 6. Verified state {#CLA-§6}

Claudia is a documentation + config repo; "verified" here means the repo's own artifacts are
self-consistent and machine-checkable, not that a physical device was assembled in CI.

| Item | Status | Evidence |
|------|--------|----------|
| `config/parts.json` is valid JSON & every part matches the schema | ✅ | `pwsh tools/codex.ps1 doctor` — JSON + schema check |
| `config/versions.json` is valid JSON | ✅ | `powershell tools/codex.ps1 doctor` |
| Catalog ids unique & mirrored in `parts.index.json` | ✅ | doctor entity-id uniqueness check |
| Codex docs front-matter + unique `{#...}` ids + resolving cross-refs | ✅ | doctor |
| `BIBLE.digest.md` is current | ✅ | `tools/codex.ps1 digest` then doctor staleness check |
| Cited repo paths (`config/*`, `scripts/pi/*`) exist on disk | ✅ | doctor path-existence check |
| Pi installer / healthcheck run end-to-end on real hardware | 🟡 | shell scripts present & internally reviewed; not exercised on a Pi in this repo's CI — see [CLA-US-D1](USER_STORIES.md#stories), [CLA-US-D2](USER_STORIES.md#stories) |
| Landing page renders & deploys | 🟡 | owned by sibling MindAttic.Deploy (out of this repo's scope) |

**Build/test commands:** This repo has no compile step and no test suite (no `*.sln`,
`*.csproj`, or `package.json`). Verification is `tools/codex.ps1 doctor` plus JSON validity;
`bash -n` syntax-checks the Pi scripts where a POSIX shell is available. See the final report for
the actual run results.

## 7. Active frontier {#CLA-§7}

- **Stories & backlog:** [`docs/USER_STORIES.md`](USER_STORIES.md) — Epics A (Configure & shop),
  B (Assemble & flash), C (Install & converse), D (Verify & operate).
- **Design notes:** [`docs/rfc/`](rfc/) — [RFC 0001](rfc/0001-config-axis-contract.md) on keeping
  the configurator axes a single enforced contract.
- **Known soft spots:** firmware-dependent WonderEcho register map (caveated, see
  [CLA-LAW-5](#CLA-LAW-5)); ElevenLabs requires a hand-applied upstream patch; on-hardware
  end-to-end remains 🟡.

## 8. Quality bar {#CLA-§8}

A change to Claudia is "done" only when:

1. `tools/codex.ps1 doctor` passes (front-matter, ids, cross-refs, JSON+schema, path existence,
   digest freshness).
2. Any new/edited config axis agrees across `parts.json`, part `when` gates, and README markers
   ([CLA-LAW-4](#CLA-LAW-4)).
3. Any new hardware/price/version claim carries a vendor citation and a dated/"verify" caveat
   ([CLA-LAW-3](#CLA-LAW-3), [CLA-LAW-5](#CLA-LAW-5)).
4. Pi-side shell scripts pass `bash -n` and remain idempotent.
5. Docs status marks follow [HOUSE-LAW-8](../../MindAttic.HouseRules.md#HOUSE-LAW-8): `✅` only
   when a check or build proves it; otherwise `🟡`/`⬜`.

## 9. Glossary {#CLA-§9}

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
