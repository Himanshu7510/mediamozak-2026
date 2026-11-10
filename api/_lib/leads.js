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

async function saveLead(lead) {
  const url = process.env.LEADS_WEBHOOK_URL;
  const secret = process.env.LEADS_SECRET;
  if (!url || !secret) throw new Error("Lead inbox is not configured");
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
    summary: String(lead.summary == null ? "" : lead.summary).trim().slice(0, 2000),
    page: clip(lead.page, 300),
    language: clip(lead.language, 20),
  };
  // Apps Script answers with a 302 to the result; fetch follows it.
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret, lead: clean }),
    redirect: "follow",
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch (e) {}
  if (!r.ok || !j.ok) {
    const hint = (text.match(/<title>([^<]*)<\/title>/i) || [])[1] || text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error("Lead inbox rejected the lead (" + r.status + "): " + (j.error || hint));
  }
  return j.id;
}

module.exports = { allowedOrigin, rateLimited, readBody, saveLead, clip };
