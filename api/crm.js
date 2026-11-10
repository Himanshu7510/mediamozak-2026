// /api/crm/?a=<action> — the private CRM at mediamozak.com/crm.
const { allowedOrigin, rateLimited, readBody, store, clip } = require("./_lib/leads");
const { hashPassword, verifyPassword, getSession, setSession, clearSession, safeEqual } = require("./_lib/auth");
const { getConfig, clearCache, leadApiKey, hookKey } = require("./_lib/config");

const STAGES = ["prospect", "new", "contacted", "qualified", "proposal", "won", "lost"];
const FIELDS = ["stage", "priority", "name", "contact", "phone", "email", "website", "city", "niche", "services", "source", "value", "followUp", "assignedTo", "notes", "budget", "callTime", "language", "ref"];

function cleanLead(p) {
  const out = {};
  for (const k of FIELDS) {
    if (p[k] === undefined) continue;
    if (k === "services") out.services = Array.isArray(p.services) ? p.services.map((s) => clip(s, 60)).slice(0, 20) : [];
    else if (k === "value") out.value = Math.max(0, Math.round(Number(p.value) || 0));
    else if (k === "stage") out.stage = STAGES.includes(p.stage) ? p.stage : "new";
    else if (k === "priority") out.priority = ["hot", "warm", "cold"].includes(p.priority) ? p.priority : "warm";
    else if (k === "followUp") out.followUp = /^\d{4}-\d{2}-\d{2}$/.test(p.followUp || "") ? p.followUp : "";
    else if (k === "notes") out.notes = String(p.notes || "").slice(0, 5000);
    else out[k] = clip(p[k], k === "ref" || k === "website" ? 400 : 200);
  }
  return out;
}

const publicUser = (u) => ({ email: u.email, name: u.name, role: u.role, active: u.active !== "false" });

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const a = String((req.query && req.query.a) || "");
  if (req.method === "POST" && !allowedOrigin(req)) return res.status(403).json({ error: "forbidden" });
  const b = req.method === "POST" ? readBody(req) : {};

  try {
    // ---- signed-out actions ----
    if (a === "me") {
      const s = getSession(req);
      if (s) return res.status(200).json({ user: { email: s.email, name: s.name, role: s.role } });
      const { users } = await store("users");
      return res.status(401).json({ error: "signed_out", needsSetup: users.length === 0 });
    }
    if (a === "setup" && req.method === "POST") {
      if (rateLimited(req, 5, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
      const { users } = await store("users");
      if (users.length) return res.status(409).json({ error: "The CRM is already set up. Sign in instead." });
      if (!safeEqual(b.setupCode, process.env.LEADS_SECRET)) return res.status(403).json({ error: "That setup code isn't right." });
      const email = clip(b.email, 120).toLowerCase(), name = clip(b.name, 80);
      if (!email || !name || String(b.password || "").length < 8) return res.status(400).json({ error: "Enter your name, email and a password of at least 8 characters." });
      const user = { email, name, role: "owner", hash: hashPassword(b.password), active: true };
      await store("saveUser", { user });
      setSession(res, user);
      return res.status(200).json({ user: publicUser(user) });
    }
    if (a === "login" && req.method === "POST") {
      if (rateLimited(req, 10, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
      const email = clip(b.email, 120).toLowerCase();
      const { users } = await store("users");
      const u = users.find((x) => x.email === email);
      if (!u || u.active === "false" || !verifyPassword(b.password, u.hash)) return res.status(401).json({ error: "Email or password is incorrect." });
      setSession(res, u);
      return res.status(200).json({ user: publicUser(u) });
    }
    if (a === "logout") {
      clearSession(res);
      return res.status(200).json({ ok: true });
    }

    // ---- signed-in actions ----
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: "signed_out" });
    const owner = s.role === "owner";
    const by = s.name || s.email;

    if (a === "leads") {
      const [{ leads }, { users }] = await Promise.all([store("list"), store("users")]);
      return res.status(200).json({ leads, users: users.map(publicUser) });
    }
    if (req.method !== "POST" && !["waStatus", "integrations", "system", "backendCode"].includes(a)) return res.status(405).json({ error: "POST only" });

    if (a === "create") {
      const lead = cleanLead(b.lead || {});
      if (!lead.name) return res.status(400).json({ error: "Add the business name first." });
      const r = await store("create", { lead, by });
      return res.status(200).json({ lead: r.lead });
    }
    if (a === "patch") {
      const r = await store("patch", { id: clip(b.id, 60), patch: cleanLead(b.patch || {}), note: String(b.note || "").slice(0, 1000), by });
      return res.status(200).json({ lead: r.lead });
    }
    if (a === "delete") {
      if (!owner) return res.status(403).json({ error: "Only the account owner can delete leads." });
      await store("delete", { id: clip(b.id, 60) });
      return res.status(200).json({ ok: true });
    }
    if (a === "password") {
      if (String(b.newPassword || "").length < 8) return res.status(400).json({ error: "Use at least 8 characters." });
      const { users } = await store("users");
      const u = users.find((x) => x.email === s.email);
      if (!u || !verifyPassword(b.currentPassword, u.hash)) return res.status(401).json({ error: "Your current password is incorrect." });
      await store("saveUser", { user: { email: s.email, hash: hashPassword(b.newPassword) } });
      return res.status(200).json({ ok: true });
    }
    if (a === "saveUser") {
      if (!owner) return res.status(403).json({ error: "Only the account owner can manage the team." });
      const email = clip(b.email, 120).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email." });
      if (email === s.email && b.role && b.role !== "owner") return res.status(400).json({ error: "You can't remove your own owner role." });
      const user = { email, name: b.name != null ? clip(b.name, 80) : undefined, role: b.role === "owner" ? "owner" : b.role ? "member" : undefined, active: b.active };
      if (b.password) {
        if (String(b.password).length < 8) return res.status(400).json({ error: "Use at least 8 characters for the password." });
        user.hash = hashPassword(b.password);
      }
      await store("saveUser", { user });
      return res.status(200).json({ ok: true });
    }
    if (a === "deleteUser") {
      if (!owner) return res.status(403).json({ error: "Only the account owner can manage the team." });
      const email = clip(b.email, 120).toLowerCase();
      if (email === s.email) return res.status(400).json({ error: "You can't remove yourself." });
      await store("deleteUser", { email });
      return res.status(200).json({ ok: true });
    }
    if (a === "system") {
      const want = Number(require("./_lib/backend-template").version);
      const backend = await store("getConfig").then((c) => (Number(c.version || 4) >= want ? "ok" : "outdated")).catch((e) => (/unknown action/.test(String(e.message)) ? "outdated" : "error"));
      return res.status(200).json({
        backend, backendVersion: require("./_lib/backend-template").version,
        chatbot: !!process.env.ANTHROPIC_API_KEY || (backend === "ok" && (await getConfig(true).catch(() => ({}))).anthropicSet === true),
      });
    }
    if (a === "backendCode") {
      if (!owner) return res.status(403).json({ error: "Only the account owner can update the backend." });
      const t = require("./_lib/backend-template");
      return res.status(200).json({ version: t.version, code: t.code.replace("__LEADS_SECRET__", process.env.LEADS_SECRET || "") });
    }
    if (a === "integrations") {
      if (!owner) return res.status(403).json({ error: "Only the account owner can see integrations." });
      const cfg = await getConfig(true);
      const host = req.headers["x-forwarded-host"] || req.headers.host || "mediamozak.com";
      return res.status(200).json({
        anthropic: { set: !!(process.env.ANTHROPIC_API_KEY || cfg.anthropicSet), fromVercel: !!process.env.ANTHROPIC_API_KEY },
        indiamart: { set: cfg.indiamartSet, last: cfg.indiamartLast, error: cfg.indiamartError },
        leadApi: { url: "https://" + host + "/api/lead-in/", key: leadApiKey(cfg.leadApiVersion) },
        meta: { callback: "https://" + host + "/api/hooks/meta/", verifyToken: hookKey("meta", cfg.hookKeyVersion), tokenSet: !!cfg.metaTokenSet, secretSet: !!cfg.metaSecretSet },
        google: { url: "https://" + host + "/api/hooks/google/", key: hookKey("google", cfg.hookKeyVersion) },
        backendVersion: cfg.version || "4",
      });
    }
    if (a === "setKey") {
      if (!owner) return res.status(403).json({ error: "Only the account owner can change API keys." });
      const map = { anthropic: "ANTHROPIC_API_KEY", indiamart: "INDIAMART_KEY", metaToken: "META_PAGE_TOKEN", metaSecret: "META_APP_SECRET" };
      if (!map[b.name]) return res.status(400).json({ error: "Unknown key" });
      const value = String(b.value || "").trim().slice(0, 500);
      if (b.name === "anthropic" && value && !/^sk-ant-/.test(value)) return res.status(400).json({ error: "That doesn't look like an Anthropic key (it should start with sk-ant-)." });
      await store("setConfig", { key: map[b.name], value });
      clearCache();
      return res.status(200).json({ ok: true });
    }
    if (a === "regenApiKey") {
      if (!owner) return res.status(403).json({ error: "Only the account owner can change API keys." });
      const cfg = await getConfig(true);
      await store("setConfig", { key: "LEAD_API_VERSION", value: String((Number(cfg.leadApiVersion) || 1) + 1) });
      clearCache();
      return res.status(200).json({ ok: true });
    }
    if (a === "regenHookKeys") {
      if (!owner) return res.status(403).json({ error: "Only the account owner can change API keys." });
      const cfg = await getConfig(true);
      await store("setConfig", { key: "HOOK_KEY_VERSION", value: String((Number(cfg.hookKeyVersion) || 1) + 1) });
      clearCache();
      return res.status(200).json({ ok: true });
    }
    if (a === "imSync") {
      if (!owner) return res.status(403).json({ error: "Only the account owner can run the import." });
      const r = await store("indiamartSync").catch((e) => ({ ok: false, error: String(e.message || e) }));
      if (!r.ok) return res.status(400).json({ error: "IndiaMART: " + (r.error || "sync failed").replace(/^Lead backend error on indiamartSync \(\d+\): /, "") });
      return res.status(200).json({ added: r.added || 0 });
    }
    if (a === "waStatus") {
      const st = await store("waStatus");
      return res.status(200).json(st);
    }
    if (a === "waConfig") {
      if (!owner) return res.status(403).json({ error: "Only the account owner can change WhatsApp settings." });
      const c = b.config || {};
      const config = {};
      for (const k of ["token", "phoneId", "alertTo", "alertTemplate", "alertLang", "replyTemplate", "replyLang"]) if (c[k] != null) config[k] = clip(c[k], k === "token" ? 1000 : 300);
      const st = await store("waConfig", { config });
      return res.status(200).json(st);
    }
    if (a === "waSend") {
      const st = await store("waStatus");
      if (!st.configured || !st.replyTemplate) return res.status(400).json({ error: "Set up WhatsApp and a reply template in Settings first." });
      const { leads } = await store("list");
      const lead = leads.find((l) => l.id === b.id);
      if (!lead || !lead.phone) return res.status(400).json({ error: "This lead has no phone number." });
      const first = String(lead.contact || lead.name || "there").split(" ")[0];
      const r = await store("waSend", { to: lead.phone, template: st.replyTemplate, lang: st.replyLang, params: [first, by] }).catch((e) => ({ ok: false, error: String(e.message || e) }));
      if (!r.ok) return res.status(502).json({ error: "WhatsApp didn't send: " + (r.error || "unknown error") });
      const p = await store("patch", { id: lead.id, patch: {}, note: "Sent WhatsApp template \"" + st.replyTemplate + "\"", by });
      return res.status(200).json({ lead: p.lead });
    }
    return res.status(404).json({ error: "Unknown action" });
  } catch (e) {
    console.error(e);
    if (e.code === "not_found") return res.status(404).json({ error: "That lead no longer exists. Refresh the page." });
    return res.status(502).json({ error: "The CRM couldn't reach the lead database. Try again in a moment." });
  }
};
