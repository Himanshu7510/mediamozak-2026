// Settings stored in the CRM backend (Apps Script properties), cached per instance.
const crypto = require("crypto");
const { store } = require("./leads");

let cache = { at: 0, cfg: null, anthropic: null };
const TTL = 5 * 60 * 1000;

async function getConfig(force) {
  if (!force && cache.cfg && Date.now() - cache.at < TTL) return cache.cfg;
  const cfg = await store("getConfig");
  cache = { at: Date.now(), cfg, anthropic: cache.anthropic };
  return cfg;
}

// Chatbot key: a Vercel env var wins; otherwise the key saved in CRM Settings.
async function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (cache.anthropic !== null && Date.now() - cache.at < TTL) return cache.anthropic;
  const cfg = await getConfig().catch(() => null);
  let key = "";
  if (cfg && cfg.anthropicSet) key = (await store("getSecret", { key: "ANTHROPIC_API_KEY" }).catch(() => ({}))).value || "";
  cache.anthropic = key;
  return key;
}

function clearCache() { cache = { at: 0, cfg: null, anthropic: null }; }

// Lead API key = HMAC of the server secret and a version number, so it can be
// regenerated from CRM Settings without touching Vercel.
function leadApiKey(version) {
  const v = String(version || "1");
  return "mmk_" + v + "_" + crypto.createHmac("sha256", process.env.LEADS_SECRET || "").update("lead-api:" + v).digest("base64url").slice(0, 32);
}

module.exports = { getConfig, getAnthropicKey, clearCache, leadApiKey };
