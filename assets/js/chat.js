/* Mediamozak AI assistant — floating chat widget.
   Talks to /api/chat; leads it collects go to the leads sheet and the CRM. */
(function () {
  "use strict";
  if (window.__mmChat) return;
  window.__mmChat = true;

  var KEY = "mm-chat-v1";
  var GREETING = "Hi! 👋 I'm Mediamozak's AI assistant. Ask me about websites, SEO, ads or social media, or tell me about your business and I'll set up a free strategy call.\n\nHindi mein bhi baat kar sakte hain.";
  var CHIPS = ["How much does a website cost?", "I need more leads", "SEO for my business", "Book a free strategy call", "हिंदी में बात करें"];

  function track(event, params) {
    window.dataLayer = window.dataLayer || [];
    var d = { event: event };
    for (var k in params || {}) d[k] = params[k];
    window.dataLayer.push(d);
    if (typeof window.gtag === "function") window.gtag("event", event, params || {});
  }

  var css =
    ".mmc-launch{position:fixed;right:1.25rem;bottom:calc(5.5rem + env(safe-area-inset-bottom,0px));z-index:31;display:flex;align-items:center;gap:.5rem;background:#c5a880;color:#111827;border:0;border-radius:9999px;padding:.8rem 1.05rem .8rem .9rem;font:700 .9rem/1 Inter,ui-sans-serif,system-ui,sans-serif;box-shadow:0 18px 40px -12px rgba(0,0,0,.7);cursor:pointer;transition:transform .2s,background .2s}" +
    ".mmc-launch:hover{transform:translateY(-2px);background:#d4b993}.mmc-launch:focus-visible{outline:2px solid #fff;outline-offset:3px}" +
    ".mmc-launch svg{width:1.25rem;height:1.25rem}.mmc-dot{width:.55rem;height:.55rem;border-radius:9999px;background:#16a34a;box-shadow:0 0 0 2px #c5a880}" +
    ".mmc-panel{position:fixed;right:1.25rem;bottom:calc(5.5rem + env(safe-area-inset-bottom,0px));z-index:72;width:min(24rem,calc(100vw - 2rem));height:min(36rem,calc(100dvh - 7.5rem));display:flex;flex-direction:column;background:#0b1120;border:1px solid #1f2937;border-radius:1.1rem;box-shadow:0 30px 60px -15px rgba(0,0,0,.8);color:#e5e7eb;font-family:Inter,ui-sans-serif,system-ui,sans-serif;overflow:hidden;animation:mmc-in .18s ease-out}" +
    "@keyframes mmc-in{from{opacity:0;transform:translateY(10px)}}" +
    ".mmc-head{display:flex;align-items:center;gap:.7rem;padding:.85rem 1rem;background:#111827;border-bottom:1px solid #1f2937}" +
    ".mmc-av{width:2.25rem;height:2.25rem;border-radius:.7rem;background:#c5a880;color:#111827;display:grid;place-items:center;font-weight:800;flex-shrink:0}" +
    ".mmc-head b{display:block;font-size:.95rem;color:#fff}.mmc-head small{font-size:.75rem;color:#9ca3af}" +
    ".mmc-x{margin-left:auto;width:2.1rem;height:2.1rem;border-radius:.6rem;border:0;background:transparent;color:#9ca3af;font-size:1.5rem;line-height:1;cursor:pointer}.mmc-x:hover{background:#1f2937;color:#fff}" +
    ".mmc-log{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.6rem;overscroll-behavior:contain}" +
    ".mmc-msg{max-width:86%;padding:.6rem .8rem;border-radius:.9rem;font-size:.88rem;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}" +
    ".mmc-bot{align-self:flex-start;background:#111827;border:1px solid #1f2937;border-bottom-left-radius:.3rem}" +
    ".mmc-me{align-self:flex-end;background:#c5a880;color:#111827;border-bottom-right-radius:.3rem;font-weight:500}" +
    ".mmc-msg a{color:#e6d3ba;text-decoration:underline}" +
    ".mmc-ok{align-self:center;font-size:.75rem;color:#86efac;background:rgba(22,163,74,.12);border:1px solid rgba(22,163,74,.35);border-radius:9999px;padding:.3rem .75rem}" +
    ".mmc-typing{display:flex;gap:.25rem;padding:.75rem .9rem}.mmc-typing i{width:.4rem;height:.4rem;border-radius:9999px;background:#6b7280;animation:mmc-b 1s infinite}.mmc-typing i:nth-child(2){animation-delay:.15s}.mmc-typing i:nth-child(3){animation-delay:.3s}" +
    "@keyframes mmc-b{50%{opacity:.3;transform:translateY(-2px)}}" +
    ".mmc-chips{display:flex;flex-wrap:wrap;gap:.4rem;padding:0 1rem .75rem}" +
    ".mmc-chip{font-size:.78rem;padding:.42rem .7rem;border-radius:9999px;border:1px solid #374151;background:#030712;color:#d1d5db;cursor:pointer}.mmc-chip:hover{border-color:#c5a880;color:#e6d3ba}" +
    ".mmc-form{display:flex;gap:.5rem;padding:.75rem;border-top:1px solid #1f2937;background:#111827}" +
    ".mmc-in{flex:1;min-width:0;resize:none;max-height:6rem;background:#030712;border:1px solid #374151;border-radius:.75rem;color:#f3f4f6;padding:.6rem .75rem;font:inherit;font-size:.9rem}.mmc-in:focus{outline:none;border-color:#c5a880}" +
    ".mmc-send{flex-shrink:0;width:2.6rem;border:0;border-radius:.75rem;background:#c5a880;color:#111827;cursor:pointer;display:grid;place-items:center}.mmc-send:disabled{opacity:.5;cursor:default}" +
    ".mmc-note{font-size:.68rem;color:#6b7280;text-align:center;padding:0 1rem .6rem;background:#111827}.mmc-note a{color:#9ca3af;text-decoration:underline}" +
    "@media (max-width:480px){.mmc-launch span{display:none}.mmc-launch{padding:.85rem}.mmc-panel{right:0;left:0;bottom:0;width:100%;height:100dvh;border-radius:0;border:0;padding-bottom:env(safe-area-inset-bottom,0px)}}" +
    "@media (prefers-reduced-motion:reduce){.mmc-panel,.mmc-typing i{animation:none}.mmc-launch{transition:none}}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var CHAT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var SEND_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>';

  var launch = document.createElement("button");
  launch.type = "button";
  launch.className = "mmc-launch";
  launch.setAttribute("aria-label", "Chat with Mediamozak's AI assistant");
  launch.innerHTML = CHAT_SVG + "<span>Ask us anything</span><i class=\"mmc-dot\" aria-hidden=\"true\"></i>";
  document.body.appendChild(launch);

  var state = { messages: [], leadSaved: false, busy: false };
  try { var saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (saved && Array.isArray(saved.messages)) state = { messages: saved.messages, leadSaved: !!saved.leadSaved, busy: false }; } catch (e) {}
  function persist() { try { sessionStorage.setItem(KEY, JSON.stringify({ messages: state.messages.slice(-40), leadSaved: state.leadSaved })); } catch (e) {} }

  var panel = null, log, input, sendBtn, chips;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(\+91[\s-]?\d{5}[\s-]?\d{5})/g, function (m) { return '<a href="https://wa.me/' + m.replace(/\D/g, "") + '" target="_blank" rel="noopener">' + m + "</a>"; })
      .replace(/(mediamozak@gmail\.com)/g, '<a href="mailto:$1">$1</a>');
  }
  function addBubble(role, text) {
    var d = document.createElement("div");
    d.className = "mmc-msg " + (role === "user" ? "mmc-me" : "mmc-bot");
    d.innerHTML = fmt(text);
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }
  function addOk() {
    var d = document.createElement("div");
    d.className = "mmc-ok";
    d.textContent = "✓ Details shared with the Mediamozak team";
    log.appendChild(d);
  }

  function build() {
    panel = document.createElement("section");
    panel.className = "mmc-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Mediamozak AI assistant");
    panel.innerHTML =
      '<div class="mmc-head"><div class="mmc-av" aria-hidden="true">M</div><div><b>Mediamozak Assistant</b><small>AI · replies instantly · English / हिंदी</small></div><button type="button" class="mmc-x" aria-label="Close chat">&times;</button></div>' +
      '<div class="mmc-log" aria-live="polite"></div>' +
      '<div class="mmc-chips"></div>' +
      '<form class="mmc-form"><label for="mmc-input" class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Your message</label><textarea id="mmc-input" class="mmc-in" rows="1" maxlength="1500" placeholder="Type your question…"></textarea><button type="submit" class="mmc-send" aria-label="Send">' + SEND_SVG + "</button></form>" +
      '<p class="mmc-note">AI assistant — it can make mistakes. By chatting you agree to our <a href="/privacy-policy/">Privacy Policy</a>.</p>';
    document.body.appendChild(panel);
    log = panel.querySelector(".mmc-log");
    input = panel.querySelector(".mmc-in");
    sendBtn = panel.querySelector(".mmc-send");
    chips = panel.querySelector(".mmc-chips");

    addBubble("assistant", GREETING);
    state.messages.forEach(function (m) { addBubble(m.role, m.content); });
    if (state.leadSaved) addOk();
    if (!state.messages.length) {
      chips.innerHTML = CHIPS.map(function (c) { return '<button type="button" class="mmc-chip">' + esc(c) + "</button>"; }).join("");
      chips.querySelectorAll(".mmc-chip").forEach(function (b) { b.addEventListener("click", function () { send(b.textContent); }); });
    }

    panel.querySelector(".mmc-x").addEventListener("click", close);
    panel.querySelector(".mmc-form").addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); } });
    input.addEventListener("input", function () { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 96) + "px"; });
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  function open() {
    if (!panel) build();
    panel.hidden = false;
    launch.hidden = true;
    if (window.matchMedia("(max-width:480px)").matches) document.documentElement.classList.add("wa-lock");
    setTimeout(function () { input.focus(); }, 30);
    track("ai_chat_open", {});
  }
  function close() {
    panel.hidden = true;
    launch.hidden = false;
    document.documentElement.classList.remove("wa-lock");
    launch.focus();
  }
  launch.addEventListener("click", open);

  function send(text) {
    text = String(text || "").trim();
    if (!text || state.busy) return;
    chips.innerHTML = "";
    input.value = "";
    input.style.height = "auto";
    state.messages.push({ role: "user", content: text });
    addBubble("user", text);
    persist();
    if (state.messages.length === 1) track("ai_chat_start", {});

    state.busy = true;
    sendBtn.disabled = true;
    var typing = document.createElement("div");
    typing.className = "mmc-msg mmc-bot mmc-typing";
    typing.setAttribute("aria-label", "Assistant is typing");
    typing.innerHTML = "<i></i><i></i><i></i>";
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;

    fetch("/api/chat/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: state.messages, page: location.href.split("#")[0], attribution: window.__mmAttribution ? window.__mmAttribution() : null }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        typing.remove();
        if (!res.ok || !res.j.reply) throw new Error(res.j.error || "failed");
        state.messages.push({ role: "assistant", content: res.j.reply });
        addBubble("assistant", res.j.reply);
        if (res.j.leadSaved && !state.leadSaved) {
          state.leadSaved = true;
          addOk();
          track("lead_ai_chat", {});
          if (typeof window.fbq === "function") window.fbq("track", "Lead", { content_name: "AI chat" });
        }
        persist();
      })
      .catch(function () {
        typing.remove();
        state.messages.pop(); // let them retry the same message
        persist();
        addBubble("assistant", "Sorry, I couldn't reply just now. Please try again, or WhatsApp us at +91 79829 84658.");
      })
      .then(function () {
        state.busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }
})();
