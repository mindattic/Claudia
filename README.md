# Claudia

> **Claudia** is a palm-sized voice assistant box you build yourself: Raspberry Pi Zero 2 W + PiSugar Whisplay HAT, powered by the Claude API. Press the button, ask anything, Claude talks back.

This repo is the **builder kit** — the build guide, the configuration files that go on the device, and a Windows-side console for flashing/updating/configuring it once it's on your LAN.

The actual chatbot runtime is the upstream [`PiSugar/whisplay-ai-chatbot`](https://github.com/PiSugar/whisplay-ai-chatbot); this repo doesn't fork it.

---

## What's in here

```
Claudia/
├── Claudia_2026.05.18.md              # The build guide (canonical source of truth)
├── Claudia_2026.05.18.htm             # Auto-generated self-contained page (inlined CSS+JS+images, light/dark theme)
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
│   ├── console.json           # Saved Pi host/user (created on first detect)
│   ├── images/                # OPTIONAL local overrides for gallery photos (<part-id>.<ext>)
│   └── images-cache/          # Downloaded part photos (git-ignored)
│
└── scripts/
    ├── Claudia.Console.ps1    # Multi-command console (local + remote Pi)
    ├── Claudia.Console.bat    # Launcher
    ├── build-html.js          # Node: markdown -> self-contained .htm with theme toggle
    ├── build-html.ps1 / .bat  # PowerShell wrapper for build-html.js
    ├── bump-version.ps1 / .bat# Copy to next version + rebuild .htm
    ├── on-md-change.ps1       # Hook handler - auto-rebuild .htm on .md edits
    ├── pull-latest-finisher.ps1 # Detached helper for self-update (locked-file safe)
    ├── healthcheck.sh         # End-to-end smoke test (runs on the Pi)
    └── install-claudia.sh     # Automates Parts 4-9 (runs on the Pi)
```

---

## Getting started (Windows builder side)

You need **Node.js** ([nodejs.org](https://nodejs.org)) and **PowerShell 5+** (ships with Windows).

```powershell
# 1. one-time: install the local deps the PDF pipeline uses
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
    set-wakeword   Set WAKE_WORD on the Pi.
    set-model      Set ANTHROPIC_MODEL on the Pi.
    set-prompt     Set SYSTEM_PROMPT on the Pi.
    set-apikey     Set ANTHROPIC_API_KEY on the Pi.
    show-config    Print the remote .env (api key masked).
    update         Install/refresh local Node deps.
    build-html     Render the latest Claudia_<date>.md to a self-contained .htm.
    fetch-images   Force-refresh every part image from its remote URL.
    bump           Copy latest Claudia_<date>.md to today's date and rebuild the .htm.
    list-parts     List parts catalog + which have a chosen URL.
    find-deals     Open Amazon/official/reputable tabs per part; save your picks.
    apply-deals    Stamp chosen URLs into the latest Claudia_<date>.md.
    pull-latest    git fetch + overlay latest source (handles locked .ps1 files).
    self-update    Refresh node_modules + open "newer version?" searches per part.
```

### Shopping flow (find-deals → apply-deals)

The Console doubles as a price-comparison assistant for the parts in `config/parts.json`. For every part it opens browser tabs in this order:

1. **Search for** a Google query (broad fallback)
2. **Amazon** (filtered for price-asc)
3. **Official retailer** (raspberrypi.com, pisugar.com, seeedstudio.com, etc.)
4. **Reputable** secondaries (Adafruit, Pi Hut, Sparkfun, Mouser, DigiKey, B&H, Tindie)

You pick the best URL, paste it back into the prompt, and `apply-deals` rewrites the latest `Claudia_<date>.md` so each part line becomes a Markdown link to the URL you chose. The hook then auto-regenerates the PDF.

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

1. Open **`Claudia_2026.05.18.md`** (or the PDF if you'd rather read it printed).
2. Follow Parts 1–3 to buy parts, assemble, and flash the SD card.
3. SSH in. Then either:
   - **Manual path:** follow Parts 4–9 by hand.
   - **Scripted path:** copy `scripts/install-claudia.sh` to the Pi and run it. It walks the same steps end-to-end and prompts you when it needs a reboot or your API key.
4. Once it's running, plug Claudia onto your LAN and run `Claudia.Console detect` from this machine — every command after that targets it over SSH.

---

## HTML workflow

The `.htm` is **derived**: never hand-edit `Claudia_2026.05.18.htm`, always edit the `.md`. The output is one self-contained file — inline CSS, inline JS, inline (base64) part photos. No CDN, no `<link>`, no `<script src>`. Styling and the light/dark theme toggle follow [mindattic.com](https://mindattic.com)'s single-file convention.

Two ways the page gets refreshed:

1. **Automatic** — `.claude/settings.json` registers a `PostToolUse` hook that fires `scripts/on-md-change.ps1` whenever Claude Code edits a `Claudia_<date>.md`. The hook re-renders the matching `.htm` and logs to `.claude/html-rebuild.log`. No-op for any other file edit.

2. **Manual** —
   ```powershell
   .\scripts\build-html.bat              # latest version
   .\scripts\build-html.bat -Source .\Claudia_2026.05.18.md
   ```

### Theming

The page ships with both palettes. The toggle button (top-right corner) flips `data-theme` on `<html>`; CSS custom properties drive every color so the rest of the cascade follows. The choice persists via `localStorage` under the key `claudia-theme`. First-time visitors get the palette implied by `prefers-color-scheme`.

### Part images (base64-embedded)

`build-html.js` builds a "Parts gallery" section. For every entry in `config/parts.json` it tries to:

1. Use a local override at `config/images/<part-id>.<ext>` if present (always wins).
2. Otherwise look up the part in the script's URL map, download once, and cache to `config/images-cache/` (git-ignored).
3. Fall back to a generated SVG placeholder with the part name baked in.

Either way, the result is base64-encoded into a `.part-card[data-pid="<id>"] .part-image { background-image: url(data:...) }` rule and inlined in the page CSS — so once you open the `.htm`, no further network requests fire.

Tune which images get embedded:

```powershell
.\Claudia.Console.bat fetch-images        # force-refresh every URL
node scripts/build-html.js --no-images    # skip embedding entirely (placeholders only)
```

### Bumping the version

When the guide changes substantively, bump to a new dated revision rather than overwriting the existing one:

```powershell
.\scripts\bump-version.bat                    # today's date (YYYY.MM.DD)
.\scripts\bump-version.bat -To 2026.06.01     # forward-date explicitly
.\scripts\bump-version.bat -Force             # overwrite an existing same-day file
```

The bumper copies the latest `Claudia_<date>.md` to a new file stamped with today's date, rewrites the in-file `Build Guide (<date>)` / `What's new in <date>` / footer tags, and regenerates the matching `.htm`. Earlier dated files are left in place so you have permanent diff targets.

---

## Slash commands (`/commit`, `/do`)

Two project-scoped commands live under `.claude/commands/`:

- **`/commit`** — stages and commits the current working tree with a concise, log-style-matching message. Never `git add -A`, never `--amend`, never `--no-verify`.
- **`/do`** — explicit version of the "bare `do` means continue" rule. Resumes whatever Claude was in the middle of when you stepped away.

Either of these can be hoisted to your global `~/.claude/commands/` later if you want them everywhere.

---

## Cost / time / parts

The full breakdown lives in `Claudia_2026.05.18.md` (Part 1). At a glance:

| Build | What you get | Total |
|-------|--------------|-------|
| Desktop          | Core + Whisplay's mics + wall power      | ~$77  |
| Desktop + budget mic | + SunFounder USB mic + OTG           | ~$97  |
| Desktop + premium mic | + reSpeaker XVF3800 + OTG           | ~$144 |
| Portable + premium mic | All of the above + PiSugar 3 battery | ~$184 |

Assembly is ~5 minutes (no soldering); first-boot software install is ~30–60 minutes wall-clock (most of it `apt` and `npm` chugging on a 512 MB Pi).

---

## Upstream references

- Build guide: **`Claudia_2026.05.18.md`** in this repo
- Chatbot runtime: <https://github.com/PiSugar/whisplay-ai-chatbot>
- Whisplay driver: <https://github.com/PiSugar/Whisplay>
- Wake-word wiki: <https://github.com/PiSugar/whisplay-ai-chatbot/wiki/Wakeword>
- Claude API docs: <https://docs.claude.com>
- Claude pricing: <https://anthropic.com/pricing>

---

*Built by MindAttic LLC. The guide carries the canonical version; this README just points at it.*
