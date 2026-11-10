// Team logins for mediamozak.com/crm: scrypt password hashes stored in the
// Users tab, and an HMAC-signed, HttpOnly session cookie.
const crypto = require("crypto");

const COOKIE = "mm_crm";
const MAX_AGE = 7 * 24 * 3600; // 7 days

function key() {
  return crypto.createHmac("sha256", process.env.LEADS_SECRET || "").update("mm-crm-session-v1").digest();
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32);
  return "s1$" + salt.toString("hex") + "$" + h.toString("hex");
}

function verifyPassword(pw, stored) {
  const [v, s, h] = String(stored || "").split("$");
  if (v !== "s1" || !s || !h) return false;
  const calc = crypto.scryptSync(String(pw), Buffer.from(s, "hex"), 32);
  const want = Buffer.from(h, "hex");
  return want.length === calc.length && crypto.timingSafeEqual(calc, want);
}

function sign(payload) {
  const b = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const m = crypto.createHmac("sha256", key()).update(b).digest("base64url");
  return b + "." + m;
}

function verify(token) {
  const [b, m] = String(token || "").split(".");
  if (!b || !m) return null;
  const want = crypto.createHmac("sha256", key()).update(b).digest("base64url");
  if (want.length !== m.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m))) return null;
  try {
    const p = JSON.parse(Buffer.from(b, "base64url").toString());
    return p.exp > Date.now() / 1000 ? p : null;
  } catch (e) {
    return null;
  }
}

function getSession(req) {
  const raw = String(req.headers.cookie || "");
  const m = raw.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  return m ? verify(decodeURIComponent(m[1])) : null;
}

function setSession(res, user) {
  const token = sign({ email: user.email, name: user.name, role: user.role, exp: Math.floor(Date.now() / 1000) + MAX_AGE });
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`);
}

function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

// Constant-time string compare for the one-time setup code.
function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { hashPassword, verifyPassword, getSession, setSession, clearSession, safeEqual };
