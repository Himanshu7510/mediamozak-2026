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
  // Exactly the services listed on mediamozak.com/services, plus "Other".
  // "wd" = web development line, everything else = digital marketing.
  var SERVICE_GROUPS = [
    { id: "web", line: "wd", name: "Web Development Services" },
    { id: "social", line: "dm", name: "Social Media Marketing Services" },
    { id: "perf", line: "dm", name: "Performance Marketing Services" },
    { id: "ecom", line: "dm", name: "E-com Marketing" },
    { id: "qcom", line: "dm", name: "Quick-com Marketing" },
    { id: "leadgen", line: "dm", name: "Lead Generation Services" },
    { id: "seo", line: "dm", name: "Search Engine Optimization (SEO)" },
    { id: "other", line: "", name: "Other" },
  ];
  SERVICE_GROUPS.forEach(function (g) { g.items = [g.name]; });
  var SERVICES = { dm: [], wd: [] };
  var GROUP_OF = {};
  SERVICE_GROUPS.forEach(function (g) { g.items.forEach(function (x) { if (SERVICES[g.line]) SERVICES[g.line].push(x); GROUP_OF[x] = g; }); });
  var groupsOf = function (l) { var out = []; (l.services || []).forEach(function (x) { var g = GROUP_OF[x]; if (g && out.indexOf(g) < 0) out.push(g); }); return out; };
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
  var state = { view: "board", q: "", line: "all", service: "", source: "", niche: "", owner: "", openId: null, confirmDel: false, draft: null };
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
      (me.role === "owner" ? '<button class="btn sm ghost" id="integBtn" type="button">Integrations</button>' : "") +
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
      '<select id="fService" aria-label="Filter by service"><option value="">All services</option>' + SERVICE_GROUPS.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + "</option>"; }).join("") + "</select>" +
      '<select id="fSource" aria-label="Filter by source"><option value="">All sources</option>' + SOURCES.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") + "</select>" +
      '<select id="fNiche" aria-label="Filter by industry"><option value="">All industries</option>' + NICHES.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") + "</select>" +
      '<select id="fOwner" aria-label="Filter by owner"><option value="">Everyone</option><option value="__me">Mine</option><option value="__none">Unassigned</option></select></div>' +
      '<div id="view"></div></main>';

    $("#q").oninput = function (e) { state.q = e.target.value.toLowerCase(); render(); };
    $("#fSource").onchange = function (e) { state.source = e.target.value; render(); };
    $("#fService").onchange = function (e) { state.service = e.target.value; render(); };
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
    if ($("#integBtn")) $("#integBtn").onclick = function () { openSettings(); setTimeout(function () { var b = $("#intBox"); if (b) b.scrollIntoView({ block: "start" }); }, 50); };
    $("#logoutBtn").onclick = function () { api("logout", {}).finally(function () { me = null; renderAuth(false); }); };

    var h = location.hash.replace("#", "");
    if (["board", "list", "follow", "insights"].indexOf(h) >= 0) state.view = h;
    var m = location.hash.match(/lead=([\w-]+)/);
    render();
    load().then(function () { if (m) openSheet(m[1]); });
    if (me.role === "owner") checkSystem();
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
      if (state.service && !groupsOf(l).some(function (g) { return g.id === state.service; })) return false;
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
    var h = "";
    groupsOf(l).forEach(function (g) { h += '<span class="chip ' + (g.line || "src") + '">' + esc(g.name) + "</span>"; });
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
    var dmV = leads.filter(function (l) { return isOpen(l) && lineOf(l).dm; }).reduce(function (t, l) { return t + (+l.value || 0); }, 0);
    var wdV = leads.filter(function (l) { return isOpen(l) && lineOf(l).wd; }).reduce(function (t, l) { return t + (+l.value || 0); }, 0);
    return '<div class="ins">' +
      '<div class="panel"><h3>Leads by source</h3><div class="bars">' + barRows(by("source")) + "</div></div>" +
      '<div class="panel"><h3>Revenue won by source</h3><div class="bars">' + (barRows(wonRows, "good") || '<div class="col-hint">Win your first deal to see which source pays best.</div>') + "</div></div>" +
      '<div class="panel"><h3>Pipeline by stage</h3><div class="bars">' + barRows(STAGES.map(function (s) { return [s.name, leads.filter(function (l) { return l.stage === s.id; }).length]; })) + "</div></div>" +
      '<div class="panel"><h3>Leads by service</h3><div class="bars">' + barRows(SERVICE_GROUPS.map(function (g) { return [g.name, leads.filter(function (l) { return groupsOf(l).indexOf(g) >= 0; }).length]; }).sort(function (a, b) { return b[1] - a[1]; }), "wd") + '</div></div>' +
      '<div class="panel"><h3>Open pipeline by service line</h3><div class="bars">' + barRows([["Digital marketing", dmV, inrShort(dmV)], ["Web development", wdV, inrShort(wdV)]]) + '</div></div>' +
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
    var svcGrp = function (g) { return '<div class="grp">' + (g.name ? "<span>" + esc(g.name) + "</span>" : "") + g.items.map(function (x, i) { return '<label><input type="checkbox" id="svc-' + g.id + "-" + i + '" value="' + esc(x) + '"' + (d.services.indexOf(x) >= 0 ? " checked" : "") + "> " + esc(x) + "</label>"; }).join("") + "</div>"; };
    var legacy = d.services.filter(function (x) { return !GROUP_OF[x]; });
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
      '<div class="f"><span>Services they need</span><div class="svc">' + svcGrp({ id: "svc", name: "", items: SERVICE_GROUPS.map(function (g) { return g.name; }).concat(legacy) }) + "</div></div>" +
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
    root.innerHTML = '<div class="scrim" id="mScrim"></div><div class="modal" role="dialog" aria-modal="true" aria-label="Settings"><div class="modal-card" style="width:min(980px,100%)">' +
      '<div class="actions"><h2 style="margin-right:auto">Settings</h2><button class="btn sm" type="button" id="mClose">Close</button></div>' +
      '<section><h3>Your password</h3><div class="grid2"><label class="f"><span>Current password</span><input type="password" id="pw-cur" autocomplete="current-password"></label><label class="f"><span>New password (8+)</span><input type="password" id="pw-new" autocomplete="new-password"></label></div><div><button class="btn sm" type="button" id="pwSave">Change password</button></div></section>' +
      '<section><h3>Team</h3>' + teamHtml +
      (owner ? '<div class="grid2"><label class="f"><span>Name</span><input type="text" id="t-name"></label><label class="f"><span>Email</span><input type="email" id="t-email"></label><label class="f"><span>Temporary password (8+)</span><input type="text" id="t-pw" autocomplete="off"></label><label class="f"><span>Role</span><select id="t-role"><option value="member">Team member</option><option value="owner">Owner (can manage team &amp; delete)</option></select></label></div><div><button class="btn sm primary" type="button" id="tAdd">Add team member</button></div><p class="help">Share the sign-in link <strong>mediamozak.com/crm</strong> and the temporary password with them; they can change it here after signing in.</p>' : '<p class="help">Only the owner can add or remove team members.</p>') + "</section>" +
      (owner ? '<section id="intBox"><h3>Integrations &amp; API keys</h3><p class="help">Loading…</p></section>' : "") +
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
    renderIntegrations();
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

  var sys = null;
  function checkSystem() {
    return api("system").then(function (st) {
      sys = st;
      var n = $("#notice");
      if (n && st.backend === "outdated") {
        n.innerHTML = 'Finish setup (2 min): update the CRM backend to connect Meta Lead Ads, Google Ads, IndiaMART, JustDial, LinkedIn and the AI chatbot. <button class="btn sm" type="button" id="openSetup">Show me how</button>';
        n.hidden = false;
        $("#openSetup").onclick = openSetupGuide;
      }
      return st;
    }).catch(function () {});
  }

  function openSetupGuide() {
    var root = $("#modalRoot");
    root.innerHTML = '<div class="scrim" id="gScrim"></div><div class="modal" role="dialog" aria-modal="true" aria-label="Update CRM backend"><div class="modal-card">' +
      '<div class="actions"><h2 style="margin-right:auto">Update the CRM backend</h2><button class="btn sm" type="button" id="gClose">Close</button></div>' +
      '<p class="help">Your leads live in the “Mediamozak Website Leads” Google Sheet. Its script needs a one-time update to version ' + esc((sys && sys.backendVersion) || "4") + '. Your leads are not touched.</p>' +
      '<ol style="display:flex;flex-direction:column;gap:10px;padding-left:20px;margin:0">' +
      '<li><button class="btn primary sm" type="button" id="copyCode">Copy backend code</button> <span class="help" id="copyMsg"></span></li>' +
      '<li>Open the <a href="https://docs.google.com/spreadsheets/d/1Z13tW-kHxLDqG9j975nZZGzIqSJF8zr1AxZn-S6PvqY/edit" target="_blank" rel="noopener">leads sheet</a> → <strong>Extensions → Apps Script</strong>.</li>' +
      '<li>Click in the code, press <strong>Ctrl + A</strong>, then <strong>Ctrl + V</strong> to replace everything. Press <strong>Ctrl + S</strong>.</li>' +
      '<li>In the function dropdown pick <strong>authorize</strong> → <strong>▷ Run</strong> → allow the permissions (Advanced → Go to … → Allow).</li>' +
      '<li><strong>Deploy → Manage deployments</strong> → pick the deployment ending <strong>…YhQw</strong> → ✏️ → Version: <strong>New version</strong> → Deploy.</li>' +
      '<li><button class="btn sm" type="button" id="recheck">Check again</button> <span class="help" id="recheckMsg"></span></li></ol>' +
      '<textarea id="codeBox" readonly style="min-height:120px;font-family:var(--mono);font-size:12px" hidden aria-label="Backend code"></textarea>' +
      "</div></div>";
    var close = function () { root.innerHTML = ""; };
    $("#gScrim").onclick = close; $("#gClose").onclick = close;
    $("#copyCode").onclick = function () {
      var btn = $("#copyCode"); btn.disabled = true;
      api("backendCode").then(function (j) {
        var box = $("#codeBox"); box.value = j.code;
        var done = function () { $("#copyMsg").textContent = "Copied ✓ — now paste it in Apps Script."; btn.disabled = false; };
        if (navigator.clipboard) navigator.clipboard.writeText(j.code).then(done, function () { box.hidden = false; box.select(); $("#copyMsg").textContent = "Press Ctrl + C to copy the selected code."; btn.disabled = false; });
        else { box.hidden = false; box.select(); $("#copyMsg").textContent = "Press Ctrl + C to copy the selected code."; btn.disabled = false; }
      }).catch(function (e) { toast(e.message); btn.disabled = false; });
    };
    $("#recheck").onclick = function () {
      $("#recheckMsg").textContent = "Checking…";
      checkSystem().then(function (st) {
        if (st && st.backend === "ok") { $("#recheckMsg").textContent = "✓ Backend is up to date. API options are ready in Settings."; var n = $("#notice"); if (n) n.hidden = true; }
        else $("#recheckMsg").textContent = "Not updated yet. Make sure you chose “New version” on the …YhQw deployment.";
      });
    };
  }

  function renderIntegrations() {
    var box = $("#intBox"); if (!box) return;
    api("integrations").then(function (it) {
      if (Number(it.backendVersion || 4) < 5) throw new Error("outdated");
      var pill = function (on, txt) { return on ? '<span class="ok-pill">' + (txt || "Connected") + "</span>" : '<span class="off-pill">Not connected</span>'; };
      var copyRow = function (label, value) {
        return '<label class="f"><span>' + label + '</span><div class="actions"><code class="num" style="background:var(--raised);padding:6px 8px;border-radius:6px;user-select:all;overflow-wrap:anywhere;flex:1;min-width:0">' + esc(value) + '</code><button class="btn sm" type="button" data-copy="' + esc(value) + '">Copy</button></div></label>';
      };
      var keyRow = function (name, ph, isSet) {
        return '<div class="actions"><input type="password" id="k-' + name + '" placeholder="' + esc(ph) + '" autocomplete="off" style="flex:1;min-width:200px"><button class="btn sm primary" type="button" data-savekey="' + name + '">' + (isSet ? "Replace" : "Save") + "</button>" +
          (isSet ? '<button class="btn sm danger" type="button" data-clearkey="' + name + '">Remove</button>' : "") + "</div>";
      };
      var lastFrom = function (src) {
        var l = leads.filter(function (x) { return x.source === src; }).sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); })[0];
        return l ? '<p class="help">Last lead: ' + esc(new Date(l.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })) + " · " + esc(l.name || l.contact) + "</p>" : "";
      };
      var steps = function (arr) { return '<details class="box"><summary>How to connect</summary><ol class="help" style="margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px">' + arr.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol></details>"; };
      var card = function (title, status, body) { return '<div class="panel" style="padding:12px;display:flex;flex-direction:column;gap:10px"><div class="actions"><strong style="margin-right:auto">' + title + "</strong>" + status + "</div>" + body + "</div>"; };
      var jdUrl = it.leadApi.url + "?key=" + encodeURIComponent(it.leadApi.key) + "&source=JustDial";
      var sample = JSON.stringify({ name: "Rohit Sharma", phone: "9876543210", email: "rohit@example.com", business: "Sharma Dental", city: "Delhi", service: "Search Engine Optimization (SEO)", message: "Need more patients from Google", source: "LinkedIn", id: "your-lead-id-123" }, null, 2);

      box.innerHTML = "<h3>Integrations &amp; API keys</h3><p class=\"help\">Connect each platform once; its leads then arrive in the CRM automatically with the right source and an email alert. Keys are stored securely in your Google backend, never in the sheet.</p>" +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">' +

        card("🤖 AI chatbot (Anthropic)", pill(it.anthropic.set, it.anthropic.fromVercel ? "Set on Vercel" : "Connected"),
          '<p class="help">Powers the chat assistant on mediamozak.com (leads tagged “AI chatbot”).</p>' + lastFrom("AI chatbot") +
          (it.anthropic.fromVercel ? '<p class="help">This key is set in Vercel and takes priority.</p>' : keyRow("anthropic", "sk-ant-…", it.anthropic.set)) +
          steps(["Go to console.anthropic.com → sign in.", "Settings → Billing → add credit (about $5 lasts a long time).", "Settings → API Keys → Create Key → copy it (starts with sk-ant-).", "Paste it above and Save. The chat button appears on your website within ~5 minutes."])) +

        card("📘 Meta Lead Ads (Facebook &amp; Instagram)", pill(it.meta.tokenSet),
          '<p class="help">Instant forms on Facebook and Instagram ads → CRM (tagged “Meta ads”, with campaign and ad name).</p>' + lastFrom("Meta ads") +
          copyRow("Callback URL", it.meta.callback) + copyRow("Verify token", it.meta.verifyToken) +
          '<label class="f"><span>Page access token</span></label>' + keyRow("metaToken", "EAAG… (Page access token with leads_retrieval)", it.meta.tokenSet) +
          '<label class="f"><span>App secret (optional, adds signature check)</span></label>' + keyRow("metaSecret", "App secret", it.meta.secretSet) +
          steps(["Open developers.facebook.com → your app (create a Business app if needed) → add the <strong>Webhooks</strong> product.", "Webhooks → choose <strong>Page</strong> → Subscribe to this object → paste the <strong>Callback URL</strong> and <strong>Verify token</strong> above → Verify and save → subscribe to the <strong>leadgen</strong> field.", "In Business settings → System users, generate a token for your Page with <strong>leads_retrieval, pages_show_list, pages_manage_metadata, pages_read_engagement</strong> → paste it above as Page access token.", "Connect the Page to the app (Graph API: POST /{page-id}/subscribed_apps?subscribed_fields=leadgen) or via the Lead Ads Testing Tool.", "Test with developers.facebook.com/tools/lead-ads-testing — the test lead should appear in the CRM."])) +

        card("🔎 Google Ads lead forms", '<span class="ok-pill">Ready</span>',
          '<p class="help">Lead form assets in Search, YouTube, Discovery &amp; Performance Max → CRM (tagged “Google ads”).</p>' + lastFrom("Google ads") +
          copyRow("Webhook URL", it.google.url) + copyRow("Key", it.google.key) +
          steps(["Google Ads → Assets → Lead forms → open your lead form (or create one).", "Lead delivery options → <strong>Webhook integration</strong>.", "Paste the <strong>Webhook URL</strong> and <strong>Key</strong> above.", "Click <strong>Send test data</strong> — a lead marked “TEST LEAD” should appear in the CRM. Save the form."])) +

        card("🛒 IndiaMART", pill(it.indiamart.set),
          '<p class="help">Buyer enquiries pulled every 10 minutes (tagged “IndiaMART”).</p>' + lastFrom("IndiaMART") +
          (it.indiamart.last ? '<p class="help">Last sync: ' + esc(it.indiamart.last) + "</p>" : "") +
          (it.indiamart.error ? '<p class="err" style="font-size:13px">' + esc(it.indiamart.error) + "</p>" : "") +
          keyRow("indiamart", "IndiaMART CRM key", it.indiamart.set) + (it.indiamart.set ? '<div><button class="btn sm" type="button" id="imSync">Sync now</button></div>' : "") +
          steps(["Log in to seller.indiamart.com (paid seller plan).", "Lead Manager → ⋮ → Import/Export Leads → <strong>Pull API</strong> → Generate Key.", "Paste the key above and Save. Leads from the last 24 hours are imported on the first sync."])) +

        card("📒 JustDial", '<span class="ok-pill">Ready</span>',
          '<p class="help">JustDial pushes each enquiry to your link (tagged “JustDial”).</p>' + lastFrom("JustDial") +
          copyRow("Your JustDial lead URL", jdUrl) +
          steps(["Email or call your JustDial account manager and ask for <strong>“Lead API / CRM integration (GET push)”</strong>.", "Give them the URL above. JustDial sends name, mobile, email, category, city and area to it.", "Ask them to send a test lead — it should appear in the CRM."])) +

        card("💼 LinkedIn Lead Gen Forms", '<span class="ok-pill">Via Zapier / Make</span>',
          '<p class="help">LinkedIn only shares leads with approved partners, so connect through Zapier or Make (tagged “LinkedIn”).</p>' + lastFrom("LinkedIn") +
          steps(["In Zapier: trigger <strong>LinkedIn Lead Gen Forms → New Form Response</strong>.", "Action: <strong>Webhooks by Zapier → POST</strong> to the Lead API endpoint below.", "Add header <strong>X-API-Key</strong> = your Lead API key, and map fields name, phone, email, business, city, service, message, plus <strong>source = LinkedIn</strong> and <strong>id</strong> = the response ID.", "Turn on the Zap and submit a test form."])) +

        card("🔗 Lead API (Zapier, Make, Pabbly, other websites)", '<span class="ok-pill">Ready</span>',
          '<p class="help">Any tool can send leads here: Sulekha, UrbanCompany, TradeIndia, landing pages, Google Forms (via Apps Script), Typeform, etc.</p>' +
          copyRow("Endpoint (POST JSON or form; GET with ?key=)", it.leadApi.url) + copyRow("API key (header X-API-Key, or ?key=)", it.leadApi.key) +
          '<details class="box"><summary>Fields &amp; example</summary><p class="help">Fields: <code>name</code>, <code>phone</code>, <code>email</code>, <code>business</code>, <code>city</code>, <code>service</code> (one of your 7 services), <code>message</code>, <code>budget</code>, <code>source</code> (Meta ads, Google ads, JustDial, IndiaMART, LinkedIn, Referral, Website form, Other), <code>id</code> (prevents duplicates).</p><pre class="transcript" style="color:var(--ink)">' + esc(sample) + "</pre></details>" +
          '<div><button class="btn sm danger" type="button" id="regenKey">Regenerate API key</button></div>') +

        card("💬 WhatsApp Business", pill(wa && wa.configured),
          '<p class="help">New-lead alerts and one-click template replies. Set it up in the <strong>WhatsApp Business</strong> section below.</p>') +
        "</div>" +
        '<div class="actions"><button class="btn sm ghost" type="button" id="regenHooks">Regenerate Meta verify token &amp; Google key</button><span class="help">Only if they leak — you must re-enter them in Meta and Google afterwards.</span></div>';

      box.querySelectorAll("[data-savekey]").forEach(function (b) {
        b.onclick = function () {
          var v = $("#k-" + b.dataset.savekey).value.trim(); if (!v) { toast("Paste the key first"); return; }
          b.disabled = true;
          api("setKey", { name: b.dataset.savekey, value: v }).then(function () { toast("Saved"); renderIntegrations(); }).catch(function (e) { toast(e.message); b.disabled = false; });
        };
      });
      box.querySelectorAll("[data-clearkey]").forEach(function (b) {
        b.onclick = function () {
          if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Confirm remove"; return; }
          api("setKey", { name: b.dataset.clearkey, value: "" }).then(function () { toast("Removed"); renderIntegrations(); }).catch(function (e) { toast(e.message); });
        };
      });
      box.querySelectorAll("[data-copy]").forEach(function (b) {
        b.onclick = function () {
          var t = b.dataset.copy;
          if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast("Copied"); }, function () { toast("Select the text and copy it"); });
          else toast("Select the text and copy it");
        };
      });
      var confirmBtn = function (id, label, action, msg) {
        var el = $("#" + id); if (!el) return;
        el.onclick = function () {
          if (!el.dataset.confirm) { el.dataset.confirm = "1"; el.textContent = label; return; }
          api(action, {}).then(function () { toast(msg); renderIntegrations(); }).catch(function (e) { toast(e.message); });
        };
      };
      confirmBtn("regenKey", "Confirm: old key stops working", "regenApiKey", "New API key created");
      confirmBtn("regenHooks", "Confirm: re-enter them in Meta & Google", "regenHookKeys", "New webhook keys created");
      var sy = $("#imSync");
      if (sy) sy.onclick = function () {
        sy.disabled = true; sy.textContent = "Syncing…";
        api("imSync", {}).then(function (j) { toast(j.added ? j.added + " new IndiaMART lead(s) added" : "No new IndiaMART leads"); load(); renderIntegrations(); })
          .catch(function (e) { toast(e.message); sy.disabled = false; sy.textContent = "Sync now"; });
      };
    }).catch(function () {
      box.innerHTML = '<h3>Integrations &amp; API keys</h3><p class="help">Connect Meta Lead Ads, Google Ads lead forms, IndiaMART, JustDial, LinkedIn, Zapier and the AI chatbot here. First, a one-time 2-minute update of the CRM backend is needed.</p><div><button class="btn sm primary" type="button" id="setupFromSettings">Update backend (2 min)</button></div>';
      $("#setupFromSettings").onclick = openSetupGuide;
    });
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
