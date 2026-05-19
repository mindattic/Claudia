# Claudia — Build Guide (2026.05.18)

A single-path, checkpoint-driven build guide for a Raspberry Pi Zero 2 W + PiSugar Whisplay HAT voice assistant powered by the Claude API. Press the on-board button, speak, and Claude talks back.

**Last Verified:** May 2026
**Build Cost:** ~$77 base · ~$117 with battery · ~$184 fully loaded

---

## What's new in 2026.05.18 (vs. previous)

- **One path, not two.** v2 offered a parallel "wake word via gpt-home" path. It's dropped. The PiSugar `whisplay-ai-chatbot` repo is purpose-built for this exact hardware and is the right choice for a Pi Zero 2 W. Wake word is supported through the official wiki (see Part 9) if you want hands-free later.
- **Verified install commands against the live upstream repos.** Several v2 commands were wrong — corrected here.
- **Checkpoint tests at the end of each Part.** If something breaks, you'll know exactly where.
- **First-run `healthcheck.sh` script** (Part 8) — tests speaker, mic, network, and Claude API in one shot.
- **systemd unit dropped.** v2 hand-rolled one and didn't load `.env` correctly. The repo provides `startup.sh` which sets up `chatbot.service` properly — just use it.
- **Mic decision moved to the front** as a 3-question flowchart, not buried in a table.
- **Cost tiers cut from 4 to 2.** Desktop or portable. Done.

---

## Pick your build before you buy

Two questions decide everything.

**Q1 — Where will this device sit?**

- *On my desk, within arm's reach* → desktop build (cheaper, simpler)
- *Roaming around the house / outside / unplugged* → portable build (add the PiSugar 3 battery)

**Q2 — How far away will you be when you talk to it?**

- *Within 3 feet, quiet room* → use the Whisplay's on-board mics (no extra purchase)
- *4–10 feet, normal room* → add the SunFounder USB mini mic (~$13) + an OTG adapter
- *Across the room, possibly noisy, "Alexa-class" pickup* → add the reSpeaker XVF3800 mic array (~$60) + an OTG adapter

That's it. Now build the cart.

---

## Part 1: Shopping list

### Core build (required)

| Item | Why | ~Price | Notes |
|------|-----|--------|-------|
| **Raspberry Pi Zero 2 WH** | The brain. The **"H"** matters — it has the GPIO header pre-soldered, which the Whisplay HAT needs. Don't buy the bare "Pi Zero 2 W" or you'll need to solder 40 pins yourself. | ~$22 | Search Amazon or Adafruit for "Raspberry Pi Zero 2 WH" |
| **PiSugar Whisplay HAT** | LCD, speaker, dual mic, RGB LED, buttons — everything except the CPU. | ~$36 | Direct from PiSugar's site or Amazon |
| **microSD card, 32 GB Class 10** (SanDisk Ultra or equivalent) | The "hard drive." 16 GB works but 32 GB gives you headroom. | ~$9 | Any reputable brand |
| **Official Raspberry Pi 12.5W micro-USB power supply (5V/2.5A)** | The Pi Zero 2 W is rated for 5V/2.5A. Phone chargers will *seem* to work and then cause random crashes. Buy the official one or a known-good 2.5A+ supply. | ~$10 | Pi Hut, Adafruit, official resellers |

### Pick-your-mic (optional)

| Item | When to buy | ~Price |
|------|-------------|--------|
| **SunFounder USB Mini Mic** | If you need 4–10 ft pickup. | ~$13 |
| **Seeed reSpeaker XVF3800 USB Mic Array** | If you want across-the-room pickup with built-in echo cancellation, beamforming, and noise suppression. | ~$60 |
| **micro-USB OTG adapter** | **Required** if you bought either USB mic above — the Pi Zero only has a micro-USB data port. | ~$7 |

### Portable (optional)

| Item | When to buy | ~Price |
|------|-------------|--------|
| **PiSugar 3 1200 mAh battery** | If you want to unplug and carry it around. Snaps onto the Pi via magnetic pogo pins — no soldering. | ~$40 |

### Totals

| Build | What you get | Total |
|-------|--------------|-------|
| **Desktop** | Core + Whisplay's mics + wall power | ~$77 |
| **Desktop + better mic (budget)** | + SunFounder + OTG | ~$97 |
| **Desktop + better mic (premium)** | + reSpeaker XVF3800 + OTG | ~$144 |
| **Portable + premium mic** | All of the above + PiSugar 3 battery | ~$184 |

> Prices fluctuate. Verify before checkout. Where I've named vendors, search by product name rather than trusting a link.

### What you do **not** need

- A separate speaker (the Whisplay has one)
- A monitor or keyboard (we do the whole setup over SSH from your PC)
- A USB hub (one USB mic on the OTG port is fine)

---

## Part 2: Assemble the hardware

**Total time:** ~5 minutes. No soldering.

1. **Do not insert the microSD yet.** Flash it first in Part 3.
2. Align the Whisplay HAT's 40-pin socket with the Pi Zero 2 WH's GPIO header pins. The Whisplay's buttons should be on the same side as the Pi's USB ports.
3. Press the HAT down firmly and evenly until fully seated. **Hold the PCB edges; do not press on the glass LCD.** Press the LCD and it cracks.
4. Peel off the LCD protective film.
5. *(Optional, portable build)* Snap the PiSugar 3 battery onto the underside of the Pi using its magnetic pogo pins.

**Final stack (top → bottom):** Whisplay HAT → Pi Zero 2 WH → *PiSugar 3 (optional)*

✅ **Checkpoint:** The stack feels solid, the LCD is exposed and undamaged, nothing wobbles.

---

## Part 3: Flash the microSD card

### 3.1 Install Raspberry Pi Imager

Download from **raspberrypi.com/software** (Windows, macOS, Linux).

### 3.2 Flash

1. Open Raspberry Pi Imager.
2. **Choose Device** → `Raspberry Pi Zero 2 W`.
3. **Choose OS** → `Raspberry Pi OS (other)` → **Raspberry Pi OS (64-bit)** (the full version, *not* Lite).
   - The chatbot repo's install script expects packages from the full image. Lite will work but you'll need extra apt installs and may hit surprises.
4. **Choose Storage** → your microSD card.
5. Click the gear icon (⚙) for **Edit Settings** and configure:
   - **Hostname:** `claudia`
   - **Username:** `pi`
   - **Password:** *something secure*
   - **Enable SSH:** ✅ password auth
   - **Wireless LAN:** SSID + password for your home Wi-Fi
   - **Locale:** `America/Chicago`, keyboard `us`
6. **Save**, then **Write**. Takes 2–5 minutes.

### 3.3 First boot

1. Insert the microSD into the Pi.
2. Plug the official power supply into the **`PWR IN`** micro-USB port (the one nearest the corner, labeled `PWR IN` on the silkscreen). **Not** the middle port labeled `USB`.
3. Wait 60–90 seconds.
4. From your PC:

   ```bash
   ssh pi@claudia.local
   ```

   If `claudia.local` doesn't resolve, find the Pi's IP in your router's admin page and use `ssh pi@192.168.x.x`.

✅ **Checkpoint:** You see the `pi@claudia:~ $` prompt. Run `cat /etc/os-release` and confirm it says Debian/Raspberry Pi OS. Run `free -h` — you should see ~430 MB of `Mem:` (the Pi Zero 2 W has 512 MB total).

---

## Part 4: System setup

Run these from the SSH session. One at a time. Wait for each to finish.

### 4.1 Update

```bash
sudo apt update && sudo apt full-upgrade -y
```

This takes 5–15 minutes on a Pi Zero. Be patient.

### 4.2 Free up RAM (Pi Zero only has 512 MB)

The Pi Zero 2 W is RAM-constrained. Disable services you don't need:

```bash
# Disable Bluetooth (not used by this build)
sudo systemctl disable hciuart bluetooth

# Disable triggerhappy (gamepad daemon, not needed)
sudo systemctl disable triggerhappy
```

### 4.3 Install build dependencies

```bash
sudo apt install -y git curl build-essential python3-pip python3-venv \
  portaudio19-dev libsndfile1 ffmpeg alsa-utils libatlas-base-dev
```

### 4.4 Install the Whisplay HAT driver (LCD + audio + buttons + LEDs)

This is the official PiSugar driver. The install script also enables the I2C, SPI, and I2S buses automatically.

```bash
cd ~
git clone https://github.com/PiSugar/Whisplay.git --depth 1
cd Whisplay/Driver
sudo bash install_wm8960_drive.sh
sudo reboot
```

Wait ~60 seconds, then SSH back in:

```bash
ssh pi@claudia.local
```

✅ **Checkpoint 1 — driver loaded:**

```bash
aplay -l
```

You should see a card whose name contains `wm8960`. If not, the driver didn't load — re-run the install script and re-check.

✅ **Checkpoint 2 — speaker works:**

```bash
speaker-test -t sine -f 440 -l 1 -D plughw:CARD=wm8960soundcard
```

You should hear a one-second 440 Hz beep from the Whisplay's speaker. If you hear nothing, run `alsamixer`, press F6, pick the wm8960 card, and turn up the playback levels.

✅ **Checkpoint 3 — on-board mic works:**

```bash
arecord -d 5 -f cd /tmp/mic_test.wav && aplay /tmp/mic_test.wav
```

Record 5 seconds, then play it back. You should hear your voice. If it's silent or garbled, raise the "Capture" levels in `alsamixer` (F4 toggles between Playback and Capture).

If all three checkpoints pass and you're using the on-board mic, skip to Part 5. Otherwise, do Part 4.5 first.

---

## Part 4.5: Configure a USB microphone *(skip if using on-board mics)*

### Plug it in

1. Power down: `sudo shutdown -h now` and unplug power.
2. Connect the OTG adapter to the Pi's **data** micro-USB port — that's the **middle** one labeled `USB`, not `PWR IN`.
3. Plug the USB mic into the OTG adapter.
4. Power back on, SSH in.

### Verify it's detected

```bash
arecord -l
```

You should now see two capture cards:

```
card 0: wm8960soundcard ...
card 1: ArrayUAC10 / Mini Mic ...  (your USB mic — name varies)
```

If `card 1` is missing: try a different OTG cable (some are charge-only), or make sure you're in the data port not the power one. Run `lsusb` and confirm the device shows up.

### Test recording from the USB mic

```bash
arecord -D plughw:1,0 -d 5 -f cd /tmp/usb_test.wav
aplay /tmp/usb_test.wav
```

If it's quiet, run `alsamixer`, press F6 to switch to the USB card, F4 for Capture controls, and raise it to ~80%.

### Make the USB mic the system default capture device

This way the chatbot picks it up automatically — speaker stays on the Whisplay.

```bash
nano ~/.asoundrc
```

Paste:

```conf
# Playback on Whisplay speaker (card 0), capture on USB mic (card 1)
pcm.!default {
    type asym
    playback.pcm {
        type plug
        slave.pcm "hw:0,0"
    }
    capture.pcm {
        type plug
        slave.pcm "hw:1,0"
    }
}

ctl.!default {
    type hw
    card 1
}
```

Save with `Ctrl+X`, `Y`, `Enter`.

### Pin the card numbering across reboots

Linux's USB card numbers can swap on reboot. Lock the USB mic to card 1:

```bash
echo "options snd_usb_audio index=1" | sudo tee /etc/modprobe.d/alsa-base.conf
```

Reboot:

```bash
sudo reboot
```

### Verify the default config works end-to-end

```bash
ssh pi@claudia.local
arecord -d 5 -f cd /tmp/default_test.wav && aplay /tmp/default_test.wav
```

This should record from the USB mic and play through the Whisplay speaker — without specifying any device flags.

✅ **Checkpoint:** Recording and playback both use the right devices via the system default.

> **reSpeaker XVF3800 note:** The on-board AEC, beamforming, and noise suppression run automatically. No extra software needed. For raw multi-channel access or firmware tweaks, see the [Seeed reSpeaker XVF3800 wiki](https://wiki.seeedstudio.com/respeaker_xvf3800_introduction/).

---

## Part 5: Install the chatbot software

This is the PiSugar `whisplay-ai-chatbot` repo. It's purpose-built for the Pi Zero 2 W + Whisplay combo. Press button → speak → release → Claude answers.

```bash
cd ~
git clone https://github.com/PiSugar/whisplay-ai-chatbot.git
cd whisplay-ai-chatbot
bash install_dependencies.sh
source ~/.bashrc
```

The dependency install pulls Node.js, Python packages, and audio libraries. This takes **15–25 minutes** on a Pi Zero 2 W. Let it finish.

> The `source ~/.bashrc` line is important — the installer sets PATH entries you need in your current shell session.

✅ **Checkpoint:** `install_dependencies.sh` finishes without errors. Test that Node is on PATH:

```bash
node --version
```

You should see `v20.x` or similar.

---

## Part 6: Get a Claude API key

1. Go to **console.anthropic.com** and sign in (or create an account).
2. Add a payment method and put a small amount of credit on the account (e.g., $5 — that lasts a long time on Haiku).
3. Navigate to **API Keys** → **Create Key**.
4. Name it `claudia`. **Copy the key now** — you can't see it again later.
5. Treat the key like a password.

**Approximate cost:** Casual personal use on `claude-haiku-4-5-20251001` typically runs a few dollars per month at most. Check current pricing at anthropic.com/pricing.

### Which model to pick

| Model ID | Speed | Quality | When to use |
|----------|-------|---------|-------------|
| `claude-haiku-4-5-20251001` | Fastest | Good | **Default for this device.** Latency matters more than essay-grade prose for a voice assistant. |
| `claude-sonnet-4-6` | Medium | Excellent | If you want richer answers and don't mind a slightly slower response. |
| `claude-opus-4-7` | Slowest | Best | Overkill for spoken Q&A. Use for hard reasoning tasks only. |

Model IDs change over time. The current list lives at [docs.claude.com](https://docs.claude.com/en/docs/about-claude/models/overview).

---

## Part 7: Configure the chatbot

### 7.1 Create your `.env`

```bash
cd ~/whisplay-ai-chatbot
cp .env.template .env
nano .env
```

The template ships with many fields for different ASR/LLM/TTS providers. For a Claude-based build, you need the LLM section set to Anthropic. Find and set:

```env
# === LLM (the AI brain) ===
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# === System prompt — shapes the assistant's voice ===
SYSTEM_PROMPT=You are a concise, friendly voice assistant. Answer in plain spoken English — no markdown, no bullet lists, no headings. Keep responses to 1–3 sentences unless the user explicitly asks for more.
```

For speech-to-text (ASR) and text-to-speech (TTS), the template defaults usually work. If you want fully local (no extra API keys), pick `whisper` for ASR and `piper` for TTS. If you want higher-quality cloud STT/TTS, see the wiki for OpenAI / Google / Volcengine options — each needs its own API key.

> The `.env.template` evolves. If your file looks different from this guide, the live template at [github.com/PiSugar/whisplay-ai-chatbot/blob/master/.env.template](https://github.com/PiSugar/whisplay-ai-chatbot/blob/master/.env.template) is the source of truth.

Save: `Ctrl+X`, `Y`, `Enter`.

### 7.2 Build the project

```bash
bash build.sh
```

This compiles the TypeScript and prepares assets. ~5–10 minutes on a Pi Zero 2 W.

✅ **Checkpoint:** `build.sh` exits cleanly with no errors.

---

## Part 8: First-run sanity check

Before launching the full chatbot, run a 90-second healthcheck that verifies every layer end-to-end: speaker, mic, network, Claude API.

Create the script:

```bash
nano ~/healthcheck.sh
```

Paste:

```bash
#!/bin/bash
# claudia healthcheck — quick end-to-end smoke test
# Usage: bash ~/healthcheck.sh

set -u
ENV_FILE="$HOME/whisplay-ai-chatbot/.env"
PASS="\033[0;32m✓\033[0m"
FAIL="\033[0;31m✗\033[0m"
exit_code=0

step() { printf "\n%s\n" "── $1 ──"; }
ok()   { printf "  $PASS %s\n" "$1"; }
bad()  { printf "  $FAIL %s\n" "$1"; exit_code=1; }

step "1. Audio devices"
aplay -l | grep -q wm8960 && ok "wm8960 playback card detected" || bad "wm8960 NOT detected (driver issue?)"
arecord -l | grep -q card && ok "at least one capture card detected" || bad "no capture card detected"

step "2. Speaker test (1s beep)"
speaker-test -t sine -f 440 -l 1 -s 1 >/dev/null 2>&1 \
  && ok "speaker-test completed (did you hear a beep?)" \
  || bad "speaker-test failed"

step "3. Mic test (3s record-and-replay)"
echo "  (speak for 3 seconds now…)"
arecord -d 3 -f cd /tmp/hc_mic.wav >/dev/null 2>&1
[ -s /tmp/hc_mic.wav ] && ok "captured audio file written" || bad "no audio captured"
aplay /tmp/hc_mic.wav >/dev/null 2>&1 && ok "playback OK (did you hear yourself?)" || bad "playback failed"

step "4. Network reachability"
ping -c 1 -W 3 api.anthropic.com >/dev/null 2>&1 \
  && ok "api.anthropic.com is reachable" \
  || bad "cannot reach api.anthropic.com (Wi-Fi or DNS issue)"

step "5. Claude API call"
if [ ! -f "$ENV_FILE" ]; then
  bad "$ENV_FILE not found — finish Part 7 first"
else
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    bad "ANTHROPIC_API_KEY is empty in .env"
  else
    response=$(curl -s -w "\n%{http_code}" https://api.anthropic.com/v1/messages \
      -H "x-api-key: $ANTHROPIC_API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d "{\"model\":\"${ANTHROPIC_MODEL:-claude-haiku-4-5-20251001}\",\"max_tokens\":50,\"messages\":[{\"role\":\"user\",\"content\":\"Say hello in exactly 5 words.\"}]}")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    if [ "$http_code" = "200" ]; then
      ok "Claude API responded HTTP 200"
      echo "  Reply: $(echo "$body" | grep -o '"text":"[^"]*"' | head -1 | sed 's/"text":"//;s/"$//')"
    else
      bad "Claude API returned HTTP $http_code"
      echo "  $body" | head -3
    fi
  fi
fi

echo
if [ $exit_code -eq 0 ]; then
  printf "$PASS All checks passed. You're ready for Part 9.\n"
else
  printf "$FAIL One or more checks failed. Fix above before running the chatbot.\n"
fi
exit $exit_code
```

Run it:

```bash
chmod +x ~/healthcheck.sh
bash ~/healthcheck.sh
```

✅ **Checkpoint:** All five sections print green check marks. If anything fails, fix that piece before moving on — running the full chatbot before this passes just makes debugging harder.

---

## Part 9: Run the chatbot

### Manual launch (foreground, for testing)

```bash
cd ~/whisplay-ai-chatbot
bash run_chatbot.sh
```

The LCD lights up with status. Press the on-board button on the Whisplay, speak your question, release. Claude responds out loud.

Stop with `Ctrl+C`.

### Set it to start on boot

The repo provides an opinionated startup installer that registers a `chatbot.service` systemd unit and sets the system to multi-user (headless) mode. Use it:

```bash
cd ~/whisplay-ai-chatbot
bash startup.sh
```

After this, the chatbot starts automatically on every boot. Verify:

```bash
sudo systemctl status chatbot.service
```

You should see `Active: active (running)`.

### Live logs

```bash
tail -f ~/whisplay-ai-chatbot/chatbot.log
# or
journalctl -u chatbot.service -f
```

### Wake word *(optional, hands-free)*

If you want "Hey Claude" instead of pressing a button, the PiSugar wiki has the integration guide:

- [Wake Word wiki page](https://github.com/PiSugar/whisplay-ai-chatbot/wiki/Wakeword)

It uses a separate wake-word engine and adds modest CPU load. Worth doing once everything else is working — not before.

---

## Part 10: Optional case (3D-printed)

PiSugar publishes free STL files for case shells:

- [pi02 Whisplay chatbot case (resin/SLA)](https://github.com/PiSugar/suit-cases/tree/main/pisugar3-whisplay-chatbot)
- [pi02 Whisplay chatbot case (FDM)](https://github.com/PiSugar/suit-cases/tree/main/pisugar3-whisplay-chatbot-fdm)

No printer? Upload the STL to a print service like JLC3DP or Craftcloud — a few dollars shipped.

---

## Part 11: Troubleshooting

### Nothing plays through the speaker
- `aplay -l` should list `wm8960`. If not, re-run the driver install in Part 4.4.
- Run `alsamixer` → F6 → wm8960 card → confirm `Speaker` is unmuted (no `MM` label) and above 0%.

### Mic captures silence or garbage
- Run `arecord -l`, confirm the card you expect is listed.
- Run `alsamixer` → F6 → mic card → F4 (Capture) → raise to ~80%.
- For a USB mic: re-check Part 4.5; the OTG cable being charge-only is a common gotcha.

### USB mic disappears after reboot
- Linux can renumber cards. The `/etc/modprobe.d/alsa-base.conf` line in Part 4.5 pins it. If you skipped that, do it now.

### Build fails out of memory
- The Pi Zero 2 W only has 512 MB. Add swap if `build.sh` gets OOM-killed:
  ```bash
  sudo dphys-swapfile swapoff
  sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
  sudo dphys-swapfile setup
  sudo dphys-swapfile swapon
  ```

### Service won't start
```bash
sudo systemctl status chatbot.service --no-pager
journalctl -u chatbot.service -n 60 --no-pager
```
Look for the first ERROR line — usually a missing `.env` key or a wrong path.

### Claude API returns 401
- API key is invalid or expired. Re-copy from console.anthropic.com → API Keys.

### Claude API returns 429
- You're rate-limited. Add credit at console.anthropic.com → Billing.

### Responses feel slow
- Use `claude-haiku-4-5-20251001` (Part 6 — it's the recommended default for this reason).
- The Pi Zero 2 W's Wi-Fi antenna is weak. Move it closer to the router.
- Local Whisper STT is the slowest step on a Pi Zero. If you have a cloud STT key (OpenAI, Google), switching to one of those in `.env` cuts perceived latency dramatically.

### Need to re-run the healthcheck
```bash
bash ~/healthcheck.sh
```

### SD card filling up
```bash
df -h
sudo apt clean
# clear chatbot recordings:
rm -f ~/whisplay-ai-chatbot/data/recordings/*.wav 2>/dev/null
```

---

## Reference

- **Whisplay HAT driver:** https://github.com/PiSugar/Whisplay
- **Chatbot repo:** https://github.com/PiSugar/whisplay-ai-chatbot
- **Chatbot wiki (wake word, image gen, battery display):** https://github.com/PiSugar/whisplay-ai-chatbot/wiki
- **Pre-built SD card images:** https://github.com/PiSugar/whisplay-ai-chatbot/wiki (skips most of Parts 4–7)
- **Claude API docs:** https://docs.claude.com
- **Claude model catalog:** https://docs.claude.com/en/docs/about-claude/models/overview
- **Pricing:** https://anthropic.com/pricing

---

## Summary stack

| Layer | What it is |
|-------|-----------|
| Hardware | Pi Zero 2 WH + PiSugar Whisplay HAT (+ optional PiSugar 3 battery, USB mic) |
| OS | Raspberry Pi OS 64-bit |
| Audio driver | WM8960 (Whisplay) |
| Activation | On-board button (default) or wake word (optional) |
| Speech → text | Local Whisper, or cloud STT if configured |
| LLM | Claude API (Anthropic) |
| Text → speech | Piper (local) or cloud TTS if configured |
| Service manager | systemd (`chatbot.service`, set up by `startup.sh`) |

Only Claude runs in the cloud. Everything else can run on-device if you want it to.

---

*Built for MindAttic LLC — 2026.05.18*
