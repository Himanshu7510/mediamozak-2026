// Google Ads lead form webhook. Paste the URL and key from CRM Settings into
// Google Ads → Lead form → Lead delivery → Webhook integration.
const { store, clip, readBody, finalizeLead } = require("../_lib/leads");
const { getConfig, hookKey } = require("../_lib/config");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ message: "Use POST" });
  const b = readBody(req);
  let cfg;
  try { cfg = await getConfig(); } catch (e) { return res.status(503).json({ message: "CRM unavailable, retry" }); }
  if (b.google_key !== hookKey("google", cfg.hookKeyVersion)) return res.status(401).json({ message: "Invalid google_key" });

  const col = {};
  for (const c of b.user_column_data || []) if (c && c.column_id) col[c.column_id] = c.string_value || "";
  const known = ["FULL_NAME", "FIRST_NAME", "LAST_NAME", "PHONE_NUMBER", "PHONE_NUMBER_VERIFIED", "WORK_PHONE", "EMAIL", "WORK_EMAIL", "CITY", "COMPANY_NAME"];
  const extra = (b.user_column_data || []).filter((c) => c && !known.includes(c.column_id)).map((c) => (c.column_name || c.column_id) + ": " + (c.string_value || ""));
  try {
    const r = await store("apiLead", {
      lead: {
        source: "Google ads",
        name: clip(col.FULL_NAME || [col.FIRST_NAME, col.LAST_NAME].filter(Boolean).join(" ") || "Google Ads lead", 100),
        phone: clip(col.PHONE_NUMBER || col.PHONE_NUMBER_VERIFIED || col.WORK_PHONE, 30),
        email: clip(col.EMAIL || col.WORK_EMAIL, 120), business: clip(col.COMPANY_NAME, 150), city: clip(col.CITY, 80),
        services: clip(extra.join(" "), 300),
        summary: [b.is_test ? "TEST LEAD sent from Google Ads" : "", "Google Ads lead form" + (b.campaign_id ? " · campaign " + b.campaign_id : "") + (b.form_id ? " · form " + b.form_id : ""), extra.join("\n")].filter(Boolean).join("\n").slice(0, 3000),
        ref: "google:" + clip(b.lead_id, 120),
      },
    });
    if (r.id) await finalizeLead(r.id, { servicesText: extra.join(" ") });
    return res.status(200).json({});
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Temporary error, please retry" });
  }
};
