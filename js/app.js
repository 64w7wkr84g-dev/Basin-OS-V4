(() => {
  'use strict';

  const STORE_KEY = 'basin_os_clean_store_v1';
  const RADAR_PATHS = [
    'data/radar-leads.json',
    './data/radar-leads.json',
    'radar-leads.json',
    './radar-leads.json',
    'https://raw.githubusercontent.com/64w7wkr84g-dev/Basin-OS-V4/main/data/radar-leads.json',
    'https://raw.githubusercontent.com/64w7wkr84g-dev/Basin-OS-V4/main/radar-leads.json'
  ];

  const CADENCE = [
    {
      day: 1,
      title: 'Research-Based Intro Touch',
      prior: 'Review evidence trail, confirm contact route, send/queue evidence-based email or LinkedIn touch before call unless signal is high confidence.',
      firstAction: 'Send evidence-based email or LinkedIn touch; then intro call if phone is usable.',
      callScript: `Hi [Name], this is [Your Name] with Basin Ventures in Southlake. I know this is out of the blue. I came across [Signal], and based on your background as [Role], I thought a short intro may be relevant. Do you have 30 seconds?

Basin works with accredited investors on direct, tax-advantaged oil and gas ownership. I am not calling to force a decision. The only goal is a short director call so you can understand the structure and decide whether it is even worth reviewing.

Would this week or next week be better?`
    },
    {
      day: 2,
      title: 'Second Attempt — Signal Reminder',
      prior: 'Day 1 evidence-based email or LinkedIn touch should normally happen before calling.',
      firstAction: 'Second attempt by phone if a valid phone exists; otherwise follow-up email/LinkedIn.',
      callScript: `Hi [Name], [Your Name] with Basin Ventures. I reached out because of [Signal], and I wanted to try you once more.

The reason I thought it might fit is that high-income professionals and business owners often want to understand tax-advantaged direct energy ownership, especially when income or liquidity events are in play. Your CPA would need to confirm fit.

Should I send a brief overview or just get you directly to a 20-minute director call?`
    },
    {
      day: 4,
      title: 'Credibility Angle',
      prior: 'Use after the earlier signal-based touch. Shift from signal to credibility and fit.',
      firstAction: 'Credibility-angle call or email.',
      callScript: `Hi [Name], [Your Name] from Basin Ventures. I know we have not spoken before. Basin has managed over $1.25B since 2014, and we focus on direct energy opportunities for accredited investors.

Given [Signal], I thought it was worth making one clean introduction. If it is irrelevant, no problem. If it is worth understanding, I can schedule a short director call.

Does this deserve 20 minutes, or should I close the loop?`
    },
    {
      day: 6,
      title: 'Final Research-Based Call',
      prior: 'Use only as final research-based call or value follow-up before close-loop.',
      firstAction: 'Final research-based call or short close-loop email.',
      callScript: `Hi [Name], last attempt from [Your Name] at Basin Ventures. I reached out because [Signal] made your profile look potentially relevant for a direct energy conversation.

I do not want to chase you. Should I mark this as not a fit, or would you like one short overview call before I close it out?`
    },
    {
      day: 10,
      title: 'Longer-Term Permission Call',
      prior: 'Close-loop or permission-based future nurture.',
      firstAction: 'Ask whether to close out, keep on future fund window list, or remove.',
      callScript: `Hi [Name], [Your Name] with Basin Ventures. I am closing the loop on my outreach.

If now is not the time, I can leave you alone. If you want to be kept on the list for future fund windows or tax-planning updates, I can do that instead. What is better?`
    }
  ];

  const DEFAULT_STORE = {
    leads: [],
    research: [],
    notes: [],
    followUps: [],
    meetings: [],
    suppressed: [],
    api: {
      groqKey: '',
      groqModel: 'llama-3.3-70b-versatile',
      groqAuto: true
    },
    lastRadar: null,
    lastLoadedFrom: '',
    lastLoadedAt: ''
  };

  const state = {
    page: 'dashboard',
    filter: 'all',
    query: '',
    store: loadStore()
  };

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return clone(DEFAULT_STORE);
      return Object.assign(clone(DEFAULT_STORE), JSON.parse(raw));
    } catch {
      return clone(DEFAULT_STORE);
    }
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.store));
      return true;
    } catch (err) {
      showToast('Local save failed. Export your data and clear old browser storage.', true);
      console.error(err);
      return false;
    }
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function text(v) {
    return String(v ?? '').replace(/\s+/g, ' ').trim();
  }

  function uid(prefix='id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function showToast(message, isError=false) {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast ${isError ? 'bad' : ''}`;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => el.classList.add('hidden'), 4200);
  }

  function setStatus(message, tone='') {
    const el = $('#statusBanner');
    el.className = `status-banner ${tone}`;
    el.textContent = message;
  }

  function hasAnyRadar(raw) {
    if (!raw || typeof raw !== 'object') return false;
    const stats = raw.stats || {};
    return Number(stats.totalFound || 0) > 0 ||
      Number(stats.readyToWork || 0) > 0 ||
      Number(stats.research || 0) > 0 ||
      Number(stats.npiCollected || 0) > 0 ||
      (Array.isArray(raw.leads) && raw.leads.length > 0) ||
      (Array.isArray(raw.researchCandidates) && raw.researchCandidates.length > 0) ||
      (Array.isArray(raw.allCandidates) && raw.allCandidates.length > 0);
  }

  async function fetchJson(path) {
    const url = path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path} returned ${res.status}`);
    const raw = await res.text();
    if (!raw.trim()) throw new Error(`${path} was empty`);
    return JSON.parse(raw);
  }

  async function loadRadarData(force=false) {
    if (state.store.lastRadar && !force && hasAnyRadar(state.store.lastRadar)) {
      return state.store.lastRadar;
    }
    const attempts = [];
    for (const path of RADAR_PATHS) {
      try {
        const json = await fetchJson(path);
        attempts.push({ path, ok: true });
        if (hasAnyRadar(json)) {
          json.__loadedFrom = path;
          json.__attempts = attempts;
          state.store.lastRadar = json;
          state.store.lastLoadedFrom = path;
          state.store.lastLoadedAt = new Date().toISOString();
          saveStore();
          return json;
        }
      } catch (err) {
        attempts.push({ path, ok: false, error: err.message });
      }
    }
    const blank = { stats: {}, leads: [], researchCandidates: [], allCandidates: [], __loadedFrom: 'none', __attempts: attempts };
    state.store.lastRadar = blank;
    saveStore();
    return blank;
  }

  function normalizeContact(c) {
    if (!c) return null;
    if (typeof c === 'string') {
      const type = c.includes('@') ? 'email' : /^https?:\/\//.test(c) ? 'url' : 'phone';
      return { type, value: c, source: 'imported' };
    }
    const type = text(c.type || c.kind || c.channel || 'contact').toLowerCase();
    const value = text(c.value || c.url || c.email || c.phone || c.href || '');
    if (!value) return null;
    return { type, value, source: text(c.source || 'imported') };
  }

  function normalizeLead(raw, bucket='research') {
    const contacts = Array.isArray(raw.contactMethods) ? raw.contactMethods.map(normalizeContact).filter(Boolean) : [];
    const evidence = Array.isArray(raw.evidenceTrail) ? raw.evidenceTrail : [];
    const score = Number(raw.score || 50);
    const sourceBlob = [raw.source, raw.sourceType, raw.sourceUrl, raw.queue, raw.status, raw.sourceConfidence].join(' ').toLowerCase();
    const hasLinkedIn = contacts.some(c => /linkedin/.test(`${c.type} ${c.value}`.toLowerCase())) || /linkedin/.test(sourceBlob);
    const hasEmail = contacts.some(c => c.type === 'email' || /@/.test(c.value));
    const hasPhone = contacts.some(c => c.type === 'phone' || /\d{3}.*\d{3}.*\d{4}/.test(c.value));
    const hasWarmRoute = hasLinkedIn || hasEmail;
    const isReady = Boolean(raw.associateReady || raw.readyToWork || raw.bucket === 'ready' || raw.status === 'Ready to Work' || raw.queue === 'Ready to Work' || (hasWarmRoute && score >= 65));

    const sourceType = detectSource(raw, contacts);
    const quality = computeQuality({ raw, score, hasLinkedIn, hasEmail, hasPhone, evidence, sourceType, isReady });

    return {
      id: text(raw.id || raw.leadId || uid('lead')),
      name: text(raw.name || raw.fullName || raw.person || raw.title || 'Unnamed Candidate'),
      title: text(raw.title || raw.role || raw.specialty || raw.profession || 'Prospect'),
      company: text(raw.company || raw.practice || raw.organization || ''),
      location: text(raw.location || raw.practiceLocation || raw.city || ''),
      source: text(raw.source || raw.sourceType || sourceType || 'Radar'),
      sourceType,
      sourceUrl: text(raw.sourceUrl || raw.url || ''),
      signal: text(raw.signal || raw.summary || raw.reason || 'Public-source signal'),
      summary: text(raw.summary || raw.signal || raw.reason || ''),
      fitReason: text(raw.fitReason || raw.accreditedLikelyReason || inferFitReason(raw)),
      accreditedLikelyReason: text(raw.accreditedLikelyReason || inferAccreditedReason(raw)),
      contacts,
      evidence,
      score: quality.score,
      grade: quality.grade,
      qualityTier: quality.tier,
      sourceConfidence: text(raw.sourceConfidence || quality.confidence),
      hasLinkedIn,
      hasEmail,
      hasPhone,
      hasWarmRoute,
      associateReady: isReady,
      bucket: isReady ? 'ready' : 'research',
      workflowDay: Number(raw.workflowDay || raw.day || (isReady ? 1 : 0)),
      status: text(raw.status || raw.queue || (isReady ? 'Ready to Work' : 'Research Needed')),
      bestFirstAction: firstAction({ hasLinkedIn, hasEmail, hasPhone, isReady }),
      nextAction: text(raw.nextAction || ''),
      lastUpdated: new Date().toISOString()
    };
  }

  function detectSource(raw, contacts=[]) {
    const blob = [raw.source, raw.sourceType, raw.sourceUrl, raw.url, raw.signal, raw.summary, contacts.map(c => `${c.type} ${c.value}`).join(' ')].join(' ').toLowerCase();
    if (/linkedin/.test(blob)) return 'linkedin';
    if (/rss|news\.google|article|press|event|speaker|podcast/.test(blob)) return 'rss';
    if (/npi|npiregistry|provider-view/.test(blob)) return 'npi';
    if (/manual/.test(blob)) return 'manual';
    if (/cpa|accounting|tax/.test(blob)) return 'cpa';
    return 'public';
  }

  function computeQuality({ raw, score, hasLinkedIn, hasEmail, hasPhone, evidence, sourceType, isReady }) {
    let s = score;
    if (hasEmail) s += 14;
    if (hasLinkedIn) s += 12;
    if (hasPhone) s += 6;
    if (sourceType === 'rss') s += 12;
    if (sourceType === 'linkedin') s += 10;
    if (sourceType === 'npi') s -= 6;
    if (evidence.length >= 2) s += 7;
    if (!hasEmail && !hasLinkedIn && !hasPhone) s -= 25;
    if (isReady) s += 5;
    s = Math.max(0, Math.min(100, Math.round(s)));

    let grade = 'D';
    if (s >= 88) grade = 'A';
    else if (s >= 72) grade = 'B';
    else if (s >= 58) grade = 'C';

    const tier = grade === 'A' ? 'A Lead' : grade === 'B' ? 'Strong Lead' : grade === 'C' ? 'Research Candidate' : 'Low Confidence';
    const confidence = [sourceType.toUpperCase(), hasEmail ? 'EMAIL' : '', hasLinkedIn ? 'LINKEDIN' : '', hasPhone ? 'PHONE' : '', evidence.length ? `${evidence.length} EVIDENCE` : ''].filter(Boolean).join(' + ');
    return { score: s, grade, tier, confidence };
  }

  function inferFitReason(raw) {
    const blob = [raw.title, raw.role, raw.specialty, raw.company, raw.signal, raw.summary].join(' ');
    if (/orthopedic|surgeon|anesthes|physician|md|doctor|dentist|specialist/i.test(blob)) return 'High-income medical professional profile; likely worth accredited investor screening.';
    if (/partner|attorney|law|firm/i.test(blob)) return 'Law partner or senior legal professional profile; likely high-income and suitable for accredited-screening conversation.';
    if (/cpa|tax|account/i.test(blob)) return 'CPA/tax professional profile; potential referral or direct accredited investor conversation.';
    if (/owner|founder|ceo|president|executive/i.test(blob)) return 'Business owner/executive profile; potential income/liquidity fit for educational director call.';
    return 'Public profile suggests professional/business context that may justify a short educational intro if accredited fit is confirmed.';
  }

  function inferAccreditedReason(raw) {
    const blob = [raw.title, raw.role, raw.specialty, raw.company, raw.signal, raw.summary].join(' ');
    if (/physician|surgeon|anesthes|orthopedic|cardio|derm|md/i.test(blob)) return 'Specialist medical role may indicate income above accredited-investor threshold, but must be confirmed by prospect.';
    if (/partner|attorney|law/i.test(blob)) return 'Partner-level legal role may indicate income/net-worth profile, but must be confirmed by prospect.';
    if (/owner|founder|ceo|president|executive/i.test(blob)) return 'Owner/executive profile may indicate income or net-worth fit, but must be confirmed by prospect.';
    return 'Possible accredited profile based on public professional role; never assume or state qualification without confirmation.';
  }

  function firstAction({ hasLinkedIn, hasEmail, hasPhone, isReady }) {
    if (!isReady) return 'Research needed: find or confirm email, direct LinkedIn URL, phone, or second public evidence source before associate cadence.';
    if (hasEmail) return 'Day 1: send evidence-based email first, then call if phone is available.';
    if (hasLinkedIn) return 'Day 1: manually open LinkedIn URL, confirm identity, then send reviewed LinkedIn connection/note.';
    if (hasPhone) return 'Day 1: phone is available, but verify evidence trail and ask for correct email/direct contact.';
    return 'Do not work yet. Confirm contact route first.';
  }

  function mergeLeadArrays(existing, incoming) {
    const map = new Map();
    const put = lead => {
      if (!lead) return;
      const key = leadKey(lead);
      const prev = map.get(key);
      if (!prev) map.set(key, lead);
      else map.set(key, mergeLead(prev, lead));
    };
    existing.forEach(put);
    incoming.forEach(put);
    return Array.from(map.values());
  }

  function leadKey(lead) {
    const email = lead.contacts?.find(c => c.type === 'email')?.value || '';
    const linkedin = lead.contacts?.find(c => /linkedin/.test(`${c.type} ${c.value}`.toLowerCase()))?.value || '';
    const phone = lead.contacts?.find(c => c.type === 'phone')?.value || '';
    return [lead.name, lead.company, lead.title, email, linkedin, phone].join('|').toLowerCase().replace(/\W+/g, '');
  }

  function mergeLead(a, b) {
    const contacts = [...(a.contacts || []), ...(b.contacts || [])];
    const evidence = [...(a.evidence || []), ...(b.evidence || [])];
    const dedupContacts = Array.from(new Map(contacts.map(c => [`${c.type}|${c.value}`.toLowerCase(), c])).values());
    const dedupEvidence = Array.from(new Map(evidence.map(e => [`${e.url || ''}|${e.source || ''}`.toLowerCase(), e])).values());
    const better = (b.score || 0) > (a.score || 0) ? b : a;
    return {
      ...a,
      ...b,
      ...better,
      contacts: dedupContacts,
      evidence: dedupEvidence,
      associateReady: a.associateReady || b.associateReady,
      hasLinkedIn: a.hasLinkedIn || b.hasLinkedIn,
      hasEmail: a.hasEmail || b.hasEmail,
      hasPhone: a.hasPhone || b.hasPhone,
      hasWarmRoute: a.hasWarmRoute || b.hasWarmRoute,
      lastUpdated: new Date().toISOString()
    };
  }

  function ingestRadar(raw) {
    const ready = Array.isArray(raw.leads) ? raw.leads : [];
    const research = Array.isArray(raw.researchCandidates) ? raw.researchCandidates : [];
    const allCandidates = Array.isArray(raw.allCandidates) ? raw.allCandidates : [];
    const combined = [...ready, ...research, ...allCandidates];

    const normalized = combined.map(item => normalizeLead(item)).filter(l => l.name && l.name !== 'Unnamed Candidate');
    const readyLeads = normalized.filter(l => l.associateReady);
    const researchLeads = normalized.filter(l => !l.associateReady);

    state.store.leads = mergeLeadArrays(state.store.leads, readyLeads);
    state.store.research = mergeLeadArrays(state.store.research, researchLeads);
    state.store.lastRadar = raw;
    state.store.lastLoadedFrom = raw.__loadedFrom || state.store.lastLoadedFrom;
    state.store.lastLoadedAt = new Date().toISOString();

    saveStore();
    updateAll();
    return { ready: readyLeads.length, research: researchLeads.length, total: normalized.length };
  }

  async function loadSharedRadar(force=true) {
    setStatus('Loading shared GitHub radar data...');
    try {
      const raw = await loadRadarData(force);
      const counts = ingestRadar(raw);
      const st = radarStats(raw);
      setStatus(`Loaded ${counts.total} candidates from ${raw.__loadedFrom || 'radar JSON'} · Ready ${counts.ready} · Research ${counts.research} · Brave/Public searches ${st.searches}`, counts.total ? '' : 'warn');
      showToast(`Radar loaded: ${counts.total} candidates`);
    } catch (err) {
      setStatus(`Radar load failed: ${err.message}`, 'error');
      showToast('Radar load failed. Check data/radar-leads.json and GitHub Actions.', true);
      console.error(err);
    }
  }

  function radarStats(raw = state.store.lastRadar || {}) {
    const st = raw.stats || {};
    return {
      found: Number(st.totalFound || 0),
      ready: Number(st.readyToWork || 0),
      research: Number(st.research || st.filteredNotUsable || 0),
      npi: Number(st.npiCollected || 0),
      rss: Number(st.rssCollected || 0),
      linkedin: Number(st.linkedinCandidatesFound || st.linkedinVerify || 0),
      searches: Number(st.publicSearches || 0),
      ai: Number(st.aiCalls || 0)
    };
  }

  function allVisibleLeads() {
    return [...state.store.leads, ...state.store.research]
      .filter(l => {
        const q = state.query.toLowerCase();
        if (!q) return true;
        const blob = [l.name, l.title, l.company, l.location, l.source, l.sourceType, l.signal, l.summary, l.fitReason, (l.contacts || []).map(c => c.value).join(' ')].join(' ').toLowerCase();
        return blob.includes(q);
      })
      .sort(prioritySort);
  }

  function prioritySort(a, b) {
    const rank = l => {
      if (l.associateReady && l.hasEmail) return 1;
      if (l.associateReady && l.hasLinkedIn) return 2;
      if (l.associateReady && l.hasPhone) return 3;
      if (l.hasLinkedIn) return 4;
      if (l.sourceType === 'rss') return 5;
      if (l.sourceType === 'npi') return 7;
      return 6;
    };
    return rank(a) - rank(b) || (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name);
  }

  function filterLeads(leads, filter=state.filter) {
    return leads.filter(l => {
      if (filter === 'all') return true;
      if (filter === 'ready') return l.associateReady;
      if (filter === 'research') return !l.associateReady;
      if (filter === 'linkedin') return l.hasLinkedIn || l.sourceType === 'linkedin';
      if (filter === 'email') return l.hasEmail;
      if (filter === 'phone') return l.hasPhone;
      if (filter === 'rss') return l.sourceType === 'rss';
      if (filter === 'npi') return l.sourceType === 'npi';
      if (filter === 'A') return l.grade === 'A';
      if (filter === 'cpa') return l.type === 'cpa';
      if (filter === 'investor') return l.type !== 'cpa';
      return true;
    });
  }

  function counts() {
    const all = [...state.store.leads, ...state.store.research];
    return {
      total: all.length,
      ready: state.store.leads.length,
      research: state.store.research.length,
      linkedin: all.filter(l => l.hasLinkedIn || l.sourceType === 'linkedin').length,
      email: all.filter(l => l.hasEmail).length,
      phone: all.filter(l => l.hasPhone).length,
      rss: all.filter(l => l.sourceType === 'rss').length,
      npi: all.filter(l => l.sourceType === 'npi').length,
      A: all.filter(l => l.grade === 'A').length,
      cpa: all.filter(l => l.type === 'cpa').length,
      investor: all.filter(l => l.type !== 'cpa').length,
      notes: state.store.notes.length,
      followUps: state.store.followUps.length,
      suppressed: state.store.suppressed.length
    };
  }

  function updateNavCounts() {
    const c = counts();
    $('#navCount-dashboard').textContent = c.total;
    $('#navCount-radar').textContent = c.total;
    $('#navCount-workflow').textContent = c.ready;
    $('#navCount-linkedin').textContent = c.linkedin;
    $('#navCount-pipeline').textContent = c.investor;
    $('#navCount-cpa').textContent = c.cpa;
    $('#navCount-notes').textContent = c.notes;
    $('#navCount-calendar').textContent = c.followUps;
    $('#apiBadge').textContent = state.store.api.groqKey ? 'GROQ' : (radarStats().searches > 0 ? 'BRAVE' : 'OFF');
  }

  function kpi(num, label, hint='') {
    return `<div class="kpi"><div class="num">${num}</div><div class="label">${escapeHtml(label)}</div>${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ''}</div>`;
  }

  function pageHeader(title, sub='') {
    return `<div class="panel" style="margin-bottom:16px"><div class="panel-head"><div><div class="panel-title">${escapeHtml(title)}</div>${sub ? `<div class="panel-sub">${escapeHtml(sub)}</div>` : ''}</div></div></div>`;
  }

  function tabs(active=state.filter) {
    const c = counts();
    const items = [
      ['all', `All ${c.total}`],
      ['ready', `Ready ${c.ready}`],
      ['research', `Research ${c.research}`],
      ['linkedin', `LinkedIn ${c.linkedin}`],
      ['email', `Email ${c.email}`],
      ['phone', `Phone ${c.phone}`],
      ['rss', `RSS/Public ${c.rss}`],
      ['npi', `NPI ${c.npi}`],
      ['A', `A Grade ${c.A}`],
      ['investor', `Investors ${c.investor}`],
      ['cpa', `CPA ${c.cpa}`]
    ];
    return `<div class="tabs">${items.map(([key,label]) => `<button class="tab ${active===key?'active':''}" data-filter="${key}">${escapeHtml(label)}</button>`).join('')}</div>`;
  }

  function contactHtml(lead) {
    if (!lead.contacts || !lead.contacts.length) return `<span class="contact-pill missing">No usable contact method yet</span>`;
    return lead.contacts.map(c => {
      const type = escapeHtml(c.type.toUpperCase());
      const value = escapeHtml(c.value);
      const href = c.type === 'email' || c.value.includes('@') ? `mailto:${c.value}` :
        c.type === 'phone' ? `tel:${c.value.replace(/[^\d+]/g,'')}` :
        /^https?:\/\//.test(c.value) ? c.value : '';
      return `<span class="contact-pill">${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${type}: ${value}</a>` : `${type}: ${value}`}</span>`;
    }).join('');
  }

  function evidenceHtml(lead) {
    const ev = lead.evidence || [];
    const rows = ev.slice(0, 4).map(e => {
      const src = escapeHtml(e.source || e.title || 'Evidence');
      const what = escapeHtml(e.whatItProves || e.note || '');
      if (e.url) return `<a class="tag blue" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${src}${what ? ` · ${what}` : ''}</a>`;
      return `<span class="tag blue">${src}${what ? ` · ${what}` : ''}</span>`;
    });
    if (lead.sourceUrl && !rows.length) rows.push(`<a class="tag blue" href="${escapeHtml(lead.sourceUrl)}" target="_blank" rel="noopener">Source</a>`);
    return rows.join('');
  }

  function leadCard(lead, compact=false) {
    return `<article class="lead-card" data-lead-id="${escapeHtml(lead.id)}">
      <div class="avatar">${escapeHtml(lead.grade)}</div>
      <div>
        <div class="lead-name">${escapeHtml(lead.name)}</div>
        <div class="lead-line">${escapeHtml([lead.title, lead.company, lead.location].filter(Boolean).join(' · '))}</div>
        <div class="tags">
          <span class="tag gold">Score ${lead.score}</span>
          <span class="tag ${lead.associateReady ? 'green' : 'red'}">${lead.associateReady ? 'Ready' : 'Research'}</span>
          <span class="tag teal">${escapeHtml(lead.sourceType.toUpperCase())}</span>
          <span class="tag blue">${escapeHtml(lead.qualityTier)}</span>
          ${lead.hasEmail ? '<span class="tag green">Email</span>' : ''}
          ${lead.hasLinkedIn ? '<span class="tag green">LinkedIn</span>' : ''}
          ${lead.hasPhone ? '<span class="tag green">Phone</span>' : ''}
        </div>
        <div class="contact-row">${contactHtml(lead)}</div>
        ${compact ? '' : `<div class="small" style="margin-top:9px"><strong>Why it fits:</strong> ${escapeHtml(lead.fitReason)}</div>
        <div class="small" style="margin-top:6px"><strong>Next step:</strong> ${escapeHtml(lead.bestFirstAction)}</div>
        <div class="evidence-row">${evidenceHtml(lead)}</div>`}
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" data-action="open" data-id="${escapeHtml(lead.id)}">Open Lead Card</button>
        ${lead.associateReady ? `<button class="btn btn-secondary btn-sm" data-action="advance" data-id="${escapeHtml(lead.id)}">Advance Day</button>` : `<button class="btn btn-teal btn-sm" data-action="ready" data-id="${escapeHtml(lead.id)}">Move to Ready</button>`}
        <button class="btn btn-secondary btn-sm" data-action="handoff" data-id="${escapeHtml(lead.id)}">Handoff Sheet</button>
        <button class="btn btn-danger btn-sm" data-action="suppress" data-id="${escapeHtml(lead.id)}">Suppress</button>
      </div>
    </article>`;
  }

  function leadList(leads, empty='No leads match this view.') {
    if (!leads.length) return `<div class="empty">${escapeHtml(empty)}</div>`;
    return `<div class="lead-list">${leads.map(l => leadCard(l)).join('')}</div>`;
  }

  function renderDashboard() {
    const c = counts();
    const ready = filterLeads(allVisibleLeads(), 'ready').slice(0, 8);
    const research = filterLeads(allVisibleLeads(), 'research').slice(0, 5);
    const st = radarStats();

    $('#page-dashboard').innerHTML = `
      <div class="grid grid-5" style="margin-bottom:16px">
        ${kpi(c.total, 'Total Candidates', 'Ready + research')}
        ${kpi(c.ready, 'Ready to Work', 'Associate cadence')}
        ${kpi(c.linkedin, 'LinkedIn Candidates', 'Verify manually')}
        ${kpi(c.email, 'Email Available', 'Best Day 1 route')}
        ${kpi(st.searches, 'Public Searches', 'Brave/GitHub runner')}
      </div>

      <div class="grid grid-2">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Top Ready Leads</div><div class="panel-sub">Email/LinkedIn leads rank before phone-only NPI seeds.</div></div></div>
          <div class="panel-body">${leadList(ready, 'No ready leads yet. Use Research / LinkedIn Verify to confirm contact routes.')}</div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Research Queue</div><div class="panel-sub">Candidates found but not ready for associate cadence.</div></div></div>
          <div class="panel-body">${leadList(research, 'No research candidates loaded.')}</div>
        </div>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><div><div class="panel-title">System Truth</div><div class="panel-sub">One data model. No iframe. No duplicate old pages. No patch loops.</div></div></div>
        <div class="panel-body">
          <div class="notice">
            A record is not treated as associate-ready unless it has a real person, enough profile context, and at least one usable contact route or manual confirmation. NPI-only records remain in Research until enriched by public search, email, LinkedIn URL, or a second evidence source.
          </div>
        </div>
      </div>
    `;
  }

  function renderRadar() {
    const c = counts();
    const leads = filterLeads(allVisibleLeads(), state.filter);
    const st = radarStats();
    $('#page-radar').innerHTML = `
      <div class="grid grid-5" style="margin-bottom:16px">
        ${kpi(c.total, 'Visible Candidates')}
        ${kpi(c.ready, 'Ready')}
        ${kpi(c.research, 'Research')}
        ${kpi(c.npi, 'NPI Seeds')}
        ${kpi(st.searches, 'Brave/Public Searches')}
      </div>
      <div class="panel" style="margin-bottom:16px">
        <div class="panel-head"><div><div class="panel-title">Lead Source / Route Filters</div><div class="panel-sub">Filter across every lead, regardless of workflow day.</div></div></div>
        <div class="panel-body">${tabs()}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">Found Leads & Signals</div><div class="panel-sub">Sorted by ready status, warm route, score, and source quality.</div></div></div>
        <div class="panel-body">${leadList(leads, 'No candidates visible. Click Load Shared GitHub Radar or run the GitHub Action.')}</div>
      </div>
    `;
  }

  function renderWorkflow() {
    const ready = filterLeads(allVisibleLeads(), 'ready');
    const byDay = new Map();
    for (const lead of ready) {
      const day = Number(lead.workflowDay || 1);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(lead);
    }
    const research = filterLeads(allVisibleLeads(), 'research');

    const daySections = [1,2,3,4,5,6,7,8,9,10].map(day => {
      const leads = (byDay.get(day) || []).sort(prioritySort);
      return `<div class="panel" style="margin-bottom:14px">
        <div class="panel-head"><div><div class="panel-title">Day ${day}</div><div class="panel-sub">${leads.length} ready lead(s). Must complete tasks, disposition, and note before advancing.</div></div></div>
        <div class="panel-body">${leadList(leads, `No ready leads in Day ${day}.`)}</div>
      </div>`;
    }).join('');

    $('#page-workflow').innerHTML = `
      <div class="notice" style="margin-bottom:16px">
        Required execution: every ready lead keeps grade, score, contact method tags, qualification status, evidence trail, notes, follow-up, and handoff history. Day 1 starts with email or LinkedIn when available; phone-only records should not become ready unless the phone source and profile are trusted enough to work.
      </div>
      <div class="grid grid-3" style="margin-bottom:16px">
        ${kpi(ready.length, 'Ready Leads')}
        ${kpi(research.length, 'Research / Prep')}
        ${kpi(counts().linkedin, 'LinkedIn / Verify')}
      </div>
      <div class="panel" style="margin-bottom:16px">
        <div class="panel-head"><div><div class="panel-title">Workflow Filters</div><div class="panel-sub">Use source filters without losing day status.</div></div></div>
        <div class="panel-body">${tabs()}</div>
      </div>
      ${state.filter === 'all' || state.filter === 'ready' ? daySections : `<div class="panel"><div class="panel-head"><div><div class="panel-title">Filtered Workflow View</div><div class="panel-sub">${state.filter}</div></div></div><div class="panel-body">${leadList(filterLeads(allVisibleLeads(), state.filter))}</div></div>`}
      ${research.length ? `<div class="panel"><div class="panel-head"><div><div class="panel-title">Prep / Research Candidates</div><div class="panel-sub">Not pushed to associate cadence until contact route is confirmed.</div></div></div><div class="panel-body">${leadList(research.slice(0, 100), 'No research candidates.')}</div></div>` : ''}
    `;
  }

  function renderLinkedIn() {
    const leads = filterLeads(allVisibleLeads(), 'linkedin');
    $('#page-linkedin').innerHTML = `
      ${pageHeader('LinkedIn Verify', 'No automated LinkedIn scraping. The OS stores public/profile URLs and lets you manually open, confirm, and pull in details you choose to enter.')}
      <div class="notice" style="margin-bottom:16px">
        Compliant flow: open profile URL manually, confirm the person, then add role/company/location/contact details into the lead card. The CRM keeps the URL and your manually-confirmed notes.
      </div>
      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">LinkedIn Candidates</div><div class="panel-sub">Highest score first. Move to Ready after profile/contact route is confirmed.</div></div></div>
        <div class="panel-body">${leadList(leads, 'No LinkedIn candidates yet. Run GitHub radar after adding Brave API key and LinkedIn search enabled.')}</div>
      </div>
    `;
  }

  function renderPipeline(type='investor') {
    const leads = filterLeads(allVisibleLeads(), type).filter(l => l.associateReady);
    const pageId = type === 'cpa' ? 'page-cpa' : 'page-pipeline';
    const title = type === 'cpa' ? 'CPA Pipeline' : 'Investor Pipeline';
    const sub = type === 'cpa' ? 'Referral partners and CPA/tax contacts.' : 'Ready accredited-likely investor prospects.';
    $(`#${pageId}`).innerHTML = `
      ${pageHeader(title, sub)}
      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">${title}</div><div class="panel-sub">Only ready leads appear here.</div></div></div>
        <div class="panel-body">${leadList(leads, `No ready ${type} leads yet.`)}</div>
      </div>
    `;
  }

  function renderSequence() {
    $('#page-sequence').innerHTML = `
      ${pageHeader('7-Channel Sequence Builder', 'Scripts are selected by day and available contact method.')}
      <div class="grid grid-2">
        ${CADENCE.map(step => `<div class="panel">
          <div class="panel-head"><div><div class="panel-title">Day ${step.day} — ${escapeHtml(step.title)}</div><div class="panel-sub">${escapeHtml(step.prior)}</div></div></div>
          <div class="panel-body">
            <div class="notice">${escapeHtml(step.firstAction)}</div>
            <pre class="code">${escapeHtml(step.callScript)}</pre>
          </div>
        </div>`).join('')}
      </div>
    `;
  }

  function renderCallCoach() {
    $('#page-callcoach').innerHTML = `
      ${pageHeader('Call Coach', 'Compliance-safe talk tracks for Basin Ventures.')}
      <div class="grid grid-2">
        <div class="panel"><div class="panel-head"><div><div class="panel-title">Core Positioning</div></div></div><div class="panel-body">
          <div class="code">Basin works with accredited investors on direct, tax-advantaged oil and gas ownership. This is educational and optional. Your CPA should confirm whether anything fits your situation.</div>
        </div></div>
        <div class="panel"><div class="panel-head"><div><div class="panel-title">Compliance Guardrails</div></div></div><div class="panel-body">
          <ul class="small">
            <li>Never promise or imply guaranteed returns.</li>
            <li>Never say they qualify. Screen and confirm.</li>
            <li>Never provide tax advice. Refer to CPA.</li>
            <li>Do not imply a public signal means they need an investment.</li>
          </ul>
        </div></div>
      </div>
    `;
  }

  function renderNotes() {
    const notes = state.store.notes.slice().reverse();
    $('#page-notes').innerHTML = `
      ${pageHeader('Call Notes', 'Searchable notes also attach to each lead card.')}
      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">All Notes</div><div class="panel-sub">${notes.length} note(s)</div></div></div>
        <div class="panel-body">
          ${notes.length ? `<table class="table"><thead><tr><th>Date</th><th>Lead</th><th>Note</th></tr></thead><tbody>${notes.map(n => {
            const lead = findLead(n.leadId);
            return `<tr><td>${escapeHtml(new Date(n.at).toLocaleString())}</td><td>${escapeHtml(lead?.name || n.leadName || 'Unknown')}</td><td>${escapeHtml(n.note)}</td></tr>`;
          }).join('')}</tbody></table>` : '<div class="empty">No notes yet.</div>'}
        </div>
      </div>
    `;
  }

  function renderHandoffs() {
    const leads = state.store.leads.slice().sort(prioritySort);
    $('#page-handoffs').innerHTML = `
      ${pageHeader('Director Handoffs', 'Generate a printable handoff from each lead card.')}
      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">Ready Leads</div><div class="panel-sub">Open any lead and click Handoff Sheet.</div></div></div>
        <div class="panel-body">${leadList(leads, 'No ready leads for handoff.')}</div>
      </div>
    `;
  }

  function renderCalendar() {
    const followUps = state.store.followUps.slice().sort((a,b) => new Date(a.dueAt) - new Date(b.dueAt));
    $('#page-calendar').innerHTML = `
      ${pageHeader('Follow-Up Calendar', 'Follow-ups created from lead cards and workflow actions.')}
      <div class="panel">
        <div class="panel-head"><div><div class="panel-title">Scheduled Follow-Ups</div><div class="panel-sub">${followUps.length} item(s)</div></div></div>
        <div class="panel-body">
        ${followUps.length ? `<table class="table"><thead><tr><th>Due</th><th>Lead</th><th>Action</th><th>Status</th></tr></thead><tbody>${followUps.map(f => {
          const lead = findLead(f.leadId);
          return `<tr><td>${escapeHtml(new Date(f.dueAt).toLocaleString())}</td><td>${escapeHtml(lead?.name || 'Unknown')}</td><td>${escapeHtml(f.action)}</td><td>${escapeHtml(f.status || 'Open')}</td></tr>`;
        }).join('')}</tbody></table>` : '<div class="empty">No follow-ups scheduled.</div>'}
        </div>
      </div>
    `;
  }

  function renderAnalytics() {
    const c = counts();
    $('#page-analytics').innerHTML = `
      ${pageHeader('Analytics', 'Pipeline quality and source mix.')}
      <div class="grid grid-4" style="margin-bottom:16px">
        ${kpi(c.total, 'All Candidates')}
        ${kpi(c.ready, 'Ready')}
        ${kpi(c.research, 'Research')}
        ${kpi(c.A, 'A Grade')}
      </div>
      <div class="grid grid-2">
        <div class="panel"><div class="panel-head"><div><div class="panel-title">Source Mix</div></div></div><div class="panel-body">
          <div class="code">${escapeHtml(JSON.stringify({ LinkedIn:c.linkedin, Email:c.email, Phone:c.phone, RSS:c.rss, NPI:c.npi, CPA:c.cpa }, null, 2))}</div>
        </div></div>
        <div class="panel"><div class="panel-head"><div><div class="panel-title">Radar File Stats</div></div></div><div class="panel-body">
          <div class="code">${escapeHtml(JSON.stringify(radarStats(), null, 2))}</div>
        </div></div>
      </div>
    `;
  }

  function renderApi() {
    const st = radarStats();
    const hasGroq = Boolean(state.store.api.groqKey);
    $('#page-api').innerHTML = `
      ${pageHeader('API Command Center', 'Groq browser key is stored locally. Brave Search runs in GitHub Actions through BRAVE_API_KEY secret.')}
      <div class="grid grid-3" style="margin-bottom:16px">
        ${kpi(hasGroq ? 'ON' : 'OFF', 'Groq Browser', hasGroq ? 'Stored locally' : 'Not saved')}
        ${kpi(st.searches > 0 ? 'ON' : 'CHECK', 'Brave GitHub Runner', `${st.searches} public searches in latest radar JSON`)}
        ${kpi(st.ai, 'AI Calls', 'Runner/browser usage')}
      </div>
      <div class="grid grid-2">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Groq Browser Setup</div><div class="panel-sub">One-time setup on this browser only.</div></div></div>
          <div class="panel-body">
            <label class="small">Groq API Key</label>
            <input id="groqKeyInput" class="input" type="password" value="${escapeHtml(state.store.api.groqKey || '')}" placeholder="gsk_..." />
            <label class="small" style="display:block;margin-top:12px">Groq Model</label>
            <select id="groqModelInput">
              <option ${state.store.api.groqModel === 'llama-3.3-70b-versatile' ? 'selected' : ''}>llama-3.3-70b-versatile</option>
              <option ${state.store.api.groqModel === 'llama-3.1-8b-instant' ? 'selected' : ''}>llama-3.1-8b-instant</option>
              <option ${state.store.api.groqModel === 'mixtral-8x7b-32768' ? 'selected' : ''}>mixtral-8x7b-32768</option>
            </select>
            <div style="display:flex;gap:10px;margin-top:14px">
              <button id="saveApiBtn" class="btn btn-primary">Save API Settings</button>
              <button id="clearApiBtn" class="btn btn-danger">Clear</button>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Brave / GitHub Actions</div><div class="panel-sub">Production search does not run from the webpage.</div></div></div>
          <div class="panel-body">
            <div class="notice good">
              Brave status is based on <strong>publicSearches</strong> inside <strong>data/radar-leads.json</strong>. Browser Brave tests were removed because CORS makes them unreliable and misleading.
            </div>
            <pre class="code">Required GitHub Secret:
BRAVE_API_KEY

Optional GitHub Secret:
GROQ_API_KEY

Run:
Actions → Basin Radar Daily → Run workflow</pre>
          </div>
        </div>
      </div>
    `;
  }

  function renderSettings() {
    $('#page-settings').innerHTML = `
      ${pageHeader('Settings', 'Backup, restore, and safe data reset.')}
      <div class="grid grid-2">
        <div class="panel"><div class="panel-head"><div><div class="panel-title">Backup / Restore</div></div></div><div class="panel-body">
          <button id="exportJsonBtn" class="btn btn-primary">Export Browser CRM JSON</button>
          <label class="small" style="display:block;margin-top:14px">Import Browser CRM JSON</label>
          <input id="importFileInput" type="file" accept="application/json" class="input" />
        </div></div>
        <div class="panel"><div class="panel-head"><div><div class="panel-title">Reset</div></div></div><div class="panel-body">
          <button id="clearLocalBtn" class="btn btn-danger">Clear Browser CRM Data</button>
          <p class="small">This clears browser/local CRM data only. It does not change GitHub radar files.</p>
        </div></div>
      </div>
    `;
  }

  function renderPage() {
    $('#pageTitle').textContent = ({
      dashboard:'Dashboard',
      radar:'Lead Radar & Automation',
      workflow:'Leads Workflow',
      linkedin:'LinkedIn Verify',
      pipeline:'Investor Pipeline',
      cpa:'CPA Pipeline',
      sequence:'7-Channel Sequence Builder',
      callcoach:'Call Coach',
      notes:'Call Notes',
      handoffs:'Director Handoffs',
      calendar:'Follow-Up Calendar',
      analytics:'Analytics',
      api:'API Command Center',
      settings:'Settings'
    })[state.page] || 'Dashboard';

    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${state.page}`)?.classList.add('active');
    $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === state.page));

    if (state.page === 'dashboard') renderDashboard();
    if (state.page === 'radar') renderRadar();
    if (state.page === 'workflow') renderWorkflow();
    if (state.page === 'linkedin') renderLinkedIn();
    if (state.page === 'pipeline') renderPipeline('investor');
    if (state.page === 'cpa') renderPipeline('cpa');
    if (state.page === 'sequence') renderSequence();
    if (state.page === 'callcoach') renderCallCoach();
    if (state.page === 'notes') renderNotes();
    if (state.page === 'handoffs') renderHandoffs();
    if (state.page === 'calendar') renderCalendar();
    if (state.page === 'analytics') renderAnalytics();
    if (state.page === 'api') renderApi();
    if (state.page === 'settings') renderSettings();

    bindDynamicEvents();
  }

  function updateAll() {
    updateNavCounts();
    renderPage();
  }

  function findLead(id) {
    return [...state.store.leads, ...state.store.research].find(l => l.id === id);
  }

  function updateLead(lead) {
    const inReady = lead.associateReady;
    state.store.leads = state.store.leads.filter(l => l.id !== lead.id);
    state.store.research = state.store.research.filter(l => l.id !== lead.id);
    if (inReady) state.store.leads.push(lead);
    else state.store.research.push(lead);
    saveStore();
    updateAll();
  }

  function suppressLead(id) {
    const lead = findLead(id);
    if (!lead) return;
    state.store.leads = state.store.leads.filter(l => l.id !== id);
    state.store.research = state.store.research.filter(l => l.id !== id);
    state.store.suppressed.push({ ...lead, suppressedAt: new Date().toISOString() });
    saveStore();
    updateAll();
    showToast(`${lead.name} suppressed`);
  }

  function advanceLead(id) {
    const lead = findLead(id);
    if (!lead) return;
    lead.workflowDay = Math.min(10, Number(lead.workflowDay || 1) + 1);
    lead.lastUpdated = new Date().toISOString();
    const nextStep = CADENCE.find(c => c.day >= lead.workflowDay) || CADENCE[CADENCE.length - 1];
    lead.bestFirstAction = nextStep.firstAction;
    state.store.followUps.push({
      id: uid('follow'),
      leadId: lead.id,
      dueAt: new Date(Date.now() + 24*60*60*1000).toISOString(),
      action: `Day ${lead.workflowDay}: ${nextStep.title}`,
      status: 'Open'
    });
    updateLead(lead);
    showToast(`${lead.name} advanced to Day ${lead.workflowDay}`);
  }

  function markReady(id) {
    const lead = findLead(id);
    if (!lead) return;
    lead.associateReady = true;
    lead.bucket = 'ready';
    lead.status = 'Ready to Work';
    lead.workflowDay = lead.workflowDay || 1;
    lead.bestFirstAction = firstAction({
      hasLinkedIn: lead.hasLinkedIn,
      hasEmail: lead.hasEmail,
      hasPhone: lead.hasPhone,
      isReady: true
    });
    updateLead(lead);
    showToast(`${lead.name} moved to Ready`);
  }

  function addNote(leadId, note, disposition='', followUp='') {
    const lead = findLead(leadId);
    if (!lead || !text(note)) return;
    const n = { id: uid('note'), leadId, leadName: lead.name, note: text(note), disposition: text(disposition), at: new Date().toISOString() };
    state.store.notes.push(n);
    lead.notes = Array.isArray(lead.notes) ? lead.notes : [];
    lead.notes.push(n);
    if (followUp) {
      state.store.followUps.push({ id: uid('follow'), leadId, dueAt: followUp, action: disposition || 'Follow up', status: 'Open' });
    }
    updateLead(lead);
  }

  function openLeadModal(id) {
    const lead = findLead(id);
    if (!lead) return;
    $('#modalTitle').textContent = lead.name;
    const cadence = CADENCE.find(c => c.day === Number(lead.workflowDay || 1)) || CADENCE[0];
    const notes = state.store.notes.filter(n => n.leadId === lead.id).slice().reverse();

    $('#modalBody').innerHTML = `
      <div class="grid grid-3" style="margin-bottom:16px">
        ${kpi(lead.score, 'Score')}
        ${kpi(lead.grade, 'Grade')}
        ${kpi(lead.workflowDay || 0, 'Workflow Day')}
      </div>

      <div class="grid grid-2">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Lead Profile</div></div></div>
          <div class="panel-body">
            <div class="form-row">
              <div><label class="small">Name</label><input class="input" id="editName" value="${escapeHtml(lead.name)}"></div>
              <div><label class="small">Title / Role</label><input class="input" id="editTitle" value="${escapeHtml(lead.title)}"></div>
            </div>
            <div class="form-row" style="margin-top:12px">
              <div><label class="small">Company / Practice</label><input class="input" id="editCompany" value="${escapeHtml(lead.company)}"></div>
              <div><label class="small">Location</label><input class="input" id="editLocation" value="${escapeHtml(lead.location)}"></div>
            </div>
            <label class="small" style="display:block;margin-top:12px">Why it fits</label>
            <textarea id="editFit">${escapeHtml(lead.fitReason)}</textarea>
            <label class="small" style="display:block;margin-top:12px">Accredited-likely reason</label>
            <textarea id="editAccredited">${escapeHtml(lead.accreditedLikelyReason)}</textarea>
            <button class="btn btn-primary" style="margin-top:12px" data-action="saveLead" data-id="${escapeHtml(lead.id)}">Save Lead Edits</button>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Contact Methods</div><div class="panel-sub">Visible and clickable.</div></div></div>
          <div class="panel-body">
            <div class="contact-row">${contactHtml(lead)}</div>
            <div class="form-row three" style="margin-top:14px">
              <input id="newContactType" class="input" placeholder="email / phone / linkedin" />
              <input id="newContactValue" class="input" placeholder="value or URL" />
              <button class="btn btn-teal" data-action="addContact" data-id="${escapeHtml(lead.id)}">Add Contact</button>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-2" style="margin-top:16px">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Evidence Trail</div></div></div>
          <div class="panel-body">
            <div class="evidence-row">${evidenceHtml(lead) || '<span class="small">No evidence links yet.</span>'}</div>
            <div class="form-row three" style="margin-top:14px">
              <input id="newEvidenceSource" class="input" placeholder="Source label" />
              <input id="newEvidenceUrl" class="input" placeholder="URL" />
              <button class="btn btn-teal" data-action="addEvidence" data-id="${escapeHtml(lead.id)}">Add Evidence</button>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Current Cadence Step</div><div class="panel-sub">Day ${cadence.day} — ${escapeHtml(cadence.title)}</div></div></div>
          <div class="panel-body">
            <div class="notice">${escapeHtml(cadence.prior)}</div>
            <pre class="code">${escapeHtml(cadence.callScript.replaceAll('[Name]', lead.name).replaceAll('[Signal]', lead.signal || 'your public signal').replaceAll('[Role]', lead.title || 'your role'))}</pre>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><div><div class="panel-title">Daily Note / Disposition</div><div class="panel-sub">Required before meaningful advancement.</div></div></div>
        <div class="panel-body">
          <div class="form-row">
            <select id="noteDisposition">
              <option value="">Select disposition...</option>
              <option>Reviewed evidence</option>
              <option>Sent email</option>
              <option>Sent LinkedIn touch</option>
              <option>Called - no answer</option>
              <option>Left voicemail</option>
              <option>Booked director call</option>
              <option>Callback requested</option>
              <option>Future nurture</option>
              <option>Not interested</option>
            </select>
            <input id="noteFollowUp" class="input" type="datetime-local" />
          </div>
          <textarea id="noteText" style="margin-top:12px" placeholder="What happened? Outcome? Next reason?"></textarea>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
            <button class="btn btn-primary" data-action="saveNote" data-id="${escapeHtml(lead.id)}">Save Note</button>
            <button class="btn btn-secondary" data-action="printHandoff" data-id="${escapeHtml(lead.id)}">Print Director Handoff</button>
            ${lead.associateReady ? `<button class="btn btn-teal" data-action="advance" data-id="${escapeHtml(lead.id)}">Advance Day</button>` : `<button class="btn btn-teal" data-action="ready" data-id="${escapeHtml(lead.id)}">Move to Ready</button>`}
          </div>
        </div>
      </div>

      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><div><div class="panel-title">Attached Notes</div><div class="panel-sub">${notes.length} note(s)</div></div></div>
        <div class="panel-body">
          ${notes.length ? notes.map(n => `<div class="notice" style="margin-bottom:8px"><strong>${escapeHtml(new Date(n.at).toLocaleString())} — ${escapeHtml(n.disposition || 'Note')}</strong><br>${escapeHtml(n.note)}</div>`).join('') : '<div class="empty">No notes yet.</div>'}
        </div>
      </div>
    `;
    $('#modalBackdrop').classList.remove('hidden');
    bindDynamicEvents();
  }

  function closeModal() {
    $('#modalBackdrop').classList.add('hidden');
    $('#modalBody').innerHTML = '';
  }

  function saveLeadEdits(id) {
    const lead = findLead(id);
    if (!lead) return;
    lead.name = text($('#editName').value);
    lead.title = text($('#editTitle').value);
    lead.company = text($('#editCompany').value);
    lead.location = text($('#editLocation').value);
    lead.fitReason = text($('#editFit').value);
    lead.accreditedLikelyReason = text($('#editAccredited').value);
    updateLead(lead);
    openLeadModal(id);
    showToast('Lead saved');
  }

  function addContact(id) {
    const lead = findLead(id);
    if (!lead) return;
    const type = text($('#newContactType').value).toLowerCase();
    const value = text($('#newContactValue').value);
    if (!type || !value) return showToast('Enter contact type and value', true);
    lead.contacts = lead.contacts || [];
    lead.contacts.push({ type, value, source: 'manual' });
    const refreshed = normalizeLead(lead);
    refreshed.associateReady = lead.associateReady || refreshed.associateReady;
    updateLead(refreshed);
    openLeadModal(id);
  }

  function addEvidence(id) {
    const lead = findLead(id);
    if (!lead) return;
    const source = text($('#newEvidenceSource').value) || 'Manual evidence';
    const url = text($('#newEvidenceUrl').value);
    if (!url) return showToast('Enter evidence URL', true);
    lead.evidence = lead.evidence || [];
    lead.evidence.push({ source, url, whatItProves: 'Manually added evidence' });
    const refreshed = normalizeLead(lead);
    refreshed.associateReady = lead.associateReady || refreshed.associateReady;
    updateLead(refreshed);
    openLeadModal(id);
  }

  function printHandoff(id) {
    const lead = findLead(id);
    if (!lead) return;
    const notes = state.store.notes.filter(n => n.leadId === id);
    const html = `
      <html><head><title>Director Handoff - ${escapeHtml(lead.name)}</title>
      <style>body{font-family:Arial,sans-serif;color:#111;padding:28px;line-height:1.5}h1{margin-bottom:0}.box{border:1px solid #ccc;padding:14px;margin:12px 0;border-radius:8px}.small{color:#555;font-size:12px}a{color:#0645ad}</style></head>
      <body>
        <h1>Director Handoff: ${escapeHtml(lead.name)}</h1>
        <div class="small">${escapeHtml([lead.title, lead.company, lead.location].filter(Boolean).join(' · '))}</div>
        <div class="box"><strong>Score / Grade:</strong> ${lead.score} / ${lead.grade}<br><strong>Status:</strong> ${escapeHtml(lead.status)}<br><strong>Current Day:</strong> ${lead.workflowDay || 0}</div>
        <div class="box"><strong>Why it fits:</strong><br>${escapeHtml(lead.fitReason)}</div>
        <div class="box"><strong>Accredited-likely reason:</strong><br>${escapeHtml(lead.accreditedLikelyReason)}</div>
        <div class="box"><strong>Contact Methods:</strong><br>${(lead.contacts||[]).map(c => `${escapeHtml(c.type)}: ${escapeHtml(c.value)}`).join('<br>') || 'None confirmed'}</div>
        <div class="box"><strong>Evidence:</strong><br>${(lead.evidence||[]).map(e => e.url ? `<a href="${escapeHtml(e.url)}">${escapeHtml(e.source || e.url)}</a>` : escapeHtml(e.source || '')).join('<br>') || 'None'}</div>
        <div class="box"><strong>Recommended next action:</strong><br>${escapeHtml(lead.bestFirstAction)}</div>
        <div class="box"><strong>Notes:</strong><br>${notes.map(n => `${escapeHtml(new Date(n.at).toLocaleString())}: ${escapeHtml(n.note)}`).join('<br>') || 'None'}</div>
        <div class="small">Compliance: Educational only. No guaranteed returns. No tax advice. Accredited fit must be confirmed by prospect.</div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return showToast('Popup blocked. Allow popups for this site.', true);
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state.store, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `basin-os-crm-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file) {
    const text = await file.text();
    const json = JSON.parse(text);
    state.store = Object.assign(clone(DEFAULT_STORE), json);
    saveStore();
    updateAll();
    showToast('CRM backup imported');
  }

  function bindStaticEvents() {
    $$('.nav-item[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.page = btn.dataset.page;
        state.filter = 'all';
        renderPage();
      });
    });

    $('#reloadRadarBtn').addEventListener('click', () => loadSharedRadar(true));
    $('#runLocalBtn').addEventListener('click', () => runLocalBrowserRadar());
    $('#globalSearch').addEventListener('input', e => {
      state.query = e.target.value;
      renderPage();
    });
    $('#closeModalBtn').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', e => {
      if (e.target.id === 'modalBackdrop') closeModal();
    });
    $('#exportAllBtn').addEventListener('click', exportData);
  }

  function bindDynamicEvents() {
    $$('[data-filter]').forEach(btn => {
      btn.onclick = () => {
        state.filter = btn.dataset.filter;
        renderPage();
      };
    });

    $$('[data-action]').forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'open') openLeadModal(id);
        if (action === 'advance') advanceLead(id);
        if (action === 'ready') markReady(id);
        if (action === 'suppress') suppressLead(id);
        if (action === 'handoff' || action === 'printHandoff') printHandoff(id);
        if (action === 'saveLead') saveLeadEdits(id);
        if (action === 'addContact') addContact(id);
        if (action === 'addEvidence') addEvidence(id);
        if (action === 'saveNote') {
          addNote(id, $('#noteText').value, $('#noteDisposition').value, $('#noteFollowUp').value ? new Date($('#noteFollowUp').value).toISOString() : '');
          openLeadModal(id);
          showToast('Note saved');
        }
      };
    });

    const saveApi = $('#saveApiBtn');
    if (saveApi) saveApi.onclick = () => {
      state.store.api.groqKey = $('#groqKeyInput').value.trim();
      state.store.api.groqModel = $('#groqModelInput').value;
      saveStore();
      updateAll();
      showToast('API settings saved');
    };

    const clearApi = $('#clearApiBtn');
    if (clearApi) clearApi.onclick = () => {
      state.store.api.groqKey = '';
      saveStore();
      updateAll();
      showToast('Groq key cleared');
    };

    const exportJson = $('#exportJsonBtn');
    if (exportJson) exportJson.onclick = exportData;

    const importFile = $('#importFileInput');
    if (importFile) importFile.onchange = e => {
      if (e.target.files[0]) importData(e.target.files[0]).catch(err => showToast(`Import failed: ${err.message}`, true));
    };

    const clearLocal = $('#clearLocalBtn');
    if (clearLocal) clearLocal.onclick = () => {
      if (!confirm('Clear browser CRM data? This cannot be undone unless you exported a backup.')) return;
      state.store = clone(DEFAULT_STORE);
      saveStore();
      updateAll();
      showToast('Browser CRM data cleared');
    };
  }

  function runLocalBrowserRadar() {
    const examples = [
      {
        name: 'Manual Research Candidate',
        title: 'Business Owner / Executive',
        company: 'Manual Source',
        location: 'USA',
        source: 'manual',
        sourceType: 'manual',
        signal: 'Added from local browser radar placeholder',
        summary: 'Use manual import or GitHub Actions for automated sourcing.',
        score: 58,
        contactMethods: [],
        evidenceTrail: [],
        associateReady: false
      }
    ];
    const normalized = examples.map(normalizeLead);
    state.store.research = mergeLeadArrays(state.store.research, normalized);
    saveStore();
    updateAll();
    showToast('Local placeholder candidate added. Use GitHub Actions for real automated radar.');
  }

  function boot() {
    bindStaticEvents();
    updateAll();
    setStatus('Ready. Click Load Shared GitHub Radar to load the latest GitHub-generated leads.');
    loadRadarData(false).then(raw => {
      if (hasAnyRadar(raw)) {
        ingestRadar(raw);
        setStatus(`Auto-loaded cached/shared radar from ${raw.__loadedFrom || state.store.lastLoadedFrom}.`);
      }
    }).catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
