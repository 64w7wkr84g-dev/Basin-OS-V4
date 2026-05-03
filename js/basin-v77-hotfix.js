
(function(){
  'use strict';
  const STORE_KEY = 'basin_os_integrated';
  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => Array.from(r.querySelectorAll(s));
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();

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
        console.warn('[Basin V7.7] localStorage save failed after trim', e2);
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
  function importRadar(raw, sourcePath){
    const s = getStore();
    const ready = Array.isArray(raw.leads) ? raw.leads : [];
    const research = Array.isArray(raw.researchCandidates) ? raw.researchCandidates : [];
    const all = ready.concat(research.length ? research : (Array.isArray(raw.allCandidates) ? raw.allCandidates : []));
    const seen = new Set();
    const deduped = [];
    all.forEach((x,i)=>{
      const l = normalizeLead(x, i < ready.length ? 'ready' : 'prep');
      const k = leadKey(l);
      if(!k || seen.has(k)) return;
      seen.add(k);
      deduped.push(l);
    });
    const readyNorm = deduped.filter(l => l.associateReady || /ready to work|day1/i.test([l.queue,l.status,l.bucket].join(' ')));
    const prepNorm = deduped.filter(l => !readyNorm.includes(l));
    s.radarLeads = deduped;
    s.leadWorkflow = deduped;
    s.leadFactory.leads = readyNorm;
    s.leadFactory.research = prepNorm;
    s.lastSharedRadarLoad = new Date().toLocaleString();
    s.lastSharedRadarSource = sourcePath || 'data/radar-leads.json';
    s.lastSharedRadarFound = deduped.length;
    s.lastSharedRadarAdded = deduped.length;
    s.lastSharedRadarSkipped = 0;
    s.lastSharedRadarErrors = 0;
    saveStore(s);
    try { if(typeof window.updateCounts === 'function') window.updateCounts(); } catch(e){}
    try { if(typeof window.renderRadarSummary === 'function') window.renderRadarSummary(); } catch(e){}
    try { if(typeof window.renderRadarResults === 'function') window.renderRadarResults(); } catch(e){}
    try { if(typeof window.renderLeadsWorkflowPage === 'function') window.renderLeadsWorkflowPage(); } catch(e){}
    try { if(typeof window.refresh === 'function') window.refresh(); } catch(e){}
    setTimeout(()=>{ try { if(typeof window.renderRadarResults === 'function') window.renderRadarResults(); } catch(e){} }, 300);
    return {found:deduped.length, ready:readyNorm.length, prep:prepNorm.length, added:deduped.length, skipped:0, errors:0};
  }
  function stats(raw){
    const st = raw.stats || {};
    const ready = Array.isArray(raw.leads) ? raw.leads : [];
    const research = Array.isArray(raw.researchCandidates) ? raw.researchCandidates : [];
    const all = ready.concat(research.length ? research : (Array.isArray(raw.allCandidates) ? raw.allCandidates : []));
    return {
      found: Number(st.totalFound || all.length || 0),
      ready: Number(st.readyToWork || ready.length || 0),
      prep: Number(st.research || st.filteredNotUsable || research.length || 0),
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
    setCard(/active\s*lead\s*work|active\s*cadence/i, s.ready || s.found);
    setCard(/filtered\s*\/\s*not\s*usable|filtered|not\s*usable/i, s.prep);
    setCard(/has\s*contact/i, s.ready || s.found);
    Array.from(document.querySelectorAll('a,button,.nav-item,.side-link,.menu-item')).forEach(el=>{
      const badge = el.querySelector('.badge,.pill,.count,[class*="badge"],[class*="count"]');
      if(!badge) return;
      const txt = el.textContent || '';
      if(/Lead Radar/i.test(txt)) badge.textContent = String(s.found);
      if(/\bLeads\b/i.test(txt) && !/Radar/i.test(txt)) badge.textContent = String(s.ready || s.found);
    });
  }
  function injectLeadSourcePanel(raw){
    const page = document.querySelector('.page.active') || document;
    if(!/Lead Radar|Leads Workflow|Lead Generation Dashboard/i.test(page.textContent || '')) return;
    const old = document.getElementById('basin-v77-source-panel'); if(old) old.remove();
    const s = stats(raw);
    const html = `<div id="basin-v77-source-panel" class="panel" style="margin-bottom:14px;border:2px solid rgba(216,148,36,.65)">
      <div class="panel-hd"><div><div class="panel-title">Live Source Bank / Prep Visibility</div>
      <div class="panel-sub">The GitHub radar currently has ${s.ready} ready leads and ${s.prep} prep/contact-needed candidates. Prep candidates are now imported into the visible source bank instead of disappearing.</div></div></div>
      <div class="panel-bd"><div class="chips" style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="chip">Raw Found ${s.found}</span><span class="chip">Ready ${s.ready}</span><span class="chip">Prep / Contact Needed ${s.prep}</span><span class="chip">LinkedIn Candidates ${s.li}</span><span class="chip">NPI Seeds ${s.npi}</span><span class="chip">RSS/Public ${s.rss}</span><span class="chip">Brave Searches ${s.searches}</span>
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
    if(showToast && typeof window.toast === 'function') window.toast(`Shared GitHub Radar loaded: ${result.found} visible · ${result.ready} ready · ${result.prep} prep/contact-needed`);
    return result;
  }
  window.basinImportSharedRadarLeads = function(raw, sourcePath){
    const result = importRadar(raw || {}, sourcePath || 'data/radar-leads.json');
    updateApi(raw || {});
    updateCountsFromRadar(raw || {});
    injectLeadSourcePanel(raw || {});
    return result;
  };
  window.basinLoadSharedRadar = async function(showToast){ return loadAndRepair(showToast); };
  window.loadScheduledRadarData = function(){ return loadAndRepair(false); };
  window.BasinV77 = {
    load: loadAndRepair,
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
  function boot(){
    markGroq();
    loadAndRepair(false);
    setTimeout(()=>loadAndRepair(false), 1200);
    setTimeout(()=>loadAndRepair(false), 4000);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  new MutationObserver(()=>{
    clearTimeout(window.__basinV77RepairTimer);
    window.__basinV77RepairTimer = setTimeout(async()=>{
      const raw = await getRadar();
      updateApi(raw);
      updateCountsFromRadar(raw);
      injectLeadSourcePanel(raw);
    }, 500);
  }).observe(document.documentElement, {childList:true, subtree:true});
})();
