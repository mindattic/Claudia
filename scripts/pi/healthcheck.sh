#!/bin/bash
# claudia healthcheck — quick end-to-end smoke test
# Verifies the WonderEcho answers on I2C, the USB mic and USB speaker are
# visible to ALSA, the wake bridge is installed, the network can reach
# Anthropic, and the API key + chosen model return a response. (The full
# audio round trip — wake, record, transcribe, speak — is exercised by the
# manual launch in the guide's Run section, not here.)
# Usage: bash ~/healthcheck.sh

set -u
ENV_FILE="$HOME/whisplay-ai-chatbot/.env"
PASS="\033[0;32m✓\033[0m"
FAIL="\033[0;31m✗\033[0m"
exit_code=0

step() { printf "\n%s\n" "── $1 ──"; }
ok()   { printf "  $PASS %s\n" "$1"; }
bad()  { printf "  $FAIL %s\n" "$1"; exit_code=1; }

# Read only the keys this check needs. The .env is dotenv, not shell:
# sourcing it would run the words of an unquoted SYSTEM_PROMPT as commands.
env_get() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d "\r\"'"; }

# ALSA card ids from `arecord -l` / `aplay -l`, skipping the Pi's HDMI outputs.
alsa_card_ids() { "$1" -l 2>/dev/null | sed -n 's/^card [0-9]*: \([^ ]*\) \[.*/\1/p' | grep -viE 'hdmi'; }

step "1. WonderEcho module on I2C"
# The WonderEcho is the wake-word frontend and talks to the Pi over I2C bus 1
# at 0x34 (0x33 if re-addressed). It is NOT an audio device — never in ALSA.
if command -v i2cdetect >/dev/null 2>&1; then
    if i2cdetect -y 1 2>/dev/null | grep -qE ' 3[34] '; then
        ok "WonderEcho detected on I2C bus 1"
    else
        bad "WonderEcho NOT at 0x34/0x33 on I2C bus 1 (check the 4 jumpers + 'sudo raspi-config nonint do_i2c 0')"
    fi
else
    bad "i2c-tools not installed - run 'sudo apt install -y i2c-tools' (see System setup)"
fi

step "2. USB microphone and speaker in ALSA"
# Conversation audio is recorded from the USB mic and replies play on the USB
# speaker (or the reSpeaker array's jack). The Pi Zero has no audio jack.
if command -v arecord >/dev/null 2>&1; then
    mic=$(alsa_card_ids arecord | head -n1)
    spk=$(alsa_card_ids aplay | head -n1)
    [ -n "$mic" ] && ok "capture card: $mic" \
        || bad "no USB capture card — is the mic on the OTG hub in the middle 'USB' port?"
    [ -n "$spk" ] && ok "playback card: $spk" \
        || bad "no USB playback card — is the USB speaker on the OTG hub? (HDMI doesn't count)"
    [ -f "$HOME/.asoundrc" ] && ok "~/.asoundrc present" \
        || bad "~/.asoundrc missing — re-run install-claudia.sh or see 'Set up the mic and speaker'"
else
    bad "alsa-utils not installed - run 'sudo apt install -y alsa-utils' (see System setup)"
fi

step "3. Wake bridge"
bridge=$(env_get WAKE_WORD_PYTHON_PATH)
if [ "$(env_get WAKE_WORD_ENABLED)" != "true" ]; then
    bad "WAKE_WORD_ENABLED is not true in .env — the chatbot will never listen for a wake event"
elif [ -z "$bridge" ] || [ ! -x "$bridge" ]; then
    bad "WAKE_WORD_PYTHON_PATH does not point at an executable wonderecho-wake.py (got '${bridge:-unset}')"
elif ! python3 -c 'import smbus' 2>/dev/null; then
    bad "python3-smbus missing - run 'sudo apt install -y python3-smbus'"
else
    ok "bridge installed: $bridge"
fi

step "4. Network reachability"
# Use HTTPS instead of ping — many networks/APIs drop ICMP but pass TLS.
# A 4xx response still proves we got a real reply from api.anthropic.com.
# curl prints 000 via -w on failure itself, so don't append a fallback.
net_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 https://api.anthropic.com/ 2>/dev/null)
if [ -n "$net_code" ] && [ "$net_code" != "000" ]; then
  ok "api.anthropic.com responded (HTTP $net_code)"
else
  bad "cannot reach api.anthropic.com (Wi-Fi, DNS, or TLS issue)"
fi

step "5. Claude API call"
if [ ! -f "$ENV_FILE" ]; then
  bad "$ENV_FILE not found — finish 'Configure the chatbot' first"
else
  ANTHROPIC_API_KEY=$(env_get ANTHROPIC_API_KEY)
  # Upstream reads ANTHROPIC_LLM_MODEL; with it unset it falls back to its own default.
  ANTHROPIC_LLM_MODEL=$(env_get ANTHROPIC_LLM_MODEL)
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    bad "ANTHROPIC_API_KEY is empty in .env"
  else
    if [ -z "${ANTHROPIC_LLM_MODEL:-}" ]; then
      bad "ANTHROPIC_LLM_MODEL is unset — upstream would fall back to its own (slower, pricier) default model"
    fi
    response=$(curl -s --max-time 30 -w "\n%{http_code}" https://api.anthropic.com/v1/messages \
      -H "x-api-key: $ANTHROPIC_API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d "{\"model\":\"${ANTHROPIC_LLM_MODEL:-claude-haiku-5-5}\",\"max_tokens\":256,\"messages\":[{\"role\":\"user\",\"content\":\"Say hello in exactly 5 words.\"}]}")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    if [ "$http_code" = "200" ]; then
      ok "Claude API responded HTTP 200 (${ANTHROPIC_LLM_MODEL:-claude-haiku-5-5})"
      # Prefer jq if available — it handles escaped quotes correctly. Fall
      # back to a grep+sed that breaks on escapes but is good enough for a
      # smoke-test "did Claude reply" sanity check.
      if command -v jq >/dev/null 2>&1; then
        reply=$(echo "$body" | jq -r '[.content[] | select(.type=="text") | .text] | join("")' 2>/dev/null)
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
  printf "$PASS All checks passed. You're ready to run the chatbot.\n"
else
  printf "$FAIL One or more checks failed. Fix above before running the chatbot.\n"
fi
exit $exit_code
