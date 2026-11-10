/* Mediamozak Lead Desk — private CRM at /crm/. Talks to /api/crm/. */
(function () {
  "use strict";

  var STAGES = [
    { id: "prospect", name: "Prospects", hint: "Researched businesses not yet contacted" },
    { id: "new", name: "New enquiry", hint: "Website, chatbot, ads and portal leads" },
    { id: "contacted", name: "Contacted", hint: "First call, WhatsApp or email done" },
    { id: "qualified", name: "Qualified", hint: "Need, budget and decision-maker confirmed" },
    { id: "proposal", name: "Proposal sent", hint: "Quote or audit shared" },
    { id: "won", name: "Won", hint: "Signed / advance received" },
    { id: "lost", name: "Lost", hint: "Not now or went elsewhere" },
  ];
  var SERVICES = {
    dm: ["SEO", "Local SEO / GMB", "Social media", "Meta ads", "Google ads", "Content & video", "WhatsApp / email marketing", "Lead generation campaign"],
    wd: ["New website", "Website redesign", "Landing page", "E-commerce store", "Web app / portal", "Website maintenance"],
  };
  var SOURCES = ["Website form", "AI chatbot", "Meta ads", "Google ads", "IndiaMART", "JustDial", "Referral", "Cold call / email", "Instagram / WhatsApp", "LinkedIn", "Walk-in / event", "Prospect research", "Other"];
  var NICHES = ["Restaurant & cafe", "Real estate & builder", "School & coaching", "Clinic & hospital", "Salon, spa & fitness", "Retail & D2C", "Hotel & travel", "Manufacturing / B2B", "Other"];
  var PRI = { hot: "Hot", warm: "Warm", cold: "Cold" };

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var inr = function (n) { return "₹" + Math.round(n || 0).toLocaleString("en-IN"); };
  var inrShort = function (n) { n = n || 0; if (n >= 1e7) return "₹" + (n / 1e7).toFixed(2).replace(/\.?0+$/, "") + " Cr"; if (n >= 1e5) return "₹" + (n / 1e5).toFixed(2).replace(/\.?0+$/, "") + " L"; return inr(n); };
  var istDate = function (offsetDays) { var d = new Date(Date.now() + (offsetDays || 0) * 864e5 + 330 * 6e4); return d.toISOString().slice(0, 10); };
  var today = function () { return istDate(0); };
  var fmtDate = function (s) { return s ? new Date(s + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""; };
  var lineOf = function (l) { var s = l.services || []; return { dm: s.some(function (x) { return SERVICES.dm.indexOf(x) >= 0; }), wd: s.some(function (x) { return SERVICES.wd.indexOf(x) >= 0; }) }; };
  var isOpen = function (l) { return l.stage !== "won" && l.stage !== "lost"; };
  var stageName = function (id) { var s = STAGES.filter(function (x) { return x.id === id; })[0]; return s ? s.name : id; };

  var me = null, leads = [], users = [], wa = null, loaded = false;
  var state = { view: "board", q: "", line: "all", source: "", niche: "", owner: "", openId: null, confirmDel: false, draft: null };
  try { var v = localStorage.getItem("mm.crm.view"); if (v) state.view = v; } catch (e) {}

  // ---------- API ----------
  function api(action, body) {
    var opts = body === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch("/api/crm/?a=" + action, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && action !== "login" && action !== "setup" && action !== "me" && me) { me = null; renderAuth(false); }
        if (!r.ok) { var e = new Error(j.error || "Something went wrong. Try again."); e.status = r.status; e.body = j; throw e; }
        return j;
      });
    });
  }
  var toastT;
  function toast(m) { var t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2800); }

  // ---------- auth screens ----------
  function renderAuth(needsSetup) {
    $("#sheetRoot").innerHTML = ""; $("#modalRoot").innerHTML = "";
    var app = $("#app"); app.className = "auth";
    if (needsSetup) {
      app.innerHTML = '<form class="auth-card" id="authForm" novalidate>' +
        '<div class="brand"><div class="mark">M</div><div><strong>Mediamozak Lead Desk</strong><div class="help">First-time setup</div></div></div>' +
        "<h1>Create the owner account</h1><p>You'll add your team after this. The setup code is the <code>LEADS_SECRET</code> value (the <code>var SECRET</code> line in your Apps Script).</p>" +
        '<label class="f"><span>Setup code</span><input type="password" id="s-code" autocomplete="off" required></label>' +
        '<label class="f"><span>Your name</span><input type="text" id="s-name" autocomplete="name" required></label>' +
        '<label class="f"><span>Email</span><input type="email" id="s-email" autocomplete="email" required></label>' +
        '<label class="f"><span>Password (8+ characters)</span><input type="password" id="s-pw" autocomplete="new-password" minlength="8" required></label>' +
        '<div class="err" id="authErr" hidden></div><button class="btn primary" type="submit">Create account</button></form>';
      $("#authForm").onsubmit = function (e) {
        e.preventDefault();
        submitAuth("setup", { setupCode: $("#s-code").value, name: $("#s-name").value, email: $("#s-email").value, password: $("#s-pw").value });
      };
    } else {
      app.innerHTML = '<form class="auth-card" id="authForm" novalidate>' +
        '<div class="brand"><div class="mark">M</div><div><strong>Mediamozak Lead Desk</strong><div class="help">Team sign-in</div></div></div>' +
        "<h1>Sign in</h1>" +
        '<label class="f"><span>Email</span><input type="email" id="l-em" autocomplete="username" required></label>' +
        '<label class="f"><span>Password</span><input type="password" id="l-pw" autocomplete="current-password" required></label>' +
        '<div class="err" id="authErr" hidden></div><button class="btn primary" type="submit">Sign in</button>' +
        '<p class="help">Forgot your password? Ask the account owner to set a new one in Settings → Team.</p></form>';
      $("#authForm").onsubmit = function (e) { e.preventDefault(); submitAuth("login", { email: $("#l-em").value, password: $("#l-pw").value }); };
    }
    var first = $("#authForm input"); if (first) first.focus();
  }
  function submitAuth(action, body) {
    var btn = $("#authForm button[type=submit]"); btn.disabled = true;
    api(action, body).then(function (j) { me = j.user; start(); }).catch(function (e) {
      var er = $("#authErr"); er.textContent = e.message; er.hidden = false; btn.disabled = false;
    });
  }

  // ---------- app shell ----------
  function start() {
    var app = $("#app"); app.className = "";
    app.innerHTML =
      '<header class="top"><div class="wrap"><div class="top-row">' +
      '<div class="brand"><div class="mark" aria-hidden="true">M</div><div><h1>Lead Desk</h1><small>Mediamozak · digital marketing &amp; web development</small></div></div>' +
      '<span class="who">' + esc(me.name) + (me.role === "owner" ? " · Owner" : "") + "</span>" +
      '<button class="btn sm ghost" id="settingsBtn" type="button">Settings</button>' +
      '<button class="btn sm ghost" id="exportBtn" type="button">Export CSV</button>' +
      '<button class="btn sm ghost" id="logoutBtn" type="button">Sign out</button>' +
      '<button class="btn primary" id="addBtn" type="button">+ Add lead</button></div>' +
      '<nav class="tabs" role="tablist" aria-label="Views">' +
      '<button class="tab" role="tab" data-view="board">Pipeline</button>' +
      '<button class="tab" role="tab" data-view="list">All leads <span class="count" id="cAll">0</span></button>' +
      '<button class="tab" role="tab" data-view="follow">Follow-ups <span class="count" id="cDue">0</span></button>' +
      '<button class="tab" role="tab" data-view="insights">Insights</button></nav></div></header>' +
      '<main class="wrap"><section class="stats" id="stats" aria-label="Summary"></section><div id="notice" class="notice" hidden></div>' +
      '<div class="toolbar" id="toolbar"><input type="search" id="q" placeholder="Search business, city, contact, phone…" aria-label="Search leads">' +
      '<div class="seg" role="group" aria-label="Service line"><button type="button" data-line="all" aria-pressed="true">All</button><button type="button" data-line="dm" aria-pressed="false">Digital marketing</button><button type="button" data-line="wd" aria-pressed="false">Web dev</button></div>' +
      '<select id="fSource" aria-label="Filter by source"><option value="">All sources</option>' + SOURCES.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") + "</select>" +
      '<select id="fNiche" aria-label="Filter by industry"><option value="">All industries</option>' + NICHES.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") + "</select>" +
      '<select id="fOwner" aria-label="Filter by owner"><option value="">Everyone</option><option value="__me">Mine</option><option value="__none">Unassigned</option></select></div>' +
      '<div id="view"></div></main>';

    $("#q").oninput = function (e) { state.q = e.target.value.toLowerCase(); render(); };
    $("#fSource").onchange = function (e) { state.source = e.target.value; render(); };
    $("#fNiche").onchange = function (e) { state.niche = e.target.value; render(); };
    $("#fOwner").onchange = function (e) { state.owner = e.target.value; render(); };
    document.querySelectorAll("[data-line]").forEach(function (b) {
      b.onclick = function () { state.line = b.dataset.line; document.querySelectorAll("[data-line]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); render(); };
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      t.onclick = function () { state.view = t.dataset.view; try { localStorage.setItem("mm.crm.view", state.view); } catch (e) {} history.replaceState(null, "", "#" + state.view); render(); };
    });
    $("#addBtn").onclick = function () { openSheet(""); };
    $("#exportBtn").onclick = exportCsv;
    $("#settingsBtn").onclick = openSettings;
    $("#logoutBtn").onclick = function () { api("logout", {}).finally(function () { me = null; renderAuth(false); }); };

    var h = location.hash.replace("#", "");
    if (["board", "list", "follow", "insights"].indexOf(h) >= 0) state.view = h;
    var m = location.hash.match(/lead=([\w-]+)/);
    render();
    load().then(function () { if (m) openSheet(m[1]); });
    api("waStatus").then(function (s) { wa = s; }).catch(function () {});
  }

  var loadTimer;
  function load() {
    clearTimeout(loadTimer);
    return api("leads").then(function (j) {
      leads = j.leads || []; users = j.users || []; loaded = true;
      $("#notice").hidden = true;
      var fo = $("#fOwner");
      if (fo && fo.options.length <= 3) users.forEach(function (u) { fo.insertAdjacentHTML("beforeend", '<option value="' + esc(u.email) + '">' + esc(u.name || u.email) + "</option>"); });
      render();
    }).catch(function (e) {
      loaded = true;
      if (e.status === 401) return;
      var n = $("#notice"); if (n) { n.textContent = e.message; n.hidden = false; }
      render();
    }).then(function () {
      loadTimer = setTimeout(function () { if (me && document.visibilityState === "visible") load(); }, 60000);
    });
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && me && loaded) load(); });

  var nameOf = function (email) { if (!email) return ""; if (me && email === me.email) return "You"; var u = users.filter(function (x) { return x.email === email; })[0]; return u ? (u.name || u.email) : email; };

  function filtered() {
    return leads.filter(function (l) {
      if (state.line !== "all" && !lineOf(l)[state.line]) return false;
      if (state.source && l.source !== state.source) return false;
      if (state.niche && l.niche !== state.niche) return false;
      if (state.owner === "__me" && l.assignedTo !== me.email) return false;
      if (state.owner === "__none" && l.assignedTo) return false;
      if (state.owner && state.owner.indexOf("__") !== 0 && l.assignedTo !== state.owner) return false;
      if (state.q) {
        var hay = [l.name, l.contact, l.city, l.phone, l.email, l.niche, l.notes, (l.services || []).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(state.q) < 0) return false;
      }
      return true;
    });
  }
  function dueClass(d) { if (!d) return ""; var t = today(); return d < t ? "over" : d === t ? "today" : "later"; }
  function dueText(d) { var c = dueClass(d); return c === "over" ? "Overdue · " + fmtDate(d) : c === "today" ? "Follow up today" : "Next: " + fmtDate(d); }

  function chipsFor(l) {
    var ln = lineOf(l), h = "";
    if (ln.dm) h += '<span class="chip dm">Digital marketing</span>';
    if (ln.wd) h += '<span class="chip wd">Web dev</span>';
    if (l.priority) h += '<span class="chip ' + esc(l.priority) + '">' + esc(PRI[l.priority] || "") + "</span>";
    if (l.source) h += '<span class="chip ' + (l.source === "AI chatbot" ? "ai" : "src") + '">' + esc(l.source) + "</span>";
    return '<div class="chips">' + h + "</div>";
  }
  function cardHtml(l, drag) {
    var d = isOpen(l) && l.followUp ? '<div class="due ' + dueClass(l.followUp) + '">' + esc(dueText(l.followUp)) + "</div>" : "";
    return '<button type="button" class="card" data-id="' + esc(l.id) + '"' + (drag ? ' draggable="true"' : "") + ">" +
      (l.value ? '<span class="val">' + esc(inrShort(l.value)) + "</span>" : "") +
      '<span class="t">' + esc(l.name || l.contact) + "</span>" +
      '<span class="m">' + esc([l.niche, l.city].filter(Boolean).join(" · ")) + "</span>" + chipsFor(l) + d +
      (l.assignedTo ? '<span class="owner">👤 ' + esc(nameOf(l.assignedTo)) + "</span>" : "") + "</button>";
  }

  function renderStats() {
    var openL = leads.filter(isOpen), won = leads.filter(function (l) { return l.stage === "won"; });
    var decided = leads.filter(function (l) { return !isOpen(l); }).length;
    var t = today(), month = t.slice(0, 7);
    var due = openL.filter(function (l) { return l.followUp && l.followUp <= t; }).length;
    var newToday = leads.filter(function (l) { return (l.createdAt || "").slice(0, 10) === t && l.source !== "Prospect research"; }).length;
    var wonMonth = won.filter(function (l) { return (l.updatedAt || "").slice(0, 7) === month; }).reduce(function (s, l) { return s + (+l.value || 0); }, 0);
    $("#stats").innerHTML =
      '<div class="stat"><span class="label">Open leads</span><b>' + openL.length + '</b><span class="sub">' + newToday + " new today</span></div>" +
      '<div class="stat"><span class="label">Pipeline value</span><b>' + esc(inrShort(openL.reduce(function (s, l) { return s + (+l.value || 0); }, 0))) + '</b><span class="sub">estimated, open deals</span></div>' +
      '<div class="stat"><span class="label">Due follow-ups</span><b style="color:' + (due ? "var(--bad)" : "inherit") + '">' + due + '</b><span class="sub">today or overdue</span></div>' +
      '<div class="stat"><span class="label">Won this month</span><b>' + esc(inrShort(wonMonth)) + '</b><span class="sub">' + won.length + " deals won overall</span></div>" +
      '<div class="stat"><span class="label">Win rate</span><b>' + (decided ? Math.round(won.length / decided * 100) : 0) + '%</b><span class="sub">of ' + decided + " closed</span></div>";
    $("#cAll").textContent = leads.length;
    var c = $("#cDue"); c.textContent = due; c.classList.toggle("alert", due > 0);
  }
  function emptyState() {
    if (!loaded) return '<div class="empty"><h3>Loading leads…</h3></div>';
    return '<div class="empty"><h3>No leads yet</h3><p>Website, chatbot and WhatsApp enquiries land here automatically. Add others with “+ Add lead”.</p></div>';
  }
  function renderBoard(list) {
    if (!leads.length) return emptyState();
    return '<div class="board-scroll"><div class="board">' + STAGES.map(function (s) {
      var items = list.filter(function (l) { return l.stage === s.id; }).sort(function (a, b) { return (a.followUp || "9").localeCompare(b.followUp || "9"); });
      var val = items.reduce(function (t, l) { return t + (+l.value || 0); }, 0);
      return '<div class="col" data-stage="' + s.id + '"><div class="col-h"><h3>' + esc(s.name) + '</h3><span class="num">' + items.length + (val ? " · " + esc(inrShort(val)) : "") + "</span></div>" +
        (items.length ? items.map(function (l) { return cardHtml(l, true); }).join("") : '<div class="col-hint">' + esc(s.hint) + "</div>") + "</div>";
    }).join("") + "</div></div>";
  }
  function renderList(list) {
    if (!leads.length) return emptyState();
    if (!list.length) return '<div class="empty"><h3>No leads match these filters</h3></div>';
    return '<div class="table-wrap"><table><thead><tr><th>Business</th><th>City</th><th>Services</th><th>Source</th><th>Stage</th><th>Owner</th><th>Value</th><th>Follow-up</th></tr></thead><tbody>' +
      list.slice().sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); }).map(function (l) {
        return '<tr class="row" data-id="' + esc(l.id) + '"><td><strong>' + esc(l.name || l.contact) + '</strong><div style="color:var(--muted);font-size:12px">' + esc([l.contact, l.phone].filter(Boolean).join(" · ")) + "</div></td>" +
          "<td>" + esc(l.city) + "</td><td>" + esc((l.services || []).join(", ")) + "</td><td>" + esc(l.source) + "</td>" +
          '<td><span class="stage-pill ' + esc(l.stage) + '">' + esc(stageName(l.stage)) + "</span></td><td>" + esc(nameOf(l.assignedTo)) + "</td>" +
          '<td class="num">' + (l.value ? esc(inr(l.value)) : "—") + '</td><td><span class="due ' + (isOpen(l) ? dueClass(l.followUp) : "") + '">' + esc(fmtDate(l.followUp)) + "</span></td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function renderFollow(list) {
    if (!leads.length) return emptyState();
    var t = today(), wk = istDate(7), o = list.filter(isOpen);
    var groups = [
      ["Overdue", o.filter(function (l) { return l.followUp && l.followUp < t; })],
      ["Today", o.filter(function (l) { return l.followUp === t; })],
      ["Next 7 days", o.filter(function (l) { return l.followUp > t && l.followUp <= wk; })],
      ["No follow-up set", o.filter(function (l) { return !l.followUp && l.stage !== "prospect"; })],
    ];
    return '<div class="groups">' + groups.map(function (g) {
      return '<div class="group"><h3>' + esc(g[0]) + ' <span class="num" style="color:var(--muted);font-size:12px">' + g[1].length + '</span></h3><div class="stack">' +
        (g[1].length ? g[1].sort(function (a, b) { return (a.followUp || "").localeCompare(b.followUp || ""); }).map(function (l) { return cardHtml(l, false); }).join("") : '<div class="col-hint">Nothing here.</div>') + "</div></div>";
    }).join("") + "</div>";
  }
  function barRows(entries, cls) {
    var max = Math.max.apply(null, [1].concat(entries.map(function (e) { return e[1]; })));
    return entries.map(function (e) { return '<div class="bar"><span>' + esc(e[0]) + '</span><div class="track"><div class="fill ' + (cls || "") + '" style="width:' + (e[1] / max * 100) + '%"></div></div><span class="num">' + esc(e[2] != null ? e[2] : e[1]) + "</span></div>"; }).join("");
  }
  function renderInsights() {
    if (!leads.length) return emptyState();
    var by = function (key, f) { var m = {}; leads.filter(f || function () { return true; }).forEach(function (l) { var k = (key === "assignedTo" ? nameOf(l[key]) : l[key]) || "Not set"; m[k] = (m[k] || 0) + 1; }); return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); };
    var srcWon = {}; leads.forEach(function (l) { if (l.stage === "won") { var k = l.source || "Not set"; srcWon[k] = (srcWon[k] || 0) + (+l.value || 0); } });
    var wonRows = Object.keys(srcWon).map(function (k) { return [k, srcWon[k], inrShort(srcWon[k])]; }).sort(function (a, b) { return b[1] - a[1]; });
    var svc = {}; leads.forEach(function (l) { (l.services || []).forEach(function (s) { svc[s] = (svc[s] || 0) + 1; }); });
    var dmV = leads.filter(function (l) { return isOpen(l) && lineOf(l).dm; }).reduce(function (t, l) { return t + (+l.value || 0); }, 0);
    var wdV = leads.filter(function (l) { return isOpen(l) && lineOf(l).wd; }).reduce(function (t, l) { return t + (+l.value || 0); }, 0);
    return '<div class="ins">' +
      '<div class="panel"><h3>Leads by source</h3><div class="bars">' + barRows(by("source")) + "</div></div>" +
      '<div class="panel"><h3>Revenue won by source</h3><div class="bars">' + (barRows(wonRows, "good") || '<div class="col-hint">Win your first deal to see which source pays best.</div>') + "</div></div>" +
      '<div class="panel"><h3>Pipeline by stage</h3><div class="bars">' + barRows(STAGES.map(function (s) { return [s.name, leads.filter(function (l) { return l.stage === s.id; }).length]; })) + "</div></div>" +
      '<div class="panel"><h3>Open pipeline by service line</h3><div class="bars">' + barRows([["Digital marketing", dmV, inrShort(dmV)], ["Web development", wdV, inrShort(wdV)]]) + '</div><h3 style="margin-top:18px">Most requested services</h3><div class="bars">' + barRows(Object.keys(svc).map(function (k) { return [k, svc[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8), "dm") + "</div></div>" +
      '<div class="panel"><h3>Open leads by owner</h3><div class="bars">' + barRows(by("assignedTo", isOpen), "wd") + "</div></div>" +
      '<div class="panel"><h3>Leads by city</h3><div class="bars">' + barRows(by("city").slice(0, 10)) + "</div></div></div>";
  }

  function render() {
    if (!me || !$("#stats")) return;
    renderStats();
    document.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.view === state.view)); });
    $("#toolbar").hidden = state.view === "insights";
    var list = filtered(), v = $("#view");
    v.innerHTML = state.view === "list" ? renderList(list) : state.view === "follow" ? renderFollow(list) : state.view === "insights" ? renderInsights() : renderBoard(list);
    v.querySelectorAll("[data-id]").forEach(function (el) { el.onclick = function () { openSheet(el.dataset.id); }; });
    v.querySelectorAll(".card[draggable]").forEach(function (c) { c.ondragstart = function (e) { e.dataTransfer.setData("text/plain", c.dataset.id); }; });
    v.querySelectorAll(".col").forEach(function (col) {
      col.ondragover = function (e) { e.preventDefault(); col.classList.add("drop"); };
      col.ondragleave = function () { col.classList.remove("drop"); };
      col.ondrop = function (e) {
        e.preventDefault(); col.classList.remove("drop");
        var l = byId(e.dataTransfer.getData("text/plain"));
        if (l && l.stage !== col.dataset.stage) moveStage(l, col.dataset.stage);
      };
    });
  }
  function byId(id) { return leads.filter(function (l) { return l.id === id; })[0]; }
  function replaceLead(nl) { var i = leads.findIndex(function (l) { return l.id === nl.id; }); if (i >= 0) leads[i] = nl; else leads.push(nl); }

  function patch(id, p, note, quiet) {
    return api("patch", { id: id, patch: p, note: note || "" }).then(function (j) { replaceLead(j.lead); render(); if (state.openId === id) renderSheet(); if (!quiet) toast("Saved"); return j.lead; })
      .catch(function (e) { toast(e.message); throw e; });
  }
  function moveStage(l, stage) {
    var old = l.stage; l.stage = stage; render(); // optimistic
    var p = { stage: stage };
    if (stage === "contacted" && !l.followUp) p.followUp = istDate(3);
    patch(l.id, p, "", true).catch(function () { l.stage = old; render(); });
  }

  // ---------- lead sheet ----------
  function blank() { return { name: "", contact: "", phone: "", email: "", website: "", city: "", niche: "", services: [], source: "", stage: "new", priority: "warm", value: "", followUp: istDate(1), notes: "", assignedTo: me.email }; }
  function openSheet(id) {
    state.openId = id || ""; state.confirmDel = false;
    var l = id ? byId(id) : null;
    if (id && !l) { state.openId = null; toast("That lead wasn't found."); return; }
    state.draft = l ? JSON.parse(JSON.stringify(l)) : blank();
    if (id) history.replaceState(null, "", "#lead=" + id);
    renderSheet();
  }
  function closeSheet() { state.openId = null; state.draft = null; $("#sheetRoot").innerHTML = ""; history.replaceState(null, "", "#" + state.view); }
  function opts(arr, sel, ph) { return (ph ? '<option value="">' + esc(ph) + "</option>" : "") + arr.map(function (a) { var v = Array.isArray(a) ? a[0] : a, t = Array.isArray(a) ? a[1] : a; return '<option value="' + esc(v) + '"' + (v === sel ? " selected" : "") + ">" + esc(t) + "</option>"; }).join(""); }
  function waDigits(p) { var d = String(p || "").replace(/\D/g, "").replace(/^0+/, ""); return d.length === 10 ? "91" + d : d; }

  function renderSheet() {
    if (state.openId === null || !state.draft) return;
    var isNew = !state.openId, live = isNew ? null : byId(state.openId), d = state.draft;
    if (!isNew && !live) { closeSheet(); return; }
    var svcGrp = function (k, label) { return '<div class="grp"><span>' + label + "</span>" + SERVICES[k].map(function (s, i) { return '<label><input type="checkbox" id="svc-' + k + "-" + i + '" value="' + esc(s) + '"' + (d.services.indexOf(s) >= 0 ? " checked" : "") + "> " + esc(s) + "</label>"; }).join("") + "</div>"; };
    var userOpts = [["", "Unassigned"]].concat(users.filter(function (u) { return u.active; }).map(function (u) { return [u.email, u.name || u.email]; }));
    var log = live ? (live.log || []).slice().reverse() : [];
    var phone = live && live.phone && /\d{6,}/.test(live.phone) ? live.phone : "";
    var waReady = wa && wa.configured && wa.replyTemplate;

    $("#sheetRoot").innerHTML = '<div class="scrim" id="scrim"></div><aside class="sheet" role="dialog" aria-modal="true" aria-label="' + (isNew ? "Add lead" : "Lead details") + '">' +
      '<div class="sheet-h"><h2>' + (isNew ? "Add lead" : esc(live.name || live.contact)) + '</h2><button class="btn sm" id="closeS" type="button">Close</button></div>' +
      '<form class="sheet-b" id="leadForm">' +
      (!isNew ? '<div class="actions">' +
        (phone ? '<code class="num" style="background:var(--raised);padding:4px 8px;border-radius:6px;user-select:all">' + esc(phone) + '</code><a class="btn sm" href="tel:' + esc(phone.replace(/[^\d+]/g, "")) + '">Call</a><a class="btn sm wa" href="https://wa.me/' + waDigits(phone) + '" target="_blank" rel="noopener">Open WhatsApp chat</a>' +
          (waReady ? '<button class="btn sm" type="button" id="waSend">Send WhatsApp template</button>' : "") : "") +
        (live.email ? '<a class="btn sm" href="mailto:' + esc(live.email) + '">Email</a>' : "") +
        (live.website ? '<a class="btn sm" href="' + esc(/^https?:/.test(live.website) ? live.website : "https://" + live.website) + '" target="_blank" rel="noopener">Website</a>' : "") +
        (live.ref ? '<a class="btn sm" href="' + esc(live.ref) + '" target="_blank" rel="noopener">Source article</a>' : "") + "</div>" : "") +
      (!isNew && (live.budget || live.callTime) ? '<div class="contact-line">' + (live.budget ? '<span class="label">Budget</span> ' + esc(live.budget) + "&nbsp;&nbsp;" : "") + (live.callTime ? '<span class="label">Preferred call</span> ' + esc(live.callTime) : "") + "</div>" : "") +
      '<div class="grid2">' +
      '<label class="f"><span>Business name *</span><input type="text" id="l-name" required value="' + esc(d.name) + '"></label>' +
      '<label class="f"><span>Contact person</span><input type="text" id="l-contact" value="' + esc(d.contact) + '"></label>' +
      '<label class="f"><span>Phone / WhatsApp</span><input type="tel" id="l-phone" value="' + esc(d.phone) + '" placeholder="+91 98xxx xxxxx"></label>' +
      '<label class="f"><span>Email</span><input type="email" id="l-email" value="' + esc(d.email) + '"></label>' +
      '<label class="f"><span>City</span><input type="text" id="l-city" value="' + esc(d.city) + '"></label>' +
      '<label class="f"><span>Current website</span><input type="text" id="l-website" value="' + esc(d.website) + '" placeholder="none / example.in"></label>' +
      '<label class="f"><span>Industry</span><select id="l-niche">' + opts(NICHES, d.niche, "Choose…") + "</select></label>" +
      '<label class="f"><span>Lead source</span><select id="l-source">' + opts(SOURCES, d.source, "Choose…") + "</select></label>" +
      '<label class="f"><span>Stage</span><select id="l-stage">' + opts(STAGES.map(function (s) { return [s.id, s.name]; }), d.stage) + "</select></label>" +
      '<label class="f"><span>Priority</span><select id="l-priority">' + opts(Object.keys(PRI).map(function (k) { return [k, PRI[k]]; }), d.priority) + "</select></label>" +
      '<label class="f"><span>Estimated deal value (₹)</span><input type="number" min="0" step="1000" id="l-value" value="' + esc(d.value || "") + '"></label>' +
      '<label class="f"><span>Next follow-up</span><input type="date" id="l-followUp" value="' + esc(d.followUp || "") + '"></label>' +
      '<label class="f"><span>Owner</span><select id="l-assignedTo">' + opts(userOpts, d.assignedTo || "") + "</select></label></div>" +
      '<div class="actions" aria-label="Quick follow-up dates">' + [["Tomorrow", 1], ["In 3 days", 3], ["Next week", 7], ["In 2 weeks", 14]].map(function (x) { return '<button class="btn sm" type="button" data-days="' + x[1] + '">' + x[0] + "</button>"; }).join("") + '<button class="btn sm" type="button" data-days="">Clear date</button></div>' +
      '<div class="f"><span>Services they need</span><div class="svc">' + svcGrp("dm", "Digital marketing") + svcGrp("wd", "Web development") + "</div></div>" +
      '<label class="f"><span>Requirement / notes</span><textarea id="l-notes">' + esc(d.notes) + "</textarea></label>" +
      (!isNew && live.transcript ? '<details class="box"><summary>AI chat transcript</summary><div class="transcript">' + esc(live.transcript) + "</div></details>" : "") +
      (!isNew ? '<div class="f"><span>Activity</span><div class="log-add"><input type="text" id="logText" placeholder="Called, sent quote on WhatsApp, asked to call back…" aria-label="New activity note"><button class="btn sm" type="button" id="logAdd">Add</button></div>' +
        '<div class="log">' + (log.length ? log.map(function (e) { return '<div class="log-item"><div class="when">' + esc(new Date(e.t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })) + (e.by ? " · " + esc(e.by) : "") + "</div>" + esc(e.text) + "</div>"; }).join("") : '<div class="col-hint">No activity yet.</div>') + "</div></div>" : "") +
      "</form>" +
      '<div class="sheet-f"><button class="btn primary" type="submit" form="leadForm" id="saveBtn">' + (isNew ? "Add lead" : "Save changes") + "</button>" +
      (!isNew && me.role === "owner" ? (state.confirmDel ? '<div class="confirm">Delete this lead for everyone? <button class="btn sm danger" type="button" id="delYes">Delete</button><button class="btn sm" type="button" id="delNo">Keep</button></div>' : '<button class="btn danger" type="button" id="delBtn" style="margin-left:auto">Delete</button>') : "") +
      "</div></aside>";

    var r = $("#sheetRoot");
    var sync = function () {
      ["name", "contact", "phone", "email", "city", "website", "niche", "source", "stage", "priority", "value", "followUp", "assignedTo", "notes"].forEach(function (k) { var el = $("#l-" + k, r); if (el) d[k] = el.value; });
      d.services = Array.prototype.map.call(r.querySelectorAll(".svc input:checked"), function (i) { return i.value; });
    };
    r.querySelectorAll("input,select,textarea").forEach(function (el) { el.addEventListener("input", sync); el.addEventListener("change", sync); });
    $("#scrim", r).onclick = closeSheet; $("#closeS", r).onclick = closeSheet;
    r.querySelectorAll("[data-days]").forEach(function (b) { b.onclick = function () { sync(); d.followUp = b.dataset.days ? istDate(+b.dataset.days) : ""; $("#l-followUp", r).value = d.followUp; }; });
    $("#leadForm", r).onsubmit = function (e) { e.preventDefault(); sync(); save(isNew); };
    var del = $("#delBtn", r); if (del) del.onclick = function () { sync(); state.confirmDel = true; renderSheet(); };
    var dn = $("#delNo", r); if (dn) dn.onclick = function () { state.confirmDel = false; renderSheet(); };
    var dy = $("#delYes", r); if (dy) dy.onclick = function () {
      api("delete", { id: state.openId }).then(function () { leads = leads.filter(function (l) { return l.id !== state.openId; }); toast("Lead deleted"); closeSheet(); render(); }).catch(function (e) { toast(e.message); });
    };
    var la = $("#logAdd", r);
    if (la) {
      var go = function () { var t = $("#logText", r).value.trim(); if (!t) return; sync(); la.disabled = true; patch(live.id, {}, t, true).finally(function () { la.disabled = false; }); };
      la.onclick = go; $("#logText", r).onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } };
    }
    var ws = $("#waSend", r);
    if (ws) ws.onclick = function () {
      ws.disabled = true; ws.textContent = "Sending…";
      api("waSend", { id: live.id }).then(function (j) { replaceLead(j.lead); toast("WhatsApp sent"); renderSheet(); render(); }).catch(function (e) { toast(e.message); ws.disabled = false; ws.textContent = "Send WhatsApp template"; });
    };
    document.onkeydown = function (e) { if (e.key === "Escape" && state.openId !== null) closeSheet(); };
  }

  function save(isNew) {
    var d = state.draft;
    if (!String(d.name || "").trim()) { toast("Add the business name first"); return; }
    var btn = $("#saveBtn"); btn.disabled = true;
    var body = { name: d.name.trim(), contact: d.contact, phone: d.phone, email: d.email, city: d.city, website: d.website, niche: d.niche, source: d.source, stage: d.stage, priority: d.priority, value: d.value === "" ? 0 : +d.value, followUp: d.followUp, assignedTo: d.assignedTo, notes: d.notes, services: d.services };
    var p = isNew ? api("create", { lead: body }).then(function (j) { leads.push(j.lead); toast("Lead added"); }) : patch(state.openId, body, "", false);
    p.then(function () { closeSheet(); render(); }).catch(function (e) { if (isNew) toast(e.message); btn.disabled = false; });
  }

  // ---------- settings ----------
  function openSettings() {
    var owner = me.role === "owner";
    var root = $("#modalRoot");
    var teamHtml = users.map(function (u) {
      return '<div class="team-row"><div class="who2"><strong>' + esc(u.name || u.email) + "</strong> " + (u.role === "owner" ? '<span class="ok-pill">Owner</span>' : "") + (u.active ? "" : ' <span class="off-pill">Disabled</span>') + '<div class="help">' + esc(u.email) + "</div></div>" +
        (owner && u.email !== me.email ? '<button class="btn sm" type="button" data-reset="' + esc(u.email) + '">Set password</button><button class="btn sm" type="button" data-toggle="' + esc(u.email) + '" data-active="' + u.active + '">' + (u.active ? "Disable" : "Enable") + '</button><button class="btn sm danger" type="button" data-remove="' + esc(u.email) + '">Remove</button>' : "") + "</div>";
    }).join("");
    var w = wa || {};
    root.innerHTML = '<div class="scrim" id="mScrim"></div><div class="modal" role="dialog" aria-modal="true" aria-label="Settings"><div class="modal-card">' +
      '<div class="actions"><h2 style="margin-right:auto">Settings</h2><button class="btn sm" type="button" id="mClose">Close</button></div>' +
      '<section><h3>Your password</h3><div class="grid2"><label class="f"><span>Current password</span><input type="password" id="pw-cur" autocomplete="current-password"></label><label class="f"><span>New password (8+)</span><input type="password" id="pw-new" autocomplete="new-password"></label></div><div><button class="btn sm" type="button" id="pwSave">Change password</button></div></section>' +
      '<section><h3>Team</h3>' + teamHtml +
      (owner ? '<div class="grid2"><label class="f"><span>Name</span><input type="text" id="t-name"></label><label class="f"><span>Email</span><input type="email" id="t-email"></label><label class="f"><span>Temporary password (8+)</span><input type="text" id="t-pw" autocomplete="off"></label><label class="f"><span>Role</span><select id="t-role"><option value="member">Team member</option><option value="owner">Owner (can manage team &amp; delete)</option></select></label></div><div><button class="btn sm primary" type="button" id="tAdd">Add team member</button></div><p class="help">Share the sign-in link <strong>mediamozak.com/crm</strong> and the temporary password with them; they can change it here after signing in.</p>' : '<p class="help">Only the owner can add or remove team members.</p>') + "</section>" +
      '<section><h3>WhatsApp Business ' + (w.configured ? '<span class="ok-pill">Connected</span>' : '<span class="off-pill">Not set up</span>') + "</h3>" +
      (owner ? '<p class="help">Uses Meta\'s WhatsApp Cloud API. Alerts and replies are sent as approved templates. Alert template variables: {{1}} name, {{2}} phone, {{3}} service, {{4}} source. Reply template variables: {{1}} lead first name, {{2}} your name.</p>' +
        '<div class="grid2"><label class="f"><span>Phone number ID</span><input type="text" id="w-phoneId" value="' + esc(w.phoneId || "") + '"></label>' +
        '<label class="f"><span>Access token ' + (w.configured ? "(leave blank to keep)" : "") + '</span><input type="password" id="w-token" autocomplete="off"></label>' +
        '<label class="f"><span>Alert numbers (comma separated)</span><input type="text" id="w-alertTo" value="' + esc(w.alertTo || "") + '" placeholder="917982984658"></label>' +
        '<label class="f"><span>New-lead alert template</span><input type="text" id="w-alertTemplate" value="' + esc(w.alertTemplate || "") + '" placeholder="new_lead_alert"></label>' +
        '<label class="f"><span>Reply template</span><input type="text" id="w-replyTemplate" value="' + esc(w.replyTemplate || "") + '" placeholder="lead_followup"></label>' +
        '<label class="f"><span>Template language</span><input type="text" id="w-lang" value="' + esc(w.alertLang || "en") + '"></label></div><div><button class="btn sm primary" type="button" id="wSave">Save WhatsApp settings</button></div>' : '<p class="help">Ask the owner to set up WhatsApp.</p>') + "</section>" +
      '<section><h3>Automatic emails</h3><p class="help">Every new lead is emailed to mediamozak@gmail.com instantly. A follow-up summary (overdue + due today) goes to you and the team every day at 9 AM IST.</p></section>' +
      "</div></div>";
    var close = function () { root.innerHTML = ""; };
    $("#mScrim").onclick = close; $("#mClose").onclick = close;
    $("#pwSave").onclick = function () {
      api("password", { currentPassword: $("#pw-cur").value, newPassword: $("#pw-new").value }).then(function () { toast("Password changed"); $("#pw-cur").value = $("#pw-new").value = ""; }).catch(function (e) { toast(e.message); });
    };
    if (!owner) return;
    var refreshTeam = function (msg) { toast(msg); load().then(openSettings); };
    $("#tAdd").onclick = function () {
      api("saveUser", { name: $("#t-name").value, email: $("#t-email").value, password: $("#t-pw").value, role: $("#t-role").value, active: true }).then(function () { refreshTeam("Team member added"); }).catch(function (e) { toast(e.message); });
    };
    root.querySelectorAll("[data-reset]").forEach(function (b) {
      b.onclick = function () {
        var row = b.closest(".team-row");
        if (row.querySelector(".pw-inline")) return;
        row.insertAdjacentHTML("beforeend", '<div class="pw-inline actions" style="width:100%"><input type="text" placeholder="New password (8+)" aria-label="New password" style="flex:1"><button class="btn sm primary" type="button">Save</button></div>');
        row.querySelector(".pw-inline button").onclick = function () {
          api("saveUser", { email: b.dataset.reset, password: row.querySelector(".pw-inline input").value }).then(function () { refreshTeam("Password updated"); }).catch(function (e) { toast(e.message); });
        };
      };
    });
    root.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.onclick = function () { api("saveUser", { email: b.dataset.toggle, active: b.dataset.active !== "true" }).then(function () { refreshTeam("Updated"); }).catch(function (e) { toast(e.message); }); };
    });
    root.querySelectorAll("[data-remove]").forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.confirm) { api("deleteUser", { email: b.dataset.remove }).then(function () { refreshTeam("Removed"); }).catch(function (e) { toast(e.message); }); }
        else { b.dataset.confirm = "1"; b.textContent = "Confirm remove"; }
      };
    });
    $("#wSave").onclick = function () {
      var lang = $("#w-lang").value || "en";
      api("waConfig", { config: { phoneId: $("#w-phoneId").value, token: $("#w-token").value, alertTo: $("#w-alertTo").value, alertTemplate: $("#w-alertTemplate").value, replyTemplate: $("#w-replyTemplate").value, alertLang: lang, replyLang: lang } })
        .then(function (s) { wa = s; toast("WhatsApp settings saved"); openSettings(); }).catch(function (e) { toast(e.message); });
    };
  }

  function exportCsv() {
    var cols = ["name", "contact", "phone", "email", "website", "city", "niche", "services", "source", "stage", "priority", "value", "followUp", "assignedTo", "budget", "callTime", "notes", "createdAt"];
    var q = function (v) { return '"' + String(Array.isArray(v) ? v.join("; ") : v == null ? "" : v).replace(/"/g, '""') + '"'; };
    var csv = "﻿" + [cols.join(",")].concat(filtered().map(function (l) { return cols.map(function (c) { return q(l[c]); }).join(","); })).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "mediamozak-leads-" + today() + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- boot ----------
  api("me").then(function (j) { me = j.user; start(); }).catch(function (e) {
    if (e.status === 401) renderAuth(!!(e.body && e.body.needsSetup));
    else { $("#app").innerHTML = '<div class="boot-msg"><div class="mark">M</div><p>' + esc(e.message) + '</p><button class="btn" onclick="location.reload()">Try again</button></div>'; }
  });
})();
