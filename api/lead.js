// POST /api/lead — called by the contact form and the WhatsApp pop-up so every
// website enquiry is also saved to the leads sheet (and from there, the CRM).
const { allowedOrigin, rateLimited, readBody, saveLead, clip } = require("./_lib/leads");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!allowedOrigin(req)) return res.status(403).json({ ok: false });
  if (rateLimited(req, 10, 10 * 60 * 1000)) return res.status(429).json({ ok: false });

  const b = readBody(req);
  if (b._honey) return res.status(200).json({ ok: true }); // spam bot
  if (!clip(b.name, 100) || !(clip(b.phone, 30) || clip(b.email, 120))) {
    return res.status(400).json({ ok: false, error: "Name and a phone number or email are required" });
  }
  try {
    const id = await saveLead({
      source: ["Website form", "WhatsApp pop-up"].includes(b.source) ? b.source : "Website form",
      name: b.name,
      phone: b.phone,
      email: b.email,
      business: b.business,
      services: b.service,
      budget: b.budget,
      summary: b.message,
      page: b.page,
    });
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ ok: false });
  }
};
