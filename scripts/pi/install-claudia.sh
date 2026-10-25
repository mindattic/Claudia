#!/bin/bash
# install-claudia.sh — automate the System setup → Start on boot sections of the build guide.
#
# Run this on the Pi after a fresh Raspberry Pi OS 64-bit boot, from your computer:
#     scp scripts/pi/install-claudia.sh scripts/pi/healthcheck.sh scripts/pi/wonderecho-wake.py <user>@claudia.local:~
#     ssh -t <user>@claudia.local 'bash ~/install-claudia.sh'
#
# The script is idempotent — re-running it is safe. It stops once to let you
# paste your Claude API key into the chatbot's .env, then finishes on the re-run.

set -euo pipefail

SCRIPT_NAME=$(basename "$0")
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
LOG="$HOME/${SCRIPT_NAME%.sh}.log"
exec > >(tee -a "$LOG") 2>&1

CLAUDIA_DIR="$HOME/claudia"                 # Claudia's own files on the Pi (bridge, venv, voice models)
CHATBOT_DIR="$HOME/whisplay-ai-chatbot"     # upstream runtime, cloned (never vendored)
VENV="$CLAUDIA_DIR/venv"
VOSK_MODEL="vosk-model-small-en-us-0.15"
PIPER_VOICE="en_US-amy-low"
DEFAULT_MODEL="claude-haiku-5-5"

step() { printf "\n\033[1;36m── %s ──\033[0m\n" "$1"; }
ok()   { printf "\033[0;32m  ✓ %s\033[0m\n" "$1"; }
warn() { printf "\033[0;33m  ! %s\033[0m\n" "$1"; }
die()  { printf "\033[0;31m  ✗ %s\033[0m\n" "$1"; exit 1; }

# Sanity: don't run as root, but require sudo to be available.
[ "$EUID" -eq 0 ] && die "Run as your normal user, not root. The script will sudo where needed."
sudo -v || die "sudo is required."

# Print the ALSA card ids (the short name after "card N:") that `arecord -l`
# or `aplay -l` lists, skipping the Pi's HDMI outputs.
alsa_card_ids() {
    "$1" -l 2>/dev/null | sed -n 's/^card [0-9]*: \([^ ]*\) \[.*/\1/p' | grep -viE 'hdmi' | awk '!seen[$0]++' || true
}

# Node comes from nvm (or /opt/nodejs) via lines install_dependencies.sh adds
# to ~/.bashrc, which a non-interactive shell never runs; load them directly.
load_node() {
    export NVM_DIR="$HOME/.nvm"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        set +eu
        # shellcheck disable=SC1091
        . "$NVM_DIR/nvm.sh"
        set -eu
    fi
    if [ -d /opt/nodejs/bin ]; then PATH="/opt/nodejs/bin:$PATH"; fi
    export PATH
}

env_get()     { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | tr -d "\r\"'" || true; }
env_has()     { grep -qE "^$1=" .env; }
env_set()     { if env_has "$1"; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi; }
# Set a key only if it is missing or still holds one of upstream's template
# placeholders (=test, =/path/to/...); never overwrite a value the builder chose.
env_default() {
    case "$(env_get "$1")" in
        test|/path/to/*) env_set "$1" "$2" ;;
        *) env_has "$1" || printf '%s=%s\n' "$1" "$2" >> .env ;;
    esac
}

step "1  apt update + full-upgrade  (~5–15 min on a Pi Zero)"
sudo apt update
sudo apt full-upgrade -y

step "2  headless mode + trim services (free up RAM)"
# Booting to the console instead of the desktop saves ~100 MB on a 512 MB board,
# and stops upstream's startup.sh from prompting about it later.
if [ "$(systemctl get-default)" != "multi-user.target" ]; then
    sudo systemctl set-default multi-user.target
    ok "boot target set to multi-user (console); takes effect on next boot"
fi
for svc in hciuart bluetooth triggerhappy; do
    sudo systemctl disable --now "$svc" 2>/dev/null || warn "$svc not present"
done
ok "trimmed background services"

step "3  build dependencies"
sudo apt install -y git curl unzip build-essential python3-pip python3-venv \
  portaudio19-dev libsndfile1 ffmpeg sox alsa-utils i2c-tools python3-smbus
# libatlas-base-dev exists on Bookworm but was dropped from Debian Trixie (the
# base of current Raspberry Pi OS); install it only where apt can find it.
if apt-cache policy libatlas-base-dev 2>/dev/null | grep -q 'Candidate: [0-9]'; then
    sudo apt install -y libatlas-base-dev
fi
ok "apt deps installed"

step "4  enable I2C for the WonderEcho"
sudo raspi-config nonint do_i2c 0
ok "I2C enabled"

step "5  audio devices (USB mic + USB speaker)"
# The WonderEcho only handles the wake word — conversation audio is recorded
# from the USB mic and replies play on the USB speaker (or the reSpeaker's jack).
capture_card=$(alsa_card_ids arecord | head -n1)
playback_card=""
for card in $(alsa_card_ids aplay); do
    if [ "$card" != "$capture_card" ]; then playback_card=$card; break; fi
done
# The reSpeaker array is both mic and speaker output; fall back to it.
if [ -z "$playback_card" ] && alsa_card_ids aplay | grep -qx "$capture_card"; then
    playback_card=$capture_card
fi
[ -n "$capture_card" ] && ok "capture card: $capture_card" \
    || warn "no USB capture card — plug the mic into the OTG hub on the Pi's middle 'USB' port."
[ -n "$playback_card" ] && ok "playback card: $playback_card" \
    || warn "no USB playback card — plug the USB speaker into the OTG hub (the Pi Zero has no audio jack)."
# Claudia 1.x wrote a fixed card-number profile that played to HDMI (hw:0,0);
# set it aside so a speaker-aware one is written below.
if [ -f "$HOME/.asoundrc" ] && grep -q 'slave.pcm "hw:0,0"' "$HOME/.asoundrc"; then
    mv "$HOME/.asoundrc" "$HOME/.asoundrc.claudia1.bak"
    warn "moved the old HDMI-playback ~/.asoundrc to ~/.asoundrc.claudia1.bak"
fi
if [ -f "$HOME/.asoundrc" ]; then
    ok "~/.asoundrc already present — left untouched"
elif [ -n "$capture_card" ] && [ -n "$playback_card" ]; then
    # Same shape as the repo's config/asoundrc.usbmic, with this Pi's card ids.
    # Card ids (not numbers) survive USB enumeration order changing across boots.
    cat > "$HOME/.asoundrc" <<EOF
pcm.!default {
    type asym
    playback.pcm "plughw:CARD=$playback_card,DEV=0"
    capture.pcm "plughw:CARD=$capture_card,DEV=0"
}

ctl.!default {
    type hw
    card $playback_card
}
EOF
    ok "wrote ~/.asoundrc (capture = $capture_card, playback = $playback_card)"
else
    warn "~/.asoundrc not written — attach the mic and speaker, then re-run this script."
fi

step "6  chatbot software (PiSugar/whisplay-ai-chatbot)"
cd "$HOME"
if [ ! -d "$CHATBOT_DIR" ]; then
    git clone https://github.com/PiSugar/whisplay-ai-chatbot.git "$CHATBOT_DIR"
fi
cd "$CHATBOT_DIR"
if [ ! -f .install_dependencies.done ]; then
    bash install_dependencies.sh
    touch .install_dependencies.done
fi
load_node
command -v node >/dev/null 2>&1 && ok "node $(node --version)" || warn "node not on PATH — open a new SSH session and re-run"

step "7  .env  (Claudia defaults on top of upstream's template)"
fresh=false
if [ ! -f .env ]; then
    if [ -f .env.template ]; then cp .env.template .env; else : > .env; fi
    fresh=true
    ok "created .env"
fi
# Older Claudia guides wrote ANTHROPIC_MODEL, which upstream never read
# (it reads ANTHROPIC_LLM_MODEL); carry the value over.
if env_has ANTHROPIC_MODEL && ! env_has ANTHROPIC_LLM_MODEL; then
    env_set ANTHROPIC_LLM_MODEL "$(env_get ANTHROPIC_MODEL)"
    ok "moved ANTHROPIC_MODEL to ANTHROPIC_LLM_MODEL"
fi
# They also offered ASR_SERVER values upstream has no plugin for.
old_asr=$(env_get ASR_SERVER)
case "$old_asr" in
    whisper-cpp|google)
        env_set ASR_SERVER vosk
        warn "ASR_SERVER=$old_asr is not an upstream server; switched to vosk"
        ;;
esac
# A fresh .env gets every Claudia default; on re-runs only keys that are
# missing or still placeholders are filled in.
if $fresh; then set_key=env_set; else set_key=env_default; fi
$set_key LLM_SERVER anthropic
env_default ANTHROPIC_API_KEY sk-ant-REPLACE-ME
$set_key ANTHROPIC_LLM_MODEL "$DEFAULT_MODEL"
$set_key ANTHROPIC_MAX_TOKENS 2048
$set_key SYSTEM_PROMPT '"You are Claudia, a concise, friendly voice assistant. Keep answers to one to three spoken sentences unless asked for more."'
$set_key ASR_SERVER vosk
$set_key VOSK_MODEL_PATH "$CLAUDIA_DIR/models/$VOSK_MODEL"
$set_key TTS_SERVER piper
$set_key PIPER_BINARY_PATH "$VENV/bin/piper"
$set_key PIPER_MODEL_PATH "$CLAUDIA_DIR/piper/$PIPER_VOICE.onnx"
$set_key WAKE_WORD_ENABLED true
$set_key WAKE_WORD_PYTHON_PATH "$CLAUDIA_DIR/wonderecho-wake.py"
$set_key ALSA_INPUT_DEVICE default
$set_key ALSA_OUTPUT_DEVICE default
ok ".env keys in place"

step "8  WonderEcho wake bridge"
mkdir -p "$CLAUDIA_DIR"
if [ -f "$SCRIPT_DIR/wonderecho-wake.py" ]; then
    install -m 755 "$SCRIPT_DIR/wonderecho-wake.py" "$CLAUDIA_DIR/wonderecho-wake.py"
    ok "installed $CLAUDIA_DIR/wonderecho-wake.py"
elif [ -x "$CLAUDIA_DIR/wonderecho-wake.py" ]; then
    ok "bridge already installed"
else
    warn "wonderecho-wake.py not found next to this script — copy it from the repo's scripts/pi/ folder and re-run."
fi
if i2cdetect -y 1 2>/dev/null | grep -qE ' 3[34] '; then
    ok "WonderEcho detected on I2C bus 1"
else
    warn "WonderEcho not seen at 0x34/0x33 on I2C bus 1 — check the 4 jumper wires (SDA/SCL/5V/GND)."
fi

step "9  local speech engines (only those .env selects)"
asr=$(env_get ASR_SERVER)
tts=$(env_get TTS_SERVER)
plugs=$(env_get CLAUDIA_PLUGS)
if [ "$asr" = vosk ] || [ "$tts" = piper ] || [[ "$plugs" == *kasa:* ]]; then
    [ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
fi
if [ "$tts" = elevenlabs ] && [ ! -f plugins/elevenlabs-tts/index.js ]; then
    warn "TTS_SERVER=elevenlabs but plugins/elevenlabs-tts is missing — copy it from the repo's plugins/ folder."
fi
if [[ "$plugs" == *kasa:* ]]; then
    "$VENV/bin/pip" install --quiet python-kasa
    ok "python-kasa ready for the smart-plugs plugin"
fi
if [ "$asr" = vosk ]; then
    "$VENV/bin/pip" install --quiet vosk
    # Upstream runs vosk-transcriber by name, so it must be on the service's PATH.
    sudo ln -sf "$VENV/bin/vosk-transcriber" /usr/local/bin/vosk-transcriber
    if [ ! -d "$CLAUDIA_DIR/models/$VOSK_MODEL" ]; then
        mkdir -p "$CLAUDIA_DIR/models"
        curl -fL -o "/tmp/$VOSK_MODEL.zip" "https://alphacephei.com/vosk/models/$VOSK_MODEL.zip"
        unzip -q -o "/tmp/$VOSK_MODEL.zip" -d "$CLAUDIA_DIR/models"
        rm -f "/tmp/$VOSK_MODEL.zip"
    fi
    ok "Vosk ASR ready ($VOSK_MODEL)"
fi
if [ "$tts" = piper ]; then
    "$VENV/bin/pip" install --quiet piper-tts
    if [ ! -f "$CLAUDIA_DIR/piper/$PIPER_VOICE.onnx" ]; then
        mkdir -p "$CLAUDIA_DIR/piper"
        "$VENV/bin/python" -m piper.download_voices --download-dir "$CLAUDIA_DIR/piper" "$PIPER_VOICE"
    fi
    ok "Piper TTS ready ($PIPER_VOICE)"
fi

step "10  API key check"
# Guard against an unconfigured key from EITHER source: the placeholder above
# or the upstream .env.template ("your_anthropic_api_key").
api_key=$(env_get ANTHROPIC_API_KEY | tr -d ' \t')
case "$api_key" in
    ""|*REPLACE*|*your*|*YOUR*|*here*|*HERE*)
        warn ".env still has a placeholder / empty ANTHROPIC_API_KEY."
        warn "Edit it now:   nano $CHATBOT_DIR/.env"
        warn "Then re-run:   bash ~/$SCRIPT_NAME"
        exit 0
        ;;
esac
ok "API key present"

step "11  build the chatbot  (~5–10 min)"
bash build.sh
ok "build complete"

step "12  healthcheck"
if [ -f "$HOME/healthcheck.sh" ]; then
    bash "$HOME/healthcheck.sh" || warn "healthcheck reported failures — review before enabling boot"
else
    warn "healthcheck.sh not present — skipping (copy it from the repo's scripts/pi/ folder)"
fi

step "13  register on-boot service"
if systemctl is-enabled chatbot.service >/dev/null 2>&1; then
    sudo systemctl restart chatbot.service
    ok "chatbot.service already enabled — restarted to pick up changes"
else
    bash startup.sh
    ok "chatbot.service installed via startup.sh"
fi

echo
ok "DONE.  sudo systemctl status chatbot.service  to verify."
ok "Log:   $LOG"
