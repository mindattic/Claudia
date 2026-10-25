---
codex: 1
project: Claudia
code: CLA
layer: bible
status: living
updated: 2026-10-24
---

# Claudia — Project Bible

> Single source of truth for what Claudia IS, is NOT, and the rules that keep it coherent.
> `README.md` says how to build/run the device; this says how to think about the system.

## 1. The one sentence {#CLA-§1}

Claudia is a buildable, vendor-neutral guide, published as its static GitHub README, for an always-on,
privacy-respecting voice assistant — a Raspberry Pi Zero 2 WH with a USB conversation microphone,
a USB speaker and a Hiwonder WonderEcho I²C wake-word module, wired straight to the Claude API — that a
non-expert can assemble in an afternoon.

## 2. The product promise {#CLA-§2}

- **No Alexa account, no surveillance, no subscription** — only a Claude API key and hardware you
  own. Only Claude (and an optional cloud TTS/ASR, if the builder opts in) ever leaves the device.
- **An afternoon, no soldering.** The build uses the **WH** (pre-soldered-header) Pi and a 4-wire
  Dupont link to the WonderEcho. Total assembly time ~5 minutes; the slow parts are downloads/builds.
- **Configurable to the builder's taste, not ours.** The reader picks battery vs. wall power,
  basic vs. far-field-array microphone, local vs. cloud ASR/TTS, case, and smart-home plug from
  the build options (the config axes in [`config/parts.json`](../config/parts.json)); the README's
  static parts table and guide prose say where each choice changes a part or a step.
- **Honest about cost and stock.** Prices are flagged non-authoritative; the Pi Zero 2 WH's
  supply constraints and 2.4 GHz-only Wi-Fi are called out up front.

## 3. What it is NOT {#CLA-§3}

- **NOT an application or library with compiled source.** This repo is documentation + config +
  Pi-side scripts + two drop-in plugins. The actual assistant runtime is upstream
  [`PiSugar/whisplay-ai-chatbot`](https://github.com/PiSugar/whisplay-ai-chatbot), cloned on the
  Pi — Claudia does not vendor or fork it, and extends it only through upstream's own hooks
  (`WAKE_WORD_PYTHON_PATH`, the `plugins/` folder).
- **NOT a wake-word trainer.** Wake-word ("Claudia") is taught to the WonderEcho by voice and
  detected on its on-device CI1302 chip; the only Pi-side piece is `wonderecho-wake.py`, a small
  I²C poller that upstream's wake listener runs in place of openWakeWord. No training step.
- **NOT a WonderEcho-as-microphone build.** The WonderEcho is a command-word recognizer: it
  reports result IDs over I²C and **never streams raw audio**, so it cannot feed ASR and never
  appears in ALSA. Conversation audio comes from the required USB mic.
- **NOT a Whisplay-HAT project.** The upstream repo is named for the Whisplay HAT, but Claudia
  deliberately uses only its LLM/ASR/TTS plumbing — wake events come from the WonderEcho and
  conversation audio from the USB mic and USB speaker instead.
- **NOT tied to one cloud vendor for speech.** ASR and TTS are builder-selectable (local Vosk /
  Piper by default, or OpenAI / ElevenLabs). The LLM brain is Claude by design — that is the point
  of the project, not an incidental choice.
- **NOT a web deploy.** The project page is this repo's GitHub README
  (https://github.com/mindattic/Claudia). Nothing renders or uploads it; edit `README.md` and push.
- **NOT an interactive configurator.** The README is a static page: its parts table is written by
  hand from `config/parts.json`, and no tool reads the catalog to build a page or shopping list.

## 4. Architecture canon {#CLA-§4}

```
  ┌─────────────────────── This repo (Claudia) ───────────────────────┐
  │  README.md ............ the build guide + project page (static)     │
  │  config/parts.json .... L5 catalog + build-option axes  ──┐         │
  │  config/versions.json . pinned upstream dep version labels │        │
  │  config/env.template .. example .env for the Pi            │        │
  │  config/asoundrc.usbmic USB mic + speaker ALSA profile     │        │
  │  scripts/pi/* ......... installer, healthcheck, wake bridge│        │
  │  plugins/ ............. drop-in ElevenLabs + smart plugs   │        │
  │  docs/ ................ Codex canon (this bible, etc.)     │        │
  └───────────────────────────────────────────────────────────┼────────┘
            │ README.md (parts table written by hand from ──────┘
            ▼            parts.json; GitHub shows it as-is)
     github.com/mindattic/Claudia
            │ builder follows guide
            ▼
  ┌────────────────────────── On the Pi ──────────────────────────────┐
  │  Raspberry Pi OS 64-bit                                            │
  │  whisplay-ai-chatbot (cloned upstream) ── systemd chatbot.service  │
  │      wake listener → ~/claudia/wonderecho-wake.py (I²C poll)       │
  │      ASR → LLM → TTS pipeline                                      │
  │        ASR: vosk (local, default) | openai                         │
  │        LLM: Anthropic Claude  ◄── the brain (always cloud)         │
  │        TTS: piper (local, default) | openai | elevenlabs (plugin)  │
  └───────┬──────────────────────────────────────────────────┬────────┘
          │ I²C bus 1 (4 wires)      │ USB OTG hub             │ HTTPS
          ▼                          ▼                         ▼
   Hiwonder WonderEcho (0x34)   USB mic + USB speaker    api.anthropic.com
   wake word "Claudia" ONLY —   (SunFounder mini or      (text only with
   on-device CI1302, reports    reSpeaker array; any     local ASR/TTS)
   result IDs, streams no audio UAC speaker)
```

### 4.1 Components

- **`README.md`** — the canonical build guide (named sections + troubleshooting) and the
  project page as GitHub shows it. It is static: the parts tables and the build-options table are
  written by hand from `config/parts.json`, and per-option differences are plain prose (no
  conditional markers). It is also the home page of the docs site at
  https://mindattic.github.io/Claudia/, published on every push to `main` [see HOUSE-LAW-14].
- **`config/parts.json`** — L5 canon-as-data: the shopping catalog AND the `configAxes` (the build
  options the README describes). Only `tools/codex.ps1 doctor` reads it; the README tables are
  updated by hand when it changes. See [§4.2](#CLA-§4) and [`docs/data/parts.index.json`](data/parts.index.json).
- **`config/versions.json`** — pinned upstream dependency version *labels* (Node, Python, default
  Claude model). README hardcodes these; kept in sync by hand.
- **`config/env.template`** — example `.env` for `~/whisplay-ai-chatbot/.env` on the Pi.
- **`config/asoundrc.usbmic`** — ALSA `~/.asoundrc` profile making the USB mic the default
  capture device and the USB speaker the default playback device, by card ID; the installer writes
  it with the detected IDs if absent.
- **`scripts/pi/install-claudia.sh`** — idempotent Pi-side installer automating the README from
  System setup through Start on boot, including the `.env` defaults and local Vosk/Piper.
- **`scripts/pi/healthcheck.sh`** — 5-part smoke test (WonderEcho on I²C · USB mic + speaker in
  ALSA · wake bridge configured · network reaches Anthropic · API key + model return 200). The
  README links it; it is not reproduced there.
- **`scripts/pi/wonderecho-wake.py`** — the wake bridge: upstream's wake listener runs it via
  `WAKE_WORD_PYTHON_PATH`; it polls the WonderEcho result register and prints `WAKE`.
- **`plugins/`** — drop-in upstream plugins (`elevenlabs-tts`, `smart-plugs`) copied to
  `~/whisplay-ai-chatbot/plugins/`, which upstream loads at startup.

### 4.2 Domain model (NOUNS)

- **Part** — one catalog entry (`id`, `category` ∈ core|mic|portable|smarthome, `price`, `tiers`,
  `specs`, optional `when` gate). Canonical store [`config/parts.json`](../config/parts.json);
  schema [`part.schema.json`](data/_schema/part.schema.json); ids registered in
  [`parts.index.json`](data/parts.index.json) as `part.<slug>`.
- **Config axis** — a builder choice, described as a build option in the README:
  `battery` (no|yes), `mic` (basic|array), `asr` (vosk|openai),
  `tts` (piper|openai|elevenlabs), `case` (none|fdm|sla), `smarthome` (none|kasa|shelly|sonoff).
  Values MUST match each part's `when` field exactly.
- **Build guide** — `README.md` sections; the artifact a builder follows end to end.
- **The device** — assembled stack: WonderEcho (I²C) ↔ Pi Zero 2 WH ↔ OTG hub ↔ USB mic + USB
  speaker (→ optional PiSugar 3 battery).

### 4.3 Key services (VERBS)

- **Install** — `scripts/pi/install-claudia.sh` provisions the Pi (apt, I²C, clone, build, service).
- **Healthcheck** — `scripts/pi/healthcheck.sh` proves I²C + audio devices + wake bridge +
  network + Claude API before launch.
- **Wake / converse** — WonderEcho detects "Claudia" on-device and latches a result ID in register
  `0x64`; `wonderecho-wake.py` polls it and prints `WAKE`; the chatbot records from the USB mic,
  runs ASR → Claude → TTS, and speaks the reply on the USB speaker.
- **Publish** — push `README.md` to `main`; the GitHub README (https://github.com/mindattic/Claudia)
  is the project page.

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
`config/parts.json`, the part `when` gates, and the README's build-options table and prose naming
that option. Adding or renaming an axis value means updating all of them together; a value present
in one but not the others is a defect. `doctor` enforces that every `when` key is a known axis;
the README leg is checked by review.

### {#CLA-LAW-5} No hardware claim ships unverified against the vendor.
I²C addresses, register opcodes, pin mappings, SKUs, and "in the box" contents are asserted only
with a vendor citation, and firmware-dependent specifics (e.g. the WonderEcho `0x34` address,
`0x64` result register and the undocumented learned-wake-word result ID) MUST carry an explicit
"verify against your firmware revision" caveat. Where the vendor publishes nothing (e.g. the
WonderEcho's I²C idle voltage), the guide says so and gives the builder a check instead.

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

**Build/test commands:** This repo has no compile step and no test suite (no `*.sln`,
`*.csproj`, or `package.json`). Verification is `tools/codex.ps1 doctor` plus JSON validity;
`bash -n` syntax-checks the Pi scripts where a POSIX shell is available.

## 7. Active frontier {#CLA-§7}

- **Stories & backlog:** [`docs/USER_STORIES.md`](USER_STORIES.md) — Epics A (Configure & shop),
  B (Assemble & flash), C (Install & converse), D (Verify & operate).
- **Open RFCs:** none.
- **Known soft spots:** firmware-dependent WonderEcho register map and undocumented wake result ID
  (caveated, see [CLA-LAW-5](#CLA-LAW-5)); unpublished WonderEcho I²C logic level (the guide has a
  multimeter check); reliance on upstream hooks (`WAKE_WORD_PYTHON_PATH`, `plugins/`) that can
  drift ([CLA-LAW-2](#CLA-LAW-2)); on-hardware end-to-end remains 🟡.

## 8. Quality bar {#CLA-§8}

A change to Claudia is "done" only when:

1. `tools/codex.ps1 doctor` passes (front-matter, ids, cross-refs, JSON+schema, path existence,
   digest freshness).
2. Any new/edited config axis agrees across `parts.json`, part `when` gates, and the README's
   build-options table and prose ([CLA-LAW-4](#CLA-LAW-4)); a catalog change is copied by hand into
   the README parts tables.
3. Any new hardware/price/version claim carries a vendor citation and a dated/"verify" caveat
   ([CLA-LAW-3](#CLA-LAW-3), [CLA-LAW-5](#CLA-LAW-5)).
4. Pi-side shell scripts pass `bash -n` and remain idempotent.
5. Docs status marks follow [HOUSE-LAW-8](../../MindAttic.HouseRules.md#HOUSE-LAW-8): `✅` only
   when a check or build proves it; otherwise `🟡`/`⬜`.

## 9. Glossary {#CLA-§9}

- **WonderEcho** — Hiwonder I²C wake-word module (CI1302 chip); learns "Claudia" by voice,
  recognizes it on-device and reports a result ID in register `0x64` at I²C address `0x34` on bus 1. Its on-board mic + speaker serve only
  the on-chip recognizer — it never streams audio and is not an ALSA device.
  Catalog id `part.hiwonder-wonderecho`.
- **USB conversation mic** — the required ALSA capture device the chatbot records from, attached
  through the OTG hub (`part.otg-hub`) on the Pi's data port: `part.sunfounder-mic` (basic, default) or `part.respeaker-xvf3800`
  (far-field 4-mic array upgrade), selected by the `mic` config axis.
- **USB speaker** — the playback device Claude's replies come out of (`part.usb-speaker`); the
  Pi Zero 2 WH has no audio jack and the WonderEcho's speaker plays only firmware phrases.
- **Wake bridge** — `scripts/pi/wonderecho-wake.py`, installed as `~/claudia/wonderecho-wake.py`
  and named by `WAKE_WORD_PYTHON_PATH`; turns WonderEcho results into upstream `WAKE` lines.
- **Pi Zero 2 WH** — Raspberry Pi Zero 2 with pre-soldered headers (the "H"); required so the
  4-pin WonderEcho link needs no soldering. Catalog id `part.pi-zero-2-wh`.
- **I²C** — two-wire serial bus (SDA/SCL) the Pi uses to talk to the WonderEcho on bus 1.
- **whisplay-ai-chatbot** — upstream PiSugar repo providing the ASR→LLM→TTS runtime, cloned on the
  Pi (see [CLA-LAW-2](#CLA-LAW-2)).
- **ASR / TTS** — automatic speech recognition (speech→text) / text-to-speech (text→speech); each
  builder-selectable via a config axis.
- **Config axis** — a build option (`battery`/`mic`/`asr`/`tts`/`case`/`smarthome`) governed by
  [CLA-LAW-4](#CLA-LAW-4).
- **Wake event** — the WonderEcho flagging, over I²C, that it heard "Claudia"; the wake bridge
  polls the result register and upstream starts a recording session.
