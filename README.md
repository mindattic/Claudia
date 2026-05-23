# Claudia

**Build your own Claude-powered smart speaker in an afternoon. No soldering. No cloud lock-in.**

Claudia is a palm-sized, hackable smart speaker on a Raspberry Pi Zero 2 **WH** + Hiwonder WonderEcho voice module. Say **"Claudia"**, ask anything, and Claude answers out loud. This repo is the complete builder kit: an illustrated build guide, a parts catalog with price-comparison shopping, an automated Pi installer, and a Windows console that configures and updates your device over the LAN.

Wake-word detection runs in the WonderEcho's own firmware over I²C — no Pi-side listener, no openWakeWord, no model training. You program **"Claudia"** once with a one-shot I²C write (Part 8.3 of the guide). The chatbot runtime is the upstream [`PiSugar/whisplay-ai-chatbot`](https://github.com/PiSugar/whisplay-ai-chatbot); this repo doesn't fork it — it's the guide, configs, and Windows-side tooling that turn a pile of parts into a finished device.

**Why Claudia:**

- **No soldering, ready in an afternoon.** Four pins of pre-flashed I²C cable connects the WonderEcho to the Pi Zero 2 **WH**. First-boot install is one shell script.
- **No Alexa in the room.** The wake word is local. Recognition fires on-board the WonderEcho — your microphone is not streaming to a vendor's servers waiting for "Hey {brand}."
- **Pluggable everything.** Swap LLMs (`anthropic` / `openai`), TTS engines (`openai` / `piper` / `elevenlabs` / `gemini`), or ASR providers (`whisper-cpp` / `openai` / `google`) with a single `set-llm` / `set-tts` / `set-asr` console command.
- **Builder kit, not a SaaS.** Everything you need ships in this repo: parts list with tiered Amazon / Official / Reputable links, a `find-deals` shopping walker, a Pi-side installer, a Windows console, and a build guide rendered as one self-contained HTML file.
- **One Markdown, one HTML, one truth.** Edit `Claudia.md`, save, and a `PostToolUse` hook regenerates `Claudia.htm` (inline CSS + JS + base64 PNGs — no CDN, no broken images two years from now).

> The build requires the **WH** variant of the Pi Zero 2 (pre-soldered headers). The plain "W" has no headers and would need 40 pins soldered before the WonderEcho's 4-pin cable can connect.

---

## Table of Contents

- [What's in here](#whats-in-here)
- [Getting started (Windows builder side)](#getting-started-windows-builder-side)
  - [Shopping flow (find-deals → apply-deals)](#shopping-flow-find-deals--apply-deals)
  - [Self-update (`pull-latest` + `self-update`)](#self-update-pull-latest--self-update)
- [Build the device](#build-the-device)
- [HTML workflow](#html-workflow)
  - [Theming](#theming)
  - [Parts gallery](#parts-gallery)
  - [Bumping the version](#bumping-the-version)
  - [Deploying to mindattic.com/claudia/](#deploying-to-mindatticcomclaudia)
- [Slash commands](#slash-commands-commit-do-deploy)
- [Cost / time / parts](#cost--time--parts)
- [Upstream references](#upstream-references)

---

## What's in here

```
Claudia/
├── Claudia.md                 # The build guide (canonical source of truth)
├── Claudia.htm                # Auto-generated self-contained page (inlined CSS+JS+images, light/dark theme)
├── index.htm                  # Byte-identical clone of Claudia.htm (so /claudia/ serves it directly — no redirect)
├── README.md                  # ← you are here
├── CLAUDE.md                  # Project rules for Claude Code agents
├── Claudia.Console.bat        # Top-level shortcut to scripts/cli/Claudia.Console.bat
├── package.json               # Two deps: marked (markdown) + highlight.js (syntax)
│
├── .claude/
│   ├── settings.json          # Hook: regenerate .htm on every .md edit
│   └── commands/
│       ├── commit.md          # /commit slash command
│       ├── deploy.md          # /deploy slash command (FTP-upload to mindattic.com/claudia)
│       └── do.md              # /do slash command (continue current task)
│
├── config/
│   ├── env.template           # Example .env for the Pi
│   ├── asoundrc.usbmic        # ~/.asoundrc for legacy USB-mic builds (current build doesn't need it)
│   ├── parts.json             # Parts catalog (Amazon/official/reputable URLs per part)
│   ├── versions.json          # Compile-time {{VAR}} substitutions injected into the .md
│   ├── part-images/           # PNGs that build-html.js base64-inlines into Claudia.htm
│   └── console.json           # Saved Pi host/user (created on first 'detect'; gitignored value)
│
└── scripts/
    ├── cli/                          # Windows builder-side tooling
    │   ├── Claudia.Console.ps1       # Multi-command console (local + remote Pi)
    │   ├── Claudia.Console.bat       # Launcher
    │   ├── build-html.js             # Node: markdown -> self-contained .htm with theme toggle
    │   ├── build-html.ps1 / .bat     # PowerShell wrapper for build-html.js
    │   ├── bump-version.ps1 / .bat   # Stamp Claudia.md with a new date + rebuild .htm
    │   ├── deploy.ps1 / .bat         # Build + FTP upload to /mindattic.com/claudia/
    │   ├── deploy.settings.json.template  # Copy to deploy.settings.json (gitignored) with real FTP creds
    │   ├── on-md-change.ps1          # Hook handler - auto-rebuild .htm on .md edits
    │   └── pull-latest-finisher.ps1  # Detached helper for self-update (locked-file safe)
    └── pi/                           # Scripts that run on the Raspberry Pi
        ├── healthcheck.sh            # End-to-end smoke test (I²C + network + Claude API)
        └── install-claudia.sh        # Automates Parts 5-10 of the guide
```

---

## Getting started (Windows builder side)

You need **Node.js** ([nodejs.org](https://nodejs.org)) and **PowerShell 5+** (ships with Windows).

```powershell
# 1. one-time: install the local deps the HTML build uses
.\scripts\cli\Claudia.Console.bat update

# 2. open the interactive console
.\Claudia.Console.bat
```

You'll see something like:

```
  Claudia Console
  ---------------
  target Pi  : pi@claudia.local

  Commands:
    help           List available commands.
    detect         Find Claudia (the Pi) on the LAN. Saves the host for later commands.
    set-host       Override the Pi hostname/IP.
    shell          Open an interactive SSH session to Claudia.
    status         Show chatbot.service status on Claudia.
    restart        Restart chatbot.service on Claudia.
    logs           Tail Claudia chatbot logs.
    healthcheck    Copy scripts/pi/healthcheck.sh to Claudia and run it.
    set-model      Set ANTHROPIC_MODEL on the Pi.
    set-prompt     Set SYSTEM_PROMPT on the Pi.
    set-apikey     Set ANTHROPIC_API_KEY on the Pi.
    set-tts        Set TTS_SERVER on the Pi (openai | piper | elevenlabs | gemini | ...).
    set-asr        Set ASR_SERVER on the Pi (whisper-cpp | openai | google).
    set-llm        Set LLM_SERVER on the Pi (anthropic | openai).
    show-config    Print the remote .env (api key masked).
    update         Install/refresh local Node deps.
    build-html     Render the latest Claudia.md to a self-contained .htm.
    bump           Stamp Claudia.md with today's date and rebuild the .htm.
    deploy         Build Claudia.htm and FTP-upload .md/.htm/index.htm.
    list-parts     List parts catalog + which have a chosen URL.
    find-deals     Open Amazon/official/reputable tabs per part; save your picks.
    apply-deals    Stamp chosen URLs into the latest Claudia.md.
    pull-latest    git fetch + overlay latest source (handles locked .ps1 files).
    self-update    Refresh node_modules + open "newer version?" searches per part.
```

> The wake word lives in the WonderEcho's own firmware over I²C — there's no Pi-side env knob for it, so the Console no longer exposes a `set-wakeword` command. Re-program it with the one-shot I²C script from Part 8.3 of the guide.

### Shopping flow (find-deals → apply-deals)

The Console doubles as a price-comparison assistant for the parts in `config/parts.json`. For every part it opens browser tabs in this order:

1. **Search for** a Google Shopping query (broad fallback)
2. **Amazon** (filtered for price-asc)
3. **Official retailer** (raspberrypi.com, pisugar.com, hiwonder.com, etc.)
4. **Reputable** secondaries (Adafruit, Pi Hut, Sparkfun, Best Buy, Target, Tindie)

You pick the best URL, paste it back into the prompt, and `apply-deals` rewrites the latest `Claudia.md` so each part line becomes a Markdown link to the URL you chose. The hook then auto-regenerates `Claudia.htm`.

```powershell
.\Claudia.Console.bat find-deals               # walk the whole catalog
.\Claudia.Console.bat find-deals core          # just the must-have parts (Pi, SD, PSU, WonderEcho)
.\Claudia.Console.bat find-deals smarthome     # just the smart-plug category
.\Claudia.Console.bat apply-deals              # write the chosen URLs into the .md
```

### Self-update (`pull-latest` + `self-update`)

- **`pull-latest`** — `git fetch` then mirror `origin/<branch>` into the working tree. Because Windows keeps the running `Claudia.Console.ps1` open, the command stages the new files into `%TEMP%` and spawns a detached helper (`scripts/cli/pull-latest-finisher.ps1`) that waits for *this* PowerShell to exit before robocopying the temp tree over the repo. Progress goes to `.claude/pull-latest.log`.
- **`self-update`** — runs `npm outdated` / `npm update` / `npm audit fix`, then opens "is there a newer version of \<part\>?" searches for every catalog entry, then opens the official Claude model catalog. Use it monthly to catch silently-aging dependencies, deprecated parts, and new model IDs.

You can also call commands directly:

```powershell
.\Claudia.Console.bat detect
.\Claudia.Console.bat set-model claude-sonnet-4-6
.\Claudia.Console.bat logs
.\Claudia.Console.bat update --clean
```

---

## Build the device

1. Open **`Claudia.md`** (or `Claudia.htm` for the styled, offline-ready version).
2. Follow Parts 01–04 to configure your build, buy parts, assemble, and flash the SD card.
3. SSH in. Then either:
   - **Manual path:** follow Parts 05–10 by hand.
   - **Scripted path:** copy `scripts/pi/install-claudia.sh` to the Pi and run it. It walks the same steps end-to-end and prompts you when it needs a reboot or your API key.
4. Once it's running, run `Claudia.Console detect` from this machine — every command after that targets it over SSH.

---

## HTML workflow

The `.htm` is **derived**: never hand-edit `Claudia.htm`, always edit the `.md`. The output is one self-contained file — inline CSS, inline JS. No CDN, no `<link>`, no `<script src>`. Styling and the light/dark theme toggle follow [mindattic.com](https://mindattic.com)'s single-file convention.

Two ways the page gets refreshed:

1. **Automatic** — `.claude/settings.json` registers a `PostToolUse` hook that fires `scripts/cli/on-md-change.ps1` whenever Claude Code edits `Claudia.md`. The hook re-renders `Claudia.htm`, mirrors it to `index.htm`, and logs to `.claude/html-rebuild.log`. No-op for any other file edit.

2. **Manual** —
   ```powershell
   .\scripts\cli\build-html.bat              # latest version
   .\scripts\cli\build-html.bat -Source .\Claudia.md
   ```

### Theming

The page ships with both palettes and **defaults to dark**. The toggle button (top-right corner) flips `data-theme` on `<html>`; CSS custom properties drive every color so the rest of the cascade follows. The choice is persisted to `localStorage` under the key `claudia-theme` — including on first visit, so the dark default is locked in until the user explicitly flips it.

### Parts gallery

`build-html.js` builds a "Parts gallery" section from `config/parts.json`. Each card lists every tier link (Official / Google Shopping / reputable secondaries) plus a per-part price estimate, and the running total at the bottom updates live as the user changes the Configure-your-build widget above.

Images are read from `config/part-images/*.png` and base64-inlined into `Claudia.htm` at build time — no `<img src>`, no CDN dependency. Vendor CDNs rot too fast to trust; local PNGs in the repo are version-pinned with the rest of the build. To add an image for a new part, drop a PNG into `config/part-images/` and set `"imageFile": "part-images/<file>.png"` on the part entry in `parts.json`.

### Bumping the version

The file path is **stable** — `Claudia.md` and `Claudia.htm` never get renamed, so external links to them never rot. The revision date lives *inside* the file (in the H1, the "What's new in <date>" heading, and the footer). Bumping means rewriting those dates in place; historical revisions are recoverable from git history.

```powershell
.\scripts\cli\bump-version.bat                # stamp today's date (YYYY.MM.DD)
.\scripts\cli\bump-version.bat -To 2026.06.01 # forward-date explicitly
```

The bumper finds the current date from the H1, replaces it everywhere it appears in the file, then regenerates `Claudia.htm`.

### Deploying to mindattic.com/claudia/

The repo includes an FTP deploy that mirrors mindattic.com's pattern.

```powershell
# one-time setup
copy scripts\cli\deploy.settings.json.template scripts\cli\deploy.settings.json
# edit deploy.settings.json with real FTP creds (it's gitignored)

# every release
.\scripts\cli\deploy.bat
# or, from the Console:
.\Claudia.Console.bat deploy
```

What `deploy.ps1` does, in order:

1. **Builds** — runs `build-html.js` so `Claudia.htm` reflects the current `.md`. Skip with `-NoBuild` if you just ran it.
2. **Stamps + clones** — inserts/replaces a `<!-- Last Updated: ISO8601 -->` comment at the top of `Claudia.htm`, then writes that same byte stream out to `index.htm`. Both files are identical post-deploy, so `mindattic.com/claudia/` serves the full page directly with no redirect hop.
3. **Uploads** — `curl.exe --ssl-reqd --ftp-pasv` pushes `Claudia.md`, `Claudia.htm`, and `index.htm` to `FtpRemotePath` (defaults to `/mindattic.com/claudia`).

Credentials never leave your machine: `scripts/cli/deploy.settings.json` is in `.gitignore`. Only the placeholder template gets committed.

---

## Slash commands (`/commit`, `/do`, `/deploy`)

Three project-scoped commands live under `.claude/commands/`:

- **`/commit`** — stages and commits the current working tree with a concise, log-style-matching message. Never `git add -A`, never `--amend`, never `--no-verify`.
- **`/do`** — explicit version of the "bare `do` means continue" rule. Resumes whatever Claude was in the middle of when you stepped away.
- **`/deploy`** — rebuilds `Claudia.htm`, stamps `index.htm`, and FTP-uploads `Claudia.md` / `Claudia.htm` / `index.htm` to `mindattic.com/claudia/`. Mirrors the `/deploy` command in the [mindattic.com](https://mindattic.com) repo.

Any of these can be hoisted to your global `~/.claude/commands/` later if you want them everywhere.

---

## Cost / time / parts

The interactive Parts gallery in `Claudia.md` (Part 02) sums the live total based on your configuration. At a glance:

| Build | What you get | Total |
|-------|--------------|-------|
| Desktop  | Pi Zero 2 WH + 32 GB microSD + 12.5 W PSU + WonderEcho  | ~$62 |
| Portable | Desktop + PiSugar 3 1200 mAh battery                    | ~$102 |
| + smart plug | Add one of Kasa HS103 / Shelly Plug US Gen4 / Sonoff S31 + Tasmota | +$10–$20 |

Assembly is ~3 minutes — one 4-pin I²C cable from the WonderEcho to the Pi's GPIO header, no soldering. First-boot software install is ~30–60 minutes wall-clock (mostly `apt` and `npm` chugging on a 512 MB Pi).

---

## Upstream references

- Build guide: **`Claudia.md`** in this repo
- Chatbot runtime: <https://github.com/PiSugar/whisplay-ai-chatbot>
- WonderEcho voice module: <https://www.hiwonder.com/products/wonderecho>
- Claude API docs: <https://docs.claude.com>
- Claude model catalog: <https://docs.claude.com/en/docs/about-claude/models/overview>
- Claude pricing: <https://anthropic.com/pricing>

---

*Built by MindAttic LLC. The guide carries the canonical version; this README just points at it.*
