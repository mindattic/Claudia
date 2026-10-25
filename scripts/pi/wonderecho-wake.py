#!/usr/bin/env python3
# wonderecho-wake.py — Claudia's bridge from the WonderEcho to whisplay-ai-chatbot.
#
# Upstream's wake-word listener (src/device/wakeword.ts) spawns
#     $WAKE_WORD_PYTHON_PATH <upstream python/wakeword.py>
# and starts a listening session whenever a stdout line begins with "WAKE".
# Pointing WAKE_WORD_PYTHON_PATH at this file swaps upstream's openWakeWord
# (which needs the mic) for the WonderEcho, which hears "Claudia" on its own
# chip and reports a 1-byte result over I2C. No upstream file is modified;
# the script path upstream passes as argv[1] is ignored.
#
# Vendor protocol (docs.hiwonder.com/projects/WonderEcho, "Multiple Controller
# Communication"): I2C address 0x34 (0x33 on units re-addressed via register
# 0x03), result register 0x64, 0x00 = nothing recognized. The ID reported for a
# learned wake word is not documented and can differ by firmware revision, so
# any non-zero result wakes by default; run with --watch to see what your unit
# reports and narrow it with WONDERECHO_WAKE_IDS.
#
# Settings (read from the environment; the chatbot passes its .env through):
#   WONDERECHO_I2C_BUS      I2C bus number             (default 1)
#   WONDERECHO_I2C_ADDR     module address             (default 0x34)
#   WONDERECHO_WAKE_IDS     comma list of IDs, or any  (default any)
#   WONDERECHO_POLL_SEC     seconds between reads      (default 0.1)
#   WAKE_WORD_COOLDOWN_SEC  quiet time after a wake    (default 1.5, shared with upstream)
#
# Usage:
#   python3 wonderecho-wake.py --watch   # print every result ID, never exits on its own

import os
import signal
import sys
import time

try:
    import smbus
except ImportError:
    print("[WonderEcho] python3-smbus is missing: sudo apt install -y python3-smbus", file=sys.stderr, flush=True)
    sys.exit(1)

RESULT_REG = 0x64


def env_int(name, default):
    value = os.getenv(name, "").strip()
    return int(value, 0) if value else default


def env_float(name, default):
    value = os.getenv(name, "").strip()
    return float(value) if value else default


def parse_wake_ids(raw):
    raw = (raw or "any").strip().lower()
    if raw in ("", "any"):
        return None
    return {int(item, 0) for item in raw.split(",") if item.strip()}


def main():
    watch = "--watch" in sys.argv[1:]
    bus_num = env_int("WONDERECHO_I2C_BUS", 1)
    addr = env_int("WONDERECHO_I2C_ADDR", 0x34)
    wake_ids = parse_wake_ids(os.getenv("WONDERECHO_WAKE_IDS"))
    poll_sec = env_float("WONDERECHO_POLL_SEC", 0.1)
    cooldown_sec = env_float("WAKE_WORD_COOLDOWN_SEC", 1.5)

    # Upstream stops the listener with SIGTERM before each session; exit cleanly.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    try:
        bus = smbus.SMBus(bus_num)
    except OSError as e:
        print(f"[WonderEcho] cannot open /dev/i2c-{bus_num}: {e} (is I2C enabled?)", file=sys.stderr, flush=True)
        sys.exit(1)

    def read_result():
        return bus.read_byte_data(addr, RESULT_REG)

    # Drop whatever result is still latched from before this listener started,
    # so a restart between sessions doesn't wake on a stale ID.
    try:
        read_result()
    except OSError:
        pass

    ids_label = "any non-zero" if wake_ids is None else ",".join(hex(i) for i in sorted(wake_ids))
    print(f"[WonderEcho] READY bus={bus_num} addr={hex(addr)} wake_ids={ids_label}", flush=True)

    last_wake = 0.0
    last_error = 0.0
    while True:
        try:
            result = read_result()
        except OSError as e:
            now = time.monotonic()
            if now - last_error > 30:
                print(f"[WonderEcho] I2C read failed at {hex(addr)}: {e} (check wiring)", file=sys.stderr, flush=True)
                last_error = now
            time.sleep(1)
            continue

        if result:
            if watch:
                print(f"[WonderEcho] result {hex(result)} ({result})", flush=True)
            elif wake_ids is None or result in wake_ids:
                now = time.monotonic()
                if now - last_wake >= cooldown_sec:
                    last_wake = now
                    print(f"WAKE wonderecho {hex(result)}", flush=True)
        time.sleep(poll_sec)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
