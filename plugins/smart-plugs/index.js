// Smart-plug control for whisplay-ai-chatbot, as a drop-in llm-tools plugin.
//
// Copy this folder to ~/whisplay-ai-chatbot/plugins/ and list your plugs in the
// chatbot's .env; Claude then gets one tool, setPlug, that switches them over
// the LAN with no vendor cloud in the loop:
//
//   CLAUDIA_PLUGS=living room=kasa:192.168.1.42,desk lamp=shelly:192.168.1.43,fan=tasmota:192.168.1.44
//
// Kinds: kasa (python-kasa CLI), shelly (Gen2+ RPC), tasmota (Sonoff S31 reflashed).
// Kasa plugs on TP-Link's newer KLAP firmware also need KASA_USERNAME and
// KASA_PASSWORD (your TP-Link account). KASA_BINARY defaults to Claudia's venv.

const { execFile } = require("child_process");

const parsePlugs = (raw) =>
  (raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.lastIndexOf("=");
      const [kind, host] = entry.slice(eq + 1).split(":");
      return { name: entry.slice(0, eq).trim().toLowerCase(), kind: (kind || "").trim(), host: (host || "").trim() };
    })
    .filter((plug) => plug.name && plug.host && ["kasa", "shelly", "tasmota"].includes(plug.kind));

const httpGet = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

module.exports = {
  name: "claudia-smart-plugs",
  displayName: "Claudia smart plugs",
  version: "1.0.0",
  type: "llm-tools",
  description: "Switch local-control smart plugs (Kasa, Shelly, Tasmota) on or off",
  activate(ctx) {
    const env = ctx.env;
    const plugs = parsePlugs(env.CLAUDIA_PLUGS);
    const kasaBinary = env.KASA_BINARY || `${env.HOME}/claudia/venv/bin/kasa`;

    const runKasa = (host, on) =>
      new Promise((resolve, reject) => {
        const args = ["--host", host];
        if (env.KASA_USERNAME && env.KASA_PASSWORD) {
          args.push("--username", env.KASA_USERNAME, "--password", env.KASA_PASSWORD);
        }
        args.push(on ? "on" : "off");
        execFile(kasaBinary, args, { timeout: 15000 }, (err, _out, stderr) =>
          err ? reject(new Error(stderr || err.message)) : resolve()
        );
      });

    const switchPlug = (plug, on) => {
      if (plug.kind === "kasa") return runKasa(plug.host, on);
      if (plug.kind === "shelly") return httpGet(`http://${plug.host}/rpc/Switch.Set?id=0&on=${on}`);
      return httpGet(`http://${plug.host}/cm?cmnd=Power%20${on ? "On" : "Off"}`);
    };

    const getTools = () => {
      if (plugs.length === 0) return [];
      return [
        {
          type: "function",
          function: {
            name: "setPlug",
            description: "Turn one of the user's smart plugs on or off.",
            parameters: {
              type: "object",
              properties: {
                plug: { type: "string", description: "Which plug to switch", enum: plugs.map((p) => p.name) },
                state: { type: "string", description: "Whether to turn it on or off", enum: ["on", "off"] },
              },
              required: ["plug", "state"],
            },
          },
          // Results carry upstream's ToolReturnTag prefixes (src/type/index.ts).
          func: async (params) => {
            const plug = plugs.find((p) => p.name === String(params.plug || "").toLowerCase());
            if (!plug) return `[error]No plug named "${params.plug}".`;
            if (params.state !== "on" && params.state !== "off") return "[error]State must be on or off.";
            try {
              await switchPlug(plug, params.state === "on");
              return `[success]Turned ${plug.name} ${params.state}.`;
            } catch (e) {
              return `[error]Could not switch ${plug.name}: ${e.message}`;
            }
          },
        },
      ];
    };

    return { getTools };
  },
};
