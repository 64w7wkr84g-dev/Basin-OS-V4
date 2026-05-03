/* Basin OS V6.3 — Automated Lead Factory + Manual LinkedIn Verification CRM
   Safe LinkedIn handling:
   - does not open LinkedIn automatically
   - does not read LinkedIn pages
   - does not scrape Sales Navigator
   - stores candidate URLs from public search or manual input
   - user manually opens, confirms/rejects, and may paste profile snapshot
*/
(function(){
  'use strict';

  const STORE_KEY = 'basin_os_integrated';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr = v => esc(v).replace(/`/g,'&#96;');
  const now = () => new Date().toISOString();
  const uid = (p='lf') => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
  const digits = v => String(v || '').replace(/\D/g,'');
  const isEmail = v => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(v || ''));
  const isPhone = v => digits(v).length >= 10;
  const isLinkedIn = v => /linkedin\.com\/in\//i.test(String(v || ''));

  function fmtPhone(v){
    const d = digits(v);
    if(d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    if(d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
    return clean(v);
  }

  function loadStore(){
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch(e) { s = {}; }
    s.radarLeads = Array.isArray(s.radarLeads) ? s.radarLeads : [];
    s.leadWorkflow = Array.isArray(s.leadWorkflow) ? s.leadWorkflow : [];
    s.investors = Array.isArray(s.investors) ? s.investors : [];
    s.suppressed = Array.isArray(s.suppressed) ? s.suppressed : [];
    s.leadFactory = s.leadFactory || {};
    s.leadFactory.leads = Array.isArray(s.leadFactory.leads) ? s.leadFactory.leads : [];
    s.leadFactory.research = Array.isArray(s.leadFactory.research) ? s.leadFactory.research : [];
    s.leadFactory.activity = Array.isArray(s.leadFactory.activity) ? s.leadFactory.activity : [];
    return s;
  }
  function saveStore(s){
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
    try { window.STORE = Object.assign(window.STORE || {}, s); } catch(e){}
  }
  function toast(msg){
    if(typeof window.toast === 'function') return window.toast(msg);
    let t = $('#lf-toast');
    if(!t){
      t = document.createElement('div');
      t.id='lf-toast';
      t.style.cssText='position:fixed;right:18px;bottom:18px;z-index:999999;background:#d89424;color:#071017;padding:12px 14px;border-radius:12px;font:800 13px system-ui;box-shadow:0 12px 40px rgba(0,0,0,.4)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display='block';
    clearTimeout(t._timer);
    t._timer=setTimeout(()=>t.style.display='none',2500);
  }

  function normalizeContact(c){
    if(!c) return null;
    const type = clean(c.type || c.kind || 'Contact');
    let value = clean(c.value || c.url || c.href || '');
    if(!value) return null;
    if(/phone/i.test(type)) value = fmtPhone(value);
    let action = 'open';
    if(/email/i.test(type)) action = 'email';
    else if(/phone/i.test(type)) action = 'call';
    else if(/linkedin/i.test(type)) action = 'linkedin';
    const status = clean(c.status || (/(candidate|unverified)/i.test(type) ? 'Needs Manual Confirmation' : ''));
    const confidence = clean(c.confidence || (status ? 'Needs Manual Confirmation' : 'Medium'));
    return {
      id: c.id || uid('ct'),
      type, value, action,
      source: clean(c.source || ''),
      confidence,
      status,
      verified: !!c.verified,
      verifiedBy: c.verifiedBy || '',
      verifiedAt: c.verifiedAt || '',
      rejected: !!c.rejected,
      createdAt: c.createdAt || now(),
      updatedAt: c.updatedAt || now()
    };
  }

  function contactKey(c){ return `${c.type}|${c.value}`.toLowerCase(); }

  function contactsFromRaw(raw){
    const out = [];
    const add = (type, value, source='lead data', confidence='Medium', extra={}) => {
      value = clean(value);
      if(!value) return;
      const c = normalizeContact({type, value, source, confidence, ...extra});
      if(!c) return;
      if(!out.some(x => contactKey(x) === contactKey(c))) out.push(c);
    };
    (Array.isArray(raw.contactMethods) ? raw.contactMethods : []).forEach(c => {
      const n = normalizeContact(c);
      if(n && !out.some(x => contactKey(x) === contactKey(n))) out.push(n);
    });
    add('Phone', raw.phone, 'lead field', 'High');
    add('Email', raw.email, 'lead field', 'High');
    add('LinkedIn Profile', raw.linkedin || raw.linkedinUrl || raw.linkedInUrl, 'lead field', 'High', {verified: true, status:'Verified'});
    add('LinkedIn Candidate URL', raw.linkedinCandidateUrl || raw.linkedInCandidateUrl, 'public search/manual', 'Needs Manual Confirmation', {status:'Needs Manual Confirmation'});
    if(raw.npi) add('NPI Profile', `https://npiregistry.cms.hhs.gov/provider-view/${raw.npi}`, 'NPI Registry', 'High');
    if(raw.url && /npiregistry/i.test(raw.url)) add('NPI Profile', raw.url, 'NPI Registry', 'High');
    if(raw.sourceUrl && /npiregistry/i.test(raw.sourceUrl)) add('NPI Profile', raw.sourceUrl, 'NPI Registry', 'High');
    add('Company Website', raw.website || raw.companyUrl || raw.companyURL, 'lead field', 'Medium');
    if(raw.url && !/npiregistry/i.test(raw.url)) add('Source Link', raw.url, raw.source || 'source', 'Medium');
    return out;
  }

  function hasVerifiedLinkedIn(contacts){
    return contacts.some(c => /linkedin/i.test(c.type) && isLinkedIn(c.value) && (c.verified || /verified/i.test(c.status || '')));
  }
  function hasCandidateLinkedIn(contacts){
    return contacts.some(c => /linkedin/i.test(c.type) && isLinkedIn(c.value) && !c.verified && !c.rejected);
  }
  function hasEmail(contacts){ return contacts.some(c => /email/i.test(c.type) && isEmail(c.value)); }
  function hasPhone(contacts){ return contacts.some(c => /phone/i.test(c.type) && isPhone(c.value)); }
  function hasUsableContact(contacts){ return hasEmail(contacts) || hasVerifiedLinkedIn(contacts) || hasCandidateLinkedIn(contacts) || hasPhone(contacts) || contacts.some(c => /npi|website|source/i.test(c.type) && c.value); }
  function contactStrength(contacts){
    if(hasEmail(contacts) && hasVerifiedLinkedIn(contacts) && hasPhone(contacts)) return 'A1';
    if(hasEmail(contacts) || hasVerifiedLinkedIn(contacts)) return 'A2';
    if(hasCandidateLinkedIn(contacts)) return 'LV';
    if(hasPhone(contacts)) return 'B1';
    return 'R';
  }

  function routeForContacts(contacts){
    if(hasEmail(contacts)) return { queue:'Email First', bucket:'day1', text:'Day 1: send reviewed email first, then log outcome, disposition, and next step.' };
    if(hasVerifiedLinkedIn(contacts)) return { queue:'LinkedIn First', bucket:'day1', text:'Day 1: open verified LinkedIn/SalesNav profile manually and complete the appropriate manual action, then log result.' };
    if(hasCandidateLinkedIn(contacts)) return { queue:'LinkedIn Verify', bucket:'day1', text:'Day 1: open candidate LinkedIn URL manually, confirm or reject match, paste snapshot if useful, then complete next action.' };
    if(hasPhone(contacts)) return { queue:'Call First / Verify', bucket:'day1', text:'Day 1: call or verify by phone. Ask for correct email/direct contact if needed, then log result.' };
    return { queue:'Research Needed', bucket:'research', text:'Research: verify person and find a usable contact route before outreach.' };
  }

  function fitReason(raw){
    const blob = [raw.title,raw.role,raw.specialty,raw.company,raw.signal,raw.summary,raw.source].join(' ').toLowerCase();
    const reasons = [];
    if(/physician|surgeon|doctor|md|do|anesth|orthop|plastic|cardio|derm|urology|gastro|radiology|ophthalmology/.test(blob)) reasons.push('high-income medical profession proxy');
    if(/owner|founder|ceo|president|partner|principal|executive|managing director/.test(blob)) reasons.push('owner/executive/partner proxy');
    if(/cpa|tax|accounting/.test(blob)) reasons.push('CPA/tax referral pathway');
    if(/attorney|law|estate/.test(blob)) reasons.push('law/estate/referral pathway');
    if(/oil|gas|energy|mineral|royalty|idc/.test(blob)) reasons.push('oil/gas or tax-angle relevance');
    if(/sold|acquired|liquidity|exit|promoted|opened|launch|speaker|podcast|appointed|named/.test(blob)) reasons.push('timely public trigger');
    return reasons.length ? reasons.join('; ') : 'Potential fit based on professional role and public evidence.';
  }
  function accreditedReason(raw){
    const blob = [raw.title,raw.role,raw.specialty,raw.company,raw.signal,raw.summary,raw.source].join(' ').toLowerCase();
    const reasons = [];
    if(/physician|surgeon|doctor|md|do|anesth|orthop|plastic|cardio|derm|urology|gastro|radiology|ophthalmology/.test(blob)) reasons.push('specialist physician/high-income proxy');
    if(/owner|founder|ceo|president|partner|principal|executive/.test(blob)) reasons.push('owner/executive/partner proxy');
    if(/sold|acquired|liquidity|exit/.test(blob)) reasons.push('possible liquidity event');
    if(/form d|sec|issuer|private placement/.test(blob)) reasons.push('securities/private-placement signal');
    if(!reasons.length) reasons.push('accredited-likely not proven by public data');
    return reasons.join('; ') + '. Accreditation must still be verified through compliant qualification/self-attestation.';
  }

  function evidenceFromRaw(raw){
    const out = [];
    const add = (source,url,what,confidence='Medium') => {
      source = clean(source); url = clean(url); what = clean(what);
      if(!source && !url && !what) return;
      const key = `${source}|${url}|${what}`.toLowerCase();
      if(out.some(e => `${e.source}|${e.url}|${e.whatItProves}`.toLowerCase() === key)) return;
      out.push({id:uid('ev'),source:source||'Source',url:url||'',whatItProves:what||'Supporting evidence.',confidence,capturedAt:now()});
    };
    if(raw.npi || /npi/i.test(raw.source || '') || /npiregistry/i.test(raw.url || raw.sourceUrl || '')) {
      add('NPI Registry', raw.url || raw.sourceUrl || (raw.npi ? `https://npiregistry.cms.hhs.gov/provider-view/${raw.npi}` : ''), 'Real provider identity, specialty, practice phone, and practice location.', 'High');
    }
    if(raw.sourceUrl || raw.url) add(raw.source || raw.sourceFeed || 'Public source', raw.sourceUrl || raw.url, raw.signal || raw.summary || 'Public signal / source evidence.', 'Medium');
    (Array.isArray(raw.evidenceTrail) ? raw.evidenceTrail : []).forEach(e => add(e.source, e.url, e.whatItProves || e.proves, e.confidence));
    (Array.isArray(raw.publicEvidence) ? raw.publicEvidence : []).forEach(e => add(e.source || 'Public evidence', e.url, e.title || e.whatItProves || 'Public evidence found.', e.confidence || 'Medium'));
    return out;
  }

  function scoreLead(raw, contacts, evidence){
    let s = Number(raw.score || 40);
    if(hasEmail(contacts)) s += 18;
    if(hasVerifiedLinkedIn(contacts)) s += 15;
    if(hasCandidateLinkedIn(contacts)) s += 9;
    if(hasPhone(contacts)) s += 5;
    if(evidence.length >= 1) s += 5;
    if(evidence.length >= 2) s += 5;
    return Math.max(1, Math.min(98, Math.round(s)));
  }

  function normalizeLead(raw, forcedBucket){
    const contacts = contactsFromRaw(raw);
    const route = routeForContacts(contacts);
    const bucket = forcedBucket || raw.bucket || route.bucket;
    const evidence = evidenceFromRaw(raw);
    const score = scoreLead(raw, contacts, evidence);
    const grade = raw.grade || (score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'R');
    return {
      id: raw.id || uid('lead'),
      name: clean(raw.name || raw.fullName || raw.signal || 'Research Candidate'),
      title: clean(raw.title || raw.role || raw.specialty || 'Prospect'),
      role: clean(raw.role || raw.title || ''),
      specialty: clean(raw.specialty || ''),
      company: clean(raw.company || raw.practice || raw.organization || ''),
      practiceLocation: clean(raw.practiceLocation || raw.location || raw.address || ''),
      location: clean(raw.location || raw.practiceLocation || ''),
      source: clean(raw.source || raw.sourceFeed || raw.sourceType || ''),
      sourceType: clean(raw.sourceType || raw.source || ''),
      sourceUrl: clean(raw.sourceUrl || raw.url || ''),
      signal: clean(raw.signal || ''),
      summary: clean(raw.summary || ''),
      fitReason: clean(raw.fitReason || fitReason(raw)),
      accreditedLikelyReason: clean(raw.accreditedLikelyReason || accreditedReason(raw)),
      contactMethods: contacts,
      contactStrength: contactStrength(contacts),
      contactPriority: route.queue,
      queue: route.queue,
      bestFirstAction: raw.bestFirstAction || route.text,
      evidenceTrail: evidence,
      profileSnapshot: raw.profileSnapshot || '',
      leadIQNotes: raw.leadIQNotes || '',
      opener: raw.opener || '',
      likelyObjection: raw.likelyObjection || '',
      grade, score,
      associateReady: route.queue !== 'Research Needed',
      bucket,
      stage: bucket,
      workflowDay: bucket === 'day1' ? Number(raw.workflowDay || 1) : 0,
      workflow: raw.workflow || {day: bucket === 'day1' ? 1 : 0, stage: bucket, completedTasks:[], disposition:'', note:''},
      notes: Array.isArray(raw.notes) ? raw.notes : [],
      createdAt: raw.createdAt || raw.foundAt || now(),
      updatedAt: now()
    };
  }

  function dedupe(arr){
    const seen = new Set(), out = [];
    arr.forEach(l => {
      const key = [l.name,l.company,l.title,l.sourceUrl,(l.contactMethods||[]).map(c=>c.value).join('|')].join('|').toLowerCase();
      if(seen.has(key)) return;
      seen.add(key); out.push(l);
    });
    return out.sort((a,b)=>(b.score||0)-(a.score||0));
  }

  async function loadJsonSafe(path, fallback){
    try{
      const r = await fetch(path + '?v=' + Date.now(), {cache:'no-store'});
      if(!r.ok) throw new Error(r.status + ' ' + r.statusText);
      return await r.json();
    }catch(e){
      return Object.assign({_missing:true,_error:String(e.message||e)}, fallback || {});
    }
  }

  async function importFromGitHubRadar(force=false){
    const s0 = loadStore();
    const current = (s0.leadFactory.leads||[]).length + (s0.leadFactory.research||[]).length;
    if(!force && current > 0) return s0.leadFactory;

    const activeData = await loadJsonSafe('radar-leads.json', {leads:[], researchCandidates:[], stats:{}});
    const researchData = await loadJsonSafe('radar-research-candidates.json', {candidates:null, stats:{}});

    const activeRaw = Array.isArray(activeData.leads) ? activeData.leads : [];
    const researchRaw = Array.isArray(researchData.candidates) ? researchData.candidates : (Array.isArray(activeData.researchCandidates) ? activeData.researchCandidates : []);

    const ready = dedupe(activeRaw.map(x => normalizeLead(x, x.bucket || 'day1')).filter(l => l.associateReady));
    const research = dedupe(researchRaw.map(x => normalizeLead(Object.assign({}, x, {bucket:'research'}), 'research')));

    const s = loadStore();
    s.leadFactory.leads = ready;
    s.leadFactory.research = research;
    s.leadFactory.lastImportedAt = now();
    s.leadFactory.activity.unshift({id:uid('act'), text:`Imported ${ready.length} associate-ready leads and ${research.length} research candidates`, createdAt:now()});
    s.radarLeads = ready;
    s.leadWorkflow = ready.concat(research);
    saveStore(s);
    console.log('[Basin Lead Factory V6.3] imported', {ready:ready.length,research:research.length,stats:activeData.stats});
    return s.leadFactory;
  }

  const TASKS = {
    'Email First':['Review evidence trail','Send reviewed email manually','Log result','Select disposition','Add note'],
    'LinkedIn First':['Open LinkedIn manually','Confirm profile is still correct','Complete manual LinkedIn action if appropriate','Select disposition','Add note'],
    'LinkedIn Verify':['Open candidate LinkedIn URL manually','Confirm or reject profile match','Paste profile snapshot if useful','Select disposition','Add note'],
    'Call First / Verify':['Review evidence','Call / verify contact route','Ask for correct email or direct contact if needed','Select disposition','Add note'],
    'Research Needed':['Verify real person','Find usable contact method','Add evidence/contact details','Promote to Day 1 or suppress','Add note'],
    'day2':['Check replies/engagement','Second touch through best route','Update contact confidence','Select disposition','Add note'],
    'day3':['Alternate channel touch','Record objection/no answer/result','Check source/evidence again','Select disposition','Add note'],
    'day4':['Call or direct contact attempt if appropriate','Use trigger-specific opener','Record result','Select disposition','Add note'],
    'day5':['Value/tax-angle follow-up if compliant','Review whether still viable','Record result','Select disposition','Add note'],
    'day6':['Final major contact attempt','Ask for director call only if appropriate','Record result','Select disposition','Add note'],
    'day7':['Personalized note or short follow-up','Avoid repeated generic message','Record result','Select disposition','Add note'],
    'day8':['Light touch / nurture decision','Check contact accuracy','Record result','Select disposition','Add note'],
    'day9':['Final qualification review','Decide continue/pause/close','Record reason','Select disposition','Add note'],
    'day10':['Close-loop or breakup message','Final disposition','Document final reason','Select disposition','Add note']
  };
  function tasksFor(lead){
    if(lead.workflowDay && lead.workflowDay > 1) return TASKS['day'+lead.workflowDay] || TASKS.day10;
    return TASKS[lead.queue] || TASKS['Call First / Verify'];
  }
  function checked(lead,i){ return !!(lead.workflow && Array.isArray(lead.workflow.completedTasks) && lead.workflow.completedTasks[i]); }
  function canAdvance(lead){
    const tasks = tasksFor(lead);
    return tasks.every((_,i)=>checked(lead,i)) && clean(lead.workflow?.disposition) && clean(lead.workflow?.note);
  }

  function hrefFor(c){
    if(/email/i.test(c.type) && isEmail(c.value)) return 'mailto:' + c.value;
    if(/phone/i.test(c.type) && isPhone(c.value)) return 'tel:' + digits(c.value);
    if(/^https?:\/\//i.test(c.value)) return c.value;
    return '';
  }
  function contactRow(c, leadId){
    const href = hrefFor(c);
    const label = /phone/i.test(c.type) ? 'Call' : /email/i.test(c.type) ? 'Email' : /linkedin/i.test(c.type) && !c.verified ? 'Open Manually' : 'Open';
    const open = href ? `<a class="lf-btn primary small" ${/^http/i.test(href)?'target="_blank" rel="noopener"':''} href="${attr(href)}">${label}</a>` : '';
    const liActions = /linkedin/i.test(c.type) ? `
      ${!c.verified && !c.rejected ? `<button class="lf-btn small primary" onclick="BasinLeadFactory.confirmLinkedIn('${attr(leadId)}','${attr(c.id)}')">Confirm Match</button><button class="lf-btn small danger" onclick="BasinLeadFactory.rejectLinkedIn('${attr(leadId)}','${attr(c.id)}')">Wrong Person</button>` : ''}
      ${c.verified ? `<button class="lf-btn small danger" onclick="BasinLeadFactory.rejectLinkedIn('${attr(leadId)}','${attr(c.id)}')">Mark Wrong</button>` : ''}
    ` : '';
    return `<div class="lf-contact-row ${/linkedin/i.test(c.type)&&!c.verified?'pending':''}">
      <div><b>${esc(c.type)}</b><span>${esc(c.value)}</span><em>${esc(c.status || c.confidence || '')}${c.source?' · '+esc(c.source):''}${c.verifiedAt?' · verified '+esc(c.verifiedAt):''}</em></div>
      <div class="lf-actions">${open}${liActions}<button class="lf-btn small" data-copy="${attr(c.value)}" onclick="BasinLeadFactory.copy(this)">Copy</button><button class="lf-btn small" onclick="BasinLeadFactory.editContact('${attr(leadId)}','${attr(c.id)}')">Edit</button></div>
    </div>`;
  }
  function evidenceRow(e){
    return `<div class="lf-evidence-row">
      <div><b>${esc(e.source)}</b><span>${esc(e.whatItProves)}</span><em>${esc(e.confidence||'')} · ${esc(e.capturedAt||'')}</em></div>
      ${e.url?`<a class="lf-btn primary small" target="_blank" rel="noopener" href="${attr(e.url)}">Open Source</a>`:''}
    </div>`;
  }

  function leadCard(lead){
    const cms = (lead.contactMethods||[]).filter(c => /phone|email|linkedin/i.test(c.type)).slice(0,4);
    return `<div class="lf-card" data-lead-id="${attr(lead.id)}">
      <div class="lf-score">${esc(lead.grade)}<small>${esc(lead.score)}</small></div>
      <div class="lf-card-main">
        <div class="lf-name">${esc(lead.name)}</div>
        <div class="lf-meta">${esc(lead.title)} ${lead.company?'· '+esc(lead.company):''} ${lead.practiceLocation||lead.location?'· '+esc(lead.practiceLocation||lead.location):''}</div>
        <div class="lf-tags"><span>${esc(lead.queue)}</span><span>${esc(lead.contactStrength)}</span><span>${esc(lead.source||'Source')}</span></div>
        <div class="lf-why"><b>Why fit:</b> ${esc(lead.fitReason)}</div>
        <div class="lf-why"><b>Accredited-likely:</b> ${esc(lead.accreditedLikelyReason)}</div>
        <div class="lf-mini-contacts">${cms.map(c=>`<button class="lf-chip" onclick="BasinLeadFactory.openLead('${attr(lead.id)}')">${esc(c.type)}: ${esc(c.value)}</button>`).join('') || '<span class="lf-missing">No contact method yet</span>'}</div>
      </div>
      <div class="lf-card-actions">
        <button class="lf-btn primary" onclick="BasinLeadFactory.openLead('${attr(lead.id)}')">Open Full Lead Card</button>
        <button class="lf-btn" onclick="BasinLeadFactory.quickAdvance('${attr(lead.id)}')">${canAdvance(lead)?'Move Next':'Locked'}</button>
      </div>
    </div>`;
  }

  function stats(leads, research){
    const all = leads || [];
    return {
      ready: all.length,
      email: all.filter(l=>l.queue==='Email First').length,
      linkedin: all.filter(l=>l.queue==='LinkedIn First').length,
      verify: all.filter(l=>l.queue==='LinkedIn Verify').length,
      call: all.filter(l=>l.queue==='Call First / Verify').length,
      research: (research||[]).length
    };
  }
  function dashboardHtml(){
    const s = loadStore();
    const lf = s.leadFactory || {leads:[],research:[]};
    const st = stats(lf.leads, lf.research);
    const qMap = [
      ['all','Associate Ready',lf.leads],
      ['Email First','Email First',lf.leads.filter(l=>l.queue==='Email First')],
      ['LinkedIn First','LinkedIn First',lf.leads.filter(l=>l.queue==='LinkedIn First')],
      ['LinkedIn Verify','LinkedIn Verify',lf.leads.filter(l=>l.queue==='LinkedIn Verify')],
      ['Call First / Verify','Call First / Verify',lf.leads.filter(l=>l.queue==='Call First / Verify')],
      ['research','Research Needed',lf.research]
    ];
    return `<div class="lf-shell">
      <div class="lf-head"><div><h2>Basin Lead Factory V6.3</h2><p>Associate-ready leads, manual LinkedIn verification, profile snapshot parser, and Day 1–10 gating.</p></div>
        <div class="lf-actions"><button class="lf-btn primary" onclick="BasinLeadFactory.rebuild()">Load/Refresh GitHub Radar Leads</button><button class="lf-btn" onclick="BasinLeadFactory.addManualLead()">+ Manual Lead</button><button class="lf-btn danger" onclick="BasinLeadFactory.close()">Close</button></div></div>
      <div class="lf-stats"><div><b>${st.ready}</b><span>Associate Ready</span></div><div><b>${st.email}</b><span>Email First</span></div><div><b>${st.linkedin}</b><span>LinkedIn First</span></div><div><b>${st.verify}</b><span>LinkedIn Verify</span></div><div><b>${st.call}</b><span>Call First / Verify</span></div><div><b>${st.research}</b><span>Research Needed</span></div></div>
      <div class="lf-tabs">${qMap.map((q,i)=>`<button class="lf-tab ${i===0?'active':''}" onclick="BasinLeadFactory.showQueue('${attr(q[0])}',this)">${esc(q[1])} <b>${q[2].length}</b></button>`).join('')}</div>
      <div id="lf-queue-body">${(lf.leads||[]).map(leadCard).join('') || '<div class="lf-empty">No associate-ready leads yet. Run the GitHub radar workflow, then refresh.</div>'}</div>
    </div>`;
  }

  function findLead(s,id){
    const pools = [s.leadFactory.leads, s.leadFactory.research, s.leadWorkflow, s.radarLeads, s.investors];
    for(const p of pools){
      const l = (p||[]).find(x => x.id === id);
      if(l) return l;
    }
    return null;
  }
  function updateLead(id, updater){
    const s = loadStore();
    const pools = [s.leadFactory.leads, s.leadFactory.research, s.leadWorkflow, s.radarLeads, s.investors];
    pools.forEach(p => (p||[]).forEach((l,i)=>{ if(l.id===id) p[i] = updater({...l}); }));
    // Re-route between ready/research after update.
    const all = dedupe([...(s.leadFactory.leads||[]), ...(s.leadFactory.research||[])].map(l => normalizeLead(l, l.bucket)));
    s.leadFactory.leads = all.filter(l => l.associateReady).sort((a,b)=>b.score-a.score);
    s.leadFactory.research = all.filter(l => !l.associateReady).sort((a,b)=>b.score-a.score);
    s.radarLeads = s.leadFactory.leads;
    s.leadWorkflow = s.leadFactory.leads.concat(s.leadFactory.research);
    saveStore(s);
  }

  function parseSnapshotText(text){
    const lines = String(text||'').split(/\n+/).map(clean).filter(Boolean);
    const joined = lines.join(' ');
    const result = {};
    if(lines[0]) result.name = lines[0];
    const atLine = lines.find(l => /\s+at\s+/i.test(l));
    if(atLine){
      const [title, company] = atLine.split(/\s+at\s+/i);
      result.title = clean(title);
      result.company = clean(company);
    } else {
      const titleLine = lines.find(l => /surgeon|physician|doctor|founder|owner|ceo|president|partner|principal|attorney|cpa|director|manager|specialist/i.test(l));
      if(titleLine) result.title = titleLine;
    }
    const loc = lines.find(l => /metroplex|greater|area|tx|texas|dallas|fort worth|houston|austin|san antonio|midland|oklahoma|denver|phoenix|miami/i.test(l));
    if(loc) result.location = loc;
    if(/founder|owner|private practice|partner|principal|ceo|president/i.test(joined)) result.ownershipSignal = 'Owner/founder/partner/executive signal found in pasted profile snapshot.';
    if(/orthopedic|surgeon|anesthes|plastic|dermatology|gastro|urology|cardio|radiology|ophthalmology|physician|doctor|md|do/i.test(joined)) result.specialtySignal = 'Medical/specialist signal found in pasted profile snapshot.';
    result.summary = joined.slice(0,900);
    return result;
  }

  function applySnapshotToLead(lead, snapshot){
    const parsed = parseSnapshotText(snapshot);
    if(parsed.name && !/candidate|signal/i.test(lead.name)) {
      // Keep existing verified name unless user explicitly pasted same/clearer name.
    } else if(parsed.name) lead.name = parsed.name;
    if(parsed.title) lead.title = parsed.title;
    if(parsed.company) lead.company = parsed.company;
    if(parsed.location) { lead.location = parsed.location; lead.practiceLocation = parsed.location; }
    lead.profileSnapshot = snapshot;
    lead.leadIQNotes = [lead.leadIQNotes, parsed.summary].filter(Boolean).join('\n\n').trim();
    const extra = [];
    if(parsed.ownershipSignal) extra.push(parsed.ownershipSignal);
    if(parsed.specialtySignal) extra.push(parsed.specialtySignal);
    if(extra.length) {
      lead.fitReason = `${lead.fitReason || ''} ${extra.join(' ')}`.trim();
      lead.accreditedLikelyReason = `${lead.accreditedLikelyReason || ''} Manual profile snapshot adds ${extra.join('; ')}. Accreditation still requires compliant verification.`.trim();
    }
    lead.evidenceTrail = Array.isArray(lead.evidenceTrail) ? lead.evidenceTrail : [];
    lead.evidenceTrail.unshift({id:uid('ev'),source:'Manual LinkedIn/SalesNav Profile Snapshot',url:'',whatItProves:'User manually pasted visible profile details for CRM enrichment.',confidence:'Manual Entry',capturedAt:now()});
    lead.opener = lead.opener || `I noticed your background in ${lead.title || 'your field'}${lead.company ? ' at '+lead.company : ''} and wanted to connect briefly.`;
    return normalizeLead(lead, lead.bucket);
  }

  function leadDetailHtml(lead){
    const tasks = tasksFor(lead);
    const linkedinContacts = (lead.contactMethods||[]).filter(c=>/linkedin/i.test(c.type));
    return `<div class="lf-detail">
      <div class="lf-detail-head"><div><h2>${esc(lead.name)}</h2><p>${esc(lead.title)} ${lead.company?'· '+esc(lead.company):''}</p><div class="lf-tags"><span>${esc(lead.queue)}</span><span>${esc(lead.contactStrength)}</span><span>${esc(lead.grade)} ${esc(lead.score)}</span></div></div><button class="lf-btn danger" onclick="BasinLeadFactory.closeDetail()">Close</button></div>
      <div class="lf-detail-grid">
        <section><h3>Overview</h3>
          <label>Name<input id="lf-edit-name" value="${attr(lead.name)}"></label>
          <label>Title / Role / Specialty<input id="lf-edit-title" value="${attr(lead.title)}"></label>
          <label>Company / Practice<input id="lf-edit-company" value="${attr(lead.company)}"></label>
          <label>Practice Location<input id="lf-edit-location" value="${attr(lead.practiceLocation||lead.location)}"></label>
          <label>Why They Fit<textarea id="lf-edit-fit">${esc(lead.fitReason)}</textarea></label>
          <label>Accredited-Likely Reason<textarea id="lf-edit-accredited">${esc(lead.accreditedLikelyReason)}</textarea></label>
          <button class="lf-btn primary" onclick="BasinLeadFactory.saveOverview('${attr(lead.id)}')">Save Overview</button>
        </section>
        <section><h3>Contact Methods</h3>
          <div id="lf-contact-list">${(lead.contactMethods||[]).map(c=>contactRow(c,lead.id)).join('') || '<div class="lf-empty">No contact methods yet.</div>'}</div>
          <div class="lf-add-row"><select id="lf-new-contact-type"><option>Phone</option><option>Email</option><option>LinkedIn Candidate URL</option><option>LinkedIn Profile</option><option>NPI Profile</option><option>Company Website</option><option>Source Link</option></select><input id="lf-new-contact-value" placeholder="Phone, email, URL"><button class="lf-btn primary" onclick="BasinLeadFactory.addContact('${attr(lead.id)}')">Add</button></div>
        </section>
        <section><h3>LinkedIn Verification</h3>
          <div class="lf-callout">Basin stores candidate URLs only. You open manually, confirm/reject, and paste any profile details you want captured.</div>
          ${linkedinContacts.length ? linkedinContacts.map(c=>contactRow(c,lead.id)).join('') : '<div class="lf-empty">No LinkedIn URL yet. Add a candidate URL below.</div>'}
          <div class="lf-add-row"><input id="lf-li-replace-url" placeholder="Paste LinkedIn/SalesNav profile URL"><button class="lf-btn primary" onclick="BasinLeadFactory.addLinkedInCandidate('${attr(lead.id)}')">Save Candidate URL</button></div>
          <label>Paste LinkedIn / SalesNav Profile Snapshot<textarea id="lf-profile-snapshot" placeholder="Paste the visible profile text you manually copied: name, headline, company, location, about snippet, etc.">${esc(lead.profileSnapshot||'')}</textarea></label>
          <button class="lf-btn primary" onclick="BasinLeadFactory.parseSnapshot('${attr(lead.id)}')">Parse Snapshot + Update CRM</button>
        </section>
        <section><h3>Evidence Trail</h3>
          ${(lead.evidenceTrail||[]).map(evidenceRow).join('') || '<div class="lf-empty">No evidence yet.</div>'}
          <div class="lf-add-row"><input id="lf-new-evidence-source" placeholder="Source"><input id="lf-new-evidence-url" placeholder="URL"><input id="lf-new-evidence-proves" placeholder="What it proves"><button class="lf-btn primary" onclick="BasinLeadFactory.addEvidence('${attr(lead.id)}')">Add</button></div>
        </section>
        <section><h3>Workflow Gate</h3>
          <div class="lf-callout"><b>Best first action:</b> ${esc(lead.bestFirstAction)}</div>
          ${tasks.map((t,i)=>`<label class="lf-check"><input type="checkbox" ${checked(lead,i)?'checked':''} onchange="BasinLeadFactory.toggleTask('${attr(lead.id)}',${i},this.checked)"> ${esc(t)}</label>`).join('')}
          <label>Disposition<select id="lf-disposition" onchange="BasinLeadFactory.setDisposition('${attr(lead.id)}',this.value)">${['','Callback','Future','Research','Not Interested','Pipeline','Director Ready','Completed','Suppressed'].map(o=>`<option ${lead.workflow?.disposition===o?'selected':''}>${esc(o||'Select disposition...')}</option>`).join('')}</select></label>
          <label>Required Note<textarea id="lf-workflow-note" onblur="BasinLeadFactory.setWorkflowNote('${attr(lead.id)}',this.value)">${esc(lead.workflow?.note||'')}</textarea></label>
          <button class="lf-btn primary" onclick="BasinLeadFactory.quickAdvance('${attr(lead.id)}')">${canAdvance(lead)?'Move to Next Stage':'Locked Until Complete'}</button>
        </section>
        <section><h3>Notes / Handoff</h3>
          <div>${(lead.notes||[]).map(n=>`<div class="lf-note"><b>${esc(n.createdAt||'')}</b><p>${esc(n.text||n.note||'')}</p></div>`).join('') || '<div class="lf-empty">No notes yet.</div>'}</div>
          <label>Add Note<textarea id="lf-new-note" placeholder="Call result, correction, LinkedIn confirmation note, objection, etc."></textarea></label>
          <button class="lf-btn primary" onclick="BasinLeadFactory.addNote('${attr(lead.id)}')">Add Note</button>
          <button class="lf-btn" onclick="BasinLeadFactory.copyHandoff('${attr(lead.id)}')">Copy Director Handoff</button>
        </section>
      </div>
    </div>`;
  }

  function openOverlay(){
    let o = $('#lf-overlay');
    if(!o){ o=document.createElement('div'); o.id='lf-overlay'; o.innerHTML='<div id="lf-overlay-inner"></div>'; document.body.appendChild(o); }
    $('#lf-overlay-inner').innerHTML = dashboardHtml();
    o.style.display='block';
  }
  function closeOverlay(){ const o=$('#lf-overlay'); if(o) o.style.display='none'; }
  function openDetail(lead){
    let d = $('#lf-detail-overlay');
    if(!d){ d=document.createElement('div'); d.id='lf-detail-overlay'; d.innerHTML='<div id="lf-detail-inner"></div>'; document.body.appendChild(d); }
    $('#lf-detail-inner').innerHTML = leadDetailHtml(lead);
    d.style.display='block';
  }

  function addCss(){
    if($('#lf-css')) return;
    const s=document.createElement('style'); s.id='lf-css';
    s.textContent = `
#lf-launch{position:fixed;right:18px;top:88px;z-index:99990;background:#d89424;color:#061018;border:0;border-radius:999px;padding:11px 15px;font:900 13px system-ui;box-shadow:0 16px 50px rgba(0,0,0,.35)}
#lf-overlay,#lf-detail-overlay{display:none;position:fixed;inset:0;z-index:99991;background:rgba(2,5,10,.78);backdrop-filter:blur(8px);overflow:auto;padding:28px}
#lf-detail-overlay{z-index:99992}
#lf-overlay-inner,#lf-detail-inner{max-width:1360px;margin:0 auto}
.lf-shell,.lf-detail{background:#0e1623;border:1px solid #2a3546;border-radius:22px;box-shadow:0 30px 100px rgba(0,0,0,.55);color:#eef4ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden}
.lf-head,.lf-detail-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:22px 24px;border-bottom:1px solid #263246;background:linear-gradient(135deg,#111c2c,#0a111c)}
.lf-head h2,.lf-detail h2{margin:0;font-size:28px}.lf-head p,.lf-detail p{color:#aab6c8;margin:6px 0 0}
.lf-actions{display:flex;gap:8px;flex-wrap:wrap}.lf-btn{border:1px solid #39475c;background:#202a3a;color:#edf4ff;border-radius:10px;padding:9px 11px;font-weight:800;cursor:pointer;text-decoration:none}.lf-btn.primary{background:#d89424;color:#071018;border-color:#d89424}.lf-btn.danger{background:#3b1820;color:#ff9aa9;border-color:#74303b}.lf-btn.small{padding:6px 8px;font-size:11px}
.lf-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:16px 24px}.lf-stats div{background:#101b2a;border:1px solid #283548;border-radius:14px;padding:14px}.lf-stats b{display:block;color:#d89424;font-size:30px}.lf-stats span{font-size:10px;color:#9ca9bd;text-transform:uppercase;letter-spacing:.08em}
.lf-tabs{display:flex;gap:8px;padding:0 24px 16px;flex-wrap:wrap}.lf-tab{background:#1d2736;color:#d4deef;border:1px solid #344258;border-radius:999px;padding:9px 12px;font-weight:800}.lf-tab.active{background:#d89424;color:#071018;border-color:#d89424}
#lf-queue-body{padding:0 24px 24px}.lf-card{display:grid;grid-template-columns:58px 1fr auto;gap:14px;align-items:start;border:1px solid #2a3648;background:#111b2a;border-radius:18px;padding:14px;margin:10px 0}.lf-score{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;border:2px solid #d89424;color:#d89424;font-weight:900;font-size:20px}.lf-score small{display:block;font-size:10px;color:#b6c3d7}.lf-name{font-size:18px;font-weight:900}.lf-meta{color:#aeb9ca;margin-top:3px}.lf-tags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.lf-tags span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;background:#223049;border:1px solid #3a4d6f;border-radius:999px;padding:5px 7px;color:#bcd0ee}.lf-why{font-size:12px;color:#c4cedd;margin-top:4px}.lf-mini-contacts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.lf-chip{background:#0d2a26;color:#9ff5dc;border:1px solid #205f52;border-radius:8px;padding:5px 7px;font-size:11px}.lf-missing{color:#ff8da0}.lf-empty{padding:20px;color:#9eabbf;text-align:center}
.lf-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px}.lf-detail section{background:#111b2a;border:1px solid #2a3648;border-radius:18px;padding:16px}.lf-detail h3{margin:0 0 12px}.lf-detail label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#9ca9bd;margin:10px 0}.lf-detail input,.lf-detail textarea,.lf-detail select,.lf-add-row input,.lf-add-row select{width:100%;box-sizing:border-box;background:#0b111b;border:1px solid #344258;border-radius:10px;color:#eef4ff;padding:10px;margin-top:5px}.lf-detail textarea{min-height:88px}.lf-add-row{display:grid;grid-template-columns:1fr 1.3fr auto;gap:8px;align-items:end;margin:10px 0}.lf-contact-row,.lf-evidence-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid #27364a;background:#0c1522;border-radius:12px;padding:10px;margin:8px 0}.lf-contact-row.pending{border-color:#d89424;background:#1a1b12}.lf-contact-row b,.lf-evidence-row b{display:block}.lf-contact-row span,.lf-evidence-row span{display:block;color:#c5d0df;word-break:break-word}.lf-contact-row em,.lf-evidence-row em{display:block;color:#8190a6;font-size:11px}.lf-check{display:flex!important;align-items:flex-start;gap:8px;text-transform:none!important;letter-spacing:0!important;font-size:13px!important;color:#d5deec!important}.lf-callout{background:#102923;border:1px solid #285e51;color:#cffce8;padding:10px;border-radius:12px}.lf-note{background:#0b111b;border:1px solid #2a3648;border-radius:12px;padding:10px;margin:8px 0}
@media(max-width:980px){.lf-card{grid-template-columns:52px 1fr}.lf-card-actions{grid-column:1/3}.lf-detail-grid{grid-template-columns:1fr}.lf-stats{grid-template-columns:repeat(2,1fr)}#lf-overlay,#lf-detail-overlay{padding:12px}.lf-add-row{grid-template-columns:1fr}.lf-contact-row,.lf-evidence-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function addLaunchButton(){
    if($('#lf-launch')) return;
    const b=document.createElement('button');
    b.id='lf-launch'; b.textContent='Lead Factory';
    b.onclick=()=>BasinLeadFactory.open();
    document.body.appendChild(b);
  }

  window.BasinLeadFactory = {
    async open(){ await importFromGitHubRadar(false); openOverlay(); },
    close: closeOverlay,
    closeDetail(){ const d=$('#lf-detail-overlay'); if(d) d.style.display='none'; },
    async rebuild(){ await importFromGitHubRadar(true); openOverlay(); toast('Lead Factory refreshed from GitHub radar JSON'); },
    showQueue(key,btn){
      $$('.lf-tab').forEach(x=>x.classList.remove('active')); if(btn) btn.classList.add('active');
      const s=loadStore(), lf=s.leadFactory||{leads:[],research:[]};
      let arr = [];
      if(key==='research') arr = lf.research || [];
      else if(key==='all') arr = lf.leads || [];
      else arr = (lf.leads||[]).filter(l=>l.queue===key);
      $('#lf-queue-body').innerHTML = arr.length ? arr.map(leadCard).join('') : '<div class="lf-empty">No records in this queue.</div>';
    },
    openLead(id){ const s=loadStore(); const lead=findLead(s,id); if(lead) openDetail(normalizeLead(lead,lead.bucket)); },
    copy(btn){ const v=btn?.dataset?.copy||''; if(!v) return; navigator.clipboard?.writeText(v).then(()=>toast('Copied')).catch(()=>prompt('Copy',v)); },
    addContact(leadId){
      const type=$('#lf-new-contact-type')?.value||'Phone', value=$('#lf-new-contact-value')?.value||'';
      if(!value.trim()) return toast('Enter a contact value');
      updateLead(leadId,l=>{ l.contactMethods=contactsFromRaw(l); l.contactMethods.push(normalizeContact({type,value,source:'manual associate entry',confidence:'Manual Entry',status:/candidate/i.test(type)?'Needs Manual Confirmation':''})); return normalizeLead(l,l.bucket); });
      this.openLead(leadId); toast('Contact added');
    },
    editContact(leadId, contactId){
      const s=loadStore(), lead=findLead(s,leadId); if(!lead) return;
      const c=(lead.contactMethods||[]).find(x=>x.id===contactId); if(!c) return;
      const val=prompt(`Edit ${c.type}`, c.value); if(val===null) return;
      updateLead(leadId,l=>{ l.contactMethods=contactsFromRaw(l).map(x=>x.id===contactId?{...x,value:val,updatedAt:now()}:x); return normalizeLead(l,l.bucket); });
      this.openLead(leadId); toast('Contact updated');
    },
    addLinkedInCandidate(leadId){
      const value=$('#lf-li-replace-url')?.value||'';
      if(!isLinkedIn(value)) return toast('Paste a valid linkedin.com/in URL');
      updateLead(leadId,l=>{ l.contactMethods=contactsFromRaw(l); l.contactMethods.push(normalizeContact({type:'LinkedIn Candidate URL',value,source:'manual entry',confidence:'Needs Manual Confirmation',status:'Needs Manual Confirmation'})); return normalizeLead(l,l.bucket); });
      this.openLead(leadId); toast('LinkedIn candidate saved');
    },
    confirmLinkedIn(leadId, contactId){
      updateLead(leadId,l=>{
        l.contactMethods=contactsFromRaw(l).map(c=>c.id===contactId?{...c,type:'LinkedIn Profile',verified:true,status:'Verified',confidence:'Manual Verified',verifiedBy:'User',verifiedAt:now(),rejected:false}:c);
        l.evidenceTrail=evidenceFromRaw(l); l.evidenceTrail.unshift({id:uid('ev'),source:'Manual LinkedIn Confirmation',url:(l.contactMethods.find(c=>c.id===contactId)||{}).value||'',whatItProves:'User manually confirmed this LinkedIn profile matches the lead.',confidence:'Manual Verified',capturedAt:now()});
        return normalizeLead(l,'day1');
      });
      this.openLead(leadId); toast('LinkedIn match confirmed');
    },
    rejectLinkedIn(leadId, contactId){
      updateLead(leadId,l=>{ l.contactMethods=contactsFromRaw(l).map(c=>c.id===contactId?{...c,rejected:true,status:'Wrong Person',confidence:'Rejected'}:c); l.evidenceTrail=evidenceFromRaw(l); l.evidenceTrail.unshift({id:uid('ev'),source:'Manual LinkedIn Rejection',url:'',whatItProves:'User marked candidate LinkedIn profile as wrong person.',confidence:'Manual Verified',capturedAt:now()}); return normalizeLead(l,l.bucket); });
      this.openLead(leadId); toast('LinkedIn candidate rejected');
    },
    parseSnapshot(leadId){
      const txt=$('#lf-profile-snapshot')?.value||'';
      if(!txt.trim()) return toast('Paste profile snapshot text first');
      updateLead(leadId,l=>applySnapshotToLead(l,txt));
      this.openLead(leadId); toast('Profile snapshot parsed into CRM');
    },
    saveOverview(leadId){
      updateLead(leadId,l=>{ l.name=$('#lf-edit-name')?.value||l.name; l.title=$('#lf-edit-title')?.value||l.title; l.company=$('#lf-edit-company')?.value||l.company; l.practiceLocation=$('#lf-edit-location')?.value||l.practiceLocation; l.location=l.practiceLocation||l.location; l.fitReason=$('#lf-edit-fit')?.value||l.fitReason; l.accreditedLikelyReason=$('#lf-edit-accredited')?.value||l.accreditedLikelyReason; return normalizeLead(l,l.bucket); });
      this.openLead(leadId); toast('Overview saved');
    },
    addEvidence(leadId){
      const source=$('#lf-new-evidence-source')?.value||'', url=$('#lf-new-evidence-url')?.value||'', proves=$('#lf-new-evidence-proves')?.value||'';
      if(!source && !url && !proves) return toast('Enter evidence details');
      updateLead(leadId,l=>{ l.evidenceTrail=evidenceFromRaw(l); l.evidenceTrail.unshift({id:uid('ev'),source,url,whatItProves:proves,confidence:'Manual Entry',capturedAt:now()}); return normalizeLead(l,l.bucket); });
      this.openLead(leadId); toast('Evidence added');
    },
    toggleTask(leadId,i,checkedVal){ updateLead(leadId,l=>{ l.workflow=l.workflow||{}; l.workflow.completedTasks=Array.isArray(l.workflow.completedTasks)?l.workflow.completedTasks:[]; l.workflow.completedTasks[i]=!!checkedVal; return l; }); },
    setDisposition(leadId,value){ updateLead(leadId,l=>{ l.workflow=l.workflow||{}; l.workflow.disposition=value; return l; }); },
    setWorkflowNote(leadId,value){ updateLead(leadId,l=>{ l.workflow=l.workflow||{}; l.workflow.note=value; return l; }); },
    addNote(leadId){
      const txt=$('#lf-new-note')?.value||''; if(!txt.trim()) return toast('Enter a note');
      updateLead(leadId,l=>{ l.notes=Array.isArray(l.notes)?l.notes:[]; l.notes.unshift({id:uid('note'),text:txt,createdAt:now()}); l.workflow=l.workflow||{}; l.workflow.note=txt; return l; });
      this.openLead(leadId); toast('Note added');
    },
    quickAdvance(leadId){
      const s=loadStore(), current=findLead(s,leadId); if(!current) return;
      const lead=normalizeLead(current,current.bucket);
      if(!canAdvance(lead)) return toast('Locked: complete tasks, disposition, and note first');
      const day = Math.min(10, Math.max(1, Number(lead.workflowDay || 1) + 1));
      updateLead(leadId,l=>{ l.workflowDay=day; l.bucket='day1'; l.stage='day'+day; l.workflow={day,stage:'day'+day,completedTasks:[],disposition:'',note:''}; return normalizeLead(l,'day1'); });
      toast(`Moved to Day ${day}`); this.openLead(leadId);
    },
    addManualLead(){
      const name=prompt('Lead full name'); if(!name) return;
      const title=prompt('Title / role / specialty')||'';
      const company=prompt('Company / practice')||'';
      const contact=prompt('Phone, email, or LinkedIn URL')||'';
      const raw={id:uid('manual'),name,title,company,source:'Manual Entry'};
      if(isEmail(contact)) raw.email=contact; else if(isPhone(contact)) raw.phone=contact; else if(isLinkedIn(contact)) raw.linkedinCandidateUrl=contact;
      const s=loadStore(); s.leadFactory.leads.unshift(normalizeLead(raw,'day1')); saveStore(s); openOverlay(); toast('Manual lead added');
    },
    copyHandoff(leadId){
      const s=loadStore(), l=normalizeLead(findLead(s,leadId)||{}, undefined);
      const text = `Director Handoff — ${l.name}\nRole: ${l.title}\nCompany: ${l.company}\nLocation: ${l.location||l.practiceLocation}\nWhy Fit: ${l.fitReason}\nAccredited-Likely: ${l.accreditedLikelyReason}\nBest Action: ${l.bestFirstAction}\nLikely Objection: ${l.likelyObjection||'Need to review with CPA / needs more information.'}\nContacts: ${(l.contactMethods||[]).map(c=>`${c.type}: ${c.value}`).join(' | ')}\nEvidence: ${(l.evidenceTrail||[]).map(e=>`${e.source}: ${e.whatItProves}`).join(' | ')}`;
      navigator.clipboard?.writeText(text).then(()=>toast('Handoff copied')).catch(()=>prompt('Copy handoff',text));
    }
  };

  function enhanceExistingCards(){
    const s=loadStore();
    const all=[...(s.leadFactory.leads||[]),...(s.leadFactory.research||[]),...(s.leadWorkflow||[]),...(s.radarLeads||[])];
    $$('.record,.radar-lead,.lead-work-card').forEach(card=>{
      if(card.querySelector('.lf-open-inline')) return;
      const nameEl=card.querySelector('.rec-name,.radar-name,.name'); if(!nameEl) return;
      const name=clean(nameEl.textContent).toLowerCase();
      const lead=all.find(l=>clean(l.name).toLowerCase()===name); if(!lead) return;
      const btn=document.createElement('button'); btn.className='lf-btn primary small lf-open-inline'; btn.textContent='Open Full Lead Card'; btn.onclick=()=>BasinLeadFactory.openLead(lead.id);
      (card.querySelector('.rec-actions,.radar-actions')||card).appendChild(btn);
    });
  }

  async function init(){
    addCss(); addLaunchButton();
    try { await importFromGitHubRadar(false); } catch(e) { console.warn('Lead Factory import skipped', e); }
    enhanceExistingCards();
    const mo=new MutationObserver(()=>{ clearTimeout(window.__lfEnhanceTimer); window.__lfEnhanceTimer=setTimeout(enhanceExistingCards,250); });
    mo.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();