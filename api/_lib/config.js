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

const secrets = {};
// Other secrets saved in CRM Settings (Meta page token, app secret), cached per instance.
async function getSecret(key) {
  const c = secrets[key];
  if (c && Date.now() - c.at < TTL) return c.value;
  const value = (await store("getSecret", { key }).catch(() => ({}))).value || "";
  secrets[key] = { at: Date.now(), value };
  return value;
}

function clearCache() { cache = { at: 0, cfg: null, anthropic: null }; for (const k in secrets) delete secrets[k]; }

// Keys shown in CRM Settings for platform webhooks (Meta verify token, Google Ads key).
function hookKey(kind, version) {
  const v = String(version || "1");
  return "mm" + kind + "_" + v + "_" + crypto.createHmac("sha256", process.env.LEADS_SECRET || "").update("hook:" + kind + ":" + v).digest("base64url").slice(0, 28);
}

// Lead API key = HMAC of the server secret and a version number, so it can be
// regenerated from CRM Settings without touching Vercel.
function leadApiKey(version) {
  const v = String(version || "1");
  return "mmk_" + v + "_" + crypto.createHmac("sha256", process.env.LEADS_SECRET || "").update("lead-api:" + v).digest("base64url").slice(0, 32);
}

module.exports = { getConfig, getAnthropicKey, getSecret, clearCache, leadApiKey, hookKey };
