#!/bin/bash
# claudebox healthcheck — quick end-to-end smoke test
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

step "1. Audio devices"
aplay -l   | grep -q wm8960 && ok "wm8960 playback card detected" || bad "wm8960 NOT detected (driver issue?)"
arecord -l | grep -q card   && ok "at least one capture card detected" || bad "no capture card detected"

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
