// Shared helpers for the website lead pipeline.
// A lead is forwarded to the Google Apps Script web app behind the
// "Mediamozak Website Leads" sheet (LEADS_WEBHOOK_URL), which appends a row
// and emails the team. An hourly task then imports new rows into the CRM.

const ALLOWED_HOSTS = [/^(www\.)?mediamozak\.(com|in)$/, /^mediamozak-2026[a-z0-9-]*\.vercel\.app$/, /^localhost(:\d+)?$/];

function allowedOrigin(req) {
  const src = req.headers.origin || req.headers.referer || "";
  try {
    return ALLOWED_HOSTS.some((re) => re.test(new URL(src).host));
  } catch (e) {
    return false;
  }
}

// Best-effort per-instance rate limit (serverless instances are short-lived).
const hits = new Map();
function rateLimited(req, limit, windowMs) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

function readBody(req) {
  let b = req.body;
  if (typeof b === "string") {
    try { b = JSON.parse(b); } catch (e) { b = {}; }
  }
  return b && typeof b === "object" ? b : {};
}

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

// Calls the Apps Script backend behind the leads sheet.
async function store(action, payload) {
  const url = process.env.LEADS_WEBHOOK_URL;
  const secret = process.env.LEADS_SECRET;
  if (!url || !secret) throw new Error("Lead inbox is not configured");
  // Apps Script answers with a 302 to the result; fetch follows it.
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ secret, action }, payload || {})),
    redirect: "follow",
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch (e) {}
  if (!r.ok || !j.ok) {
    const body = (text.match(/<body[\s\S]*?<\/body>/i) || [text])[0];
    const hint = body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    const err = new Error("Lead backend error on " + action + " (" + r.status + "): " + (j.error || hint));
    err.code = j.error;
    throw err;
  }
  return j;
}

async function saveLead(lead) {
  const clean = {
    source: clip(lead.source, 40),
    name: clip(lead.name, 100),
    phone: clip(lead.phone, 30),
    email: clip(lead.email, 120),
    business: clip(lead.business, 150),
    city: clip(lead.city, 80),
    services: clip(lead.services, 300),
    budget: clip(lead.budget, 60),
    callTime: clip(lead.callTime, 120),
    callDate: /^\d{4}-\d{2}-\d{2}$/.test(lead.callDate || "") ? lead.callDate : "",
    summary: String(lead.summary == null ? "" : lead.summary).trim().slice(0, 3000),
    transcript: String(lead.transcript == null ? "" : lead.transcript).slice(0, 40000),
    page: clip(lead.page, 300),
    language: clip(lead.language, 20),
  };
  const j = await store("lead", { lead: clean });
  return j.id;
}

// Decide the marketing channel from the visitor's landing-page tags.
function adChannel(a) {
  if (!a || typeof a !== "object") return null;
  const src = String(a.utm_source || "").toLowerCase(), med = String(a.utm_medium || "").toLowerCase();
  const paid = /cpc|ppc|paid|ads?\b|display|video|cpm|sem/.test(med);
  if (a.gclid || (/google|youtube|adwords/.test(src) && paid)) return "Google ads";
  if (/facebook|^fb$|instagram|^ig$|meta|whatsapp/.test(src) && (paid || /paid_social|social_paid/.test(med))) return "Meta ads";
  if (med === "paid_social") return "Meta ads";
  return null;
}

function describeAttribution(a) {
  if (!a || typeof a !== "object") return "";
  const parts = [];
  if (a.gclid) parts.push("Google Ads click");
  if (a.fbclid) parts.push("Facebook/Instagram click");
  if (a.utm_source) parts.push("utm_source=" + clip(a.utm_source, 60));
  if (a.utm_medium) parts.push("utm_medium=" + clip(a.utm_medium, 60));
  if (a.utm_campaign) parts.push("campaign=" + clip(a.utm_campaign, 100));
  if (a.referrer) parts.push("referrer " + clip(a.referrer, 200));
  if (a.landing) parts.push("landed on " + clip(a.landing, 200));
  return parts.length ? "Visitor came from: " + parts.join(", ") : "";
}

// Map what the visitor picked or said onto the CRM's service list
// (grouped like mediamozak.com/services).
const W = "Web Development Services", SM = "Social Media Marketing Services", P = "Performance Marketing Services",
  E = "E-com Marketing", Q = "Quick-com Marketing", L = "Lead Generation Services", S = "Search Engine Optimization (SEO)";
const SERVICE_RULES = [
  [/web ?dev|website|web site|landing page|web ?app|portal|wordpress|\bcms\b|redesign|वेबसाइट|site banwa/i, W],
  [/social media|smm|instagram page|facebook page|reel|influencer|content creation|community/i, SM],
  [/performance|google ads?|adwords|\bppc\b|meta ads?|facebook ads?|instagram ads?|youtube ads?|paid ads?|pixel|conversion api/i, P],
  [/e-?com(merce)? marketing|shopify|woocommerce|online store|abandon|catalog|remarketing|retarget/i, E],
  [/quick-?com|blinkit|zepto|instamart|swiggy instamart/i, Q],
  [/lead gen|more leads|leads chahiye|enquir(y|ies)|funnel|\bcrm\b|linkedin|nurtur|drip/i, L],
  [/\bseo\b|search engine|google (rank|ranking|maps|business)|\bgmb\b|organic|backlink|local seo/i, S],
];
const ORDER = [W, SM, P, E, Q, L, S, "Other"];
function mapServices(text) {
  const t = String(text || "").trim();
  const got = new Set();
  for (const [re, label] of SERVICE_RULES) if (re.test(t)) got.add(label);
  if (/not sure|multiple services/i.test(t) && !got.size) return [];
  if (!got.size && t && /\w{4,}/.test(t)) got.add("Other");
  return ORDER.filter((x) => got.has(x));
}

// After a website lead is saved: set the services from the website's own names,
// and relabel it as an ad lead when the landing tags say so.
async function finalizeLead(id, { attribution, servicesText } = {}) {
  if (!id) return;
  const channel = adChannel(attribution);
  const note = describeAttribution(attribution);
  const services = mapServices(servicesText);
  const patch = {};
  if (channel) patch.source = channel;
  if (services.length) patch.services = services;
  if (!Object.keys(patch).length && !note) return;
  await store("patch", { id, patch, note: note || "", by: "Website" }).catch((e) => console.error(e));
}
const tagAdLead = (id, attribution) => finalizeLead(id, { attribution });

module.exports = { allowedOrigin, rateLimited, readBody, saveLead, store, clip, tagAdLead, finalizeLead, mapServices, adChannel };
