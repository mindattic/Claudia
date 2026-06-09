#!/bin/bash
# claudia healthcheck — quick end-to-end smoke test
# Verifies the WonderEcho is on the I2C bus, the USB mic is visible to ALSA,
# the network can reach Anthropic, and the API key + chosen model return a
# response. (The full audio round trip — record, transcribe, speak — is
# exercised by the manual launch in Part 10, not here.)
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
