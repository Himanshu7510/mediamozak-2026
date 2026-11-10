// GET /api/health — shows whether the chatbot and lead inbox are configured
// (true/false only; never returns the values).
const { getAnthropicKey } = require("./_lib/config");
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  const key = await getAnthropicKey().catch(() => "");
  res.status(200).json({
    chatbot: Boolean(key),
    leadInbox: Boolean(process.env.LEADS_WEBHOOK_URL && process.env.LEADS_SECRET),
  });
};
