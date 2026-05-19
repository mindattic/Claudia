#!/bin/bash
# install-claudia.sh — automate Parts 4 through 9 of the build guide.
#
# Run this on the Pi after a fresh Raspberry Pi OS 64-bit boot:
#     scp scripts/install-claudia.sh pi@claudia.local:~
#     ssh pi@claudia.local 'bash ~/install-claudia.sh'
#
# The script is idempotent — re-running it is safe.

set -euo pipefail

SCRIPT_NAME=$(basename "$0")
LOG="/home/$(whoami)/${SCRIPT_NAME%.sh}.log"
exec > >(tee -a "$LOG") 2>&1

step() { printf "\n\033[1;36m── %s ──\033[0m\n" "$1"; }
ok()   { printf "\033[0;32m  ✓ %s\033[0m\n" "$1"; }
warn() { printf "\033[0;33m  ! %s\033[0m\n" "$1"; }
die()  { printf "\033[0;31m  ✗ %s\033[0m\n" "$1"; exit 1; }

# Sanity: don't run as root, but require sudo to be available.
[ "$EUID" -eq 0 ] && die "Run as 'pi', not root. The script will sudo where needed."
sudo -v || die "sudo is required."

step "5.1  apt update + full-upgrade  (~5–15 min on a Pi Zero)"
sudo apt update
sudo apt full-upgrade -y

step "5.2  disable services we don't need (free up RAM)"
for svc in hciuart bluetooth triggerhappy; do
    sudo systemctl disable --now "$svc" 2>/dev/null || warn "$svc not present"
done
ok "trimmed background services"

step "5.3  build dependencies"
sudo apt install -y git curl build-essential python3-pip python3-venv \
  portaudio19-dev libsndfile1 ffmpeg alsa-utils libatlas-base-dev
ok "apt deps installed"

step "5.4  Enable I2C + tools for the WonderEcho module"
sudo raspi-config nonint do_i2c 0
sudo apt install -y i2c-tools python3-smbus
ok "I2C enabled"
warn "after the next reboot, run 'i2cdetect -y 1' to confirm the WonderEcho is on the bus."

step "5  chatbot software (PiSugar/whisplay-ai-chatbot)"
cd "$HOME"
if [ ! -d whisplay-ai-chatbot ]; then
    git clone https://github.com/PiSugar/whisplay-ai-chatbot.git
fi
cd whisplay-ai-chatbot
if [ ! -f .install_dependencies.done ]; then
    bash install_dependencies.sh
    touch .install_dependencies.done
    # shellcheck disable=SC1090
    source "$HOME/.bashrc" || true
fi
ok "chatbot deps installed"

step "8.1  .env  (create from template if missing — edit before continuing)"
if [ ! -f .env ]; then
    if [ -f .env.template ]; then
        cp .env.template .env
        ok "copied .env.template → .env"
    else
        warn ".env.template not found in upstream — creating minimal stub"
        cat > .env <<'EOF'
LLM_SERVER=anthropic
ANTHROPIC_API_KEY=sk-ant-REPLACE-ME
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
SYSTEM_PROMPT=You are a concise, friendly voice assistant.
ASR_SERVER=whisper-cpp
TTS_SERVER=openai
OPENAI_API_KEY=sk-REPLACE-ME
OPENAI_VOICE_MODEL=gpt-4o-mini-tts
OPENAI_VOICE_TYPE=nova
EOF
    fi
fi

if grep -q 'sk-ant-REPLACE-ME' .env; then
    warn ".env still has the placeholder API key."
    warn "Edit it now:   nano $HOME/whisplay-ai-chatbot/.env"
    warn "Then re-run:   bash ~/$SCRIPT_NAME"
    exit 0
fi

step "8.2  build the chatbot  (~5–10 min)"
bash build.sh
ok "build complete"

step "8.3  WonderEcho I2C check"
if i2cdetect -y 1 2>/dev/null | grep -qE '52|53|54'; then
    ok "WonderEcho detected on I2C bus 1"
else
    warn "WonderEcho not detected on I2C bus 1 - check 4-pin wiring (SDA/SCL/5V/GND)"
    warn "and confirm i2c was enabled in step 5.4 (a reboot may be required first)."
fi

step "9  healthcheck"
if [ -f "$HOME/healthcheck.sh" ]; then
    bash "$HOME/healthcheck.sh" || warn "healthcheck reported failures — review before enabling boot"
else
    warn "healthcheck.sh not present — skipping (upload it from the repo's scripts/ folder)"
fi

step "10  register on-boot service"
if systemctl is-enabled chatbot.service >/dev/null 2>&1; then
    ok "chatbot.service already enabled"
else
    bash startup.sh
    ok "chatbot.service installed via startup.sh"
fi

echo
ok "DONE.  sudo systemctl status chatbot.service  to verify."
ok "Log:   $LOG"
