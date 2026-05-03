(() => {
  "use strict";

  const STORE_KEY = "basin_os_clean_store_v1";
  const RADAR_URLS = ["data/radar-leads.json", "radar-leads.json"];
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  const state = {
    page: "dashboard",
    queueFilter: "all",
    selectedLeadId: null,
    store: {
      leads: [],
      linkedinVerify: [],
      cpaVerify: [],
      research: [],
      skipped: [],
      notes: [],
      followUps: [],
      suppressed: [],
      handoffs: [],
      api: {
        groqKey: "",
        groqModel: "llama-3.3-70b-versatile"
      },
      lastRadar: null,
      lastLoadedFrom: "",
      lastLoadedAt: ""
    }
  };

  const PLAYBOOK = {
    methodAEmail: `Subject: Basin Ventures resource for [Role/Signal]

Hi [Name],

I came across [Signal] and thought your background as [Role] may make this worth a quick educational review.

Basin Ventures works with accredited investors on direct, tax-advantaged oil and gas ownership. This is not a recommendation, tax advice, or a guaranteed-return product. The first step would simply be a short director call so you can understand the structure and decide whether it is relevant.

Would it be worth sending a brief overview, or should I close the loop?

Best,
James`,
    methodAPhone: `Hi [Name], this is James with Basin Ventures in Southlake. I know this is out of the blue. I came across [Signal], and based on your background as [Role], I thought a short intro may be relevant. Do you have 30 seconds?

Basin works with accredited investors on direct, tax-advantaged oil and gas ownership. I am not calling to force a decision. The only goal is a short director call so you can understand the structure and decide whether it is even worth reviewing.

Would this week or next week be better?`,
    methodALinkedIn: `Hi [Name] — I came across your background around [Signal/Role]. I work with Basin Ventures in Southlake. We share educational information on direct, tax-advantaged energy ownership for accredited investors. No pitch here; I wanted to see if a short overview would be relevant.`,
    rebuttals: [
      ["Not interested", "Totally fair. I am not asking you to make a decision. Would it be unreasonable to understand the structure first and then decide if it is irrelevant?"],
      ["Send me information", "Absolutely. I can send a short overview. To make sure I send the right version, is this more for tax planning, diversification, or just general education?"],
      ["Talk to my CPA", "That is exactly what should happen. The director call is educational, and your CPA would need to confirm fit before anything moves forward."],
      ["Is this risky?", "All investments carry risk, and there are no guaranteed returns. The call is to understand the structure, risk profile, and whether it is even worth reviewing."]
    ]
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uid(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function showToast(message, isError = false) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", isError);
    el.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => el.classList.add("hidden"), 3500);
  }

  function setStatus(message, type = "") {
    const el = $("#statusBanner");
    if (!el) return;
    el.textContent = message;
    el.className = `status-banner ${type || ""}`.trim();
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state.store = {
        ...state.store,
        ...parsed,
        api: { ...state.store.api, ...(parsed.api || {}) },
        leads: parsed.leads || [],
        linkedinVerify: parsed.linkedinVerify || [],
        cpaVerify: parsed.cpaVerify || [],
        research: parsed.research || [],
        skipped: parsed.skipped || [],
        notes: parsed.notes || [],
        followUps: parsed.followUps || [],
        suppressed: parsed.suppressed || [],
        handoffs: parsed.handoffs || []
      };
    } catch (error) {
      console.warn("Store load failed:", error);
    }
  }

  function saveStore() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.store));
  }

  function normalizeContact(contact) {
    if (!contact) return null;
    if (typeof contact === "string") {
      const type = contact.includes("@") ? "email" : /linkedin/i.test(contact) ? "linkedin" : /\d{3}.*\d{3}.*\d{4}/.test(contact) ? "phone" : "other";
      return { type, value: contact, source: "imported" };
    }
    return {
      type: contact.type || "other",
      value: contact.value || contact.url || contact.email || contact.phone || "",
      source: contact.source || "imported"
    };
  }

  function detectSource(raw, contacts) {
    const blob = [raw.sourceType, raw.source, raw.sourceUrl, raw.sourceConfidence, raw.status].join(" ").toLowerCase();
    if (contacts.some(c => c.type === "email")) return "email";
    if (contacts.some(c => /linkedin/i.test(`${c.type} ${c.value}`))) return "linkedin";
    if (/cpa|tax|account/.test(blob)) return "cpa";
    if (/rss|news/.test(blob)) return "rss";
    if (/npi|registry/.test(blob)) return "npi";
    return raw.sourceType || "public";
  }

  function normalizeLead(raw) {
    const contacts = (raw.contactMethods || raw.contacts || [])
      .map(normalizeContact)
      .filter(c => c && c.value);

    const evidence = raw.evidenceTrail || raw.evidence || [];
    const sourceBlob = [raw.source, raw.sourceType, raw.sourceUrl, raw.queue, raw.status, raw.bucket, raw.sourceConfidence].join(" ").toLowerCase();
    const hasLinkedIn = contacts.some(c => /linkedin/i.test(`${c.type} ${c.value}`)) || /linkedin/.test(sourceBlob);
    const hasEmail = contacts.some(c => c.type === "email" || /@/.test(c.value));
    const hasPhone = contacts.some(c => c.type === "phone" || /\d{3}.*\d{3}.*\d{4}/.test(c.value));
    const sourceType = detectSource(raw, contacts);
    const isCpa = raw.isCPA === true || /cpa|tax|account/i.test([raw.title, raw.role, raw.specialty, raw.company, raw.signal, raw.summary, raw.sourceType].join(" "));
    const score = Number(raw.score || 0);
    const grade = raw.grade || (score >= 88 ? "A" : score >= 72 ? "B" : score >= 58 ? "C" : "D");

    const rawReady = Boolean(raw.associateReady || raw.readyToWork || raw.bucket === "ready" || raw.status === "Ready to Work");
    const isReady = Boolean(rawReady && hasEmail);
    const isLinkedInVerify = Boolean(!isReady && hasLinkedIn);
    const isCpaVerify = Boolean(!isReady && !isLinkedInVerify && isCpa && (raw.sourceUrl || evidence.length));
    const isSkipped = Boolean(!isReady && !isLinkedInVerify && !isCpaVerify);

    return {
      id: raw.id || uid("lead"),
      name: raw.name || "Unnamed Candidate",
      title: raw.title || raw.role || raw.specialty || "Professional",
      company: raw.company || raw.practice || "",
      location: raw.location || "",
      type: isCpa ? "cpa" : "investor",
      source: raw.source || raw.sourceType || sourceType || "Radar",
      sourceType,
      sourceUrl: raw.sourceUrl || "",
      signal: raw.signal || raw.summary || "",
      summary: raw.summary || "",
      fitReason: raw.fitReason || "Public professional signal; fit must be verified.",
      accreditedLikelyReason: raw.accreditedLikelyReason || "Accredited status must be confirmed by prospect.",
      contacts,
      evidence,
      score,
      grade,
      hasLinkedIn,
      hasEmail,
      hasPhone,
      isCPA: isCpa,
      associateReady: isReady,
      linkedinVerify: isLinkedInVerify,
      cpaVerify: isCpaVerify,
      skipped: isSkipped,
      bucket: isReady ? "ready" : isLinkedInVerify ? "linkedin-verify" : isCpaVerify ? "cpa-verify" : "skipped",
      workflowDay: Number(raw.workflowDay || raw.day || (isReady ? 1 : 0)),
      status: raw.status || (isReady ? "Ready to Work" : isLinkedInVerify ? "LinkedIn Verify" : isCpaVerify ? "CPA Verify" : "Skipped"),
      bestFirstAction: raw.bestFirstAction || bestAction({ hasEmail, hasLinkedIn, isCpaVerify, isReady }),
      notes: raw.notes || [],
      importedAt: new Date().toISOString(),
      raw
    };
  }

  function bestAction({ hasEmail, hasLinkedIn, isCpaVerify, isReady }) {
    if (isReady && hasEmail) return "Day 1: send evidence-based email first.";
    if (hasLinkedIn) return "Open LinkedIn manually, verify identity, paste bio, generate compliant sequence.";
    if (isCpaVerify) return "Review CPA/referral route and manually promote if useful.";
    return "Skipped: no warm route.";
  }

  function activeLeads() {
    return [...state.store.leads, ...state.store.linkedinVerify, ...state.store.cpaVerify, ...state.store.research];
  }

  function counts() {
    const active = activeLeads();
    return {
      total: active.length,
      ready: state.store.leads.length,
      linkedinVerify: state.store.linkedinVerify.length,
      cpaVerify: state.store.cpaVerify.length,
      research: state.store.research.length,
      skipped: state.store.skipped.length,
      email: active.filter(l => l.hasEmail).length,
      linkedin: active.filter(l => l.hasLinkedIn).length,
      phone: active.filter(l => l.hasPhone).length,
      cpa: active.filter(l => l.type === "cpa").length,
      A: active.filter(l => l.grade === "A").length,
      notes: state.store.notes.length,
      followUps: state.store.followUps.length
    };
  }

  function prioritySort(a, b) {
    const gradeRank = g => ({ A: 1, B: 2, C: 3, D: 4 }[g] || 5);
    const routeRank = lead => lead.associateReady ? 1 : lead.linkedinVerify ? 2 : lead.cpaVerify ? 3 : 8;
    return routeRank(a) - routeRank(b) || gradeRank(a.grade) - gradeRank(b.grade) || (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name);
  }

  function mergeManualWithRadar(manual, radar) {
    const byId = new Map();
    for (const lead of [...manual, ...radar]) byId.set(lead.id, lead);
    return Array.from(byId.values()).sort(prioritySort);
  }

  function ingestRadar(raw) {
    const ready = Array.isArray(raw.leads) ? raw.leads : [];
    const linkedinVerify = Array.isArray(raw.linkedinVerifyCandidates) ? raw.linkedinVerifyCandidates : [];
    const cpaVerify = Array.isArray(raw.cpaVerifyCandidates) ? raw.cpaVerifyCandidates : [];
    const research = Array.isArray(raw.researchCandidates) ? raw.researchCandidates : [];
    const skipped = Array.isArray(raw.skippedCandidates) ? raw.skippedCandidates : [];

    const readyLeads = ready.map(normalizeLead).filter(l => l.associateReady);
    const linkedinLeads = linkedinVerify.map(normalizeLead).filter(l => l.linkedinVerify);
    const cpaLeads = cpaVerify.map(normalizeLead).filter(l => l.cpaVerify);
    const researchLeads = research.map(normalizeLead).filter(l => !l.associateReady && !l.linkedinVerify && !l.cpaVerify && !l.skipped);
    const skippedLeads = skipped.map(normalizeLead).filter(l => l.skipped);

    const manualReady = state.store.leads.filter(l => l.sourceType === "manual" || l.manual);
    state.store.leads = mergeManualWithRadar(manualReady, readyLeads);
    state.store.linkedinVerify = linkedinLeads.sort(prioritySort);
    state.store.cpaVerify = cpaLeads.sort(prioritySort);
    state.store.research = researchLeads.sort(prioritySort);
    state.store.skipped = skippedLeads;
    state.store.lastRadar = raw;
    state.store.lastLoadedAt = new Date().toISOString();
    state.store.lastLoadedFrom = raw.__loadedFrom || "radar JSON";

    saveStore();
    updateAll();

    return {
      ready: readyLeads.length,
      linkedin: linkedinLeads.length,
      cpa: cpaLeads.length,
      research: researchLeads.length,
      skipped: skippedLeads.length,
      total: readyLeads.length + linkedinLeads.length + cpaLeads.length + researchLeads.length
    };
  }

  async function loadRadarData() {
    let lastError = null;

    for (const url of RADAR_URLS) {
      try {
        const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`${url} returned ${response.status}`);
        const json = await response.json();
        json.__loadedFrom = url;
        const result = ingestRadar(json);
        const stats = json.stats || {};
        setStatus(`Loaded ${result.total} active leads from ${url} · Ready ${result.ready} · LinkedIn Verify ${result.linkedin} · CPA Verify ${result.cpa} · Skipped ${result.skipped} · Groq ${stats.groqCalls || 0} · Brave ${stats.publicSearches || 0}`);
        return json;
      } catch (error) {
        lastError = error;
      }
    }

    setStatus(`Radar load failed: ${lastError?.message || "unknown error"}`, "error");
    throw lastError;
  }

  function kpi(num, label, hint = "") {
    return `<div class="kpi"><div class="num">${escapeHtml(num)}</div><div class="label">${escapeHtml(label)}</div>${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ""}</div>`;
  }

  function renderKpis() {
    const c = counts();
    const stats = state.store.lastRadar?.stats || {};
    $("#kpiStrip").innerHTML = [
      kpi(c.ready, "Ready", "Email-first"),
      kpi(c.linkedinVerify, "LinkedIn Verify", "Manual confirm"),
      kpi(c.cpaVerify, "CPA Verify", "Referral route"),
      kpi(c.email, "Email", "Warm route"),
      kpi(stats.groqCalls || 0, "Groq Calls", "Last run")
    ].join("");
  }

  function renderTabs() {
    const c = counts();
    const tabs = [
      ["all", `All ${c.total}`],
      ["ready", `Ready ${c.ready}`],
      ["linkedin", `LinkedIn Verify ${c.linkedinVerify}`],
      ["cpa", `CPA Verify ${c.cpaVerify}`],
      ["email", `Email ${c.email}`],
      ["A", `A Grade ${c.A}`]
    ];

    $("#queueTabs").innerHTML = tabs.map(([key, label]) => (
      `<button class="tab ${state.queueFilter === key ? "active" : ""}" data-filter="${key}">${escapeHtml(label)}</button>`
    )).join("");
  }

  function filteredLeads() {
    return activeLeads()
      .filter(lead => {
        const q = ($("#globalSearch")?.value || "").toLowerCase().trim();
        if (q) {
          const blob = [lead.name, lead.title, lead.company, lead.location, lead.signal, lead.summary, lead.contacts.map(c => c.value).join(" ")].join(" ").toLowerCase();
          if (!blob.includes(q)) return false;
        }
        if (state.queueFilter === "ready") return lead.associateReady;
        if (state.queueFilter === "linkedin") return lead.linkedinVerify;
        if (state.queueFilter === "cpa") return lead.cpaVerify;
        if (state.queueFilter === "email") return lead.hasEmail;
        if (state.queueFilter === "A") return lead.grade === "A";
        return true;
      })
      .sort(prioritySort);
  }

  function contactHtml(lead) {
    if (!lead.contacts.length) return `<span class="contact-pill missing">No contact method</span>`;
    return lead.contacts.map(c => {
      const value = escapeHtml(c.value);
      if (c.type === "email") return `<a class="contact-pill" href="mailto:${value}">EMAIL: ${value}</a>`;
      if (c.type === "phone") return `<a class="contact-pill" href="tel:${value}">PHONE: ${value}</a>`;
      if (/linkedin/i.test(`${c.type} ${c.value}`)) return `<a class="contact-pill" href="${value}" target="_blank" rel="noopener">LINKEDIN</a>`;
      return `<span class="contact-pill">${escapeHtml(c.type)}: ${value}</span>`;
    }).join("");
  }

  function leadCard(lead) {
    const tagClass = lead.associateReady ? "green" : lead.linkedinVerify ? "blue" : lead.cpaVerify ? "gold" : "red";
    return `
      <article class="lead-card">
        <div class="avatar">${escapeHtml((lead.name || "?").slice(0, 1))}</div>
        <div>
          <div class="lead-name">${escapeHtml(lead.name)}</div>
          <div class="lead-line">${escapeHtml(lead.title)} ${lead.company ? "· " + escapeHtml(lead.company) : ""} ${lead.location ? "· " + escapeHtml(lead.location) : ""}</div>
          <div class="tags">
            <span class="tag ${tagClass}">${escapeHtml(lead.status)}</span>
            <span class="tag gold">Score ${escapeHtml(lead.score)}</span>
            <span class="tag blue">${escapeHtml(lead.grade)}</span>
            <span class="tag teal">${escapeHtml(lead.sourceType)}</span>
          </div>
          <div class="contact-row">${contactHtml(lead)}</div>
          <div class="lead-line"><strong>Why it fits:</strong> ${escapeHtml(lead.fitReason)}</div>
          <div class="lead-line"><strong>Next step:</strong> ${escapeHtml(lead.bestFirstAction)}</div>
        </div>
        <div class="actions">
          <button class="btn btn-primary btn-sm" data-action="open" data-id="${escapeHtml(lead.id)}">Open Lead Card</button>
          ${lead.linkedinVerify ? `<button class="btn btn-teal btn-sm" data-action="openLinkedIn" data-id="${escapeHtml(lead.id)}">Open LinkedIn</button>` : ""}
          <button class="btn btn-secondary btn-sm" data-action="printHandoff" data-id="${escapeHtml(lead.id)}">Handoff</button>
          <button class="btn btn-danger btn-sm" data-action="suppress" data-id="${escapeHtml(lead.id)}">Suppress</button>
        </div>
      </article>
    `;
  }

  function renderDashboard() {
    renderKpis();
    renderTabs();

    const leads = filteredLeads();
    $("#actionQueueList").innerHTML = leads.length
      ? leads.map(leadCard).join("")
      : `<div class="empty">No active leads in this queue.</div>`;

    renderRadarFeed();
  }

  function renderRadarFeed() {
    const stats = state.store.lastRadar?.stats || {};
    const items = [
      ["Generated", state.store.lastRadar?.generatedAt || "Not loaded"],
      ["Engine", state.store.lastRadar?.engine || "No radar file loaded"],
      ["Ready", stats.readyToWork ?? state.store.leads.length],
      ["LinkedIn Verify", stats.linkedinVerify ?? state.store.linkedinVerify.length],
      ["CPA Verify", stats.cpaVerify ?? state.store.cpaVerify.length],
      ["Skipped", stats.skipped ?? state.store.skipped.length],
      ["Brave Configured", String(Boolean(stats.braveConfigured))],
      ["Groq Configured", String(Boolean(stats.groqConfigured))],
      ["Public Searches", stats.publicSearches ?? 0],
      ["Groq Calls", stats.groqCalls ?? 0]
    ];

    $("#liveRadarFeed").innerHTML = items.map(([k, v]) => (
      `<div class="feed-item"><strong>${escapeHtml(k)}</strong>${escapeHtml(v)}</div>`
    )).join("");
  }

  function renderSimpleQueue(pageId, title, leads) {
    const page = $(`#page-${pageId}`);
    page.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div><div class="panel-title">${escapeHtml(title)}</div><div class="panel-sub">${escapeHtml(leads.length)} record(s)</div></div>
        </div>
        <div class="panel-body lead-list">${leads.length ? leads.sort(prioritySort).map(leadCard).join("") : `<div class="empty">No records.</div>`}</div>
      </div>
    `;
  }

  function renderWorkflow() { renderSimpleQueue("workflow", "Action Queue / Workflow", state.store.leads); }
  function renderLinkedIn() { renderSimpleQueue("linkedin", "LinkedIn Verify", state.store.linkedinVerify); }
  function renderCpa() { renderSimpleQueue("cpa", "CPA Verify", state.store.cpaVerify); }
  function renderRadar() { renderSimpleQueue("radar", "Live Radar Active Candidates", activeLeads()); }

  function renderPlaybook() {
    $("#page-playbook").innerHTML = `
      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">Master Playbook</div><div class="panel-sub">Method A/B, scripts, rebuttals, and compliance guardrails.</div></div></div>
        <div class="panel-body">
          <details class="playbook-detail" open><summary>Method A — Warm Evidence-Based Outreach <span>Use for email, LinkedIn, RSS, or public evidence-route leads.</span></summary><div class="code">${escapeHtml(PLAYBOOK.methodAEmail)}</div><br><div class="code">${escapeHtml(PLAYBOOK.methodAPhone)}</div><br><div class="code">${escapeHtml(PLAYBOOK.methodALinkedIn)}</div></details>
          <details class="playbook-detail" open><summary>Rebuttals <span>Use to move toward an educational director call.</span></summary><table class="table"><tbody>${PLAYBOOK.rebuttals.map(([o,r]) => `<tr><td><strong>${escapeHtml(o)}</strong></td><td>${escapeHtml(r)}</td></tr>`).join("")}</tbody></table></details>
          <div class="panel"><div class="panel-body"><strong>Compliance:</strong> No guaranteed returns. No tax advice. Consult CPA/advisor. Accredited investors only. Manual review before outreach.</div></div>
        </div>
      </div>
    `;
  }

  function renderNotes() { renderSimpleNotes("notes", "Call Notes", state.store.notes); }
  function renderHandoffs() { renderSimpleNotes("handoffs", "Director Handoffs", state.store.handoffs); }
  function renderCalendar() { renderSimpleNotes("calendar", "Follow-Up Calendar", state.store.followUps); }

  function renderSimpleNotes(pageId, title, items) {
    const page = $(`#page-${pageId}`);
    page.innerHTML = `
      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">${escapeHtml(title)}</div><div class="panel-sub">${items.length} item(s)</div></div></div>
        <div class="panel-body note-list">
          ${items.length ? items.map(n => `<div class="feed-item"><strong>${escapeHtml(n.leadName || n.title || "Item")}</strong>${escapeHtml(n.note || n.body || n.at || "")}</div>`).join("") : `<div class="empty">No records.</div>`}
        </div>
      </div>`;
  }

  function renderAnalytics() {
    const c = counts();
    $("#page-analytics").innerHTML = `
      <div class="kpi-strip">
        ${kpi(c.ready, "Ready")}
        ${kpi(c.linkedinVerify, "LinkedIn Verify")}
        ${kpi(c.cpaVerify, "CPA Verify")}
        ${kpi(c.email, "Emails")}
        ${kpi(c.skipped, "Skipped")}
      </div>
      <div class="panel"><div class="panel-body code">${escapeHtml(JSON.stringify(state.store.lastRadar?.stats || {}, null, 2))}</div></div>
    `;
  }

  function renderApi() {
    $("#page-api").innerHTML = `
      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">API Command Center</div><div class="panel-sub">Browser Groq key stays only in localStorage. GitHub Actions secrets stay server-side.</div></div></div>
        <div class="panel-body">
          <label class="lead-line">Groq API Key</label>
          <input id="groqKeyInput" class="input" type="password" value="${escapeHtml(state.store.api.groqKey || "")}" placeholder="Paste Groq API key for browser drafting only" />
          <br><br>
          <label class="lead-line">Groq Model</label>
          <select id="groqModelInput" class="input">
            <option value="llama-3.3-70b-versatile" ${state.store.api.groqModel === "llama-3.3-70b-versatile" ? "selected" : ""}>llama-3.3-70b-versatile</option>
            <option value="llama3-8b-8192" ${state.store.api.groqModel === "llama3-8b-8192" ? "selected" : ""}>llama3-8b-8192</option>
          </select>
          <br><br>
          <button id="saveApiBtn" class="btn btn-teal">Save Browser Groq Key</button>
          <button id="clearApiBtn" class="btn btn-danger">Clear Key</button>
          <div class="feed-item" style="margin-top:14px"><strong>Status</strong> Browser Groq: ${state.store.api.groqKey ? "ON" : "OFF"} · Runner Groq: ${state.store.lastRadar?.stats?.groqConfigured ? "ON" : "UNKNOWN"} · Runner Brave: ${state.store.lastRadar?.stats?.braveConfigured ? "ON" : "UNKNOWN"}</div>
        </div>
      </div>
    `;
    $("#saveApiBtn")?.addEventListener("click", () => {
      state.store.api.groqKey = $("#groqKeyInput").value.trim();
      state.store.api.groqModel = $("#groqModelInput").value;
      saveStore();
      updateAll();
      showToast("Groq browser key saved locally");
    });
    $("#clearApiBtn")?.addEventListener("click", () => {
      state.store.api.groqKey = "";
      saveStore();
      updateAll();
      showToast("Groq browser key cleared");
    });
  }

  function renderSettings() {
    $("#page-settings").innerHTML = `
      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">Settings</div><div class="panel-sub">Local browser data controls.</div></div></div>
        <div class="panel-body">
          <button id="clearStoreBtn" class="btn btn-danger">Clear Local Browser CRM Data</button>
          <button id="exportStoreBtn" class="btn btn-secondary">Export Local Store</button>
        </div>
      </div>
    `;
    $("#clearStoreBtn")?.addEventListener("click", () => {
      if (!confirm("Clear local browser CRM data?")) return;
      localStorage.removeItem(STORE_KEY);
      location.reload();
    });
    $("#exportStoreBtn")?.addEventListener("click", exportAll);
  }

  function renderPage() {
    const titles = {
      dashboard: "Dashboard",
      workflow: "Action Queue",
      linkedin: "LinkedIn Verify",
      cpa: "CPA Verify",
      radar: "Live Radar Feed",
      playbook: "Master Playbook",
      notes: "Call Notes",
      handoffs: "Director Handoffs",
      calendar: "Follow-Up Calendar",
      analytics: "Analytics",
      api: "API Command Center",
      settings: "Settings"
    };
    $("#pageTitle").textContent = titles[state.page] || "Dashboard";

    $$(".page").forEach(p => p.classList.remove("active"));
    $(`#page-${state.page}`)?.classList.add("active");

    if (state.page === "dashboard") renderDashboard();
    if (state.page === "workflow") renderWorkflow();
    if (state.page === "linkedin") renderLinkedIn();
    if (state.page === "cpa") renderCpa();
    if (state.page === "radar") renderRadar();
    if (state.page === "playbook") renderPlaybook();
    if (state.page === "notes") renderNotes();
    if (state.page === "handoffs") renderHandoffs();
    if (state.page === "calendar") renderCalendar();
    if (state.page === "analytics") renderAnalytics();
    if (state.page === "api") renderApi();
    if (state.page === "settings") renderSettings();
  }

  function updateNav() {
    const c = counts();
    $("#navCount-dashboard").textContent = c.total;
    $("#navCount-workflow").textContent = c.ready;
    $("#navCount-linkedin").textContent = c.linkedinVerify;
    $("#navCount-cpa").textContent = c.cpaVerify;
    $("#navCount-radar").textContent = c.total;
    $("#navCount-notes").textContent = c.notes;
    $("#navCount-calendar").textContent = c.followUps;
    $("#apiBadge").textContent = state.store.api.groqKey ? "GROQ" : "OFF";

    $$(".nav-item[data-page]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.page === state.page);
    });
  }

  function updateAll() {
    updateNav();
    renderPage();
    saveStore();
  }

  function findLead(id) {
    return [...state.store.leads, ...state.store.linkedinVerify, ...state.store.cpaVerify, ...state.store.research, ...state.store.skipped].find(l => l.id === id);
  }

  function removeLeadFromBuckets(id) {
    for (const key of ["leads", "linkedinVerify", "cpaVerify", "research", "skipped"]) {
      state.store[key] = state.store[key].filter(l => l.id !== id);
    }
  }

  function upsertLead(lead) {
    removeLeadFromBuckets(lead.id);
    if (lead.associateReady) state.store.leads.push(lead);
    else if (lead.linkedinVerify) state.store.linkedinVerify.push(lead);
    else if (lead.cpaVerify) state.store.cpaVerify.push(lead);
    else if (lead.skipped) state.store.skipped.push(lead);
    else state.store.research.push(lead);

    state.store.leads.sort(prioritySort);
    state.store.linkedinVerify.sort(prioritySort);
    state.store.cpaVerify.sort(prioritySort);
    saveStore();
    updateAll();
  }

  function markReady(leadId) {
    const lead = findLead(leadId);
    if (!lead) return;

    lead.associateReady = true;
    lead.linkedinVerify = false;
    lead.cpaVerify = false;
    lead.skipped = false;
    lead.bucket = "ready";
    lead.status = "Ready to Work";
    lead.workflowDay = lead.workflowDay || 1;
    lead.bestFirstAction = lead.hasEmail
      ? "Day 1: send evidence-based email first."
      : "Day 1: LinkedIn manually verified. Send reviewed LinkedIn touch first.";

    upsertLead(lead);
    return lead;
  }

  function openLinkedIn(lead) {
    const c = lead.contacts.find(x => /linkedin/i.test(`${x.type} ${x.value}`));
    if (!c) return showToast("No LinkedIn URL found.", true);
    window.open(c.value, "_blank", "noopener");
  }

  function evidenceHtml(lead) {
    const evidence = lead.evidence || [];
    if (!evidence.length) return `<div class="empty">No evidence trail.</div>`;
    return evidence.map(e => `
      <div class="evidence-link">
        <strong>${escapeHtml(e.source || "Evidence")}</strong><br>
        <a href="${escapeHtml(e.url || "#")}" target="_blank" rel="noopener">${escapeHtml(e.url || "")}</a>
        <div class="lead-line">${escapeHtml(e.whatItProves || "")}</div>
      </div>
    `).join("");
  }

  function openLeadModal(leadId) {
    const lead = findLead(leadId);
    if (!lead) return;

    state.selectedLeadId = leadId;
    $("#modalLeadName").textContent = lead.name;
    $("#modalLeadTitle").textContent = lead.title || "";
    $("#modalLeadCompany").textContent = [lead.company, lead.location].filter(Boolean).join(" · ");
    $("#modalEvidenceTrail").innerHTML = evidenceHtml(lead);

    const linkedin = lead.contacts.find(c => /linkedin/i.test(`${c.type} ${c.value}`));
    const btnOpenNav = $("#btnOpenNav");
    btnOpenNav.href = linkedin?.value || lead.sourceUrl || "#";
    btnOpenNav.textContent = linkedin ? "Open Sales Navigator / LinkedIn" : "Open Source Evidence";

    $("#inputLinkedinBio").value = lead.linkedinBio || "";
    $("#outputEmail").value = lead.generatedEmail || "";
    $("#outputCallNotes").value = lead.generatedCall || "";
    $("#modalNoteInput").value = "";
    renderModalNotes(lead);

    $("#modalBackdrop").classList.remove("hidden");
  }

  function renderModalNotes(lead) {
    const notes = state.store.notes.filter(n => n.leadId === lead.id);
    $("#modalLeadNotes").innerHTML = notes.length
      ? notes.map(n => `<div class="feed-item"><strong>${escapeHtml(new Date(n.at).toLocaleString())}</strong>${escapeHtml(n.note)}</div>`).join("")
      : `<div class="empty">No notes yet.</div>`;
  }

  /**
   * TASK 4 required function.
   * Human-in-the-loop LinkedIn verification and Groq script generation.
   */
  async function verifyAndDraft() {
    const leadId = state.selectedLeadId;
    const lead = findLead(leadId);
    if (!lead) return showToast("No lead selected.", true);

    const groqKey = state.store.api.groqKey;
    if (!groqKey) {
      showToast("Paste and save your Groq key in API Command Center first.", true);
      state.page = "api";
      updateAll();
      return;
    }

    const linkedinBio = $("#inputLinkedinBio").value.trim();
    if (!linkedinBio || linkedinBio.length < 20) {
      showToast("Paste the LinkedIn bio/about text before drafting.", true);
      return;
    }

    const evidenceTrail = (lead.evidence || [])
      .map(e => `${e.source}: ${e.whatItProves || ""} ${e.url || ""}`)
      .join("\n");

    const systemPrompt = `You are a compliance-strict Oil & Gas investment SDR. Using the pasted LinkedIn bio and this public signal, draft a Day 1 outreach email offering our Beginner's Guide to NOWI (do NOT guarantee returns or give tax advice), and a Day 3 soft phone script. Output as strict JSON: { "email": "...", "call": "..." }.`;

    const userPrompt = `
Lead:
Name: ${lead.name}
Title: ${lead.title}
Company: ${lead.company}
Signal: ${lead.signal || lead.summary || ""}
Evidence Trail:
${evidenceTrail}

Pasted LinkedIn Bio:
${linkedinBio}
`.trim();

    $("#btnVerifyDraft").disabled = true;
    $("#btnVerifyDraft").textContent = "Drafting...";

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: state.store.api.groqModel || "llama-3.3-70b-versatile",
          temperature: 0.2,
          max_tokens: 900,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        })
      });

      if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content || "";
      const parsed = parseGroqJson(content);

      $("#outputEmail").value = parsed.email || "";
      $("#outputCallNotes").value = parsed.call || "";

      lead.linkedinBio = linkedinBio;
      lead.generatedEmail = parsed.email || "";
      lead.generatedCall = parsed.call || "";
      lead.hasLinkedIn = true;
      lead.contacts = lead.contacts || [];
      lead.notes = lead.notes || [];

      const note = {
        id: uid("note"),
        leadId: lead.id,
        leadName: lead.name,
        note: "LinkedIn manually verified. Groq generated Day 1 email and Day 3 soft phone script.",
        disposition: "LinkedIn verified",
        at: new Date().toISOString()
      };

      state.store.notes.push(note);
      lead.notes.push(note);

      markReady(lead.id);
      openLeadModal(lead.id);
      showToast(`${lead.name} verified and moved to Ready.`);
    } catch (error) {
      console.error(error);
      showToast(`Groq draft failed: ${error.message}`, true);
    } finally {
      $("#btnVerifyDraft").disabled = false;
      $("#btnVerifyDraft").textContent = "Verify & Draft Sequence";
    }
  }

  function parseGroqJson(content) {
    const cleaned = String(content || "").trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "");
    try {
      return JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
      throw new Error("Groq did not return valid JSON.");
    }
  }

  function saveModalNote() {
    const lead = findLead(state.selectedLeadId);
    if (!lead) return;
    const text = $("#modalNoteInput").value.trim();
    if (!text) return showToast("Write a note first.", true);

    const note = {
      id: uid("note"),
      leadId: lead.id,
      leadName: lead.name,
      note: text,
      disposition: "Manual note",
      at: new Date().toISOString()
    };

    state.store.notes.push(note);
    lead.notes = lead.notes || [];
    lead.notes.push(note);
    upsertLead(lead);
    $("#modalNoteInput").value = "";
    renderModalNotes(lead);
    showToast("Note saved.");
  }

  function suppressLead(id) {
    const lead = findLead(id);
    if (!lead) return;
    state.store.suppressed.push({ id: lead.id, name: lead.name, at: new Date().toISOString() });
    removeLeadFromBuckets(id);
    saveStore();
    updateAll();
    showToast(`${lead.name} suppressed.`);
  }

  function printHandoff(id) {
    const lead = findLead(id);
    if (!lead) return;
    const notes = state.store.notes.filter(n => n.leadId === id);
    const html = `
      <html><head><title>Director Handoff - ${escapeHtml(lead.name)}</title>
      <style>body{font-family:Arial;padding:28px;line-height:1.45}h1{margin-bottom:0}.box{border:1px solid #ccc;padding:12px;margin:12px 0}</style></head>
      <body>
        <h1>${escapeHtml(lead.name)}</h1>
        <p>${escapeHtml(lead.title)} ${lead.company ? "· " + escapeHtml(lead.company) : ""}</p>
        <div class="box"><strong>Contact Methods</strong><br>${lead.contacts.map(c => `${escapeHtml(c.type)}: ${escapeHtml(c.value)}`).join("<br>")}</div>
        <div class="box"><strong>Why it fits</strong><br>${escapeHtml(lead.fitReason)}</div>
        <div class="box"><strong>Evidence</strong><br>${lead.evidence.map(e => `${escapeHtml(e.source)} - ${escapeHtml(e.url || "")}`).join("<br>")}</div>
        <div class="box"><strong>Notes</strong><br>${notes.map(n => `${escapeHtml(n.at)} - ${escapeHtml(n.note)}`).join("<br>")}</div>
        <div class="box"><strong>Compliance</strong><br>No guaranteed returns. No tax advice. Consult CPA/advisor. Accredited investors only.</div>
      </body></html>
    `;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.print();
  }

  function manualAdd() {
    const name = prompt("Lead name:");
    if (!name) return;
    const email = prompt("Email, if available:");
    const linkedin = prompt("LinkedIn URL, if available:");
    const lead = normalizeLead({
      id: uid("manual"),
      name,
      title: prompt("Title/role:") || "Manual Lead",
      company: prompt("Company/practice:") || "",
      sourceType: "manual",
      source: "Manual Add",
      score: email ? 75 : linkedin ? 70 : 55,
      grade: email ? "B" : linkedin ? "C" : "D",
      contactMethods: [
        email ? { type: "email", value: email, source: "manual" } : null,
        linkedin ? { type: "linkedin", value: linkedin, source: "manual" } : null
      ].filter(Boolean),
      evidenceTrail: [{ source: "Manual Add", url: "", whatItProves: "Manually entered by user." }],
      associateReady: Boolean(email),
      status: email ? "Ready to Work" : linkedin ? "LinkedIn Verify" : "Skipped"
    });
    upsertLead(lead);
    showToast("Manual lead added.");
  }

  function exportAll() {
    const blob = new Blob([JSON.stringify(state.store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `basin-os-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    $$(".nav-item[data-page]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.page = btn.dataset.page;
        updateAll();
      });
    });

    $("#reloadRadarBtn")?.addEventListener("click", loadRadarData);
    $("#manualAddBtn")?.addEventListener("click", manualAdd);
    $("#exportAllBtn")?.addEventListener("click", exportAll);
    $("#globalSearch")?.addEventListener("input", () => renderPage());
    $("#closeModalBtn")?.addEventListener("click", () => $("#modalBackdrop").classList.add("hidden"));
    $("#btnVerifyDraft")?.addEventListener("click", verifyAndDraft);
    $("#btnSaveNote")?.addEventListener("click", saveModalNote);
    $("#btnPrintHandoff")?.addEventListener("click", () => printHandoff(state.selectedLeadId));
    $("#btnSuppressLead")?.addEventListener("click", () => suppressLead(state.selectedLeadId));

    document.addEventListener("click", event => {
      const tab = event.target.closest("[data-filter]");
      if (tab) {
        state.queueFilter = tab.dataset.filter;
        renderDashboard();
        return;
      }

      const action = event.target.closest("[data-action]");
      if (!action) return;
      const id = action.dataset.id;
      const lead = findLead(id);
      if (!lead) return;

      if (action.dataset.action === "open") openLeadModal(id);
      if (action.dataset.action === "openLinkedIn") openLinkedIn(lead);
      if (action.dataset.action === "printHandoff") printHandoff(id);
      if (action.dataset.action === "suppress") suppressLead(id);
    });
  }

  function init() {
    loadStore();
    bindEvents();
    updateAll();
    loadRadarData().catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", init);

  // Expose for debugging without exposing API keys.
  window.BasinOS = {
    state,
    loadRadarData,
    markReady,
    verifyAndDraft
  };
})();
