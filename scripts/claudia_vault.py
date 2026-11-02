"""Claudia's chatbot settings and keys from MindAttic Vault, pushed to the Pi's .env.

Vault (edited in MindAttic.Vault.Desktop) is the one place Claudia's settings and keys live on your PC:
  settings  %APPDATA%\\MindAttic\\Claudia\\settings.json   (Pi host + the chatbot's .env values)
  keys      the shared claude / openai / elevenlabs named keys (Claudia's assigned ones first)

  python scripts/claudia_vault.py --write-settings-manifest   seed defaults + manifest (no Pi needed)
  python scripts/claudia_vault.py --pull                      import the Pi's current .env into Vault once
  python scripts/claudia_vault.py --push                      write Vault's values into the Pi's .env and restart
Standard library only; talks to the Pi with the system ssh client.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

APP_ID = "Claudia"
PREFIX = f"MindAttic:Settings:{APP_ID}"
REMOTE_ENV = "~/whisplay-ai-chatbot/.env"

# (property, env var or None, label, group, help, kind, default, choices)
FIELDS = [
    ("piHost", None, "Pi host", "Device", "SSH host of the Pi, e.g. claudia.local.", "Text", "claudia.local", None),
    ("piUser", None, "Pi user", "Device", "Username on the Pi.", "Text", "", None),
    ("llmServer", "LLM_SERVER", "LLM", "Brain", "Which LLM answers.", "Choice", "anthropic", ["anthropic", "openai", "gemini"]),
    ("anthropicLlmModel", "ANTHROPIC_LLM_MODEL", "Claude model", "Brain", "Model id; a small fast model suits spoken answers.", "Text", "claude-haiku-5-5", None),
    ("anthropicMaxTokens", "ANTHROPIC_MAX_TOKENS", "Max tokens", "Brain", "Room for the reply plus the model's thinking.", "Integer", 2048, None),
    ("systemPrompt", "SYSTEM_PROMPT", "System prompt", "Brain", "Shapes Claudia's voice.", "Multiline",
     "You are Claudia, a concise, friendly voice assistant. Keep answers to one to three spoken sentences unless asked for more.", None),
    ("asrServer", "ASR_SERVER", "Speech to text", "Speech", "vosk is local and free; openai is faster and needs an OpenAI key.", "Choice", "vosk", ["vosk", "openai", "whisper", "faster-whisper"]),
    ("ttsServer", "TTS_SERVER", "Text to speech", "Speech", "piper is local; openai and elevenlabs are cloud voices.", "Choice", "piper", ["piper", "openai", "elevenlabs", "espeak-ng"]),
    ("openAiVoiceModel", "OPENAI_VOICE_MODEL", "OpenAI voice model", "Speech", "Used when Text to speech is openai.", "Text", "gpt-4o-mini-tts", None),
    ("openAiVoiceType", "OPENAI_VOICE_TYPE", "OpenAI voice", "Speech", "Voice name, e.g. nova.", "Text", "nova", None),
    ("elevenLabsVoiceId", "ELEVENLABS_VOICE_ID", "ElevenLabs voice id", "Speech", "From ElevenLabs VoiceLab.", "Text", "EXAVITQu4vr4xnSDxMaL", None),
    ("elevenLabsModelId", "ELEVENLABS_MODEL_ID", "ElevenLabs model", "Speech", "eleven_turbo_v2_5 has the lowest latency.", "Text", "eleven_turbo_v2_5", None),
    ("elevenLabsStability", "ELEVENLABS_STABILITY", "ElevenLabs stability", "Speech", "0 to 1.", "Decimal", 0.5, None),
    ("elevenLabsSimilarity", "ELEVENLABS_SIMILARITY", "ElevenLabs similarity", "Speech", "0 to 1.", "Decimal", 0.75, None),
    ("wakeWordEnabled", "WAKE_WORD_ENABLED", "Wake word", "Wake word", "Wake on the WonderEcho's own detector.", "Bool", True, None),
    ("wakeWordIdleTimeoutSec", "WAKE_WORD_IDLE_TIMEOUT_SEC", "Idle timeout (s)", "Wake word", "Session ends after this much silence.", "Integer", 60, None),
    ("wakeWordEndKeywords", "WAKE_WORD_END_KEYWORDS", "End keywords", "Wake word", "Comma-separated words that end a session.", "Text", "byebye,goodbye,stop", None),
    ("wonderEchoWakeIds", "WONDERECHO_WAKE_IDS", "WonderEcho wake ids", "Wake word", "Result ids that count as a wake, or any.", "Text", "any", None),
    ("alsaInputDevice", "ALSA_INPUT_DEVICE", "Microphone device", "Audio", "ALSA input device.", "Text", "default", None),
    ("alsaOutputDevice", "ALSA_OUTPUT_DEVICE", "Speaker device", "Audio", "ALSA output device.", "Text", "default", None),
]
# env var -> Vault provider
KEYS = {"ANTHROPIC_API_KEY": "claude", "OPENAI_API_KEY": "openai", "ELEVENLABS_API_KEY": "elevenlabs"}
PURPOSE = {"claude": ("Claudia's answers (LLM_SERVER=anthropic).", True),
           "openai": ("OpenAI speech to text or voice, when chosen.", False),
           "elevenlabs": ("ElevenLabs voice, when chosen.", False)}


def _root(var, env_base, fallback):
    override = os.environ.get(var, "").strip()
    if override:
        return override
    return os.path.join(os.environ.get(env_base) or os.path.join(os.path.expanduser("~"), *fallback), "MindAttic")


def roaming_root():
    return _root("MINDATTIC_VAULT_ROAMING_ROOT", "APPDATA", (".config",))


def local_root():
    return _root("MINDATTIC_VAULT_LOCAL_ROOT", "LOCALAPPDATA", (".local", "share"))


def app_dir():
    return os.path.join(roaming_root(), APP_ID)


def settings_path():
    return os.path.join(app_dir(), "settings.json")


def _read_json(path):
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _write_json_atomic(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def defaults():
    return {f[0]: f[6] for f in FIELDS}


def load_settings():
    saved = _read_json(settings_path())
    merged = defaults()
    if isinstance(saved, dict):
        merged.update({k: v for k, v in saved.items() if k in merged})
    return merged


def manifest():
    fields = []
    for order, (prop, _, label, group, help_text, kind, default, choices) in enumerate(FIELDS, start=1):
        f = {"name": f"{PREFIX}:{prop}", "property": prop, "label": label, "group": group, "help": help_text,
             "order": order, "kind": kind, "readOnly": False, "nullable": False, "default": default}
        if choices:
            f["choices"] = [{"value": c, "label": c} for c in choices]
        fields.append(f)
    return {"schemaVersion": 1, "appId": APP_ID, "displayName": "Claudia", "icon": "mic",
            "description": "Raspberry Pi voice assistant. Save here, then run scripts/claudia_vault.py --push.",
            "scope": "Roaming", "settingsFile": "settings.json", "configurationPrefix": PREFIX, "fields": fields,
            "credentials": [{"providerId": p, "displayName": p.capitalize(), "required": PURPOSE[p][1], "purpose": PURPOSE[p][0]}
                            for p in KEYS.values()]}


def write_manifest():
    path = os.path.join(app_dir(), "settings.manifest.json")
    data = manifest()
    if _read_json(path) != data:
        _write_json_atomic(path, data)
    return path


def seed():
    if not os.path.exists(settings_path()):
        _write_json_atomic(settings_path(), defaults())
    return write_manifest()


# --- keys (same naming and order rules as MindAttic.Vault's NamedKeyStore) ---

def _providers_path():
    return os.path.join(roaming_root(), "LLM", "providers.json")


def named_keys(provider):
    data = _read_json(_providers_path()) or {}
    ids = {"claude": ["claude", "anthropic"], "gemini": ["gemini", "google"], "grok": ["grok", "xai"]}.get(provider, [provider])
    raw = []
    for pid in ids:
        entry = data.get(pid)
        if not isinstance(entry, dict):
            continue
        pool = entry.get("apiKeys") if isinstance(entry.get("apiKeys"), list) else []
        found = [(i.get("label"), i["key"].strip(), i.get("disabled") is True) for i in pool
                 if isinstance(i, dict) and isinstance(i.get("key"), str) and i["key"].strip()]
        if not found and isinstance(entry.get("apiKey"), str) and entry["apiKey"].strip():
            found = [(None, entry["apiKey"].strip(), False)]
        raw += [r for r in found if all(r[1] != x[1] for x in raw)]
    used, named, pending = set(), [None] * len(raw), []
    for i, (label, key, disabled) in enumerate(raw):
        label = (label or "").strip()
        if not label or ":" in label:
            pending.append(i)
            continue
        unique, n = label, 2
        while unique.lower() in used:
            unique, n = f"{label} ({n})", n + 1
        used.add(unique.lower())
        named[i] = (unique, key, disabled)
    n = 1
    for i in pending:
        while f"key{n}" in used:
            n += 1
        used.add(f"key{n}")
        named[i] = (f"key{n}", raw[i][1], raw[i][2])
    return named


def _assignment(provider):
    data = _read_json(os.path.join(roaming_root(), "Vault", "key-assignments.json")) or {}
    for app, by in data.items():
        if app.lower() == APP_ID.lower() and isinstance(by, dict) and isinstance(by.get(provider), list):
            return [n for n in by[provider] if isinstance(n, str)]
    return []


def get_key(provider):
    keys = named_keys(provider)
    order = _assignment(provider)
    if order:
        by = {k[0].lower(): k for k in keys}
        keys = [by[n.lower()] for n in order if n.lower() in by]
    health = (_read_json(os.path.join(local_root(), "Vault", "key-health.json")) or {}).get(provider) or {}
    now = datetime.now(timezone.utc)

    def unhealthy(name):
        h = health.get(name) or {}
        until = h.get("coolDownUntilUtc")
        try:
            cooling = isinstance(until, str) and datetime.fromisoformat(until.replace("Z", "+00:00")) > now
        except ValueError:
            cooling = False
        return h.get("failed") is True or cooling

    return next((k for n, k, d in keys if not d and not unhealthy(n)), None)


# --- the Pi's .env ---

def _env_value(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    text = str(value)
    if "\n" in text or "\r" in text:
        # A Multiline value (the system prompt) must stay on one .env line; dotenv turns
        # \n back into a newline inside double quotes.
        return '"' + text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n") + '"'
    return f'"{text}"' if any(c in text for c in " #\"'") else text


def build_env_values(settings=None, key_lookup=get_key):
    """The .env lines Vault owns: every mapped setting plus each key Vault has."""
    settings = settings or load_settings()
    values = {var: _env_value(settings[prop]) for prop, var, *_ in FIELDS if var}
    for var, provider in KEYS.items():
        key = key_lookup(provider)
        if key:
            values[var] = key
    return values


def merge_env(existing_text, values):
    """Rewrites the keys Vault owns in an .env, keeping every other line and comment as is."""
    out, seen = [], set()
    for line in existing_text.splitlines():
        stripped = line.lstrip()
        key = stripped.split("=", 1)[0].lstrip("# ").strip() if "=" in stripped else None
        is_comment = stripped.startswith("#")
        if key in values and (not is_comment or key not in seen):
            if key not in seen:
                out.append(f"{key}={values[key]}")
                seen.add(key)
            continue
        out.append(line)
    out += [f"{k}={v}" for k, v in values.items() if k not in seen]
    return "\n".join(out) + "\n"


def parse_env(text):
    values = {}
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            quote, v = v[0], v[1:-1]
            if quote == '"':
                v = v.replace("\\n", "\n")
        values[k.strip()] = v
    return values


def import_env(values):
    """--pull: today's Pi .env values into Vault settings; keys into the shared lists (deduplicated) and Claudia's assignment."""
    settings = load_settings()
    for prop, var, *_rest in FIELDS:
        if var and var in values and values[var] != "":
            default = defaults()[prop]
            raw = values[var]
            try:
                settings[prop] = (raw.lower() == "true") if isinstance(default, bool) else type(default)(raw) if isinstance(default, (int, float)) else raw
            except ValueError:
                settings[prop] = raw
    _write_json_atomic(settings_path(), settings)
    for var, provider in KEYS.items():
        key = values.get(var, "").strip()
        if key and "REPLACE" not in key and all(k != key for _, k, _ in named_keys(provider)):
            _add_key(provider, f"{APP_ID} (imported)", key)
    write_manifest()


def _add_key(provider, name, value):
    path = _providers_path()
    data = _read_json(path) or {}
    pid = next((p for p in ({"claude": ["claude", "anthropic"]}.get(provider, [provider])) if p in data), provider)
    entry = data.get(pid) if isinstance(data.get(pid), dict) else {"type": "anthropic" if provider == "claude" else "bearer"}
    pool = named_keys(provider)
    taken = {n.lower() for n, _, _ in pool}
    unique, i = name, 2
    while unique.lower() in taken:
        unique, i = f"{name} {i}", i + 1
    pool.append((unique, value, False))
    entry["apiKey"] = next((k for _, k, d in pool if not d), "")
    entry["apiKeys"] = [dict({"key": k, "label": n}, **({"disabled": True} if d else {})) for n, k, d in pool]
    data[pid] = entry
    _write_json_atomic(path, dict(sorted(data.items(), key=lambda kv: kv[0].lower())))
    assignments_path = os.path.join(roaming_root(), "Vault", "key-assignments.json")
    a = _read_json(assignments_path) or {}
    by = a.setdefault(APP_ID, {})
    by[provider] = [unique] + [n for n in by.get(provider, []) if n.lower() != unique.lower()]
    _write_json_atomic(assignments_path, a)


def _ssh(settings, command, stdin=None):
    host = settings["piHost"] if not settings.get("piUser") else f'{settings["piUser"]}@{settings["piHost"]}'
    # Bytes, not text=True: text mode on Windows encodes with the ANSI codepage and turns
    # every \n into \r\n, so the Pi's UTF-8 .env would come back mangled or with CRLFs.
    r = subprocess.run(["ssh", host, command], input=None if stdin is None else stdin.encode("utf-8"),
                       capture_output=True, timeout=60)
    r.stdout = r.stdout.decode("utf-8", "replace")
    r.stderr = r.stderr.decode("utf-8", "replace")
    return r


def main(argv):
    if "--write-settings-manifest" in argv:
        print(seed())
        return 0
    seed()
    settings = load_settings()
    if "--pull" in argv:
        r = _ssh(settings, f"cat {REMOTE_ENV}")
        if r.returncode != 0:
            print(f"Couldn't read {REMOTE_ENV} on {settings['piHost']}: {r.stderr.strip()}", file=sys.stderr)
            return 1
        import_env(parse_env(r.stdout))
        print("Imported the Pi's .env into MindAttic Vault.")
        return 0
    if "--push" in argv:
        r = _ssh(settings, f"cat {REMOTE_ENV} 2>/dev/null || true")
        if r.returncode != 0:
            # The remote command itself always succeeds, so this is ssh failing; writing now
            # would replace the Pi's .env with only Vault's keys and drop every other line.
            print(f"Couldn't read {REMOTE_ENV} on {settings['piHost']}: {r.stderr.strip()}", file=sys.stderr)
            return 1
        merged = merge_env(r.stdout, build_env_values(settings))
        w = _ssh(settings, f"umask 077 && cat > {REMOTE_ENV}.tmp && mv {REMOTE_ENV}.tmp {REMOTE_ENV} && "
                           f"(sudo systemctl restart chatbot.service 2>/dev/null || true)", stdin=merged)
        if w.returncode != 0:
            print(f"Couldn't write {REMOTE_ENV}: {w.stderr.strip()}", file=sys.stderr)
            return 1
        print(f"Pushed Vault's settings and keys to {settings['piHost']}.")
        return 0
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
