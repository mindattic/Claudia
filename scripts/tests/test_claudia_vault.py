"""LAMP (CLA-T22): Claudia's settings and keys through MindAttic Vault, one test per setting.

Run: python -m unittest discover -s scripts/tests
"""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import claudia_vault as cv  # noqa: E402

PI_ENV = """# Claudia chatbot configuration
LLM_SERVER=anthropic
ANTHROPIC_API_KEY=sk-ant-today
ANTHROPIC_LLM_MODEL=claude-haiku-5-5
TTS_SERVER=piper
PIPER_MODEL_PATH=/home/pi/claudia/piper/en_US-amy-low.onnx
# ELEVENLABS_API_KEY=sk_REPLACE_ME
"""

# A distinct, valid "today's value" per mapped setting.
SAMPLE = {
    "llmServer": "openai", "anthropicLlmModel": "claude-sonnet-5-5", "anthropicMaxTokens": 4096,
    "systemPrompt": "You are Claudia, terse.", "asrServer": "openai", "ttsServer": "elevenlabs",
    "openAiVoiceModel": "gpt-4o-tts", "openAiVoiceType": "alloy", "elevenLabsVoiceId": "VOICE123",
    "elevenLabsModelId": "eleven_multilingual_v2", "elevenLabsStability": 0.3, "elevenLabsSimilarity": 0.9,
    "wakeWordEnabled": False, "wakeWordIdleTimeoutSec": 30, "wakeWordEndKeywords": "stop",
    "wonderEchoWakeIds": "5", "alsaInputDevice": "hw:1,0", "alsaOutputDevice": "hw:2,0",
}


class VaultCase(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="claudia-vault-")
        self.saved = {k: os.environ.get(k) for k in ("MINDATTIC_VAULT_ROAMING_ROOT", "MINDATTIC_VAULT_LOCAL_ROOT")}
        os.environ["MINDATTIC_VAULT_ROAMING_ROOT"] = os.path.join(self.root, "roaming")
        os.environ["MINDATTIC_VAULT_LOCAL_ROOT"] = os.path.join(self.root, "local")

    def tearDown(self):
        for k, v in self.saved.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
        shutil.rmtree(self.root, ignore_errors=True)


class SettingTests(VaultCase):
    pass


def _make_setting_test(prop, var):
    def test(self):
        value = SAMPLE.get(prop, "pi-value")
        if var:
            cv.import_env({var: cv._env_value(value).strip('"')})
            self.assertEqual(cv.load_settings()[prop], value, "the Pi's current value imported")
        settings = cv.load_settings()
        settings[prop] = value
        cv._write_json_atomic(cv.settings_path(), settings)
        with open(cv.settings_path(), encoding="utf-8") as f:
            self.assertEqual(json.load(f)[prop], value, "saved under its manifest name")
        if var:
            pushed = cv.parse_env(cv.merge_env(PI_ENV, cv.build_env_values(key_lookup=lambda p: None)))
            self.assertEqual(pushed[var], cv._env_value(value).strip('"'), "the push writes it into the Pi's .env")
        else:
            self.assertEqual(cv.load_settings()[prop], value, "used to reach the Pi over ssh")
    return test


for _prop, _var, *_ in cv.FIELDS:
    setattr(SettingTests, f"test_Setting_{_prop}_ImportsRoundTripsAndReachesThePi", _make_setting_test(_prop, _var))


class GuardTests(unittest.TestCase):
    def test_EverySettingHasItsOwnTest(self):
        names = dir(SettingTests)
        for f in cv.manifest()["fields"]:
            self.assertTrue(any(n.startswith(f"test_Setting_{f['property']}_") for n in names), f["property"])


class KeyTests(VaultCase):
    def test_PiKeysImportIntoTheSharedListsSkippingPlaceholders(self):
        cv.import_env(cv.parse_env(PI_ENV))
        self.assertEqual(cv.get_key("claude"), "sk-ant-today")
        self.assertIsNone(cv.get_key("elevenlabs"))
        cv.import_env(cv.parse_env(PI_ENV))
        self.assertEqual(len(cv.named_keys("claude")), 1, "importing twice adds nothing")

    def test_PushWritesVaultKeysAndKeepsOtherLines(self):
        cv._add_key("claude", "home", "sk-ant-vault")
        merged = cv.merge_env(PI_ENV, cv.build_env_values())
        env = cv.parse_env(merged)
        self.assertEqual(env["ANTHROPIC_API_KEY"], "sk-ant-vault")
        self.assertEqual(env["PIPER_MODEL_PATH"], "/home/pi/claudia/piper/en_US-amy-low.onnx", "lines Vault doesn't own are kept")
        self.assertIn("# Claudia chatbot configuration", merged)
        self.assertEqual(merged.count("ANTHROPIC_API_KEY="), 1)

    def test_ExistingAnthropicAliasEntryIsUsedAndKept(self):
        cv._write_json_atomic(cv._providers_path(), {"anthropic": {"type": "anthropic", "apiKey": "sk-a"}})
        self.assertEqual(cv.get_key("claude"), "sk-a")
        cv._add_key("claude", "second", "sk-b")
        with open(cv._providers_path(), encoding="utf-8") as f:
            data = json.load(f)
        self.assertNotIn("claude", data)
        self.assertEqual([e["label"] for e in data["anthropic"]["apiKeys"]], ["key1", "second"])


class ManifestTests(VaultCase):
    def test_SeedWritesDefaultsAndAValidManifestOnce(self):
        path = cv.seed()
        with open(path, encoding="utf-8") as f:
            m = json.load(f)
        self.assertEqual((m["schemaVersion"], m["appId"], m["configurationPrefix"]), (1, "Claudia", "MindAttic:Settings:Claudia"))
        self.assertTrue(all(f["label"] and f["help"] for f in m["fields"]))
        self.assertEqual([c["providerId"] for c in m["credentials"]], ["claude", "openai", "elevenlabs"])
        self.assertEqual(cv.load_settings(), cv.defaults())
        cv._write_json_atomic(cv.settings_path(), dict(cv.defaults(), piHost="kept"))
        cv.seed()
        self.assertEqual(cv.load_settings()["piHost"], "kept", "seeding never overwrites")

    def test_DefaultsMatchTheEnvTemplate(self):
        with open(os.path.join(os.path.dirname(__file__), "..", "..", "config", "env.template"), encoding="utf-8") as f:
            template = cv.parse_env(f.read())
        for prop, var, *_ in cv.FIELDS:
            if var in template:
                self.assertEqual(cv._env_value(cv.defaults()[prop]).strip('"'), template[var], var)


if __name__ == "__main__":
    unittest.main()
