// GET /api/health — shows whether the chatbot and lead inbox are configured
// (true/false only; never returns the values).
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    chatbot: Boolean(process.env.ANTHROPIC_API_KEY),
    leadInbox: Boolean(process.env.LEADS_WEBHOOK_URL && process.env.LEADS_SECRET),
  });
};
