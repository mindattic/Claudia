---
codex: 1
project: Claudia
code: CLA
layer: stories
status: living
updated: 2026-10-03
---
<!-- GENERATED from MindAttic.Tickets/data/Tickets.db by `tickets db render`. Do not edit: this file is rewritten from the database; change stories and tickets with the tickets CLI. -->

# Claudia — User Stories

> ✅ done (shipped & tested) · 🟡 partial · ⬜ planned. Every ✅ cites the test/check
> that proves it. For this repo, "tests" are: `tools/codex.ps1 doctor` checks, JSON-schema
> validation of the catalog, `bash -n` syntax checks of the Pi scripts, and the named steps of
> `scripts/pi/healthcheck.sh`. On-hardware behaviours that cannot be exercised in this repo's
> tooling stay 🟡 until proven on a Pi.

## Epic A — Configure & shop

- **CLA-US-A1 ✅** As a builder, I can see my build options (battery, microphone, ASR, TTS,
  case, smart-home) in the README, so I know which parts and guide steps apply to my choices.
  *Given the six `configAxes`, When I read the README, Then the parts table and guide note which
  parts and steps each option changes.* *(verified by the `codex.ps1 doctor` axis-contract check
  that every part `when` key in `config/parts.json` is a `configAxes` key; the README tables are
  written by hand from the catalog and checked by review per [CLA-LAW-4](BIBLE.md#CLA-LAW-4).)*
- **CLA-US-A2 ✅** As a builder, I can see every required and optional part with a price estimate
  and at least three buy links (Amazon → official → reputable), so I can source the hardware.
  *Given `config/parts.json`, Then each part has ≥1 tier and the catalog a dated `pricesAsOf`.*
  *(verified by `part.schema.json` validation in `codex.ps1 doctor`.)*
- **CLA-US-A3 ✅** As a builder, I am told prices and stock are non-authoritative and dated, so I
  don't trust a stale estimate. *Given any price, Then the catalog carries `pricesAsOf` and stock
  guidance (rpilocator).* *(verified by presence of `pricesAsOf` per [CLA-LAW-3](BIBLE.md#CLA-LAW-3); README stock note.)*

## Epic B — Assemble & flash

- **CLA-US-B1 ✅** As a builder, I can wire the WonderEcho to the Pi with no soldering, so I avoid
  electronics work. *Given the WH (pre-headered) Pi + 4 Dupont wires, When I connect
  SDA/SCL/5V/GND, Then assembly needs no iron.* *(verified by README part 03 + catalog notes on
  `part.pi-zero-2-wh` and `part.elegoo-dupont-wires`; doctor confirms cited parts exist.)*
- **CLA-US-B2 ✅** As a builder, I can flash Raspberry Pi OS 64-bit with hostname/SSH/Wi-Fi
  preset, so the Pi boots headless and reachable at `claudia.local`. *(verified by README part 04
  procedure; version label in `config/versions.json`.)*
- **CLA-US-B3 🟡** As a builder, I confirm I²C is enabled and the WonderEcho answers on the bus, so I know the module is wired correctly. *Given `i2cdetect -y 1`, Then address `0x34` (or `0x33` if re-addressed) appears.* *(checked in software by `healthcheck.sh` step 1 and `install-claudia.sh` step 8; requires real hardware — not exercisable in this repo's CI.)*

## Epic C — Install & converse

- **CLA-US-C1 ✅** As a builder, I can run one idempotent installer that provisions the Pi (apt deps, I²C, USB audio config, clone upstream, `.env` defaults, wake bridge, local Vosk/Piper, build, boot service), so setup isn't 20 manual steps. *(verified by `bash -n scripts/pi/install-claudia.sh` and a local run of its ALSA-parsing and `.env` helpers against sample input; idempotency guards reviewed — `.install_dependencies.done`, `.env` keys only added when missing, `systemctl is-enabled` check.)*
- **CLA-US-C2 ✅** As a builder, I can configure the chatbot from a documented `.env` template with the LLM set to Anthropic, so the brain is Claude. *Given `config/env.template`, Then `LLM_SERVER=anthropic` and `ANTHROPIC_LLM_MODEL` (the key upstream reads) are preset.* *(verified by `config/env.template` contents against upstream `src/cloud-api/anthropic/anthropic-llm.ts` + README Configure the chatbot.)*
- **CLA-US-C3 🟡** As a user, I can say "Claudia" and get a spoken answer within seconds, so it works like a real assistant. *Given the running service, When I speak the wake word, Then the WonderEcho latches a result, `wonderecho-wake.py` prints WAKE, and Claude replies through the USB speaker.* *(bridge logic tested locally against a simulated I²C bus; on-device behaviour depends on the WonderEcho firmware result ID — caveated per [CLA-LAW-5](BIBLE.md#CLA-LAW-5); not exercisable here.)*
- **CLA-US-C4 🟡** As a privacy-minded user, I can run ASR and TTS fully locally (Vosk + Piper, the defaults) so nothing but the Claude call leaves the device. *(local options are the default axis values per [CLA-LAW-1](BIBLE.md#CLA-LAW-1) and the installer sets them up; end-to-end latency only verifiable on hardware.)*

## Epic D — Verify & operate

- **CLA-US-D1 🟡** As a builder, I can run a healthcheck that proves the WonderEcho is present, the USB mic and speaker are visible to ALSA, the wake bridge is configured, the network reaches Anthropic, and my key + model return a response, so I debug before launch. *Given `healthcheck.sh`, Then 5 sections report pass/fail.* *(script `bash -n` clean and reviewed; steps 1–3 need hardware, step 5 needs a live key — not run in this repo's CI.)*
- **CLA-US-D2 🟡** As a builder, I can set the chatbot to start on boot via systemd, so the device
  is always-on. *(documented in README part 10 + `install-claudia.sh` step 10 calling upstream
  `startup.sh`; requires the Pi.)*
- **CLA-US-D3 ✅** As a maintainer, I can validate the whole doc/config set in one command so a
  bad edit is caught before it is pushed. *Given `tools/codex.ps1 doctor`, Then front-matter, ids,
  cross-refs, JSON+schema, and cited paths are checked.* *(verified by `codex.ps1 doctor`
  exiting 0 — see BIBLE [§6](BIBLE.md#CLA-§6).)*

## Priority backlog

Dependency-ordered toward "a non-expert ships a working Claudia":

1. **CLA-US-B3** — on-hardware I²C detection of the WonderEcho (unblocks C3/C4).
2. **CLA-US-C3 / CLA-US-C4** — verified wake→Claude→speak round trip, local-only path.
3. **CLA-US-D1 / CLA-US-D2** — healthcheck + boot service proven on a real Pi.
4. Confirm the WonderEcho `0x52` address and `0x10` set-trigger opcode against shipping firmware,
   then drop the caveat where confirmed ([CLA-LAW-5](BIBLE.md#CLA-LAW-5)).
5. Confirm on shipping hardware the result ID a voice-learned "Claudia" reports in register `0x64` and the WonderEcho I²C idle voltage, then narrow the bridge default and the safety-check wording ([CLA-LAW-5](BIBLE.md#CLA-LAW-5)). Supersedes item 4: Hiwonder documents address `0x34`, and wake words are learned by voice, not set through a `0x10` opcode.

## Tickets
> Permanent log of every change and fix — this repo's ticket system. Rows are append-only: never
> delete or reword one; only move its Status (open → closed / wont-do) and fill in Ref. Status is
> a word, not a glyph, so tickets don't count toward the story index. Keep this section last.

| ID | Date | Type | Status | Summary | Ref |
|---|---|---|---|---|---|
| CLA-T1 | 2026-10-12 | docs | closed | Start the permanent ticket log in USER_STORIES.md | — |
| CLA-T2 | 2026-10-15 | chore | closed | Remove duplicate command copies (/deploy, /do, /quickload, /quicksave) now centralized at the user level (~/.claude/commands) | M.FLOW-T14 |
| CLA-T3 | 2026-10-16 | chore | closed | install.ps1 adds this repo's 8 .prose/commands stubs for the shared global commands, so any LLM client finds them | mindattic-agent-standard/install.ps1 run 2026-10-16 |
| CLA-T4 | 2026-10-16 | chore | closed | Bug hunt: run an exhaustive /bughunt over the whole repo and fix every real bug found (each fix under its own fix ticket), then hunt again; close this only when a full pass finds nothing | 162cd23 |
| CLA-T5 | 2026-10-16 | chore | open | Run the full unit test suite and fix every failure (each under its own fix ticket) until it passes; put the passing run in --ref. No test project: close this wont-do saying so | user request 2026-10-16: approved repo sweep |
| CLA-T6 | 2026-10-16 | chore | open | Clean up code and docs: remove dead code, stale comments and outdated or duplicated docs, and simplify where behaviour doesn't change (/simplify); tests stay green | user request 2026-10-16: approved repo sweep |
| CLA-T7 | 2026-10-16 | docs | open | Bring README.md up to date with the code as it is now (what it is, setup, usage, commands, current state), following codex-standard/README-STYLE.md; README.htm regenerated if the repo has one | user request 2026-10-16: approved repo sweep |
| CLA-T8 | 2026-10-16 | docs | closed | Update USER_STORIES.md | — |
| CLA-T9 | 2026-10-19 | chore | wont-do | Convert tracked source files to LF line endings via .gitattributes, per HOUSE-LAW-13 (low priority) | — |
| CLA-T10 | 2026-10-20 | docs | closed | Publish Claudia docs to GitHub Pages via the shared Toolkit DocFX pipeline: run adopt-docs-site.ps1 (README.md as home page, docs/*.md as articles, API reference only where the code builds in CI), enable Pages with build_type=workflow, set the repo homepage URL, retire tools/build-readme.ps1 and README.htm, confirm the docs Actions run is green and https://mindattic.github.io/Claudia/ returns 200. Depends on MAT-T8. | aeebc42 |
| CLA-T11 | 2026-10-20 | chore | closed | Update docs pipeline reference from MindAttic.Toolkit to its new name MindAttic.Agency | — |
| CLA-T12 | 2026-10-21 | fix | closed | healthcheck reports a dead network as reachable: curl -w prints 000 and the \|\| echo 000 fallback appends another, so 000000 passes the 000 check | 1556260 |
| CLA-T13 | 2026-10-21 | fix | closed | healthcheck sources the chatbot .env as a shell script, executing unquoted SYSTEM_PROMPT words as commands and aborting on apostrophes | 9c14330 |
| CLA-T14 | 2026-10-21 | fix | closed | install-claudia.sh exits silently under set -e/pipefail when .env has no ANTHROPIC_API_KEY= line instead of warning | e5b89ca |
| CLA-T15 | 2026-10-21 | fix | closed | inject-digest.ps1 reads the UTF-8 digest as ANSI under PowerShell 5.1, injecting mojibake (em dash becomes a-euro-quote) into session context | b1ff01e |
| CLA-T16 | 2026-10-21 | fix | closed | Wake-word snippet imports smbus2, but the guide only installs python3-smbus, so it fails with ModuleNotFoundError | 95a7a68 |
| CLA-T17 | 2026-10-21 | fix | closed | Installer and guide apt line require libatlas-base-dev, which does not exist in Debian trixie (current Raspberry Pi OS), aborting the install | c5b8116 |
| CLA-T18 | 2026-10-21 | fix | closed | Quick start copies only install-claudia.sh to the Pi, so the installer skips the healthcheck and step 5's 'bash ~/healthcheck.sh' fails with No such file | 162cd23 |
| CLA-T19 | 2026-10-21 | docs | closed | Update USER_STORIES.md | — |
| CLA-T20 | 2026-10-22 | docs | closed | Update USER_STORIES.md | — |
| CLA-T21 | 2026-10-24 | fix | open | Full parts/electrical/software review: default build had no speaker, no WonderEcho-to-chatbot wake glue (wrong I2C address 0x52 vs vendor 0x34, invented 0x10 opcode), wrong upstream env keys (ANTHROPIC_MODEL, whisper-cpp, google), cloud TTS as silent default, unloaded nvm in installer; fix catalog, scripts, guide and canon | — |
