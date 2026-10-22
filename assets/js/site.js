(function () {
  "use strict";

  // Old single-page links like mediamozak.com/#contact → real pages
  var OLD = { "#about": "/about/", "#services": "/services/", "#faqs": "/faqs/", "#contact": "/contact/", "#privacy": "/privacy-policy/", "#terms": "/terms-and-conditions/", "#blog": "/blog/" };
  if (location.pathname === "/" && OLD[location.hash]) location.replace(OLD[location.hash]);
  if (location.pathname === "/" && /^#service-/.test(location.hash)) location.replace("/services/" + location.hash.slice(9) + "/");

  // ---------- Analytics events (read by Google Tag Manager) ----------
  window.dataLayer = window.dataLayer || [];
  function track(event, params) {
    var data = { event: event };
    for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) data[k] = params[k];
    window.dataLayer.push(data);
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (a) track("phone_click", { link_url: a.getAttribute("href") });
  });

  // ---------- Mobile menu ----------
  var toggle = document.getElementById("menu-toggle");
  var menu = document.getElementById("mobile-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("hidden") === false;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      toggle.querySelector(".icon-open").classList.toggle("hidden", open);
      toggle.querySelector(".icon-close").classList.toggle("hidden", !open);
    });
  }

  // ---------- WhatsApp enquiry pop-up ----------
  // Every wa.me link on the site opens this short form first; the answers are
  // added to the WhatsApp message so the team knows the lead before replying.
  (function () {
    var WA_NUMBER = "917982984658";
    var SERVICES = ["Web Development Services", "Social Media Marketing Services", "Performance Marketing Services", "E-com Marketing", "Quick-com Marketing", "Lead Generation Services", "Search Engine Optimization (SEO)", "Not sure yet / Multiple services"];
    var SLUGS = { "web-development-services": 0, "social-media-marketing-services": 1, "performance-marketing-services": 2, "e-com-marketing": 3, "quick-com-marketing": 4, "lead-generation-services": 5, "search-engine-optimization": 6 };
    var BUSINESS = ["Local business (shop, clinic, restaurant)", "E-commerce / D2C brand", "B2B / services company", "Startup", "Other"];
    var BUDGET = ["Under ₹25,000", "₹25,000 – ₹50,000", "₹50,000 – ₹1,00,000", "Above ₹1,00,000", "Not decided yet"];
    var WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function pills(name, items) {
      return items.map(function (v, i) {
        var id = "wa-" + name + "-" + i;
        return '<input type="radio" class="wa-pill-input" name="' + name + '" id="' + id + '" value="' + esc(v) + '"><label class="wa-pill" for="' + id + '">' + esc(v) + "</label>";
      }).join("");
    }

    var root = document.createElement("div");
    root.className = "wa-backdrop";
    root.hidden = true;
    root.innerHTML =
      '<div class="wa-dialog" role="dialog" aria-modal="true" aria-labelledby="wa-title" aria-describedby="wa-desc">' +
        '<button type="button" class="wa-close" aria-label="Close">&times;</button>' +
        '<div class="wa-head"><span class="wa-icon">' + WA_SVG + '</span><div><h2 id="wa-title">Chat with us on WhatsApp</h2>' +
        '<p id="wa-desc">Answer 4 quick questions so we can reply with the right advice.</p></div></div>' +
        '<form class="wa-form" novalidate>' +
          '<div class="wa-field"><label for="wa-name">1. Your name</label><input id="wa-name" name="name" type="text" autocomplete="name" maxlength="80" placeholder="e.g. Rahul Sharma"></div>' +
          '<div class="wa-field"><label for="wa-service">2. Which service do you need?</label><select id="wa-service" name="service"><option value="">Select a service</option>' +
            SERVICES.map(function (s) { return "<option>" + esc(s) + "</option>"; }).join("") + "</select></div>" +
          '<fieldset class="wa-field"><legend>3. What type of business do you have?</legend><div class="wa-pills">' + pills("business", BUSINESS) + "</div></fieldset>" +
          '<fieldset class="wa-field"><legend>4. What is your approximate budget?</legend><div class="wa-pills">' + pills("budget", BUDGET) + "</div></fieldset>" +
          '<p class="wa-error" role="alert" hidden></p>' +
          '<button type="submit" class="wa-submit">' + WA_SVG + "<span>Continue to WhatsApp</span></button>" +
          '<p class="wa-note">Your answers are added to the WhatsApp message. Just tap Send.</p>' +
        "</form>" +
      "</div>";
    document.body.appendChild(root);

    var dialog = root.querySelector(".wa-dialog");
    var waForm = root.querySelector(".wa-form");
    var err = root.querySelector(".wa-error");
    var lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      err.hidden = true;
      root.querySelectorAll(".wa-invalid").forEach(function (el) { el.classList.remove("wa-invalid"); });
      var m = location.pathname.match(/^\/services\/([^/]+)\//);
      var sel = waForm.elements.service;
      if (m && SLUGS[m[1]] !== undefined && !sel.value) sel.value = SERVICES[SLUGS[m[1]]];
      root.hidden = false;
      document.documentElement.classList.add("wa-lock");
      setTimeout(function () { (waForm.elements.name.value ? sel : waForm.elements.name).focus(); }, 30);
      track("whatsapp_popup_open", {});
    }
    function close() {
      root.hidden = true;
      document.documentElement.classList.remove("wa-lock");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href*="wa.me/"], a[href*="api.whatsapp.com/"]');
      if (!a || root.contains(a)) return;
      e.preventDefault();
      open();
    });
    root.querySelector(".wa-close").addEventListener("click", close);
    root.addEventListener("click", function (e) { if (e.target === root) close(); });
    document.addEventListener("keydown", function (e) {
      if (root.hidden) return;
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Tab") { // keep keyboard focus inside the pop-up
        var f = dialog.querySelectorAll("button, input, select");
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    waForm.addEventListener("change", function () {
      root.querySelectorAll(".wa-invalid").forEach(function (el) {
        var input = el.querySelector("input:checked, select, input[type=text]");
        if (input && (input.type === "radio" ? input.checked : input.value.trim())) el.classList.remove("wa-invalid");
      });
    });

    waForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = waForm.elements;
      var vals = {
        name: f.name.value.trim(),
        service: f.service.value,
        business: (waForm.querySelector('input[name="business"]:checked') || {}).value,
        budget: (waForm.querySelector('input[name="budget"]:checked') || {}).value,
      };
      var missing = [];
      [["name", f.name], ["service", f.service], ["business", waForm.querySelector('input[name="business"]')], ["budget", waForm.querySelector('input[name="budget"]')]].forEach(function (p) {
        var box = p[1].closest(".wa-field");
        var bad = !vals[p[0]];
        box.classList.toggle("wa-invalid", bad);
        if (bad) missing.push(box);
      });
      if (missing.length) {
        err.textContent = "Please answer all 4 questions so we can help you faster.";
        err.hidden = false;
        var firstBad = missing[0].querySelector("input, select");
        if (firstBad) firstBad.focus();
        return;
      }
      var text = [
        "Hello Mediamozak Team! I would like to enquire about your services.",
        "",
        "*Name:* " + vals.name,
        "*Service:* " + vals.service,
        "*Business type:* " + vals.business,
        "*Budget:* " + vals.budget,
        "*Page:* " + location.href.split("#")[0],
      ].join("\n");
      var url = "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(text);
      track("generate_lead", { lead_method: "WhatsApp pop-up", lead_service: vals.service, business_type: vals.business, budget: vals.budget });
      if (typeof window.fbq === "function") window.fbq("track", "Lead", { content_name: vals.service });
      var win = window.open(url, "_blank"); // runs inside the click, so it isn't blocked
      close();
      if (!win) location.href = url; // pop-up blocked (common on phones): open in the same tab
    });
  })();

  // ---------- Contact form ----------
  var form = document.getElementById("contact-form");
  if (!form) return;

  var LEADS_EMAIL = "mediamozak@gmail.com";
  var errorBox = document.getElementById("form-error");
  var successBox = document.getElementById("form-success");
  var WHATSAPP_NUMBER = "917982984658";
  var buttons = form.querySelectorAll('button[type="submit"]');
  var channelInput = document.getElementById("lead-channel");
  var lastChannel = "Email";
  buttons.forEach(function (b) { b.addEventListener("click", function () { lastChannel = b.dataset.channel; }); });

  function setBusy(busy, activeChannel) {
    buttons.forEach(function (b) {
      b.disabled = busy;
      var l = b.querySelector(".btn-label");
      if (!l.dataset.orig) l.dataset.orig = l.textContent;
      l.textContent = busy && b.dataset.channel === activeChannel ? "Sending…" : l.dataset.orig;
    });
  }

  function whatsappText(fd) {
    return [
      "*New Enquiry – Mediamozak Consulting*",
      "",
      "*Name:* " + fd.get("name"),
      "*Email:* " + fd.get("email"),
      "*Phone:* " + fd.get("phone"),
      "*Service:* " + fd.get("service"),
      "*Message:* " + fd.get("message"),
    ].join("\n");
  }

  function showSuccess(channel, waLink) {
    var title = document.getElementById("success-title");
    var text = document.getElementById("success-text");
    var again = document.getElementById("wa-again");
    if (channel === "WhatsApp") {
      title.textContent = "Almost done — tap “Send” in WhatsApp";
      text.innerHTML = "WhatsApp has opened with your enquiry already typed in. Just press <strong class=\"text-white\">Send</strong> to reach our team. If WhatsApp didn’t open, use the button below.";
      again.href = waLink;
      again.classList.remove("hidden");
      again.classList.add("inline-flex");
    }
    form.classList.add("hidden");
    successBox.classList.remove("hidden");
    successBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Pre-select a service when arriving from a service page: /contact/?service=seo-slug
  var wanted = new URLSearchParams(location.search).get("service");
  if (wanted) {
    var opt = form.querySelector('option[data-slug="' + wanted.replace(/[^a-z0-9-]/gi, "") + '"]');
    if (opt) opt.selected = true;
  }

  function showError(msg) {
    errorBox.innerHTML = msg;
    errorBox.classList.remove("hidden");
  }

  function validate() {
    var ok = true;
    form.querySelectorAll("[required]").forEach(function (el) {
      var valid = el.value.trim() !== "" && el.checkValidity();
      el.classList.toggle("invalid", !valid);
      el.setAttribute("aria-invalid", String(!valid));
      if (!valid && ok) { el.focus(); ok = false; }
    });
    return ok;
  }

  // FormSubmit — emails the lead straight to the Gmail inbox
  function sendToEmailOnce(fd) {
    return fetch("https://formsubmit.co/ajax/" + LEADS_EMAIL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        Website: "Mediamozak Consulting",
        Name: fd.get("name"),
        Email: fd.get("email"),
        Phone: fd.get("phone"),
        Service: fd.get("service"),
        Message: fd.get("message"),
        Page: location.href,
        _subject: "Mediamozak Consulting – New Enquiry from " + fd.get("name") + " (" + fd.get("service") + ")",
        _replyto: fd.get("email"),
        _template: "table",
        _captcha: "false",
      }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || String(res.j.success) === "false") {
          // First ever submission returns an "activation required" notice — that still means FormSubmit received it.
          if (res.j && /activat/i.test(res.j.message || "")) return true;
          throw new Error("FormSubmit failed");
        }
        return true;
      });
  }
  // One automatic retry if the first attempt hits a network hiccup
  function sendToEmail(fd) {
    return sendToEmailOnce(fd).catch(function () {
      return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return sendToEmailOnce(fd); });
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBox.classList.add("hidden");
    if (form.querySelector('[name="_honey"]').value) return; // spam bot
    var channel = (e.submitter && e.submitter.dataset.channel) || lastChannel;
    if (!validate()) { showError("Please fill in all required fields with valid details."); return; }

    channelInput.value = channel;
    var fd = new FormData(form);
    if (typeof window.fbq === "function") window.fbq("track", "Lead", { content_name: fd.get("service") });

    // ---- Option 1: WhatsApp — opens a chat with the details pre-filled ----
    if (channel === "WhatsApp") {
      track("generate_lead", { lead_method: "Contact form - WhatsApp", lead_service: fd.get("service") });
      var waLink = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(whatsappText(fd));
      var win = window.open(waLink, "_blank"); // must run immediately on click so it isn't blocked
      showSuccess("WhatsApp", waLink);
      if (!win) location.href = waLink;         // pop-up blocked (common on phones) → open in same tab
      return;
    }

    // ---- Option 2: Email — delivered to the Gmail inbox ----
    setBusy(true, "Email");
    sendToEmail(fd).then(function () {
      track("generate_lead", { lead_method: "Contact form - Email", lead_service: fd.get("service") });
      showSuccess("Email");
    }).catch(function () {
      showError('Sorry, your message could not be sent by email. Please try <strong>Send on WhatsApp</strong>, or email us at <a class="underline" href="mailto:' + LEADS_EMAIL + '">' + LEADS_EMAIL + "</a>.");
      setBusy(false);
    });
  });

  form.querySelectorAll("[required]").forEach(function (el) {
    el.addEventListener("input", function () { if (el.classList.contains("invalid") && el.checkValidity() && el.value.trim()) { el.classList.remove("invalid"); el.removeAttribute("aria-invalid"); } });
  });
})();
