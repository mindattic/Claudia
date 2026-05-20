# Claudia

> **Build your own Claude-powered voice assistant.** Claudia is a palm-sized, hackable smart speaker on a Raspberry Pi Zero 2 W + PiSugar Whisplay HAT — no soldering, ~$77 to start, ready in an afternoon. Say a wake word, ask anything, and Claude talks back. This repo is the complete builder kit: an illustrated build guide, a parts catalog with price-comparison shopping, an automated Pi installer, and a Windows console that flashes, configures, and updates your device over the LAN.

Wake on **"Hey Jarvis"** out of the box, or train your own **"Claudia"** wake word (Appendix A in the guide). There's an on-board button as a fallback. The chatbot runtime is the upstream [`PiSugar/whisplay-ai-chatbot`](https://github.com/PiSugar/whisplay-ai-chatbot); this repo doesn't fork it — it's the guide, configs, and Windows-side tooling that turn a pile of parts into a finished device.

---

## What's in here

```
Claudia/
├── Claudia.md              # The build guide (canonical source of truth)
├── Claudia.htm             # Auto-generated self-contained page (inlined CSS+JS+images, light/dark theme)
├── README.md                  # ← you are here
├── Claudia.Console.bat        # Top-level shortcut to scripts/Claudia.Console.bat
├── package.json               # Two deps: marked (markdown) + highlight.js (syntax)
│
├── .claude/
│   ├── settings.json          # Hook: regenerate .htm on every .md edit
│   └── commands/
│       ├── commit.md          # /commit slash command
│       └── do.md              # /do slash command (continue current task)
│
├── config/
│   ├── env.template           # Example .env for the Pi
│   ├── asoundrc.usbmic        # ~/.asoundrc for USB-mic builds
│   ├── parts.json             # Parts catalog (Amazon/official/reputable URLs per part)
│   └── console.json           # Saved Pi host/user (created on first detect)
│
├── index.htm                  # Byte-identical clone of Claudia.htm (so /claudia/ serves it directly — no redirect)
│
└── scripts/
    ├── Claudia.Console.ps1    # Multi-command console (local + remote Pi)
    ├── Claudia.Console.bat    # Launcher
    ├── build-html.js          # Node: markdown -> self-contained .htm with theme toggle
    ├── build-html.ps1 / .bat  # PowerShell wrapper for build-html.js
    ├── bump-version.ps1 / .bat# Stamp Claudia.md with a new date + rebuild .htm
    ├── deploy.ps1 / .bat      # Build + FTP upload to /mindattic.com/claudia/
    ├── deploy.settings.json.template # Copy to deploy.settings.json (gitignored)
    ├── on-md-change.ps1       # Hook handler - auto-rebuild .htm on .md edits
    ├── pull-latest-finisher.ps1 # Detached helper for self-update (locked-file safe)
    ├── healthcheck.sh         # End-to-end smoke test (runs on the Pi)
    └── install-claudia.sh     # Automates Parts 4-9 (runs on the Pi)
```

---

## Getting started (Windows builder side)

You need **Node.js** ([nodejs.org](https://nodejs.org)) and **PowerShell 5+** (ships with Windows).

```powershell
# 1. one-time: install the local deps the HTML build uses
.\scripts\Claudia.Console.bat update

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
    healthcheck    Copy scripts/healthcheck.sh to Claudia and run it.
    set-wakeword   Set the openWakeWord model on the Pi (e.g. hey_jarvis, claudia).
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

### Shopping flow (find-deals → apply-deals)

The Console doubles as a price-comparison assistant for the parts in `config/parts.json`. For every part it opens browser tabs in this order:

1. **Search for** a Google query (broad fallback)
2. **Amazon** (filtered for price-asc)
3. **Official retailer** (raspberrypi.com, pisugar.com, seeedstudio.com, etc.)
4. **Reputable** secondaries (Adafruit, Pi Hut, Sparkfun, Mouser, DigiKey, B&H, Tindie)

You pick the best URL, paste it back into the prompt, and `apply-deals` rewrites the latest `Claudia.md` so each part line becomes a Markdown link to the URL you chose. The hook then auto-regenerates `Claudia.htm`.

```powershell
.\Claudia.Console.bat find-deals               # walk the whole catalog
.\Claudia.Console.bat find-deals smarthome     # just the smart-plug category
.\Claudia.Console.bat apply-deals              # write the chosen URLs into the .md
```

### Self-update (`pull-latest` + `self-update`)

- **`pull-latest`** — `git fetch` then mirror `origin/<branch>` into the working tree. Because Windows keeps the running `Claudia.Console.ps1` open, the command stages the new files into `%TEMP%` and spawns a detached helper (`scripts/pull-latest-finisher.ps1`) that waits for *this* PowerShell to exit before robocopying the temp tree over the repo. Progress goes to `.claude/pull-latest.log`.
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
2. Follow Parts 1–3 to buy parts, assemble, and flash the SD card.
3. SSH in. Then either:
   - **Manual path:** follow Parts 4–9 by hand.
   - **Scripted path:** copy `scripts/install-claudia.sh` to the Pi and run it. It walks the same steps end-to-end and prompts you when it needs a reboot or your API key.
4. Once it's running, plug Claudia onto your LAN and run `Claudia.Console detect` from this machine — every command after that targets it over SSH.

---

## HTML workflow

The `.htm` is **derived**: never hand-edit `Claudia.htm`, always edit the `.md`. The output is one self-contained file — inline CSS, inline JS. No CDN, no `<link>`, no `<script src>`. Styling and the light/dark theme toggle follow [mindattic.com](https://mindattic.com)'s single-file convention.

Two ways the page gets refreshed:

1. **Automatic** — `.claude/settings.json` registers a `PostToolUse` hook that fires `scripts/on-md-change.ps1` whenever Claude Code edits `Claudia.md`. The hook re-renders `Claudia.htm`, mirrors it to `index.htm`, and logs to `.claude/html-rebuild.log`. No-op for any other file edit.

2. **Manual** —
   ```powershell
   .\scripts\build-html.bat              # latest version
   .\scripts\build-html.bat -Source .\Claudia.md
   ```

### Theming

The page ships with both palettes and **defaults to dark**. The toggle button (top-right corner) flips `data-theme` on `<html>`; CSS custom properties drive every color so the rest of the cascade follows. The choice is persisted to `localStorage` under the key `claudia-theme` — including on first visit, so the dark default is locked in until the user explicitly flips it.

### Parts gallery

`build-html.js` builds a text-only "Parts gallery" section from `config/parts.json`. Each card links to the buy URL chosen by `find-deals` (or the Amazon-tier URL as a fallback). No images are fetched or embedded — vendor CDNs rot too fast for that to be worth the maintenance.

### Bumping the version

The file path is **stable** — `Claudia.md` and `Claudia.htm` never get renamed, so external links to them never rot. The revision date lives *inside* the file (in the H1, the "What's new in <date>" heading, and the footer). Bumping means rewriting those dates in place; historical revisions are recoverable from git history.

```powershell
.\scripts\bump-version.bat                    # stamp today's date (YYYY.MM.DD)
.\scripts\bump-version.bat -To 2026.06.01     # forward-date explicitly
```

The bumper finds the current date from the H1, replaces it everywhere it appears in the file, then regenerates `Claudia.htm`.

### Deploying to mindattic.com/claudia/

The repo includes an FTP deploy that mirrors mindattic.com's pattern.

```powershell
# one-time setup
copy scripts\deploy.settings.json.template scripts\deploy.settings.json
# edit deploy.settings.json with real FTP creds (it's gitignored)

# every release
.\scripts\deploy.bat
# or, from the Console:
.\Claudia.Console.bat deploy
```

What `deploy.ps1` does, in order:

1. **Builds** — runs `build-html.js` so `Claudia.htm` reflects the current `.md`. Skip with `-NoBuild` if you just ran it.
2. **Stamps + clones** — inserts/replaces a `<!-- Last Updated: ISO8601 -->` comment at the top of `Claudia.htm`, then writes that same byte stream out to `index.htm`. Both files are identical post-deploy, so `mindattic.com/claudia/` serves the full page directly with no redirect hop.
3. **Uploads** — `curl.exe --ssl-reqd --ftp-pasv` pushes `Claudia.md`, `Claudia.htm`, and `index.htm` to `FtpRemotePath` (defaults to `/mindattic.com/claudia`).

Credentials never leave your machine: `scripts/deploy.settings.json` is in `.gitignore`. Only the placeholder template gets committed.

---

## Slash commands (`/commit`, `/do`, `/deploy`)

Three project-scoped commands live under `.claude/commands/`:

- **`/commit`** — stages and commits the current working tree with a concise, log-style-matching message. Never `git add -A`, never `--amend`, never `--no-verify`.
- **`/do`** — explicit version of the "bare `do` means continue" rule. Resumes whatever Claude was in the middle of when you stepped away.
- **`/deploy`** — rebuilds `Claudia.htm`, stamps `index.htm`, and FTP-uploads `Claudia.md` / `Claudia.htm` / `index.htm` to `mindattic.com/claudia/`. Mirrors the `/deploy` command in the [mindattic.com](https://mindattic.com) repo.

Any of these can be hoisted to your global `~/.claude/commands/` later if you want them everywhere.

---

## Cost / time / parts

The full breakdown lives in `Claudia.md` (Part 1). At a glance:

| Build | What you get | Total |
|-------|--------------|-------|
| Desktop          | Core + Whisplay's mics + wall power      | ~$77  |
| Desktop + budget mic | + SunFounder USB mic + OTG           | ~$97  |
| Desktop + premium mic | + reSpeaker XVF3800 + OTG           | ~$144 |
| Portable + premium mic | All of the above + PiSugar 3 battery | ~$184 |

Assembly is ~5 minutes (no soldering); first-boot software install is ~30–60 minutes wall-clock (most of it `apt` and `npm` chugging on a 512 MB Pi).

---

## Upstream references

- Build guide: **`Claudia.md`** in this repo
- Chatbot runtime: <https://github.com/PiSugar/whisplay-ai-chatbot>
- Whisplay driver: <https://github.com/PiSugar/Whisplay>
- Wake-word wiki: <https://github.com/PiSugar/whisplay-ai-chatbot/wiki/Wakeword>
- Claude API docs: <https://docs.claude.com>
- Claude pricing: <https://anthropic.com/pricing>

---

*Built by MindAttic LLC. The guide carries the canonical version; this README just points at it.*
