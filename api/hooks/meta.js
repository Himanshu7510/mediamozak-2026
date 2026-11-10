// Meta (Facebook / Instagram) Lead Ads webhook.
// GET  /api/hooks/meta/ → subscription check (hub.verify_token = key from CRM Settings)
// POST /api/hooks/meta/ → "leadgen" events; the lead is fetched with the Page access token.
const crypto = require("crypto");
const { store, clip, finalizeLead } = require("../_lib/leads");
const { getConfig, getSecret, hookKey } = require("../_lib/config");

// Read the raw body for the signature check without touching req.body first
// (on Vercel, reading req.body consumes the stream).
function readRaw(req) {
  return new Promise((resolve) => {
    if (req.readableEnded) return resolve(null);
    const chunks = [];
    const t = setTimeout(() => resolve(chunks.length ? Buffer.concat(chunks).toString("utf8") : null), 4000);
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => { clearTimeout(t); resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", () => { clearTimeout(t); resolve(null); });
  });
}

module.exports = async (req, res) => {
  let cfg;
  try { cfg = await getConfig(); } catch (e) { return res.status(503).send("CRM unavailable"); }
  const verifyToken = hookKey("meta", cfg.hookKeyVersion);

  if (req.method === "GET") {
    const q = req.query || {};
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === verifyToken) return res.status(200).send(String(q["hub.challenge"] || ""));
    return res.status(403).send("Verification failed");
  }
  if (req.method !== "POST") return res.status(405).end();

  const raw = await readRaw(req);
  let body = {};
  try { body = raw ? JSON.parse(raw) : (req.body && typeof req.body === "object" ? req.body : {}); } catch (e) { return res.status(400).end(); }

  // Signature check when the App Secret is saved in Settings.
  const appSecret = await getSecret("META_APP_SECRET");
  if (appSecret) {
    const sig = String(req.headers["x-hub-signature-256"] || "");
    const want = "sha256=" + crypto.createHmac("sha256", appSecret).update(raw || JSON.stringify(body)).digest("hex");
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return res.status(401).send("Bad signature");
  }

  const token = await getSecret("META_PAGE_TOKEN");
  const ids = [];
  for (const entry of body.entry || []) for (const ch of entry.changes || []) if (ch.field === "leadgen" && ch.value && ch.value.leadgen_id) ids.push(ch.value);

  for (const v of ids) {
    try {
      let fields = {}, info = {};
      if (token) {
        const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(v.leadgen_id)}?fields=field_data,created_time,ad_name,campaign_name,form_id,platform&access_token=${encodeURIComponent(token)}`);
        info = await r.json().catch(() => ({}));
        for (const f of info.field_data || []) fields[String(f.name).toLowerCase()] = (f.values || []).join(", ");
      }
      const get = (...keys) => { for (const k of keys) if (fields[k]) return fields[k]; return ""; };
      const extra = Object.keys(fields).filter((k) => !["full_name", "first_name", "last_name", "phone_number", "email", "city", "company_name"].includes(k)).map((k) => k.replace(/_/g, " ") + ": " + fields[k]);
      const r = await store("apiLead", {
        lead: {
          source: "Meta ads",
          name: clip(get("full_name") || [get("first_name"), get("last_name")].filter(Boolean).join(" ") || "Meta lead", 100),
          phone: clip(get("phone_number", "phone", "mobile_number"), 30), email: clip(get("email"), 120),
          business: clip(get("company_name"), 150), city: clip(get("city"), 80),
          services: clip(extra.join(" "), 300),
          summary: [token ? "" : "Meta lead id " + v.leadgen_id + " — add the Page access token in CRM Settings to fetch the details.",
            info.campaign_name ? "Campaign: " + info.campaign_name : "", info.ad_name ? "Ad: " + info.ad_name : "", info.platform ? "Platform: " + info.platform : "", extra.join("\n")].filter(Boolean).join("\n").slice(0, 3000),
          ref: "meta:" + v.leadgen_id,
        },
      });
      if (r.id) await finalizeLead(r.id, { servicesText: extra.join(" ") });
    } catch (e) {
      console.error("meta lead", v.leadgen_id, e);
    }
  }
  return res.status(200).send("EVENT_RECEIVED");
};
