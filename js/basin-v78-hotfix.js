
(function(){
  'use strict';
  const STORE_KEY = 'basin_os_integrated';
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
    const o = {};
    ['id','leadId','name','title','role','specialty','company','location','practiceLocation','source','sourceType','sourceUrl','url','signal','summary','contactMethods','bestContactRoute','queue','status','bucket','stage','day','workflowDay','grade','score','sourceConfidence','qualityTier','priorityRank','crossReferenced','fitReason','accreditedLikelyReason','evidenceTrail','nextAction','bestFirstAction','associateReady','workflow','notes','nurture'].forEach(k=>{ if(l[k]!==undefined) o[k]=l[k]; });
    if(Array.isArray(o.contactMethods)) o.contactMethods = o.contactMethods.slice(0,10);
    if(Array.isArray(o.evidenceTrail)) o.evidenceTrail = o.evidenceTrail.slice(0,10);
    return o;
  }
  function saveStore(s){
    const o = Object.assign({}, s);
    o.radarLeads = (o.radarLeads || []).slice(0,1500).map(slimLead);
    o.leadWorkflow = (o.leadWorkflow || []).slice(0,1500).map(slimLead);
    o.leads = (o.leads || []).slice(0,1200).map(slimLead);
    o.leadFactory = o.leadFactory || {};
    o.leadFactory.leads = (o.leadFactory.leads || []).slice(0,1200).map(slimLead);
    o.leadFactory.research = (o.leadFactory.research || []).slice(0,1500).map(slimLead);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(o));
      window.STORE = Object.assign(window.STORE || {}, o);
      return true;
    } catch(e) {
      Object.keys(localStorage).forEach(k=>{
        if(/backup|archive|debug|old|radar_raw|basin_os_integrated_bak/i.test(k)) {
          try { localStorage.removeItem(k); } catch(_){}
        }
      });
      try {
        o.radarLeads = o.radarLeads.slice(0,800);
        o.leadWorkflow = o.leadWorkflow.slice(0,1000);
        o.leadFactory.research = o.leadFactory.research.slice(0,1000);
        localStorage.setItem(STORE_KEY, JSON.stringify(o));
        window.STORE = Object.assign(window.STORE || {}, o);
        return true;
      } catch(e2) {
        console.warn('[Basin V7.8] localStorage save failed after trim', e2);
        return false;
      }
    }
  }
  async function fetchJson(path){
    try{
      const r = await fetch(path + (path.includes('?')?'&':'?') + 'v=' + Date.now(), {cache:'no-store'});
      const t = await r.text();
      if(!r.ok || !t.trim()) return null;
      return JSON.parse(t);
    } catch(e) { return null; }
  }
  async function getRadar(){
    return (await fetchJson('data/radar-leads.json')) || (await fetchJson('./data/radar-leads.json')) || (await fetchJson('radar-leads.json')) || {stats:{},leads:[],researchCandidates:[],allCandidates:[],errors:[]};
  }
  function leadKey(l){
    return clean([l.id,l.name,l.title,l.company,l.sourceUrl||l.url,(l.contactMethods||[]).map(c=>c.value).join('|')].join('|')).toLowerCase();
  }
  function normalizeLead(l, sourceBucket){
    l = Object.assign({}, l);
    l.id = l.id || l.leadId || ('lead_' + Math.random().toString(16).slice(2));
    l.name = l.name || l.title || 'Radar Candidate';
    l.title = l.title || l.role || l.specialty || 'Prospect Signal';
    l.company = l.company || '';
    l.location = l.location || l.practiceLocation || '';
    l.url = l.url || l.sourceUrl || '';
    l.source = l.source || l.sourceType || sourceBucket || 'Shared Radar';
    l.status = l.status || l.queue || (l.associateReady ? 'Ready to Work' : 'Contact Route Needed');
    l.queue = l.queue || l.status;
    l.bucket = l.bucket || (l.associateReady ? 'day1' : 'contact-needed');
    l.day = Number(l.day || l.workflowDay || (l.associateReady ? 1 : 0));
    l.workflowDay = l.day;
    l.score = Number(l.score || 50);
    l.grade = l.grade || (l.score>=85?'A':l.score>=70?'B':l.score>=55?'C':'R');
    l.signal = l.signal || l.summary || l.sourceConfidence || 'Shared radar candidate';
    l.summary = l.summary || l.signal || '';
    l.contactMethods = Array.isArray(l.contactMethods) ? l.contactMethods : [];
    l.evidenceTrail = Array.isArray(l.evidenceTrail) ? l.evidenceTrail : [];
    l.type = l.type || (/cpa|tax|accounting/i.test([l.title,l.summary,l.signal,l.source].join(' ')) ? 'cpa' : 'investor');
    l.foundAt = l.foundAt || new Date().toISOString();
    return l;
  }
  function splitRaw(raw){
    const ready = Array.isArray(raw.leads) ? raw.leads : [];
    const research = Array.isArray(raw.researchCandidates) ? raw.researchCandidates : [];
    const fallback = Array.isArray(raw.allCandidates) ? raw.allCandidates : [];
    const all = ready.concat(research.length ? research : fallback);
    const seen = new Set(), deduped = [];
    all.forEach((x,i)=>{
      const l = normalizeLead(x, i < ready.length ? 'ready' : 'prep');
      const k = leadKey(l);
      if(!k || seen.has(k)) return;
      seen.add(k); deduped.push(l);
    });
    const readyNorm = deduped.filter(l => l.associateReady || /ready to work|day1/i.test([l.queue,l.status,l.bucket].join(' ')));
    const prepNorm = deduped.filter(l => !readyNorm.includes(l));
    return {all:deduped, ready:readyNorm, prep:prepNorm};
  }
  function importRadar(raw, sourcePath){
    const s = getStore();
    const parts = splitRaw(raw);
    s.radarLeads = parts.all;
    s.leadWorkflow = parts.all;
    s.leadFactory.leads = parts.ready;
    s.leadFactory.research = parts.prep;
    s.lastSharedRadarLoad = new Date().toLocaleString();
    s.lastSharedRadarSource = sourcePath || 'data/radar-leads.json';
    s.lastSharedRadarFound = parts.all.length;
    s.lastSharedRadarAdded = parts.all.length;
    s.lastSharedRadarSkipped = 0;
    s.lastSharedRadarErrors = 0;
    saveStore(s);
    return {found:parts.all.length, ready:parts.ready.length, prep:parts.prep.length, added:parts.all.length, skipped:0, errors:0};
  }
  function stats(raw){
    const st = raw.stats || {};
    const parts = splitRaw(raw);
    const all = parts.all;
    return {
      found: Number(st.totalFound || all.length || 0),
      ready: Number(st.readyToWork || parts.ready.length || 0),
      prep: Number(st.research || st.filteredNotUsable || parts.prep.length || 0),
      npi: Number(st.npiCollected || all.filter(l=>/npi/i.test([l.source,l.sourceType,l.sourceUrl].join(' '))).length || 0),
      rss: Number(st.rssCollected || all.filter(l=>/rss|google rss|news\.google|article/i.test([l.source,l.sourceType,l.sourceUrl].join(' '))).length || 0),
      li: Number(st.linkedinCandidatesFound || st.linkedinVerify || all.filter(l=>/linkedin/i.test([l.queue,l.status,l.sourceConfidence,(l.contactMethods||[]).map(c=>c.value).join(' ')].join(' '))).length || 0),
      searches: Number(st.publicSearches || 0),
      ai: Number(st.aiCalls || 0),
      generatedAt: raw.generatedAt || ''
    };
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
  function setText(id, txt){ const el = document.getElementById(id); if(el) el.textContent = txt; }
  function updateApi(raw){
    const s = stats(raw);
    const groq = markGroq();
    const brave = s.searches > 0;
    setText('v77-groq-status', groq ? 'ON' : 'OFF');
    setText('v77-groq-note', groq ? 'Saved browser key detected and auto-connected.' : 'Click Save / Connect Groq.');
    setText('v77-brave-status', brave ? 'ON' : 'CHECK');
    setText('v77-brave-note', 'Latest public searches: ' + s.searches + (brave ? ' — runner used Brave/public search.' : ' — run Action or check BRAVE_API_KEY.'));
    setText('v77-ai-status', String(s.ai));
    setText('v77-api-summary', `Latest radar: found ${s.found} · ready ${s.ready} · prep ${s.prep} · LinkedIn candidates ${s.li} · NPI ${s.npi} · RSS/Public ${s.rss} · generated ${s.generatedAt || 'unknown'}`);
    const page = document.querySelector('#page-apicenter');
    if(page){
      const panel = document.getElementById('basin-v77-static-api-panel');
      const body = page.querySelector('.body');
      if(panel && body && panel.parentElement !== body) body.prepend(panel);
      Array.from(page.querySelectorAll('.panel')).forEach(p=>{
        if(p.id === 'basin-v77-static-api-panel') return;
        const t = p.textContent || '';
        if(/Connection Setup|GROQ API KEY|Run Limits & Automation/i.test(t)) p.style.display = 'none';
      });
    }
    const badge = document.getElementById('api-badge');
    if(badge) badge.textContent = groq ? (brave ? 'R+B' : 'GROQ') : (brave ? 'BRAVE' : 'OFF');
  }
  function setCard(labelRe, val){
    const page = document.querySelector('.page.active') || document;
    Array.from(page.querySelectorAll('[class*="stat"],[class*="metric"],[class*="kpi"],.grid3>div,.stats-grid>div,.kpi-grid>div')).forEach(card=>{
      const t = card.textContent || '';
      if(!labelRe.test(t)) return;
      const n = card.querySelector('.stat-val,.kpi-val,.metric-val,.num,.value') || Array.from(card.querySelectorAll('*')).find(x=>/^\d+$/.test(clean(x.textContent))) || card.firstElementChild;
      if(n) n.textContent = String(val);
    });
  }
  function updateCountsFromRadar(raw){
    const s = stats(raw);
    setCard(/total\s*found|total\s*leads|all\s*sources/i, s.found);
    setCard(/usable\s*leads|ready\s*to\s*work/i, s.ready);
    setCard(/active\s*lead\s*work|active\s*cadence/i, s.ready);
    setCard(/filtered\s*\/\s*not\s*usable|filtered|not\s*usable/i, s.prep);
    setCard(/has\s*contact/i, s.ready);
    Array.from(document.querySelectorAll('a,button,.nav-item,.side-link,.menu-item')).forEach(el=>{
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
    if(!ev.length && !l.sourceUrl && !l.url) return '';
    const rows = ev.slice(0,3).map(e=>{
      const u = e.url || '';
      const label = esc(e.source || 'Evidence');
      return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${label}</a>` : label;
    });
    if((l.sourceUrl || l.url) && !rows.length) rows.push(`<a href="${esc(l.sourceUrl || l.url)}" target="_blank" rel="noopener">Source</a>`);
    return `<div class="mini-note"><strong>Evidence:</strong> ${rows.join(' · ')}</div>`;
  }
  function leadCard(l, mode){
    const score = Number(l.score || 0);
    const grade = l.grade || (score>=85?'A':score>=70?'B':score>=55?'C':'R');
    const queue = esc(l.queue || l.status || 'Prep');
    const name = esc(l.name || 'Candidate');
    const title = esc([l.title || l.role || '', l.company || '', l.location || l.practiceLocation || ''].filter(Boolean).join(' · '));
    const reason = esc(l.fitReason || l.accreditedLikelyReason || l.summary || l.signal || '');
    const first = esc(l.bestFirstAction || l.nextAction || 'Review evidence and confirm a usable contact route.');
    const id = esc(l.id || '');
    return `<div class="record v78-card" data-v78-id="${id}" style="border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:16px;margin:12px 0;background:rgba(31,41,55,.72)">
      <div style="display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:start">
        <div class="avatar" style="width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid rgba(216,148,36,.75);font-family:serif;font-size:28px;color:#d89424">${esc(grade)}</div>
        <div>
          <div style="font-weight:800;font-size:18px;color:#f8fafc">${name}</div>
          <div class="mini-note">${title}</div>
          <div style="margin:8px 0;display:flex;flex-wrap:wrap;gap:6px">
            <span class="tag">Score ${score}</span><span class="tag">${queue}</span><span class="tag">${esc(l.source || l.sourceType || 'Source')}</span><span class="tag">${esc(l.qualityTier || l.sourceConfidence || 'Prep')}</span>
          </div>
          <div style="margin:8px 0">${contactsHtml(l)}</div>
          ${evidenceHtml(l)}
          <div class="mini-note" style="margin-top:8px"><strong>Why it fits:</strong> ${reason || 'Potential accredited-likely profile; needs confirmation.'}</div>
          <div class="mini-note" style="margin-top:8px"><strong>Next step:</strong> ${first}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px;min-width:150px">
          <button class="btn btn-primary btn-sm" onclick="window.BasinV78&&BasinV78.openLead('${id}')">Open Full Lead Card</button>
          <button class="btn btn-ghost btn-sm" onclick="window.BasinV78&&BasinV78.markReady('${id}')">Move to Ready</button>
          <button class="btn btn-ghost btn-sm" onclick="window.BasinV78&&BasinV78.markResearch('${id}')">Needs Research</button>
        </div>
      </div>
    </div>`;
  }
  function getVisibleRaw(raw){
    const parts = splitRaw(raw);
    return parts.all.sort((a,b)=>{
      const pa = Number(a.priorityRank || 9), pb = Number(b.priorityRank || 9);
      return pa - pb || Number(b.score||0) - Number(a.score||0) || String(a.name||'').localeCompare(String(b.name||''));
    });
  }
  function filterLeads(list){
    const filter = $('#radar-filter')?.value || 'all';
    const q = clean($('#radar-search')?.value || '').toLowerCase();
    return list.filter(l=>{
      const blob = [l.name,l.title,l.company,l.location,l.source,l.sourceType,l.queue,l.status,l.signal,l.summary,(l.contactMethods||[]).map(c=>c.value).join(' ')].join(' ').toLowerCase();
      if(q && !blob.includes(q)) return false;
      if(filter === 'all') return true;
      if(filter === 'A') return l.grade === 'A';
      if(filter === 'B') return l.grade === 'B';
      if(filter === 'new') return /new|contact route|research|verify/i.test([l.status,l.queue].join(' '));
      if(filter === 'needs-contact') return /(email|linkedin)/i.test((l.contactMethods||[]).map(c=>c.type+' '+c.value).join(' '));
      if(filter === 'reviewed') return /reviewed/i.test([l.status,l.queue].join(' '));
      if(filter === 'suppressed') return /suppress|reject/i.test([l.status,l.queue].join(' '));
      return true;
    });
  }
  async function renderRadarVisible(){
    const raw = await getRadar();
    importRadar(raw, 'data/radar-leads.json');
    updateApi(raw);
    updateCountsFromRadar(raw);
    injectLeadSourcePanel(raw);
    const box = $('#radar-results');
    if(!box) return;
    const visible = filterLeads(getVisibleRaw(raw));
    const label = $('#radar-count-label');
    if(label) label.textContent = `${visible.length} visible · includes ready + prep/contact-needed candidates`;
    if(!visible.length){
      box.innerHTML = `<div class="empty">No radar candidates match this filter. Use All to see prep/contact-needed candidates.</div>`;
      return;
    }
    box.innerHTML = visible.slice(0,250).map(l=>leadCard(l,'radar')).join('');
  }
  async function renderWorkflowVisible(){
    const raw = await getRadar();
    importRadar(raw, 'data/radar-leads.json');
    updateApi(raw);
    updateCountsFromRadar(raw);
    const parts = splitRaw(raw);
    const page = $('#page-leads');
    if(!page) return;
    const old = $('#v78-prep-queue', page); if(old) old.remove();
    const body = page.querySelector('.body') || page;
    const anchor = page.querySelector('#basin-v77-source-panel') || page.querySelector('.panel');
    if(!parts.ready.length && parts.prep.length){
      const html = `<div id="v78-prep-queue" class="panel" style="margin:14px 0;border:2px solid rgba(216,148,36,.65)">
        <div class="panel-hd"><div><div class="panel-title">Prep / Contact-Needed Candidates</div>
        <div class="panel-sub">${parts.prep.length} candidates found, but none are Day 1 ready yet. These are visible here so they can be researched, enriched, or manually moved to ready when a real contact route is confirmed.</div></div></div>
        <div class="panel-bd">${parts.prep.slice(0,250).map(l=>leadCard(l,'prep')).join('')}</div>
      </div>`;
      if(anchor) anchor.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
    }
  }
  function injectLeadSourcePanel(raw){
    const page = document.querySelector('.page.active') || document;
    if(!/Lead Radar|Leads Workflow|Lead Generation Dashboard/i.test(page.textContent || '')) return;
    const old = document.getElementById('basin-v77-source-panel'); if(old) old.remove();
    const s = stats(raw);
    const html = `<div id="basin-v77-source-panel" class="panel" style="margin-bottom:14px;border:2px solid rgba(216,148,36,.65)">
      <div class="panel-hd"><div><div class="panel-title">Live Source Bank / Prep Visibility</div>
      <div class="panel-sub">Radar has ${s.ready} ready leads and ${s.prep} prep/contact-needed candidates. Prep candidates are now shown, not hidden.</div></div></div>
      <div class="panel-bd"><div class="chips" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="chip" onclick="BasinV78.setFilter('all')">Raw Found ${s.found}</button><button class="chip" onclick="BasinV78.setFilter('ready')">Ready ${s.ready}</button><button class="chip" onclick="BasinV78.setFilter('prep')">Prep / Contact Needed ${s.prep}</button><button class="chip" onclick="BasinV78.setFilter('linkedin')">LinkedIn Candidates ${s.li}</button><button class="chip" onclick="BasinV78.setFilter('npi')">NPI Seeds ${s.npi}</button><button class="chip" onclick="BasinV78.setFilter('rss')">RSS/Public ${s.rss}</button><span class="chip">Brave Searches ${s.searches}</span>
      </div></div></div>`;
    const anchor = page.querySelector('#radar-summary') || page.querySelector('.grid3,.stats-grid,.kpi-grid') || page.querySelector('.body');
    if(anchor) anchor.insertAdjacentHTML('afterend', html);
  }
  async function loadAndRepair(showToast){
    const raw = await getRadar();
    const result = importRadar(raw, 'data/radar-leads.json');
    updateApi(raw);
    updateCountsFromRadar(raw);
    injectLeadSourcePanel(raw);
    renderRadarVisible();
    renderWorkflowVisible();
    if(showToast && typeof window.toast === 'function') window.toast(`Shared GitHub Radar loaded: ${result.found} visible · ${result.ready} ready · ${result.prep} prep/contact-needed`);
    return result;
  }
  window.basinImportSharedRadarLeads = function(raw, sourcePath){
    const result = importRadar(raw || {}, sourcePath || 'data/radar-leads.json');
    updateApi(raw || {});
    updateCountsFromRadar(raw || {});
    injectLeadSourcePanel(raw || {});
    renderRadarVisible();
    renderWorkflowVisible();
    return result;
  };
  window.basinLoadSharedRadar = async function(showToast){ return loadAndRepair(showToast); };
  window.loadScheduledRadarData = function(){ return loadAndRepair(false); };
  window.renderRadarResults = renderRadarVisible;

  window.BasinV78 = {
    load: loadAndRepair,
    setFilter(kind){
      const sel = $('#radar-filter');
      if(sel){
        if(kind === 'ready' || kind === 'prep' || kind === 'linkedin' || kind === 'npi' || kind === 'rss'){
          // these are custom virtual filters handled below by temporarily writing search terms
          sel.value = 'all';
          const search = $('#radar-search');
          if(search) search.value = kind === 'ready' ? 'ready to work' : kind === 'prep' ? 'contact route needed' : kind === 'linkedin' ? 'linkedin' : kind === 'npi' ? 'npi' : 'rss';
        } else {
          sel.value = 'all';
          const search = $('#radar-search'); if(search) search.value = '';
        }
      }
      renderRadarVisible(); renderWorkflowVisible();
    },
    openLead(id){
      const s = getStore();
      const lead = [...s.radarLeads, ...s.leadWorkflow, ...s.leadFactory.leads, ...s.leadFactory.research].find(l=>String(l.id)===String(id));
      if(!lead) return alert('Lead not found in browser store. Click Load Shared GitHub Radar and try again.');
      const c = lead.contactMethods || [], ev = lead.evidenceTrail || [];
      const html = `<div style="padding:18px;max-width:900px">
        <h2 style="margin-top:0">${esc(lead.name)}</h2>
        <p>${esc([lead.title, lead.company, lead.location || lead.practiceLocation].filter(Boolean).join(' · '))}</p>
        <h3>Contact Methods</h3><div>${contactsHtml(lead)}</div>
        <h3>Why it Fits</h3><p>${esc(lead.fitReason || lead.accreditedLikelyReason || lead.summary || '')}</p>
        <h3>Evidence Trail</h3><ul>${ev.map(e=>`<li>${e.url ? `<a href="${esc(e.url)}" target="_blank">${esc(e.source||'Evidence')}</a>` : esc(e.source||'Evidence')} — ${esc(e.whatItProves||'')}</li>`).join('')}</ul>
        <h3>Next Action</h3><p>${esc(lead.bestFirstAction || lead.nextAction || '')}</p>
        <h3>Call Notes</h3><textarea id="v78-note" style="width:100%;height:120px;background:#111827;color:#fff;border:1px solid #374151;border-radius:10px;padding:10px" placeholder="Add note..."></textarea>
        <div style="margin-top:10px;display:flex;gap:10px"><button onclick="opener.BasinV78.saveNote('${esc(id)}',document.getElementById('v78-note').value);window.close()">Save Note</button><button onclick="window.print()">Print / Director Handoff</button></div>
      </div>`;
      const w = window.open('', '_blank');
      if(!w) return alert('Popup blocked. Allow popups for this site.');
      w.document.write('<!doctype html><html><head><title>'+esc(lead.name)+'</title></head><body style="font-family:Arial;background:#0b1220;color:#e5e7eb">'+html+'</body></html>');
      w.document.close();
    },
    saveNote(id, note){
      const s = getStore();
      const all = [s.radarLeads, s.leadWorkflow, s.leadFactory.leads, s.leadFactory.research];
      all.forEach(arr=>arr.forEach(l=>{ if(String(l.id)===String(id)){ l.notes = Array.isArray(l.notes)?l.notes:[]; l.notes.push({at:new Date().toISOString(),note:clean(note)}); }}));
      s.callNotes.push({id:'note_'+Date.now(),leadId:id,at:new Date().toISOString(),note:clean(note)});
      saveStore(s);
    },
    markReady(id){
      const s = getStore();
      const all = [s.radarLeads, s.leadWorkflow, s.leadFactory.research, s.leadFactory.leads];
      let found = null;
      all.forEach(arr=>arr.forEach(l=>{ if(String(l.id)===String(id)){ found=l; l.associateReady=true; l.queue='Ready to Work'; l.status='Ready to Work'; l.bucket='day1'; l.day=1; l.workflowDay=1; }}));
      if(found && !s.leadFactory.leads.some(l=>String(l.id)===String(id))) s.leadFactory.leads.unshift(found);
      s.leadFactory.research = s.leadFactory.research.filter(l=>String(l.id)!==String(id));
      saveStore(s); loadAndRepair(false);
    },
    markResearch(id){
      const s = getStore();
      const all = [s.radarLeads, s.leadWorkflow, s.leadFactory.leads, s.leadFactory.research];
      all.forEach(arr=>arr.forEach(l=>{ if(String(l.id)===String(id)){ l.associateReady=false; l.queue='Research Needed'; l.status='Research Needed'; l.bucket='research'; l.day=0; l.workflowDay=0; }}));
      saveStore(s); loadAndRepair(false);
    },
    saveGroq(){
      const key = prompt('Paste Groq API key for this browser:', groqKey());
      if(key === null) return;
      if(clean(key)){ localStorage.setItem('GROQ_API_KEY', clean(key)); localStorage.setItem('BASIN_GROQ_API_KEY', clean(key)); markGroq(); alert('Groq saved and connected in this browser.'); }
      else { localStorage.removeItem('GROQ_API_KEY'); localStorage.removeItem('BASIN_GROQ_API_KEY'); alert('Groq key cleared.'); }
      getRadar().then(updateApi);
    },
    saveBraveTest(){
      const key = prompt('Optional browser Brave test key. Production Brave belongs in GitHub Secret BRAVE_API_KEY:', localStorage.getItem('BASIN_BRAVE_API_KEY_TEST_ONLY') || '');
      if(key === null) return;
      if(clean(key)){ localStorage.setItem('BASIN_BRAVE_API_KEY_TEST_ONLY', clean(key)); alert('Optional Brave browser test key saved.'); }
      else { localStorage.removeItem('BASIN_BRAVE_API_KEY_TEST_ONLY'); alert('Optional Brave browser key cleared.'); }
    },
    async testBrave(){
      const key = localStorage.getItem('BASIN_BRAVE_API_KEY_TEST_ONLY') || '';
      if(!key) return alert('No optional browser Brave test key saved. Production still uses GitHub Secret BRAVE_API_KEY.');
      try{
        const r = await fetch('https://api.search.brave.com/res/v1/web/search?q='+encodeURIComponent('Basin Ventures Southlake')+'&count=1', {headers:{'Accept':'application/json','X-Subscription-Token':key}});
        alert(r.ok ? 'Brave browser test succeeded.' : 'Brave browser test failed: '+r.status);
      } catch(e) { alert('Browser test blocked/failed. GitHub Actions may still work server-side. '+e.message); }
    },
    explain(){ alert('Groq can show ON in the browser because the key is saved locally. Brave production cannot expose BRAVE_API_KEY to the browser because GitHub Secrets are intentionally hidden. Brave shows ON when radar-leads.json reports publicSearches > 0.'); }
  };
  // Backwards API buttons from V77 call BasinV77. Keep alias.
  window.BasinV77 = window.BasinV78;

  function boot(){
    markGroq();
    loadAndRepair(false);
    setTimeout(()=>loadAndRepair(false), 1200);
    setTimeout(()=>loadAndRepair(false), 4000);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  new MutationObserver(()=>{
    clearTimeout(window.__basinV78RepairTimer);
    window.__basinV78RepairTimer = setTimeout(async()=>{
      const raw = await getRadar();
      updateApi(raw);
      updateCountsFromRadar(raw);
      injectLeadSourcePanel(raw);
      renderRadarVisible();
      renderWorkflowVisible();
    }, 500);
  }).observe(document.documentElement, {childList:true, subtree:true});
})();
