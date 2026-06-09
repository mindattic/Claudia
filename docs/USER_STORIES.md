---
codex: 1
project: Claudia
code: CLA
layer: stories
status: living
updated: 2026-06-09
---

# Claudia — User Stories

> ✅ done (shipped & tested) · 🟡 partial · ⬜ planned · 🗑️ cut. Every ✅ cites the test/check
> that proves it. For this repo, "tests" are: `tools/codex.ps1 doctor` checks, JSON-schema
> validation of the catalog, `bash -n` syntax checks of the Pi scripts, and the named steps of
> `scripts/pi/healthcheck.sh`. On-hardware behaviours that cannot be exercised in this repo's
> tooling stay 🟡 until proven on a Pi.

## Epic A — Configure & shop

- **CLA-US-A1 ✅** As a builder, I can pick my build options (battery, microphone, ASR, TTS,
  case, smart-home) on the landing page, so the shopping list and guide match my choices.
  *Given the six `configAxes`, When I choose a value, Then matching `<!-- when: -->` README
  blocks and `when`-gated parts show.* *(verified by `codex.ps1 doctor` axis-contract check that
  `configAxes` values in `config/parts.json` match part `when` gates; markers checked manually
  per [CLA-LAW-4](BIBLE.md#CLA-LAW-4).)*
- **CLA-US-A2 ✅** As a builder, I can see every required and optional part with a price estimate
  and at least three buy links (Amazon → official → reputable), so I can source the hardware.
  *Given `config/parts.json`, When rendered, Then each part has ≥1 tier and a dated `pricesAsOf`.*
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
- **CLA-US-B3 🟡** As a builder, I confirm I²C is enabled and the WonderEcho answers on the bus,
  so I know the module is wired correctly. *Given `i2cdetect -y 1`, Then a `0x5x` address appears.*
  *(checked in software by `healthcheck.sh` step 1 and `install-claudia.sh` step 8.3; requires
  real hardware — not exercisable in this repo's CI.)*

## Epic C — Install & converse

- **CLA-US-C1 ✅** As a builder, I can run one idempotent installer that provisions the Pi
  (apt deps, I²C, clone upstream, build, register the boot service), so setup isn't 20 manual
  steps. *(verified by `bash -n scripts/pi/install-claudia.sh`; idempotency guards reviewed —
  `.install_dependencies.done`, `systemctl is-enabled` check.)*
- **CLA-US-C2 ✅** As a builder, I can configure the chatbot from a documented `.env` template
  with the LLM set to Anthropic, so the brain is Claude. *Given `config/env.template`, Then
  `LLM_SERVER=anthropic` and a model id are preset.* *(verified by `config/env.template` contents
  + README part 08.)*
- **CLA-US-C3 🟡** As a user, I can say "Claudia" and get a spoken answer within seconds, so it
  works like a real assistant. *Given the running service, When I speak the wake word, Then a wake
  event fires and Claude replies via TTS.* *(on-device behaviour; depends on WonderEcho firmware
  register map — caveated per [CLA-LAW-5](BIBLE.md#CLA-LAW-5); not exercisable here.)*
- **CLA-US-C4 🟡** As a privacy-minded user, I can run ASR and TTS fully locally (whisper-cpp +
  Piper) so nothing but the Claude call leaves the device. *(local options documented and
  default-able per [CLA-LAW-1](BIBLE.md#CLA-LAW-1); end-to-end latency only verifiable on hardware.)*

## Epic D — Verify & operate

- **CLA-US-D1 🟡** As a builder, I can run a 90-second healthcheck that proves the WonderEcho is
  present, the USB mic is visible to ALSA, the network reaches Anthropic, and my key + model
  return a response, so I debug before launch. *Given `healthcheck.sh`, Then 4 layers report
  pass/fail.* *(script `bash -n` clean and reviewed; steps 1–2 need hardware, step 4 needs a live
  key — not run in this repo's CI.)*
- **CLA-US-D2 🟡** As a builder, I can set the chatbot to start on boot via systemd, so the device
  is always-on. *(documented in README part 10 + `install-claudia.sh` step 10 calling upstream
  `startup.sh`; requires the Pi.)*
- **CLA-US-D3 ✅** As a maintainer, I can validate the whole doc/config set in one command so a
  bad edit is caught before deploy. *Given `tools/codex.ps1 doctor`, Then front-matter, ids,
  cross-refs, JSON+schema, and cited paths are checked.* *(verified by `codex.ps1 doctor`
  exiting 0 — see BIBLE [§6](BIBLE.md#CLA-§6).)*

## Priority backlog

Dependency-ordered toward "a non-expert ships a working Claudia":

1. **CLA-US-B3** — on-hardware I²C detection of the WonderEcho (unblocks C3/C4).
2. **CLA-US-C3 / CLA-US-C4** — verified wake→Claude→speak round trip, local-only path.
3. **CLA-US-D1 / CLA-US-D2** — healthcheck + boot service proven on a real Pi.
4. Confirm the WonderEcho `0x52` address and `0x10` set-trigger opcode against shipping firmware,
   then drop the caveat where confirmed ([CLA-LAW-5](BIBLE.md#CLA-LAW-5)).

### Audit log

When a story is rewritten, the original spec is kept verbatim below, marked
"(original spec — audit log)".

- **CLA-US-A1** (original spec — audit log, superseded 2026-06-09 by [CLA-A2](AMENDMENTS.md)):
  "As a builder, I can pick my build options (battery, ASR, TTS, case, smart-home) on the landing
  page, so the shopping list and guide match my choices. *Given the five `configAxes`, When I
  choose a value, Then matching `<!-- when: -->` README blocks and `when`-gated parts show.*"
- **CLA-US-D1** (original spec — audit log, superseded 2026-06-09 by [CLA-A2](AMENDMENTS.md)):
  "As a builder, I can run a 90-second healthcheck that proves the WonderEcho is present, the
  network reaches Anthropic, and my key + model return a response, so I debug before launch.
  *Given `healthcheck.sh`, Then 3 layers report pass/fail.*"
