
(function(){
  'use strict';

  // V8.0: stable render. No MutationObserver. No repeated DOM rebuild loop.
  const STORE_KEY = 'basin_os_integrated';
  const REPO_RAW = 'https://raw.githubusercontent.com/64w7wkr84g-dev/Basin-OS-V4/main/data/radar-leads.json';
  const REPO_ROOT_RAW = 'https://raw.githubusercontent.com/64w7wkr84g-dev/Basin-OS-V4/main/radar-leads.json';

  let currentRaw = null;
  let isRendering = false;
  let lastRenderKey = '';
  let navBound = false;

  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => Array.from(r.querySelectorAll(s));
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function parse(v,d){ try { return JSON.parse(v); } catch(e) { return d; } }
  function getStore(){
    const s = parse(localStorage.getItem(STORE_KEY)||'{}',{});
    s.radarLeads = Array.isArray(s.radarLeads) ? s.radarLeads : [];
    s.leadWorkflow = Array.isArray(s.leadWorkflow) ? s.leadWorkflow : [];
    s.leads = Array.isArray(s.leads) ? s.leads : [];
    s.leadFactory = s.leadFactory || {};
    s.leadFactory.leads = Array.isArray(s.leadFactory.leads) ? s.leadFactory.leads : [];
    s.leadFactory.research = Array.isArray(s.leadFactory.research) ? s.leadFactory.research : [];
    s.callNotes = Array.isArray(s.callNotes) ? s.callNotes : [];
    s.followUps = Array.isArray(s.followUps) ? s.followUps : [];
    return s;
  }
  function slimLead(l){
    if(!l || typeof l !== 'object') return l;
    const keep = ['id','leadId','name','title','role','specialty','company','location','practiceLocation','source','sourceType','sourceUrl','url','signal','summary','contactMethods','bestContactRoute','queue','status','bucket','stage','day','workflowDay','grade','score','sourceConfidence','qualityTier','priorityRank','crossReferenced','fitReason','accreditedLikelyReason','evidenceTrail','nextAction','bestFirstAction','associateReady','workflow','notes','nurture'];
    const o = {};
    keep.forEach(k=>{ if(l[k]!==undefined) o[k]=l[k]; });
    if(Array.isArray(o.contactMethods)) o.contactMethods = o.contactMethods.slice(0,12);
    if(Array.isArray(o.evidenceTrail)) o.evidenceTrail = o.evidenceTrail.slice(0,12);
    return o;
  }
  function saveStore(s){
    const o = Object.assign({}, s);
    o.radarLeads = (o.radarLeads || []).slice(0,2000).map(slimLead);
    o.leadWorkflow = (o.leadWorkflow || []).slice(0,2000).map(slimLead);
    o.leads = (o.leads || []).slice(0,1500).map(slimLead);
    o.leadFactory = o.leadFactory || {};
    o.leadFactory.leads = (o.leadFactory.leads || []).slice(0,1500).map(slimLead);
    o.leadFactory.research = (o.leadFactory.research || []).slice(0,2000).map(slimLead);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(o));
      window.STORE = Object.assign(window.STORE || {}, o);
      return true;
    } catch(e) {
      Object.keys(localStorage).forEach(k => {
        if(/backup|archive|debug|old|radar_raw|basin_os_integrated_bak/i.test(k)) {
          try { localStorage.removeItem(k); } catch(_){}
        }
      });
      try {
        o.radarLeads = o.radarLeads.slice(0,1000);
        o.leadWorkflow = o.leadWorkflow.slice(0,1000);
        o.leadFactory.research = o.leadFactory.research.slice(0,1000);
        localStorage.setItem(STORE_KEY, JSON.stringify(o));
        window.STORE = Object.assign(window.STORE || {}, o);
        return true;
      } catch(e2) {
        console.error('[Basin V8.0] localStorage failed after trim', e2);
        return false;
      }
    }
  }

  async function fetchOne(url){
    try{
      const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache:'no-store', mode:'cors' });
      const text = await r.text();
      if(!r.ok || !text.trim()) throw new Error(url + ' returned ' + r.status + ' empty=' + !text.trim());
      const json = JSON.parse(text);
      return { ok:true, url, json };
    } catch(e) {
      return { ok:false, url, error:String(e.message||e) };
    }
  }
  function hasAnyRadar(raw){
    if(!raw || typeof raw !== 'object') return false;
    const s = raw.stats || {};
    const n = Number(s.totalFound || 0) + Number(s.readyToWork || 0) + Number(s.research || 0) + Number(s.npiCollected || 0);
    return n > 0 || (Array.isArray(raw.leads) && raw.leads.length) || (Array.isArray(raw.researchCandidates) && raw.researchCandidates.length) || (Array.isArray(raw.allCandidates) && raw.allCandidates.length);
  }
  async function getRadar(force){
    if(currentRaw && !force) return currentRaw;
    const urls = ['data/radar-leads.json','./data/radar-leads.json','radar-leads.json','./radar-leads.json',REPO_RAW,REPO_ROOT_RAW];
    const attempts = [];
    for(const u of urls){
      const res = await fetchOne(u);
      attempts.push(res);
      if(res.ok && hasAnyRadar(res.json)){
        res.json.__loadedFrom = u;
        res.json.__attempts = attempts.map(a => ({url:a.url, ok:a.ok, error:a.error||''}));
        currentRaw = res.json;
        try { localStorage.setItem('BASIN_LAST_GOOD_RADAR_JSON', JSON.stringify(res.json)); } catch(_){}
        return res.json;
      }
    }
    const lastGood = parse(localStorage.getItem('BASIN_LAST_GOOD_RADAR_JSON')||'null', null);
    if(lastGood && hasAnyRadar(lastGood)){
      lastGood.__loadedFrom = 'localStorage:BASIN_LAST_GOOD_RADAR_JSON';
      lastGood.__attempts = attempts.map(a => ({url:a.url, ok:a.ok, error:a.error||''}));
      currentRaw = lastGood;
      return lastGood;
    }
    currentRaw = { stats:{}, leads:[], researchCandidates:[], allCandidates:[], errors:[{source:'V8.0 loader', reason:'No usable radar JSON loaded', attempts}] };
    return currentRaw;
  }

  function normalizeLead(l, sourceBucket){
    l = Object.assign({}, l || {});
    l.id = l.id || l.leadId || ('lead_' + Math.random().toString(16).slice(2));
    l.name = clean(l.name || l.title || 'Radar Candidate');
    l.title = clean(l.title || l.role || l.specialty || 'Prospect Signal');
    l.company = clean(l.company || '');
    l.location = clean(l.location || l.practiceLocation || '');
    l.practiceLocation = clean(l.practiceLocation || l.location || '');
    l.sourceUrl = clean(l.sourceUrl || l.url || '');
    l.url = l.sourceUrl;
    l.source = clean(l.source || l.sourceType || sourceBucket || 'Shared Radar');
    l.status = clean(l.status || l.queue || (l.associateReady ? 'Ready to Work' : 'Contact Route Needed'));
    l.queue = clean(l.queue || l.status);
    l.bucket = clean(l.bucket || (l.associateReady ? 'day1' : 'contact-needed'));
    l.day = Number(l.day || l.workflowDay || (l.associateReady ? 1 : 0));
    l.workflowDay = l.day;
    l.score = Number(l.score || 50);
    l.grade = clean(l.grade || (l.score>=85?'A':l.score>=70?'B':l.score>=55?'C':'R'));
    l.signal = clean(l.signal || l.summary || l.sourceConfidence || 'Shared radar candidate');
    l.summary = clean(l.summary || l.signal || '');
    l.contactMethods = Array.isArray(l.contactMethods) ? l.contactMethods : [];
    l.evidenceTrail = Array.isArray(l.evidenceTrail) ? l.evidenceTrail : [];
    l.type = l.type || (/cpa|tax|accounting/i.test([l.title,l.summary,l.signal,l.source].join(' ')) ? 'cpa' : 'investor');
    l.foundAt = l.foundAt || new Date().toISOString();
    return l;
  }
  function leadKey(l){
    return clean([l.id,l.name,l.title,l.company,l.sourceUrl,(l.contactMethods||[]).map(c=>c.value).join('|')].join('|')).toLowerCase();
  }
  function splitRaw(raw){
    const ready = Array.isArray(raw.leads) ? raw.leads : [];
    const research = Array.isArray(raw.researchCandidates) ? raw.researchCandidates : [];
    const allCandidates = Array.isArray(raw.allCandidates) ? raw.allCandidates : [];
    const combined = ready.concat(research.length ? research : allCandidates);
    const seen = new Set(), all = [];
    combined.forEach((x,i)=>{
      const l = normalizeLead(x, i < ready.length ? 'ready' : 'prep');
      const k = leadKey(l);
      if(!k || seen.has(k)) return;
      seen.add(k); all.push(l);
    });
    const readyNorm = all.filter(l => l.associateReady || /ready to work|day1/i.test([l.queue,l.status,l.bucket].join(' ')));
    const prepNorm = all.filter(l => !readyNorm.includes(l));
    return {all, ready:readyNorm, prep:prepNorm};
  }
  function stats(raw){
    const st = raw.stats || {};
    const parts = splitRaw(raw);
    return {
      found: Number(st.totalFound || parts.all.length || 0),
      ready: Number(st.readyToWork || parts.ready.length || 0),
      prep: Number(st.research || st.filteredNotUsable || parts.prep.length || 0),
      npi: Number(st.npiCollected || parts.all.filter(l=>/npi/i.test([l.source,l.sourceType,l.sourceUrl].join(' '))).length || 0),
      rss: Number(st.rssCollected || parts.all.filter(l=>/rss|google rss|news\.google|article/i.test([l.source,l.sourceType,l.sourceUrl].join(' '))).length || 0),
      li: Number(st.linkedinCandidatesFound || st.linkedinVerify || parts.all.filter(l=>/linkedin/i.test([l.queue,l.status,l.sourceConfidence,(l.contactMethods||[]).map(c=>c.value).join(' ')].join(' '))).length || 0),
      searches: Number(st.publicSearches || 0),
      ai: Number(st.aiCalls || 0),
      generatedAt: raw.generatedAt || '',
      loadedFrom: raw.__loadedFrom || ''
    };
  }
  function importRadar(raw){
    const parts = splitRaw(raw);
    const s = getStore();
    s.radarLeads = parts.all;
    s.leadWorkflow = parts.all;
    s.leadFactory.leads = parts.ready;
    s.leadFactory.research = parts.prep;
    s.lastSharedRadarLoad = new Date().toLocaleString();
    s.lastSharedRadarSource = raw.__loadedFrom || 'unknown';
    s.lastSharedRadarFound = parts.all.length;
    s.lastSharedRadarAdded = parts.all.length;
    s.lastSharedRadarSkipped = 0;
    s.lastSharedRadarErrors = 0;
    saveStore(s);
    return parts;
  }

  function groqKey(){ return localStorage.getItem('GROQ_API_KEY') || localStorage.getItem('BASIN_GROQ_API_KEY') || ''; }
  function markGroq(){
    if(groqKey()){
      window.BV_API = window.BV_API || {};
      window.BV_API.groqLive = true;
      window.BV_API.groqConnected = true;
      return true;
    }
    return false;
  }
  function setText(id, text){ const el = document.getElementById(id); if(el) el.textContent = text; }

  function updateApi(raw){
    const s = stats(raw);
    const groq = markGroq(), brave = s.searches > 0;
    setText('v77-groq-status', groq ? 'ON' : 'OFF');
    setText('v77-groq-note', groq ? 'Saved browser key detected and auto-connected.' : 'Click Save / Connect Groq.');
    setText('v77-brave-status', brave ? 'ON' : 'CHECK');
    setText('v77-brave-note', 'Latest public searches: ' + s.searches + (brave ? ' — GitHub runner used public search.' : ' — run GitHub Action or check BRAVE_API_KEY.'));
    setText('v77-ai-status', String(s.ai));
    setText('v77-api-summary', `Latest radar: found ${s.found} · ready ${s.ready} · prep ${s.prep} · LinkedIn ${s.li} · NPI ${s.npi} · RSS/Public ${s.rss} · loaded from ${s.loadedFrom || 'unknown'} · generated ${s.generatedAt || 'unknown'}`);
    const badge = document.getElementById('api-badge');
    if(badge) badge.textContent = groq ? (brave ? 'R+B' : 'GROQ') : (brave ? 'BRAVE' : 'OFF');

    const page = $('#page-apicenter');
    if(page){
      const panel = $('#basin-v77-static-api-panel');
      const body = page.querySelector('.body');
      if(panel && body && panel.parentElement !== body) body.prepend(panel);
      $$('.panel', page).forEach(p=>{
        if(p.id === 'basin-v77-static-api-panel') return;
        const t = p.textContent || '';
        if(/Connection Setup|GROQ API KEY|Run Limits & Automation/i.test(t)) p.style.display = 'none';
      });
    }
  }
  function setCard(labelRe, val){
    const page = $('.page.active') || document;
    $$('[class*="stat"],[class*="metric"],[class*="kpi"],.grid3>div,.stats-grid>div,.kpi-grid>div', page).forEach(card=>{
      const t = card.textContent || '';
      if(!labelRe.test(t)) return;
      const n = card.querySelector('.stat-val,.kpi-val,.metric-val,.num,.value') || Array.from(card.querySelectorAll('*')).find(x=>/^\d+$/.test(clean(x.textContent))) || card.firstElementChild;
      if(n) n.textContent = String(val);
    });
  }
  function updateCounts(raw){
    const s = stats(raw);
    setCard(/total\s*found|total\s*leads|all\s*sources/i, s.found);
    setCard(/usable\s*leads|ready\s*to\s*work/i, s.ready);
    setCard(/active\s*lead\s*work|active\s*cadence/i, s.ready);
    setCard(/filtered\s*\/\s*not\s*usable|filtered|not\s*usable/i, s.prep);
    setCard(/has\s*contact/i, s.ready);
    $$('a,button,.nav-item,.side-link,.menu-item').forEach(el=>{
      const badge = el.querySelector('.badge,.pill,.count,[class*="badge"],[class*="count"]');
      if(!badge) return;
      const txt = el.textContent || '';
      if(/Lead Radar/i.test(txt)) badge.textContent = String(s.found);
      if(/\bLeads\b/i.test(txt) && !/Radar/i.test(txt)) badge.textContent = String(s.ready);
    });
  }

  function contactsHtml(l){
    const c = Array.isArray(l.contactMethods) ? l.contactMethods : [];
    if(!c.length) return '<span class="tag bad">NO CONTACT METHOD</span>';
    return c.map(x=>{
      const type = esc(x.type || 'Contact');
      const val = esc(x.value || '');
      const raw = String(x.value || '');
      const isUrl = /^https?:\/\//i.test(raw);
      const isMail = /@/.test(raw) && !isUrl;
      const href = isUrl ? raw : isMail ? 'mailto:'+raw : '';
      const inner = href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${type}: ${val}</a>` : `${type}: ${val}`;
      return `<span class="tag">${inner}</span>`;
    }).join(' ');
  }
  function evidenceHtml(l){
    const ev = Array.isArray(l.evidenceTrail) ? l.evidenceTrail : [];
    const rows = ev.slice(0,4).map(e=>{
      const u = e.url || '';
      const label = esc(e.source || 'Evidence');
      return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${label}</a>` : label;
    });
    if((l.sourceUrl || l.url) && !rows.length) rows.push(`<a href="${esc(l.sourceUrl || l.url)}" target="_blank" rel="noopener">Source</a>`);
    return rows.length ? `<div class="mini-note"><strong>Evidence:</strong> ${rows.join(' · ')}</div>` : '';
  }
  function leadCard(l){
    const score = Number(l.score || 0);
    const grade = l.grade || (score>=85?'A':score>=70?'B':score>=55?'C':'R');
    const id = esc(l.id || '');
    const name = esc(l.name || 'Candidate');
    const title = esc([l.title || l.role || '', l.company || '', l.location || l.practiceLocation || ''].filter(Boolean).join(' · '));
    const reason = esc(l.fitReason || l.accreditedLikelyReason || l.summary || l.signal || '');
    const next = esc(l.bestFirstAction || l.nextAction || 'Review evidence and confirm a usable contact route.');
    return `<div class="record v80-card" data-v80-id="${id}" style="border:1px solid rgba(148,163,184,.25);border-radius:16px;padding:16px;margin:12px 0;background:rgba(31,41,55,.74)">
      <div style="display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:start">
        <div class="avatar" style="width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid rgba(216,148,36,.75);font-family:serif;font-size:28px;color:#d89424">${esc(grade)}</div>
        <div>
          <div style="font-weight:800;font-size:18px;color:#f8fafc">${name}</div>
          <div class="mini-note">${title}</div>
          <div style="margin:8px 0;display:flex;flex-wrap:wrap;gap:6px">
            <span class="tag">Score ${score}</span>
            <span class="tag">${esc(l.queue || l.status || 'Prep')}</span>
            <span class="tag">${esc(l.source || l.sourceType || 'Source')}</span>
            <span class="tag">${esc(l.qualityTier || l.sourceConfidence || 'Needs Review')}</span>
          </div>
          <div style="margin:8px 0">${contactsHtml(l)}</div>
          ${evidenceHtml(l)}
          <div class="mini-note" style="margin-top:8px"><strong>Why it fits:</strong> ${reason || 'Potential accredited-likely profile; needs confirmation.'}</div>
          <div class="mini-note" style="margin-top:8px"><strong>Next step:</strong> ${next}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px;min-width:150px">
          <button class="btn btn-primary btn-sm" onclick="BasinV80.openLead('${id}')">Open Full Lead Card</button>
          <button class="btn btn-ghost btn-sm" onclick="BasinV80.markReady('${id}')">Move to Ready</button>
          <button class="btn btn-ghost btn-sm" onclick="BasinV80.markResearch('${id}')">Needs Research</button>
        </div>
      </div>
    </div>`;
  }
  function renderSourcePanel(raw){
    const page = $('.page.active') || document;
    if(!/Lead Radar|Leads Workflow|Lead Generation Dashboard/i.test(page.textContent || '')) return;
    const s = stats(raw);
    const html = `<div id="basin-v80-source-panel" class="panel" style="margin-bottom:14px;border:2px solid rgba(216,148,36,.65)">
      <div class="panel-hd"><div><div class="panel-title">Live Radar Data Loaded</div>
      <div class="panel-sub">Loaded from ${esc(s.loadedFrom || 'unknown')}. Prep/contact-needed candidates are visible below even when Day 1 ready leads are zero.</div></div></div>
      <div class="panel-bd"><div class="chips" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="chip" onclick="BasinV80.setFilter('all')">Raw Found ${s.found}</button>
        <button class="chip" onclick="BasinV80.setFilter('ready')">Ready ${s.ready}</button>
        <button class="chip" onclick="BasinV80.setFilter('prep')">Prep / Contact Needed ${s.prep}</button>
        <button class="chip" onclick="BasinV80.setFilter('linkedin')">LinkedIn ${s.li}</button>
        <button class="chip" onclick="BasinV80.setFilter('npi')">NPI ${s.npi}</button>
        <button class="chip" onclick="BasinV80.setFilter('rss')">RSS/Public ${s.rss}</button>
        <span class="chip">Brave Searches ${s.searches}</span>
      </div></div></div>`;
    const old = $('#basin-v80-source-panel') || $('#basin-v79-source-panel') || $('#basin-v77-source-panel');
    if(old) old.remove();
    const anchor = page.querySelector('#radar-summary') || page.querySelector('.grid3,.stats-grid,.kpi-grid') || page.querySelector('.body');
    if(anchor) anchor.insertAdjacentHTML('afterend', html);
  }
  function sorted(list){
    return list.slice().sort((a,b)=>{
      const pa = Number(a.priorityRank || 9), pb = Number(b.priorityRank || 9);
      return pa - pb || Number(b.score||0) - Number(a.score||0) || String(a.name||'').localeCompare(String(b.name||''));
    });
  }
  function applyFilter(list){
    const f = localStorage.getItem('BASIN_V80_FILTER') || 'all';
    if(f === 'all') return list;
    return list.filter(l=>{
      const blob = [l.name,l.title,l.company,l.location,l.source,l.sourceType,l.queue,l.status,l.signal,l.summary,l.sourceUrl,(l.contactMethods||[]).map(c=>`${c.type} ${c.value}`).join(' ')].join(' ').toLowerCase();
      if(f === 'ready') return /ready to work|day1/.test(blob);
      if(f === 'prep') return /contact route|research|needed|npi\/phone seed/i.test(blob);
      if(f === 'linkedin') return /linkedin/.test(blob);
      if(f === 'npi') return /npi|npiregistry/.test(blob);
      if(f === 'rss') return /rss|news\.google|google rss/.test(blob);
      return true;
    });
  }
  function activePageId(){
    const p = $('.page.active');
    return p ? p.id : '';
  }
  function renderRadar(raw, parts){
    const box = $('#radar-results');
    if(!box) return;
    const list = applyFilter(sorted(parts.all));
    const label = $('#radar-count-label');
    if(label) label.textContent = `${list.length} visible · ready + prep/contact-needed candidates`;
    if(!list.length){
      box.innerHTML = `<div class="empty">No visible candidates for this filter. Click Raw Found or reload radar. Loaded source: ${esc(raw.__loadedFrom || 'unknown')}</div>`;
      return;
    }
    box.innerHTML = `<div class="mini-note" style="margin-bottom:10px"><strong>V8.0 stable render:</strong> Showing ${list.length} candidates loaded from ${esc(raw.__loadedFrom || 'unknown')}.</div>` + list.slice(0,300).map(leadCard).join('');
  }
  function renderLeads(raw, parts){
    const page = $('#page-leads');
    if(!page) return;
    const old = $('#v80-visible-queue', page) || $('#v79-visible-queue', page) || $('#v78-prep-queue', page);
    if(old) old.remove();
    const list = sorted(parts.ready.length ? parts.ready : parts.prep);
    const title = parts.ready.length ? 'Day 1 Ready Leads' : 'Prep / Contact-Needed Candidates';
    const sub = parts.ready.length ? `${parts.ready.length} ready leads.` : `${parts.prep.length} candidates found, but none are Day 1 ready. They are visible here for enrichment/manual confirmation.`;
    const html = `<div id="v80-visible-queue" class="panel" style="margin:14px 0;border:2px solid rgba(216,148,36,.65)">
      <div class="panel-hd"><div><div class="panel-title">${title}</div><div class="panel-sub">${sub}</div></div></div>
      <div class="panel-bd">${list.length ? list.slice(0,300).map(leadCard).join('') : '<div class="empty">No candidates loaded. Click Reload Shared GitHub Radar.</div>'}</div>
    </div>`;
    const anchor = $('#basin-v80-source-panel', page) || page.querySelector('.panel') || page.querySelector('.body');
    if(anchor) anchor.insertAdjacentHTML('afterend', html);
  }
  async function stableRender(forceFetch){
    if(isRendering) return currentRaw;
    isRendering = true;
    try{
      const raw = await getRadar(forceFetch);
      const parts = importRadar(raw);
      const s = stats(raw);
      const pageKey = activePageId() + '|' + s.found + '|' + s.ready + '|' + s.prep + '|' + (localStorage.getItem('BASIN_V80_FILTER')||'all') + '|' + (raw.__loadedFrom||'');
      updateApi(raw);
      updateCounts(raw);
      if(pageKey !== lastRenderKey || forceFetch){
        lastRenderKey = pageKey;
        renderSourcePanel(raw);
        renderRadar(raw, parts);
        renderLeads(raw, parts);
      }
      return raw;
    } finally {
      isRendering = false;
    }
  }

  function bindNavOnce(){
    if(navBound) return;
    navBound = true;
    document.addEventListener('click', function(e){
      const t = e.target && e.target.closest ? e.target.closest('button,a,.nav-item,.side-link,.menu-item') : null;
      if(!t) return;
      const txt = t.textContent || '';
      if(/Load Shared GitHub Radar|Reload Shared GitHub Radar/i.test(txt)){
        setTimeout(()=>stableRender(true), 50);
        return;
      }
      if(/Lead Radar|Leads|API Command Center|Investor Pipeline|CPA Pipeline|Dashboard/i.test(txt)){
        setTimeout(()=>stableRender(false), 450);
      }
    }, true);
  }

  window.BasinV80 = {
    load: async function(){
      const raw = await stableRender(true);
      if(typeof window.toast === 'function') {
        const s = stats(raw);
        window.toast(`Radar loaded: ${s.found} found · ${s.ready} ready · ${s.prep} prep · from ${s.loadedFrom}`);
      }
      return raw;
    },
    setFilter(kind){ localStorage.setItem('BASIN_V80_FILTER', kind || 'all'); lastRenderKey=''; stableRender(false); },
    openLead(id){
      const s = getStore();
      const lead = [...s.radarLeads, ...s.leadWorkflow, ...s.leadFactory.leads, ...s.leadFactory.research].find(l=>String(l.id)===String(id));
      if(!lead) return alert('Lead not found in browser store. Click Reload Shared GitHub Radar and try again.');
      const ev = Array.isArray(lead.evidenceTrail) ? lead.evidenceTrail : [];
      const html = `<div style="padding:18px;max-width:900px">
        <h2 style="margin-top:0">${esc(lead.name)}</h2>
        <p>${esc([lead.title, lead.company, lead.location || lead.practiceLocation].filter(Boolean).join(' · '))}</p>
        <h3>Contact Methods</h3><div>${contactsHtml(lead)}</div>
        <h3>Why it Fits</h3><p>${esc(lead.fitReason || lead.accreditedLikelyReason || lead.summary || '')}</p>
        <h3>Evidence Trail</h3><ul>${ev.map(e=>`<li>${e.url ? `<a href="${esc(e.url)}" target="_blank">${esc(e.source||'Evidence')}</a>` : esc(e.source||'Evidence')} — ${esc(e.whatItProves||'')}</li>`).join('')}</ul>
        <h3>Next Action</h3><p>${esc(lead.bestFirstAction || lead.nextAction || '')}</p>
        <h3>Call Notes</h3><textarea id="v80-note" style="width:100%;height:120px;background:#111827;color:#fff;border:1px solid #374151;border-radius:10px;padding:10px" placeholder="Add note..."></textarea>
        <div style="margin-top:10px;display:flex;gap:10px"><button onclick="opener.BasinV80.saveNote('${esc(id)}',document.getElementById('v80-note').value);window.close()">Save Note</button><button onclick="window.print()">Print / Director Handoff</button></div>
      </div>`;
      const w = window.open('', '_blank');
      if(!w) return alert('Popup blocked. Allow popups for this site.');
      w.document.write('<!doctype html><html><head><title>'+esc(lead.name)+'</title></head><body style="font-family:Arial;background:#0b1220;color:#e5e7eb">'+html+'</body></html>');
      w.document.close();
    },
    saveNote(id,note){
      const s = getStore();
      [s.radarLeads, s.leadWorkflow, s.leadFactory.leads, s.leadFactory.research].forEach(arr=>arr.forEach(l=>{ if(String(l.id)===String(id)){ l.notes=Array.isArray(l.notes)?l.notes:[]; l.notes.push({at:new Date().toISOString(),note:clean(note)}); }}));
      s.callNotes.push({id:'note_'+Date.now(),leadId:id,at:new Date().toISOString(),note:clean(note)});
      saveStore(s);
    },
    markReady(id){
      const s = getStore(); let found=null;
      [s.radarLeads, s.leadWorkflow, s.leadFactory.research, s.leadFactory.leads].forEach(arr=>arr.forEach(l=>{
        if(String(l.id)===String(id)){ found=l; l.associateReady=true; l.queue='Ready to Work'; l.status='Ready to Work'; l.bucket='day1'; l.day=1; l.workflowDay=1; }
      }));
      if(found && !s.leadFactory.leads.some(l=>String(l.id)===String(id))) s.leadFactory.leads.unshift(found);
      s.leadFactory.research = s.leadFactory.research.filter(l=>String(l.id)!==String(id));
      saveStore(s); lastRenderKey=''; stableRender(false);
    },
    markResearch(id){
      const s = getStore();
      [s.radarLeads, s.leadWorkflow, s.leadFactory.leads, s.leadFactory.research].forEach(arr=>arr.forEach(l=>{
        if(String(l.id)===String(id)){ l.associateReady=false; l.queue='Research Needed'; l.status='Research Needed'; l.bucket='research'; l.day=0; l.workflowDay=0; }
      }));
      saveStore(s); lastRenderKey=''; stableRender(false);
    },
    saveGroq(){
      const key = prompt('Paste Groq API key for this browser:', groqKey());
      if(key === null) return;
      if(clean(key)){ localStorage.setItem('GROQ_API_KEY', clean(key)); localStorage.setItem('BASIN_GROQ_API_KEY', clean(key)); markGroq(); alert('Groq saved and connected.'); }
      else { localStorage.removeItem('GROQ_API_KEY'); localStorage.removeItem('BASIN_GROQ_API_KEY'); alert('Groq cleared.'); }
      stableRender(false);
    },
    saveBraveTest(){ alert('Removed as a required workflow. Brave production should be verified through GitHub Actions and publicSearches in radar JSON.'); },
    testBrave(){ alert('Browser Brave test is intentionally disabled in V8.0 because browser-side Brave calls can fail from CORS and cause confusion. Use GitHub Actions + publicSearches.'); },
    explain(){ alert('Groq is browser-side. Brave production runs through GitHub Actions. If publicSearches > 0 in radar JSON, Brave/public search ran.'); }
  };

  // Backward-compatible aliases for old buttons.
  window.BasinV79 = window.BasinV80;
  window.BasinV78 = window.BasinV80;
  window.BasinV77 = window.BasinV80;
  window.basinLoadSharedRadar = async function(showToast){ const raw = await stableRender(true); if(showToast && typeof window.toast === 'function'){ const s=stats(raw); window.toast(`Radar loaded: ${s.found} found · ${s.ready} ready · ${s.prep} prep`); } return raw; };
  window.basinImportSharedRadarLeads = function(raw){ currentRaw = raw || currentRaw; lastRenderKey=''; stableRender(false); return raw; };
  window.loadScheduledRadarData = function(){ return stableRender(false); };
  window.renderRadarResults = function(){ return stableRender(false); };
  window.renderLeadsWorkflowPage = function(){ return stableRender(false); };

  function boot(){
    markGroq();
    bindNavOnce();
    stableRender(true);
    // one delayed pass only, not a loop
    setTimeout(()=>stableRender(false), 1200);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
