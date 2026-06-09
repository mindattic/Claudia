---
codex: 1
project: Claudia
code: CLA
layer: amendments
status: living
updated: 2026-06-09
---

# Claudia — Amendments (append-only; amendment wins over the bible)

> Append-only change log. Never rewrite an amendment — supersede it with a new one. Beyond ~25,
> fold into `docs/BIBLE.md` and start a new epoch (note the git tag).

## CLA-A1 — Adopt the Codex documentation standard (supersedes —)

**What changed.** Installed the MindAttic Codex canon for this repo: added `docs/BIBLE.md` (L0),
`docs/USER_STORIES.md` (L2), this `docs/AMENDMENTS.md` (L1), `docs/rfc/0001-config-axis-contract.md`,
the L5 data registry `docs/data/parts.index.json` + `docs/data/_schema/part.schema.json`,
`tools/codex.ps1` (doctor + digest), and the `.claude/hooks/inject-digest.ps1` SessionStart hook
wired into `.claude/settings.json`.

**Why.** Give Claudia a single machine-checkable source of truth and a SessionStart digest so
agents inherit the project's laws and state.

**Migration.** None destructive. No prior canon docs existed (`README.md` and `config/*.json`
remain in place and unmodified). `config/parts.json` is the **canonical** L5 store and was NOT
moved — MindAttic.Deploy reads it at that path; `docs/data/parts.index.json` mirrors its stable
ids (`part.<slug>`) and points the schema at it. The org-wide
[`MindAttic.HouseRules.md`](../../MindAttic.HouseRules.md) is inherited by reference from
BIBLE [§5](BIBLE.md#CLA-§5), not copied.

## CLA-A2 — The WonderEcho is not a microphone; a USB mic joins the required equipment (supersedes —)

**What changed.** On-device debugging (June 2026) proved the prior architecture wrong: the
WonderEcho never appears in ALSA (`aplay -l` shows only HDMI) because its CI1302 chip is a
*command-word recognizer*, not an audio interface — it recognizes fixed phrases on-device and
transmits short command/event IDs over I²C ([Hiwonder docs](https://www.hiwonder.com/products/wonderecho)).
It cannot stream raw audio to Whisper, and its on-board speaker only plays its own pre-stored
phrases. New canon: the WonderEcho is the **hardware wake-word trigger only**; conversation audio
is captured by a **required USB microphone** — new catalog category `mic` and config axis
`mic=basic|array` (`part.sunfounder-mic` SunFounder CN0029, default; `part.respeaker-xvf3800`
Seeed reSpeaker XVF3800 far-field array as the higher-quality alternative), plus
`part.otg-adapter` (core) since the Pi Zero has no USB-A port. README parts 01/03/5.5/06/08/09/
10/12 rewritten accordingly; `healthcheck.sh` gains a step 2 "USB microphone in ALSA";
`install-claudia.sh` gains step 5.5 writing `~/.asoundrc`; `config/asoundrc.usbmic` is now the
standard (not optional) capture profile.

**Why.** The upstream `whisplay-ai-chatbot` records through a standard ALSA microphone; the
published guide claimed the WonderEcho filled that role, which is impossible at the hardware
level. Honest hardware claims are [CLA-LAW-5](BIBLE.md#CLA-LAW-5) territory — this corrects a
shipped violation of it.

**Migration.** Existing builders add a USB mic + micro-USB OTG adapter (~$12 total for the basic
option) and create `~/.asoundrc` per guide Part 5.5. No software re-install needed.
