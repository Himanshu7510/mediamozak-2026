(function () {
  "use strict";

  // Old single-page links like mediamozak.com/#contact → real pages
  var OLD = { "#about": "/about/", "#services": "/services/", "#faqs": "/faqs/", "#contact": "/contact/", "#privacy": "/privacy-policy/", "#terms": "/terms-and-conditions/", "#blog": "/" };
  if (location.pathname === "/" && OLD[location.hash]) location.replace(OLD[location.hash]);
  if (location.pathname === "/" && /^#service-/.test(location.hash)) location.replace("/services/" + location.hash.slice(9) + "/");

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
    if (typeof window.gtag === "function") window.gtag("event", "generate_lead", { service: fd.get("service"), method: channel });
    if (typeof window.fbq === "function") window.fbq("track", "Lead", { content_name: fd.get("service") });

    // ---- Option 1: WhatsApp — opens a chat with the details pre-filled ----
    if (channel === "WhatsApp") {
      var waLink = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(whatsappText(fd));
      var win = window.open(waLink, "_blank"); // must run immediately on click so it isn't blocked
      showSuccess("WhatsApp", waLink);
      if (!win) location.href = waLink;         // pop-up blocked (common on phones) → open in same tab
      return;
    }

    // ---- Option 2: Email — delivered to the Gmail inbox ----
    setBusy(true, "Email");
    sendToEmail(fd).then(function () {
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
