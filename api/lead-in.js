// POST /api/lead-in — Lead API. Other tools (Zapier, Meta Lead Ads, JustDial,
// another website, Google Forms…) send leads straight into the CRM.
// Auth: header "X-API-Key: <key>" (or ?key=<key>). Key is shown in CRM → Settings.
const crypto = require("crypto");
const { rateLimited, readBody, store, clip, finalizeLead } = require("./_lib/leads");
const { getConfig, leadApiKey } = require("./_lib/config");

const SOURCES = ["Website form", "AI chatbot", "Meta ads", "Google ads", "IndiaMART", "JustDial", "Referral", "Cold call / email", "Instagram / WhatsApp", "LinkedIn", "Walk-in / event", "Other"];
function pickSource(s) {
  const t = String(s || "").toLowerCase();
  if (!t) return "Other";
  const exact = SOURCES.find((x) => x.toLowerCase() === t);
  if (exact) return exact;
  if (/facebook|instagram|meta/.test(t)) return /whatsapp|dm|organic/.test(t) ? "Instagram / WhatsApp" : "Meta ads";
  if (/google|adwords|youtube/.test(t)) return "Google ads";
  if (/justdial|just dial/.test(t)) return "JustDial";
  if (/indiamart/.test(t)) return "IndiaMART";
  if (/linkedin/.test(t)) return "LinkedIn";
  if (/whatsapp/.test(t)) return "Instagram / WhatsApp";
  if (/refer/.test(t)) return "Referral";
  if (/website|form|landing/.test(t)) return "Website form";
  return "Other";
}
const pick = (o, keys) => { for (const k of keys) { const v = o[k] ?? o[k.toLowerCase()] ?? o[k.toUpperCase()]; if (v != null && String(v).trim()) return String(v); } return ""; };

function parse(req) {
  let b = req.body;
  if (typeof b === "string") {
    try { b = JSON.parse(b); } catch (e) { b = Object.fromEntries(new URLSearchParams(b)); }
  }
  b = b && typeof b === "object" ? b : {};
  // Meta / Zapier style: {field_data:[{name, values:[...]}]}
  if (Array.isArray(b.field_data)) for (const f of b.field_data) if (f && f.name) b[f.name] = Array.isArray(f.values) ? f.values.join(", ") : f.values;
  return Object.assign({}, req.query || {}, b);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  // GET is allowed for platforms that push with query parameters (e.g. JustDial).
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ ok: false, error: "Use POST or GET" });
  if (rateLimited(req, 60, 10 * 60 * 1000)) return res.status(429).json({ ok: false, error: "Too many requests" });

  const given = String(req.headers["x-api-key"] || (req.query && req.query.key) || "");
  let cfg;
  try { cfg = await getConfig(); } catch (e) { return res.status(502).json({ ok: false, error: "CRM unavailable" }); }
  const want = leadApiKey(cfg.leadApiVersion);
  const ok = given.length === want.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
  if (!ok) return res.status(401).json({ ok: false, error: "Invalid API key" });

  const b = parse(req);
  const name = pick(b, ["name", "full_name", "fullName", "contact", "contact_name", "first_name", "SENDER_NAME"]);
  const phone = pick(b, ["phone", "phone_number", "mobile", "whatsapp", "contact_number", "SENDER_MOBILE"]);
  delete b.key;
  const email = pick(b, ["email", "email_address", "SENDER_EMAIL"]);
  if (!name && !phone && !email) return res.status(400).json({ ok: false, error: "Send at least a name, phone or email" });
  const service = pick(b, ["service", "services", "interested_in", "requirement", "product", "category"]);
  const message = pick(b, ["message", "notes", "comments", "query", "description", "requirement_details"]);
  const extId = pick(b, ["id", "lead_id", "leadid", "leadgen_id", "external_id"]);
  const source = pickSource(pick(b, ["source", "lead_source", "platform", "utm_source"]));

  try {
    const r = await store("apiLead", {
      lead: {
        source, name: clip(name || "Unknown", 100), phone: clip(phone, 30), email: clip(email, 120),
        business: clip(pick(b, ["business", "company", "company_name", "business_name"]), 150), city: clip([pick(b, ["city", "location"]), pick(b, ["area"])].filter(Boolean).join(", "), 80),
        services: clip(service, 300), budget: clip(pick(b, ["budget"]), 60),
        summary: [message, pick(b, ["campaign", "campaign_name", "ad_name", "form_name"]) ? "Campaign/form: " + pick(b, ["campaign", "campaign_name", "ad_name", "form_name"]) : ""].filter(Boolean).join("\n").slice(0, 3000),
        ref: extId ? clip("api:" + source + ":" + extId, 200) : "",
      },
    });
    if (r.id) await finalizeLead(r.id, { servicesText: service || message });
    return res.status(200).json({ ok: true, id: r.id || null, duplicate: !!r.duplicate });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ ok: false, error: "Could not save the lead" });
  }
};
