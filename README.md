# Claudia

Build your own always-on voice assistant in an afternoon — a Raspberry Pi Zero 2 WH with a USB microphone for conversation audio and the Hiwonder WonderEcho module as a hardware wake-word trigger, wired straight to the Claude API. Sits on your shelf, listens for **"Claudia"**, and Claude answers out loud in seconds. No Alexa account, no surveillance, no subscription — just a Claude API key and hardware you own.

> **Why two audio devices?** The WonderEcho is a *command-word recognizer*, not a microphone: its CI1302 chip recognizes the wake word on-device and reports a short event ID over I²C. It never streams raw audio, so Whisper can't transcribe through it. The WonderEcho handles the always-listening wake word; the USB mic (a standard ALSA device) records what you actually say.

> **WH, not W.** The WonderEcho connects to four GPIO pins (SDA / SCL / 5V / GND), so the build needs the **WH** variant with pre-soldered headers. Buying the plain "W" means soldering 40 pins yourself before anything works.

> **Before you start, gather:** a Windows / macOS / Linux computer to flash the microSD and SSH in, a way to plug a microSD into it (the SanDisk Ultra ships with a full-size SD adapter but no USB reader — most modern ultrabooks and MacBooks need a USB microSD reader, ~$8), and a **2.4 GHz** Wi-Fi network (the Pi Zero 2 WH has no 5 GHz radio). The smart-plug options below ship with US plugs; each vendor (Kasa, Shelly, Sonoff) also sells EU/UK/AU variants that speak the same local API — pick your region at checkout. **No soldering iron needed**, but you'll need **4 female-to-female jumper wires** to link the WonderEcho to the Pi — the WonderEcho does not include any cable, so the shopping list below adds a cheap Dupont wire kit. The USB microphone plugs into the Pi's data port through a **micro-USB OTG adapter** (also in the shopping list — the Pi Zero has no full-size USB-A port).

> **Stock check.** The Pi Zero 2 WH is supply-constrained; if all the US retailers on the cards below show out-of-stock, [rpilocator.com](https://rpilocator.com) tracks live availability across the official reseller network.

---

## 01. Configure

<!-- CONFIG-WIDGET -->

---

## 02. Shopping list

<!-- PARTS-GALLERY -->

---

## 03. Assemble

**Total time:** ~3 minutes. No soldering.

1. **Do not insert the microSD yet.** Flash it first in section 04.
2. Connect the WonderEcho to the Pi's I²C header pins with **4 female-to-female Dupont jumper wires** (from the kit in the shopping list — the WonderEcho does not include any cable): **`SDA → BCM 2 (pin 3)`**, **`SCL → BCM 3 (pin 5)`**, **`5V → pin 2`**, **`GND → pin 6`**.
3. Plug the **micro-USB OTG adapter** into the Pi's **middle port labeled `USB`** (the data port — *not* the corner `PWR IN` port), then plug the USB microphone into the adapter.
<!-- when: mic=basic -->
4. The SunFounder mini mic is a thumb-size dongle — it just hangs off the OTG adapter. Point its grille roughly toward where you'll be speaking.
<!-- end -->
<!-- when: mic=array -->
4. Set the reSpeaker XVF3800 array flat, mics facing the room — its beamforming works best with an unobstructed 360° view. It connects to the OTG adapter with its own USB cable.
<!-- end -->
5. Make sure the WonderEcho's speaker face is unobstructed (its on-board mic listens for the wake word).

<!-- when: battery=yes -->
6. Snap the **PiSugar 3 battery** onto the underside of the Pi using its magnetic pogo pins. No soldering — the spring-loaded pogo pins align themselves.

**Final stack:** WonderEcho (via I²C cable) ←→ Pi Zero 2 WH ←→ USB mic (via OTG) → PiSugar 3
<!-- end -->
<!-- when: battery=no -->
**Final layout:** WonderEcho (via I²C cable) ←→ Pi Zero 2 WH ←→ USB mic (via OTG), wall-powered
<!-- end -->

✅ **Checkpoint:** The four I²C wires are seated firmly, nothing wobbles, the USB mic is in the **`USB`** (middle) port via the OTG adapter, and the WonderEcho's speaker grille is unobstructed.

---

## 04. Flash microSD

### 4.1 Install Raspberry Pi Imager

> If your laptop has no SD-card slot — common on recent ultrabooks and every modern MacBook — plug in a **USB microSD reader** now. The card itself ships with a full-size SD adapter, but that only helps you if the host has a full-size SD slot.

Download from **raspberrypi.com/software** (Windows, macOS, Linux).

### 4.2 Flash

1. Open Raspberry Pi Imager.
2. **Choose Device** → `Raspberry Pi Zero 2 W` *(Imager doesn't distinguish W from WH — the OS image is the same)*.
3. **Choose OS** → `Raspberry Pi OS (other)` → **Raspberry Pi OS (64-bit)** (the full version, *not* Lite).
   - The chatbot repo's install script expects packages from the full image. Lite will work but you'll need extra apt installs and may hit surprises.
4. **Choose Storage** → your microSD card.
5. Click the gear icon (⚙) for **Edit Settings** and configure:
   - **Hostname:** `claudia`
   - **Username:** *anything other than* `pi` — Pi OS Bookworm deprecated the default `pi` user, and current Imager builds warn (or refuse) when you try to set it. Use `claudia`, your first name, or any other identifier you'll remember.
   - **Password:** *something secure*
   - **Enable SSH:** ✅ password auth
   - **Wireless LAN:** SSID + password for your home Wi-Fi
   - **Locale:** *your timezone* (e.g. `America/Chicago`), keyboard *your layout* (e.g. `us`)
6. **Save**, then **Write**. Takes 2–5 minutes.

### 4.3 First boot

1. Insert the microSD into the Pi.
2. Plug the official power supply into the **`PWR IN`** micro-USB port (the one nearest the corner, labeled `PWR IN` on the silkscreen). **Not** the middle port labeled `USB`.
3. Wait 60–90 seconds.
4. From your PC:

   ```bash
   ssh <your-username>@claudia.local
   ```

   If `claudia.local` doesn't resolve, find the Pi's IP in your router's admin page and use `ssh <your-username>@192.168.x.x`.

✅ **Checkpoint:** You see the `<your-username>@claudia:~ $` prompt. Run `cat /etc/os-release` and confirm it says Debian/Raspberry Pi OS. Run `free -h` — you should see ~430 MB of `Mem:` (the Pi Zero 2 WH has 512 MB total).

---

## 05. System setup

Run these from the SSH session. One at a time. Wait for each to finish.

### 5.1 Update

```bash
sudo apt update && sudo apt full-upgrade -y
```

This takes 5–15 minutes on a Pi Zero 2 WH. Be patient.

### 5.2 Free up RAM (Pi Zero only has 512 MB)

The Pi Zero 2 WH is RAM-constrained. Disable services you don't need:

```bash
# Disable Bluetooth (not used by this build)
sudo systemctl disable hciuart bluetooth

# Disable triggerhappy (gamepad daemon, not needed)
sudo systemctl disable triggerhappy
```

### 5.3 Install build dependencies

```bash
sudo apt install -y git curl build-essential python3-pip python3-venv \
  portaudio19-dev libsndfile1 ffmpeg alsa-utils libatlas-base-dev
```

### 5.4 Enable I²C and detect the WonderEcho

The WonderEcho is an I²C device. Turn the bus on, install i2c-tools, then verify the module answers on the bus.

```bash
# Enable I²C non-interactively
sudo raspi-config nonint do_i2c 0

# Tools + Python bindings
sudo apt install -y i2c-tools python3-smbus

sudo reboot
```

After it reboots, SSH back in and run:

```bash
i2cdetect -y 1
```

You should see a device address show up (commonly `0x52` for the WonderEcho — verify against the sticker on the module).

✅ **Checkpoint:** `i2cdetect -y 1` lists at least one device address — the WonderEcho is talking to the Pi.

### 5.5 Verify the USB microphone

The USB mic is a standard USB Audio Class device — no driver needed. Confirm ALSA sees it:

```bash
arecord -l
```

You should see the mic listed as a capture card (typically `card 1` — `card 0` is the Pi's HDMI output, which has no capture side). Then make it the default capture device so the chatbot's recorder finds it without extra flags:

```bash
nano ~/.asoundrc
```

Paste (this file also ships in the repo as `config/asoundrc.usbmic`):

```
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

If `arecord -l` showed your mic on a different card number, change the `hw:1,0` (and `card 1`) to match.

<!-- when: mic=array -->
> **Array bonus:** the reSpeaker XVF3800 also has a playback side — a 3.5 mm jack plus a JST connector driving up to 5 W speakers ([Seeed wiki](https://wiki.seeedstudio.com/respeaker_xvf3800_introduction/)). Point `playback.pcm` at the reSpeaker's card too and one device covers both mic and speaker.
<!-- end -->

Now record a 3-second test clip:

```bash
arecord -d 3 -f S16_LE -r 16000 /tmp/mictest.wav
```

✅ **Checkpoint:** `arecord -l` lists the USB mic, and the test recording completes without `audio open error`. (Playback of the clip is covered in Part 10 — the Pi's only speaker at this point may be an HDMI display.)

---

## 06. Install chatbot

This is the PiSugar `whisplay-ai-chatbot` repo — we use it as the LLM/ASR/TTS plumbing even though we're not using the Whisplay HAT itself. Wake-word detection goes through the WonderEcho; conversation audio is recorded from the USB mic, which the chatbot picks up as the default ALSA capture device (set in Part 5.5).

```bash
cd ~
git clone https://github.com/PiSugar/whisplay-ai-chatbot.git
cd whisplay-ai-chatbot
bash install_dependencies.sh
source ~/.bashrc
```

The dependency install pulls Node.js, Python packages, and audio libraries. This takes **15–25 minutes** on a Pi Zero 2 WH. Let it finish.

> The `source ~/.bashrc` line is important — the installer sets PATH entries you need in your current shell session.

✅ **Checkpoint:** `install_dependencies.sh` finishes without errors. Test that Node is on PATH:

```bash
node --version
```

You should see `v22.x` or newer (upstream's installer pulls in the current Node LTS).

---

## 07. API key

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

## 08. Configure chatbot

### 8.1 Create your `.env`

```bash
cd ~/whisplay-ai-chatbot
cp .env.template .env
nano .env
```

The template ships with many fields for different ASR/LLM/TTS providers. For a Claude-based build, you need the LLM section set to Anthropic. Find and set:

```env
# === LLM (the AI brain) ===
LLM_SERVER=anthropic
ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# === System prompt — shapes the assistant's voice ===
SYSTEM_PROMPT=You are a concise, friendly voice assistant. Answer in plain spoken English — no markdown, no bullet lists, no headings. Keep responses to 1–3 sentences unless the user explicitly asks for more.
```

The wake-word listener does **not** run on the Pi — it's handled in hardware by the WonderEcho (see section 08.3 below). The Pi only polls the WonderEcho's wake-event register over I²C, so no `WAKE_WORD_*` env keys are needed. When a wake event fires, the chatbot records your question from the **USB mic** (the default ALSA capture device you set in Part 5.5) — the WonderEcho's own mic is only used by its on-chip wake-word detector and is never seen by the Pi.

> **Env-key naming:** upstream uses `LLM_SERVER`, `ASR_SERVER`, `TTS_SERVER` (not `*_PROVIDER`). The plugin registry switches on the lowercase value — see `src/cloud-api/server.ts` in the upstream repo.

<!-- when: asr=whisper-cpp -->
**ASR (speech-to-text): Whisper, local.** Already wired up by the template defaults. Slowest option on a Pi Zero 2 WH (~3–6 s per utterance) but no API key required and works offline.
<!-- end -->
<!-- when: asr=openai -->
**ASR (speech-to-text): OpenAI Whisper API.** Add to your `.env`:
```env
ASR_SERVER=openai
OPENAI_API_KEY=sk-REPLACE-ME
```
Round-trip latency drops to ~0.5–1 s. Costs a few cents per hour of speech.
<!-- end -->
<!-- when: asr=google -->
**ASR (speech-to-text): Google Cloud STT.** Add to your `.env`:
```env
ASR_SERVER=google
GOOGLE_APPLICATION_CREDENTIALS=/home/pi/google-stt-key.json
```
Drop the service-account JSON from Google Cloud Console at the path above. Generally fastest cloud STT on US-region traffic.
<!-- end -->

<!-- when: tts=piper -->
**TTS (text-to-speech): Piper, local.** Free, runs on the Pi. Voice quality is "robot but understandable" — fine for short replies. Add to your `.env`:
```env
TTS_SERVER=piper
PIPER_BINARY_PATH=/usr/local/bin/piper
PIPER_MODEL_PATH=/home/pi/piper/voices/en_US-amy-low.onnx
```
<!-- end -->
<!-- when: tts=openai -->
**TTS (text-to-speech): OpenAI gpt-4o-mini-tts (recommended).** Near-state-of-the-art quality, supported by upstream out-of-the-box. Add to your `.env`:
```env
TTS_SERVER=openai
OPENAI_API_KEY=sk-REPLACE-ME
OPENAI_VOICE_MODEL=gpt-4o-mini-tts
OPENAI_VOICE_TYPE=nova
```
The new `gpt-4o-mini-tts` model and the 4o-series voices (`alloy`, `nova`, `onyx`, `marin`, `cedar`, plus older `echo`/`fable`/`shimmer`/`ash`/`ballad`/`coral`/`sage`/`verse`) are dramatically more natural than the older `tts-1`. Costs roughly $0.015 per minute of speech.
<!-- end -->

<!-- when: tts=elevenlabs -->
**TTS (text-to-speech): ElevenLabs (best quality, requires a one-time patch).**

ElevenLabs has the most natural voices on the market right now, but the upstream chatbot doesn't ship an ElevenLabs handler. You add one yourself — about 40 lines of TypeScript and a single registration entry.

**Step 1 — handler.** Create `~/whisplay-ai-chatbot/src/cloud-api/elevenlabs/elevenlabs-tts.ts` with:

```typescript
import mp3Duration from "mp3-duration";
import { TTSResult } from "../../type";

// The chatbot already loads .env at startup, so process.env is populated
// by the time this plugin's activate() runs — no need to call dotenv here.
const apiKey     = process.env.ELEVENLABS_API_KEY     || "";
const voiceId    = process.env.ELEVENLABS_VOICE_ID    || "EXAVITQu4vr4xnSDxMaL"; // "Bella"
const modelId    = process.env.ELEVENLABS_MODEL_ID    || "eleven_turbo_v2_5";    // low-latency
const stability  = parseFloat(process.env.ELEVENLABS_STABILITY  || "0.5");
const similarity = parseFloat(process.env.ELEVENLABS_SIMILARITY || "0.75");

const elevenLabsTTS = async (text: string): Promise<TTSResult> => {
  if (!apiKey) { console.error("ELEVENLABS_API_KEY is not set."); return { duration: 0 }; }
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability, similarity_boost: similarity },
      }),
    });
  } catch (e) {
    console.log("ElevenLabs TTS request failed:", e);
    return { duration: 0 };
  }
  if (!res.ok) {
    console.log("ElevenLabs TTS HTTP " + res.status + ": " + (await res.text().catch(() => "")));
    return { duration: 0 };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const duration = await mp3Duration(buffer);
  // mp3-duration returns undefined if it can't parse the stream; coerce to
  // 0 so downstream code never sees NaN.
  return { buffer, duration: (duration ?? 0) * 1000 };
};

export default elevenLabsTTS;
```

**Step 2 — register the plugin.** Open `~/whisplay-ai-chatbot/src/plugin/builtin/tts.ts` and add this block alongside the other `pluginRegistry.register(...)` calls:

```typescript
pluginRegistry.register({
  name: "elevenlabs",
  displayName: "ElevenLabs TTS",
  version: "1.0.0",
  type: "tts",
  audioFormat: "mp3",
  description: "ElevenLabs text-to-speech (high-quality cloud voices)",
  activate: () => {
    const ttsProcessor = require("../../cloud-api/elevenlabs/elevenlabs-tts").default;
    return { ttsProcessor };
  },
} as TTSPlugin);
```

**Step 3 — `.env`.**
```env
TTS_SERVER=elevenlabs
ELEVENLABS_API_KEY=sk_REPLACE_ME
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
ELEVENLABS_MODEL_ID=eleven_turbo_v2_5
ELEVENLABS_STABILITY=0.5
ELEVENLABS_SIMILARITY=0.75
```

**Step 4 — rebuild + restart.**
```bash
cd ~/whisplay-ai-chatbot
bash build.sh
sudo systemctl restart chatbot.service
```

Voice IDs: log into [elevenlabs.io](https://elevenlabs.io), open VoiceLab, and copy the ID of any voice you've cloned or one of their stock voices. `eleven_turbo_v2_5` is recommended for the Pi Zero 2 WH — it has the lowest latency. Cost is roughly $0.18 per 1000 chars (~7-8 cents per minute of speech).
<!-- end -->

> The `.env.template` evolves. If your file looks different from this guide, the live template at [github.com/PiSugar/whisplay-ai-chatbot/blob/master/.env.template](https://github.com/PiSugar/whisplay-ai-chatbot/blob/master/.env.template) is the source of truth.

Save: `Ctrl+X`, `Y`, `Enter`.

### 8.2 Build the project

```bash
bash build.sh
```

This compiles the TypeScript and prepares assets. ~5–10 minutes on a Pi Zero 2 WH.

✅ **Checkpoint:** `build.sh` exits cleanly with no errors.

### 8.3 Configure the WonderEcho wake word

The WonderEcho module runs its own on-device wake-word detector — the Pi doesn't have to listen. You program the trigger phrase (`"Claudia"`) once over I²C, then the module flags a wake event on the bus whenever it hears the word; the Pi polls that register and starts a recording session each time it fires.

> **Verify before running.** The exact I²C register layout (`0x10` as the "set-trigger" opcode below) depends on your WonderEcho firmware revision. Check the [Hiwonder WonderEcho wiki](https://www.hiwonder.com/products/wonderecho) for the register map matching your unit before running this — the snippet is the canonical pattern, not a guaranteed copy-paste for every shipping firmware.

```bash
# Reference snippet: writes the trigger word to the WonderEcho's "set-trigger"
# register. Confirm the register/opcode against the Hiwonder wiki for your
# firmware revision before relying on this in production.
cd ~/whisplay-ai-chatbot
python3 - <<'PY'
import smbus2 as smbus, time
bus = smbus.SMBus(1)          # I²C bus 1 on the Pi Zero
ADDR = 0x52                    # WonderEcho default — confirm with i2cdetect
WORD = b"claudia"
bus.write_i2c_block_data(ADDR, 0x10, list(WORD) + [0])   # 0x10 = set-trigger
time.sleep(0.2)                                          # let the WonderEcho commit the trigger to its on-board flash before we close the bus
print("Wake word programmed:", WORD.decode())
PY
```

The chatbot service polls the WonderEcho's wake-event register over I²C and starts a recording session each time the word fires. No Python venv, no openWakeWord, no training.

✅ **Checkpoint:** speak "Claudia" near the module — `journalctl -u chatbot.service -f` shows a wake event within ~300 ms.

> The exact register map can vary by firmware revision. If your unit reports a different I²C address (verify with `i2cdetect -y 1`) or uses a different "set-trigger" opcode, check the [WonderEcho wiki](https://www.hiwonder.com/products/wonderecho) for the map matching your firmware.

---

## 09. Healthcheck

Before launching the full chatbot, run a 90-second healthcheck that verifies four layers: the WonderEcho is present on the I²C bus, the USB mic is visible to ALSA, the network can reach Anthropic, and your API key + chosen model actually return a response. (The full audio round trip — record, transcribe, speak — is exercised by the manual launch in Part 10.)

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

step "1. WonderEcho module on I2C"
# The WonderEcho is the wake-word frontend and talks to the Pi over I2C bus 1.
# It is NOT an audio device — it never appears in ALSA.
if command -v i2cdetect >/dev/null 2>&1; then
    if i2cdetect -y 1 2>/dev/null | grep -qE ' 5[234] '; then
        ok "WonderEcho detected on I2C bus 1"
    else
        bad "WonderEcho NOT detected on I2C bus 1 (check 4-pin wiring + 'sudo raspi-config nonint do_i2c 0')"
    fi
else
    bad "i2c-tools not installed - run 'sudo apt install -y i2c-tools' (see Part 05.4)"
fi

step "2. USB microphone in ALSA"
# Conversation audio comes from the USB mic — a standard USB Audio Class
# device that must show up as an ALSA capture card (see Part 5.5).
if command -v arecord >/dev/null 2>&1; then
    if arecord -l 2>/dev/null | grep -q '^card '; then
        ok "ALSA capture device present: $(arecord -l 2>/dev/null | grep '^card ' | head -1)"
    else
        bad "no ALSA capture device — is the USB mic in the middle 'USB' port via the OTG adapter? (Part 03 / 5.5)"
    fi
else
    bad "alsa-utils not installed - run 'sudo apt install -y alsa-utils' (see Part 05.3)"
fi

step "3. Network reachability"
# Use HTTPS instead of ping — many networks/APIs drop ICMP but pass TLS.
# A 4xx response still proves we got a real reply from api.anthropic.com.
net_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 https://api.anthropic.com/ 2>/dev/null || echo "000")
if [ "$net_code" != "000" ]; then
  ok "api.anthropic.com responded (HTTP $net_code)"
else
  bad "cannot reach api.anthropic.com (Wi-Fi, DNS, or TLS issue)"
fi

step "4. Claude API call"
if [ ! -f "$ENV_FILE" ]; then
  bad "$ENV_FILE not found — finish Part 08 first"
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
      # Prefer jq if available — it handles escaped quotes correctly. Fall
      # back to a grep+sed that breaks on escapes but is good enough for a
      # smoke-test "did Claude reply" sanity check.
      if command -v jq >/dev/null 2>&1; then
        reply=$(echo "$body" | jq -r '.content[0].text // empty' 2>/dev/null)
      else
        reply=$(echo "$body" | grep -o '"text":"[^"]*"' | head -1 | sed 's/"text":"//;s/"$//')
      fi
      echo "  Reply: $reply"
    else
      bad "Claude API returned HTTP $http_code"
      echo "  $body" | head -3
    fi
  fi
fi

echo
if [ $exit_code -eq 0 ]; then
  printf "$PASS All checks passed. You're ready for Part 10.\n"
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

✅ **Checkpoint:** All four sections print green check marks. If anything fails, fix that piece before moving on — running the full chatbot before this passes just makes debugging harder.

---

## 10. Run

### Manual launch (foreground, for testing)

```bash
cd ~/whisplay-ai-chatbot
bash run_chatbot.sh
```

**Say "Claudia"** — the WonderEcho hears the wake word, the chatbot starts a recording session on the USB mic, you ask your question, and Claude answers out loud. Sessions end automatically after 60 seconds of silence or when you say a stop word (`byebye`, `goodbye`, or `stop`).

Stop the foreground process with `Ctrl+C`.

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

### Tuning wake-word reliability

The WonderEcho exposes a few I²C registers for tuning:

- **Too many false wakes** (TV, conversations) → raise the detection threshold via the threshold register.
- **Missing real wakes** (you have to say it twice) → lower the threshold, or move the module closer to where you sit.

Reference: [Hiwonder WonderEcho wiki](https://www.hiwonder.com/products/wonderecho) for the exact register map for your firmware revision.

<!-- when: smarthome=kasa,shelly,sonoff -->
---

## 10.5 Smart-home

You picked a smart plug. Teach Claudia to flip it by giving the chatbot a *tool* — a small shell command it can invoke when the user's request matches.

<!-- when: smarthome=kasa -->
### TP-Link Kasa (HS103 / KP125M) — local control via `python-kasa`

```bash
pip install python-kasa --break-system-packages

# Find your plug on the LAN
kasa discover

# Toggle it (replace IP)
kasa --host 192.168.1.42 on
kasa --host 192.168.1.42 off
```

Wire that into the chatbot by exposing `kasa --host <ip> on` / `off` as a tool the LLM can call. No vendor account, no cloud hop — works even if the Kasa cloud is down.
<!-- end -->

<!-- when: smarthome=shelly -->
### Shelly Plug US — local HTTP

Find your plug's IP in your router admin or via the Shelly app. Then any HTTP client can flip it:

```bash
# On
curl "http://192.168.1.42/relay/0?turn=on"
# Off
curl "http://192.168.1.42/relay/0?turn=off"
```

No vendor account, no SDK — wire those two `curl` calls into the chatbot as tools.
<!-- end -->

<!-- when: smarthome=sonoff -->
### Sonoff S31 + Tasmota — local MQTT / HTTP

Out-of-the-box the S31 uses the eWeLink cloud, which means latency and a dependency on someone else's servers. Reflash with [Tasmota](https://templates.blakadder.com/sonoff_S31.html) (no soldering needed for the S31 — there's a serial header) to expose a local HTTP endpoint:

```bash
curl "http://192.168.1.42/cm?cmnd=Power%20On"
curl "http://192.168.1.42/cm?cmnd=Power%20Off"
```

Slightly more work to flash, but you get full local control + power-usage telemetry over MQTT.
<!-- end -->
<!-- end -->

---

## 11. Case

<!-- when: case=none -->
You picked **no case**. PiSugar publishes free STL files if you change your mind — flip the *3D-printed case* config above to FDM or SLA and the right link will appear here.
<!-- end -->
<!-- when: case=fdm,sla -->
PiSugar publishes free STL files for case shells:
<!-- end -->

<!-- when: case=fdm -->
- [pi02 Whisplay chatbot case — **FDM** (filament print)](https://github.com/PiSugar/suit-cases/tree/main/pisugar3-whisplay-chatbot-fdm)
<!-- end -->
<!-- when: case=sla -->
- [pi02 Whisplay chatbot case — **SLA** (resin print)](https://github.com/PiSugar/suit-cases/tree/main/pisugar3-whisplay-chatbot)
<!-- end -->

<!-- when: case=fdm,sla -->
No printer? Upload the STL to a print service like [JLC3DP](https://jlc3dp.com) or [Craftcloud](https://craftcloud3d.com) — a few dollars shipped.
<!-- end -->

---

## 12. Troubleshooting

### Nothing plays through the speaker
- TTS playback goes to the Pi's **default ALSA output** (`aplay -l` shows it), not to the WonderEcho — the WonderEcho's on-board speaker can only play its own canned firmware phrases and cannot render Claude's replies. Check which card playback is routed to in `~/.asoundrc` (Part 5.5) and that an actual speaker is attached to it.
- Check `journalctl -u chatbot.service -f` for "TTS" or "speak" lines — if Claude is replying but you hear nothing, the playback device is wrong or muted (`alsamixer`, F6 to pick the card).

### Mic captures silence or garbage
- Run `arecord -l` — if the USB mic is missing, reseat the OTG adapter in the **middle `USB` port** (the corner port is power-only) and check `dmesg | tail` for USB enumeration errors.
- If the card number changed after a reboot (USB enumeration order isn't stable), update `hw:1,0` in `~/.asoundrc` to match `arecord -l`, or lock the mic to index 1 via `/etc/modprobe.d/alsa-base.conf`.
- Test in isolation: `arecord -d 3 -f S16_LE -r 16000 /tmp/mictest.wav` — if this errors, the problem is ALSA config, not the chatbot.
- If the wake event never fires (`journalctl -u chatbot.service -f` stays silent when you speak), that's the WonderEcho, not the mic — the wake word may have been reset on cold boot; re-run the I²C programming snippet from Part 08.3.

### Build fails out of memory
- The Pi Zero 2 WH only has 512 MB. Add swap if `build.sh` gets OOM-killed:
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

### WonderEcho doesn't respond
- Run `i2cdetect -y 1` and confirm the module's address still shows up.
- Re-run the wake-word programming script in Part 08.3 — flashes can be lost on cold boots.
- Check `journalctl -u chatbot.service -f` while you speak — if the wake event never fires, the 4-pin I²C cable may have come loose or the module's mic input is occluded.

### Wake word triggers on TV / unrelated speech
- Increase the WonderEcho's detection threshold via I²C — see the [Hiwonder wiki](https://www.hiwonder.com/products/wonderecho) for the register address on your firmware revision.

### Responses feel slow
- Use `claude-haiku-4-5-20251001` (Part 07 — it's the recommended default for this reason).
- The Pi Zero 2 WH's Wi-Fi antenna is weak. Move it closer to the router.
- Local Whisper STT is the slowest step on a Pi Zero 2 WH. If you have a cloud STT key (OpenAI, Google), switching to one of those in `.env` cuts perceived latency dramatically.

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

- **WonderEcho module:** https://www.hiwonder.com/products/wonderecho
- **SunFounder USB mini mic:** https://www.sunfounder.com/products/mini-usb-microphone
- **reSpeaker XVF3800 mic array:** https://wiki.seeedstudio.com/respeaker_xvf3800_introduction/
- **Chatbot repo:** https://github.com/PiSugar/whisplay-ai-chatbot
- **Claude API docs:** https://docs.claude.com
- **Claude model catalog:** https://docs.claude.com/en/docs/about-claude/models/overview
- **Pricing:** https://anthropic.com/pricing

---

## Summary stack

| Layer | What it is |
|-------|-----------|
| Hardware | Pi Zero 2 WH + USB mic (SunFounder mini or reSpeaker XVF3800 array) + Hiwonder WonderEcho (I²C wake word) (+ optional PiSugar 3 battery) |
| OS | Raspberry Pi OS 64-bit |
| Wake word | **"Claudia"** — runs on the WonderEcho, no Pi-side listener |
| Microphone | USB mic via OTG adapter — the default ALSA capture device (the WonderEcho never streams audio) |
| Speech → text | Local Whisper-cpp, or cloud STT if configured |
| LLM | Claude API (Anthropic) |
| Text → speech | OpenAI gpt-4o-mini-tts (recommended), Piper (local), or ElevenLabs (with patch) |
| Service manager | systemd (`chatbot.service`, set up by `startup.sh`) |

Only Claude (and your chosen TTS, if cloud) runs in the cloud. Everything else can run on-device.
