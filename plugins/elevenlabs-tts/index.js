// ElevenLabs text-to-speech for whisplay-ai-chatbot, as a drop-in plugin.
//
// Upstream loads every folder under ~/whisplay-ai-chatbot/plugins/ at startup
// (src/plugin/loader.ts), so copying this folder there adds a "elevenlabs" TTS
// server without touching or rebuilding upstream source. Select it with
// TTS_SERVER=elevenlabs in the chatbot's .env. mp3-duration resolves from the
// chatbot's own node_modules.

const mp3Duration = require("mp3-duration");

module.exports = {
  name: "elevenlabs",
  displayName: "ElevenLabs TTS",
  version: "1.0.0",
  type: "tts",
  audioFormat: "mp3",
  description: "ElevenLabs text-to-speech (high-quality cloud voices)",
  activate(ctx) {
    const env = ctx.env;
    const apiKey = env.ELEVENLABS_API_KEY || "";
    const voiceId = env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; // "Bella"
    const modelId = env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5"; // low-latency
    const stability = parseFloat(env.ELEVENLABS_STABILITY || "0.5");
    const similarity = parseFloat(env.ELEVENLABS_SIMILARITY || "0.75");

    const ttsProcessor = async (text) => {
      if (!apiKey) {
        console.error("[ElevenLabs] ELEVENLABS_API_KEY is not set.");
        return { duration: 0 };
      }
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: { stability, similarity_boost: similarity },
          }),
        });
      } catch (e) {
        console.error("[ElevenLabs] request failed:", e);
        return { duration: 0 };
      }
      if (!res.ok) {
        console.error(`[ElevenLabs] HTTP ${res.status}: ${await res.text().catch(() => "")}`);
        return { duration: 0 };
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      // mp3-duration yields undefined for a stream it can't parse; never pass NaN on.
      const seconds = await mp3Duration(buffer).catch(() => 0);
      return { buffer, duration: (seconds || 0) * 1000 };
    };

    return { ttsProcessor };
  },
};
