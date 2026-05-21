#!/bin/bash
# claudia healthcheck — quick end-to-end smoke test
# Verifies speaker, mic, network, and Claude API in one shot.
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
# The WonderEcho carries both mic and speaker on-board and talks to the Pi
# over I2C bus 1. We don't expect a standalone ALSA card.
if command -v i2cdetect >/dev/null 2>&1; then
    if i2cdetect -y 1 2>/dev/null | grep -qE '52|53|54'; then
        ok "WonderEcho detected on I2C bus 1"
    else
        bad "WonderEcho NOT detected on I2C bus 1 (check 4-pin wiring + 'sudo raspi-config nonint do_i2c 0')"
    fi
else
    bad "i2c-tools not installed - run 'sudo apt install -y i2c-tools' (see Part 5.4)"
fi

step "2. Network reachability"
ping -c 1 -W 3 api.anthropic.com >/dev/null 2>&1 \
  && ok "api.anthropic.com is reachable" \
  || bad "cannot reach api.anthropic.com (Wi-Fi or DNS issue)"

step "3. Claude API call"
if [ ! -f "$ENV_FILE" ]; then
  bad "$ENV_FILE not found — finish Part 8 first"
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
  printf "$PASS All checks passed. You're ready for Part 10 (run the chatbot).\n"
else
  printf "$FAIL One or more checks failed. Fix above before running the chatbot.\n"
fi
exit $exit_code
