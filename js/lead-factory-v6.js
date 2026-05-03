/* Basin OS V8.0 — Automated Lead Factory + Manual LinkedIn Verification CRM
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
    if(hasPhone(contacts)) return { queue:'Ready to Work', bucket:'day1', text:'Day 1: call or verify by phone. Ask for correct email/direct contact if needed, then log result.' };
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
    'Ready to Work':['Review evidence','Call / verify contact route','Ask for correct email or direct contact if needed','Select disposition','Add note'],
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
    return TASKS[lead.queue] || TASKS['Ready to Work'];
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
      call: all.filter(l=>l.queue==='Ready to Work').length,
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
      ['Ready to Work','Ready to Work',lf.leads.filter(l=>l.queue==='Ready to Work')],
      ['research','Research Needed',lf.research]
    ];
    return `<div class="lf-shell">
      <div class="lf-head"><div><h2>Basin Lead Factory V6.3</h2><p>Associate-ready leads, manual LinkedIn verification, profile snapshot parser, and Day 1–10 gating.</p></div>
        <div class="lf-actions"><button class="lf-btn primary" onclick="BasinLeadFactory.rebuild()">Load/Refresh GitHub Radar Leads</button><button class="lf-btn" onclick="BasinLeadFactory.addManualLead()">+ Manual Lead</button><button class="lf-btn danger" onclick="BasinLeadFactory.close()">Close</button></div></div>
      <div class="lf-stats"><div><b>${st.ready}</b><span>Associate Ready</span></div><div><b>${st.email}</b><span>Email First</span></div><div><b>${st.linkedin}</b><span>LinkedIn First</span></div><div><b>${st.verify}</b><span>LinkedIn Verify</span></div><div><b>${st.call}</b><span>Ready to Work</span></div><div><b>${st.research}</b><span>Research Needed</span></div></div>
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

/* Basin OS V8.0 — Auto Bridge
   Fixes the exact issue where radar records exist but Dashboard / Leads Workflow still show 0.
   This automatically mirrors Lead Factory + Radar records into the legacy Basin OS buckets the existing UI reads.
*/
(function(){
  'use strict';
  const STORE_KEY='basin_os_integrated';
  const now=()=>new Date().toISOString();
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const digits=v=>String(v||'').replace(/\D/g,'');
  const isEmail=v=>/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(v||''));
  const isPhone=v=>digits(v).length>=10;
  const isLI=v=>/linkedin\.com\/in\//i.test(String(v||''));
  const fmtPhone=v=>{const d=digits(v); if(d.length===10)return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`; if(d.length===11&&d[0]==='1')return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`; return clean(v);};
  const badFirst=new Set('former system expert leading regional national global essential financial transactional advertising digital general senior assistant associate practice business tax legal medical clinical public names email local county state city new old best top chief daily annual press'.split(' '));
  const badLast=new Set('assistant transactional advertising strategies financial dermatology partners legal clinic medical health practice group capital ventures services associates advisors consulting solutions hospital center company firm llc inc news city owner partner physician attorney doctor cpa tax expert'.split(' '));

  function personOk(name){
    name=clean(name); const parts=name.split(/\s+/);
    if(parts.length<2 || parts.length>3) return false;
    const f=parts[0].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
    const l=parts[parts.length-1].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
    if(badFirst.has(f)||badLast.has(l)||/[0-9]/.test(name)) return false;
    if(/\b(llc|inc|company|group|partners|practice|clinic|hospital|center|services|solutions|news|advertising)\b/i.test(name)) return false;
    return true;
  }
  function store(){
    let s={}; try{s=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch(e){}
    s.investors=Array.isArray(s.investors)?s.investors:[];
    s.radarLeads=Array.isArray(s.radarLeads)?s.radarLeads:[];
    s.leadWorkflow=Array.isArray(s.leadWorkflow)?s.leadWorkflow:[];
    s.rejectedRadarLeads=Array.isArray(s.rejectedRadarLeads)?s.rejectedRadarLeads:[];
    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=Array.isArray(s.leadFactory.leads)?s.leadFactory.leads:[];
    s.leadFactory.research=Array.isArray(s.leadFactory.research)?s.leadFactory.research:[];
    return s;
  }
  function save(s){
    try{
      localStorage.setItem(STORE_KEY,JSON.stringify(s));
      window.STORE=Object.assign(window.STORE||{},s);
      if(typeof window.save==='function') window.save();
      if(typeof window.flushSave==='function') window.flushSave(true);
    }catch(e){console.warn('[Basin V6.4] save failed',e)}
  }
  function score(l){
    let s=Number(l.score||0);
    if(!s){
      const b=[l.name,l.title,l.company,l.summary,l.signal,l.source].join(' ').toLowerCase();
      s=44;
      if(/physician|surgeon|medical|clinic|doctor|orthopedic|gastro|derm|urology|anesth|radiology/.test(b))s+=25;
      if(/owner|founder|ceo|president|entrepreneur|executive|partner|principal/.test(b))s+=22;
      if(/attorney|law firm|partner|estate/.test(b))s+=18;
      if(/cpa|tax|accounting/.test(b))s+=18;
      if(/acquired|sold|opened|launch|named partner|promoted|speaker|conference|podcast|interview/.test(b))s+=10;
      if(/idc|deduction|depletion|year-end|high income|oil|gas|energy/.test(b))s+=10;
    }
    return Math.max(1,Math.min(98,Math.round(s)));
  }
  function grade(sc){return sc>=82?'A':sc>=68?'B':sc>=52?'C':'D'}
  function contacts(l){
    const out=[];
    const add=(type,value,source,status)=>{
      value=clean(value); if(!value)return;
      if(/phone/i.test(type)) value=fmtPhone(value);
      const key=(type+'|'+value).toLowerCase();
      if(out.some(c=>(c.type+'|'+c.value).toLowerCase()===key))return;
      out.push({id:'ct_'+Math.random().toString(16).slice(2),type,value,source:source||'',status:status||'',confidence:status||'Medium'});
    };
    (Array.isArray(l.contactMethods)?l.contactMethods:[]).forEach(c=>add(c.type||c.kind,c.value||c.url||c.href,c.source,c.status||c.confidence));
    add('Email',l.email,'lead field','Verified');
    add('Phone',l.phone,'lead field','Verified');
    add('LinkedIn Profile',l.linkedin||l.linkedinUrl||l.linkedInUrl,'lead field','Verified');
    add('LinkedIn Candidate URL',l.linkedinCandidateUrl||l.linkedInCandidateUrl,'public search','Needs Manual Confirmation');
    if(l.npi) add('NPI Profile','https://npiregistry.cms.hhs.gov/provider-view/'+l.npi,'NPI','Verified');
    return out;
  }
  function route(c){
    if(c.some(x=>/email/i.test(x.type)&&isEmail(x.value))) return ['Email First','day1','Day 1: send reviewed email first, then log outcome/disposition.'];
    if(c.some(x=>/linkedin/i.test(x.type)&&isLI(x.value)&&!/candidate|needs/i.test(x.status||x.type))) return ['LinkedIn First','day1','Day 1: open verified LinkedIn manually and complete appropriate manual action.'];
    if(c.some(x=>/linkedin/i.test(x.type)&&isLI(x.value))) return ['LinkedIn Verify','day1','Day 1: open candidate LinkedIn URL manually, confirm/reject match, paste profile snapshot if useful.'];
    if(c.some(x=>/phone/i.test(x.type)&&isPhone(x.value))) return ['Ready to Work','day1','Day 1: call or verify by phone; ask for correct email/direct contact if needed.'];
    return ['Research Needed','research','Research: verify person and find a contact route.'];
  }
  function key(l){return clean([l.name,l.company,l.title,l.sourceUrl||l.url].join('|')).toLowerCase();}
  function normalize(l,i){
    const c=contacts(l), r=route(c), sc=score(l), g=l.grade||grade(sc);
    const name=clean(l.name||l.fullName||l.signal||('Lead '+(i+1)));
    const title=clean(l.title||l.role||l.specialty||l.company||'Prospect');
    const company=clean(l.company||l.practice||l.organization||'');
    return Object.assign({},l,{
      id:l.id||('lead_'+Date.now()+'_'+i+'_'+Math.random().toString(16).slice(2)),
      name,title,company,
      role:l.role||title,
      source:l.source||l.sourceType||'Radar',
      url:l.url||l.sourceUrl||'',
      sourceUrl:l.sourceUrl||l.url||'',
      summary:l.summary||l.signal||'',
      contactMethods:c,
      queue:r[0],
      contactPriority:r[0],
      bestFirstAction:r[2],
      bucket:r[1],
      day:r[1]==='day1'?1:0,
      workflowDay:r[1]==='day1'?1:0,
      status:l.status||'New',
      score:sc,
      grade:g,
      email:l.email || (c.find(x=>/email/i.test(x.type)&&isEmail(x.value))||{}).value || '',
      phone:l.phone || (c.find(x=>/phone/i.test(x.type)&&isPhone(x.value))||{}).value || '',
      linkedin:l.linkedin || (c.find(x=>/linkedin/i.test(x.type)&&isLI(x.value))||{}).value || '',
      updatedAt:l.updatedAt||now(),
      createdAt:l.createdAt||l.foundAt||now()
    });
  }
  function workflowFromLead(l){
    return {
      id:'wf-'+(l.id||Date.now()),
      key:key(l),
      leadId:l.id,
      name:l.name,
      title:l.title,
      company:l.company,
      score:l.score,
      grade:l.grade,
      leadType:'basinos',
      bucket:l.bucket||'day1',
      day:l.day||l.workflowDay||1,
      status:l.status||'Open',
      queue:l.queue||l.contactPriority||'Ready to Work',
      nextAction:l.bestFirstAction||'Day 1: complete required first action and log outcome.',
      createdAt:l.createdAt||now(),
      updatedAt:now(),
      url:l.url||l.sourceUrl||'',
      notes:l.summary||''
    };
  }
  function collect(s){
    const arr=[];
    const push=a=>(Array.isArray(a)?a:[]).forEach(x=>x&&arr.push(x));
    push(s.leadFactory&&s.leadFactory.leads);
    push(s.radarLeads);
    push(s.leadWorkflow);
    push(s.leads);
    // Some local browser radar builds store draftable records only inside action/draft queues.
    push(s.radarActionPlan&&s.radarActionPlan.leads);
    push(s.radarActionPlan&&s.radarActionPlan.actions);
    push(s.nurtureDrafts);
    push(s.radarDrafts);
    push(s.drafts);
    return arr;
  }
  async function fetchJsonMaybe(path){
    try{
      const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'});
      const text=await r.text();
      if(!r.ok || !text.trim()) return null;
      return JSON.parse(text);
    }catch(e){return null}
  }
  async function collectFromJson(){
    const out=[];
    for(const path of ['radar-leads.json','data/radar-leads.json']){
      const j=await fetchJsonMaybe(path);
      if(j && Array.isArray(j.leads)) out.push(...j.leads);
      if(j && Array.isArray(j.researchCandidates)) out.push(...j.researchCandidates);
    }
    return out;
  }
  function applyBridge(rawList, source){
    const s=store();
    const all=[...collect(s), ...(rawList||[])].filter(Boolean);
    const map=new Map();
    all.map(normalize).forEach(l=>{
      if(!clean(l.name))return;
      // Keep almost everything in the Lead bucket with a preliminary grade. Research only lacks any route.
      if(!personOk(l.name) && !l.phone && !l.email && !l.linkedin) return;
      const k=key(l)||l.id;
      if(!map.has(k) || (map.get(k).score||0)<(l.score||0)) map.set(k,l);
    });
    const leads=[...map.values()].sort((a,b)=>(b.score||0)-(a.score||0));
    const ready=leads.filter(l=>l.bucket!=='research');
    const research=leads.filter(l=>l.bucket==='research');

    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=ready;
    s.leadFactory.research=research;
    s.leadFactory.lastAutoBridgeAt=now();
    s.leadFactory.lastAutoBridgeSource=source||'browser/radar/json';
    s.radarLeads=leads;
    s.leads=ready;
    s.leadWorkflow=ready.map(workflowFromLead);

    // Do NOT auto-add to investor pipeline. Dashboard falls back to leadWorkflow if investors is empty.
    save(s);

    try{ if(typeof window.updateCounts==='function') window.updateCounts(); }catch(e){}
    try{ if(typeof window.renderDash==='function') window.renderDash(); }catch(e){}
    try{ if(typeof window.renderRadarSummary==='function') window.renderRadarSummary(); }catch(e){}
    try{ if(typeof window.renderRadarResults==='function') window.renderRadarResults(); }catch(e){}
    try{ if(typeof window.renderLeadsWorkflowPage==='function') window.renderLeadsWorkflowPage(); }catch(e){}
    console.log('[Basin V6.4 Auto Bridge]', {total:leads.length, ready:ready.length, research:research.length, source});
    return {total:leads.length,ready:ready.length,research:research.length};
  }
  async function autoBridge(){
    const jsonLeads=await collectFromJson();
    return applyBridge(jsonLeads, jsonLeads.length?'GitHub JSON + browser':'browser local radar');
  }
  window.BasinAutoBridgeLeads=autoBridge;

  // Patch existing buttons/functions so the sync happens automatically after local radar or shared radar reload.
  function patch(name){
    const old=window[name];
    if(typeof old==='function' && !old.__basin64){
      const wrapped=function(){
        const ret=old.apply(this,arguments);
        Promise.resolve(ret).finally(()=>setTimeout(autoBridge,1200));
        return ret;
      };
      wrapped.__basin64=true;
      window[name]=wrapped;
    }
  }
  function boot(){
    patch('runLeadRadar');
    patch('basinLoadSharedRadar');
    patch('basinImportSharedRadarLeads');
    autoBridge();
    setTimeout(autoBridge,2500);
    setTimeout(autoBridge,7000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();


/* Basin OS V8.0 — Leads Workflow Source Tabs + Priority Filters
   Adds source/route tabs above Day 1 so LinkedIn Verify leads can be worked first.
*/
(function(){
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
  const digits = v => String(v||'').replace(/\D/g,'');
  const isEmail = v => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(v||''));
  const isLinkedIn = v => /linkedin\.com\/in\//i.test(String(v||''));
  const isPhone = v => digits(v).length >= 10;
  const byId = id => document.getElementById(id);

  window.BASIN_LEAD_SOURCE_FILTER = window.BASIN_LEAD_SOURCE_FILTER || 'all';

  function hardEnsure(){
    try { if(typeof ensureStore === 'function') ensureStore(); } catch(e){}
    window.STORE = window.STORE || {};
    STORE.leadWorkflow = Array.isArray(STORE.leadWorkflow) ? STORE.leadWorkflow : [];
    STORE.radarLeads = Array.isArray(STORE.radarLeads) ? STORE.radarLeads : [];
    STORE.leadFactory = STORE.leadFactory || {};
    STORE.leadFactory.leads = Array.isArray(STORE.leadFactory.leads) ? STORE.leadFactory.leads : [];
    return STORE;
  }

  function score(w){ return Number(w.score || 0); }
  function grade(w){
    const s = score(w);
    return w.grade || (s >= 82 ? 'A' : s >= 68 ? 'B' : s >= 52 ? 'C' : 'D');
  }
  function contactMethods(w){
    const out = [];
    (Array.isArray(w.contactMethods) ? w.contactMethods : []).forEach(c => {
      const type = clean(c.type || c.kind || '');
      const value = clean(c.value || c.url || c.href || '');
      if(type || value) out.push({type,value,status:clean(c.status||c.confidence||''),verified:!!c.verified});
    });
    if(w.email) out.push({type:'Email',value:w.email,status:'Verified'});
    if(w.phone) out.push({type:'Phone',value:w.phone,status:'Verified'});
    if(w.linkedin) out.push({type:'LinkedIn Profile',value:w.linkedin,status:w.linkedinVerified?'Verified':'Needs Manual Confirmation',verified:!!w.linkedinVerified});
    return out;
  }
  function findLeadForWorkflow(w){
    hardEnsure();
    return (STORE.radarLeads||[]).find(l => l.id === w.leadId || l.id === w.id) ||
      (STORE.leadFactory.leads||[]).find(l => l.id === w.leadId || l.id === w.id) ||
      w;
  }
  function hasContact(w, kind){
    const l = findLeadForWorkflow(w);
    const c = contactMethods(l).concat(contactMethods(w));
    if(kind === 'email') return c.some(x => /email/i.test(x.type) && isEmail(x.value));
    if(kind === 'linkedinVerified') return c.some(x => /linkedin/i.test(x.type) && isLinkedIn(x.value) && (/verified/i.test(x.status) || x.verified));
    if(kind === 'linkedinCandidate') return c.some(x => /linkedin/i.test(x.type) && isLinkedIn(x.value) && !(/verified/i.test(x.status) || x.verified));
    if(kind === 'phone') return c.some(x => /phone/i.test(x.type) && isPhone(x.value));
    return false;
  }
  function sourceBlob(w){
    const l = findLeadForWorkflow(w);
    return [w.source,w.sourceType,w.queue,w.contactPriority,w.bestFirstAction,w.nextAction,w.url,w.sourceUrl,w.title,w.company,w.summary,w.signal,l.source,l.sourceType,l.queue,l.contactPriority,l.bestFirstAction,l.nextAction,l.url,l.sourceUrl,l.title,l.company,l.summary,l.signal].join(' ').toLowerCase();
  }
  function sourceClass(w){
    const b = sourceBlob(w);
    if(hasContact(w,'email')) return 'email';
    if(hasContact(w,'linkedinVerified')) return 'linkedin';
    if(hasContact(w,'linkedinCandidate') || /linkedin|salesnav|sales navigator/.test(b)) return 'linkedin-verify';
    if(/npi|npiregistry|provider-view/.test(b)) return 'npi';
    if(hasContact(w,'phone') || /phone|call first/.test(b)) return 'phone';
    if(/rss|google news|news\.google|public source|article/.test(b)) return 'rss';
    if(/manual/.test(b)) return 'manual';
    if(/research/.test(b)) return 'research';
    return 'other';
  }
  function sourceLabel(w){
    const cls = sourceClass(w);
    return ({
      email:'Email First',
      linkedin:'LinkedIn Verified',
      'linkedin-verify':'LinkedIn Verify',
      npi:'NPI / Physicians',
      phone:'Ready: Phone Verify',
      rss:'RSS / Public News',
      manual:'Manual Entry',
      research:'Research Needed',
      other:'Other'
    })[cls] || 'Other';
  }
  function sourceRank(w){
    const cls = sourceClass(w);
    // LinkedIn/email are top operational priorities. Candidate LinkedIn comes before phone/NPI because it is fastest to enrich.
    return ({
      email: 1,
      linkedin: 2,
      'linkedin-verify': 3,
      npi: 4,
      phone: 5,
      rss: 6,
      manual: 7,
      research: 8,
      other: 9
    })[cls] || 9;
  }
  function tabMatch(w, filter){
    if(filter === 'all') return true;
    if(filter === 'a') return grade(w) === 'A';
    if(filter === 'day1') return /^day1$/i.test(w.bucket || 'day1') || Number(w.day || 1) === 1;
    return sourceClass(w) === filter;
  }
  function sortedWorkflow(list){
    return (list||[]).slice().sort((a,b) => {
      const sr = sourceRank(a) - sourceRank(b);
      if(window.BASIN_LEAD_SOURCE_FILTER === 'all' && sr) return sr;
      const gs = score(b) - score(a);
      if(gs) return gs;
      return clean(a.name).localeCompare(clean(b.name));
    });
  }
  function sourceCounts(list){
    const c = {all:list.length,a:0,day1:0,email:0,linkedin:0,'linkedin-verify':0,npi:0,phone:0,rss:0,manual:0,research:0,other:0};
    list.forEach(w => {
      if(grade(w) === 'A') c.a++;
      if(/^day1$/i.test(w.bucket || 'day1') || Number(w.day || 1) === 1) c.day1++;
      c[sourceClass(w)] = (c[sourceClass(w)] || 0) + 1;
    });
    return c;
  }
  function setLeadSourceFilter(filter){
    window.BASIN_LEAD_SOURCE_FILTER = filter || 'all';
    try { renderLeadsWorkflowPage(); } catch(e) { console.warn('[Basin V6.5] render after filter failed', e); }
  }
  window.setLeadSourceFilter = setLeadSourceFilter;

  function contactLine(w){
    const l = findLeadForWorkflow(w);
    const c = contactMethods(l).concat(contactMethods(w));
    const uniq = [];
    const seen = new Set();
    c.forEach(x => {
      const key = (x.type+'|'+x.value).toLowerCase();
      if(!x.value || seen.has(key)) return;
      seen.add(key); uniq.push(x);
    });
    if(!uniq.length) return '<div class="mini-note" style="margin-top:7px;color:#ff9aa9">No visible contact method yet.</div>';
    return '<div class="rec-tags" style="margin-top:8px">' + uniq.slice(0,5).map(x => {
      let val = x.value;
      let html = esc(x.type)+': '+esc(val);
      if(/^https?:\/\//i.test(val)) html = esc(x.type)+': <a href="'+esc(val)+'" target="_blank" rel="noopener" style="color:#8bd5ff">Open</a>';
      if(/email/i.test(x.type) && isEmail(val)) html = 'Email: <a href="mailto:'+esc(val)+'" style="color:#8bd5ff">'+esc(val)+'</a>';
      if(/phone/i.test(x.type) && isPhone(val)) html = 'Phone: <a href="tel:'+digits(val)+'" style="color:#8bd5ff">'+esc(val)+'</a>';
      return '<span class="tag gray">'+html+'</span>';
    }).join('') + '</div>';
  }

  function card(w){
    const cls = sourceClass(w);
    const label = sourceLabel(w);
    const g = grade(w);
    const sc = score(w);
    const name = clean(w.name || 'Unnamed Lead');
    const meta = [w.company || '', w.title || '', 'Score '+sc, w.status || 'Open'].filter(Boolean).join(' · ');
    const next = w.bestFirstAction || w.nextAction || 'Complete first action, choose disposition, and log note.';
    const openFull = (window.BasinLeadFactory && typeof window.BasinLeadFactory.openLead === 'function') ? '<button class="btn btn-ghost btn-sm" onclick="BasinLeadFactory.openLead(\''+esc(w.leadId||w.id)+'\')">Full CRM Card</button>' : '';
    return '<div class="record" style="grid-template-columns:46px 1fr auto">'
      + '<div class="score '+esc(g)+'">'+esc(g)+'</div>'
      + '<div><div class="rec-name">'+esc(name)+'</div>'
      + '<div class="rec-meta">'+esc(meta)+'</div>'
      + '<div class="rec-tags"><span class="tag gold">'+esc((w.bucket||'day1').toUpperCase())+'</span><span class="tag teal">'+esc(label)+'</span><span class="tag gray">'+esc(w.updatedAt||w.createdAt||'')+'</span></div>'
      + contactLine(w)
      + '<div class="mini-note" style="margin-top:7px"><strong>Next:</strong> '+esc(next)+'</div></div>'
      + '<div class="rec-actions" style="flex-wrap:wrap;max-width:360px">'
      + (cls === 'linkedin-verify' ? '<button class="btn btn-primary btn-sm" onclick="BasinLeadFactory&&BasinLeadFactory.openLead?BasinLeadFactory.openLead(\''+esc(w.leadId||w.id)+'\'):void(0)">Verify LinkedIn</button>' : '')
      + '<button class="btn btn-primary btn-sm" onclick="advanceLeadWorkflow(\''+esc(w.id)+'\')">Complete / Next Day</button>'
      + openFull
      + '<button class="btn btn-ghost btn-sm" onclick="setLeadWorkflowBucket(\''+esc(w.id)+'\',\'callback\')">Callback</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="setLeadWorkflowBucket(\''+esc(w.id)+'\',\'future\')">Future</button>'
      + '<button class="btn btn-danger btn-sm" onclick="setLeadWorkflowBucket(\''+esc(w.id)+'\',\'notinterested\')">Not Interested</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="makeInvestorFromWorkflow(\''+esc(w.id)+'\')">Pipeline</button>'
      + '</div></div>';
  }

  function tabsHtml(counts){
    const tabs = [
      ['all','All Sources'],
      ['a','A Grade'],
      ['email','Email First'],
      ['linkedin','LinkedIn Verified'],
      ['linkedin-verify','LinkedIn Verify'],
      ['npi','NPI / Physicians'],
      ['phone','Ready: Phone'],
      ['rss','RSS / Public News'],
      ['manual','Manual'],
      ['research','Research']
    ];
    return '<div class="panel" style="margin-bottom:14px"><div class="panel-hd"><div><div class="panel-title">Lead Source Filters</div><div class="panel-sub">Work the highest-value queue first. LinkedIn Verify is where you manually confirm candidate profile URLs, then enrich the CRM card.</div></div></div><div class="panel-bd"><div class="chips" style="gap:8px;display:flex;flex-wrap:wrap">'
      + tabs.map(t => {
        const active = window.BASIN_LEAD_SOURCE_FILTER === t[0] ? ' active' : '';
        const n = counts[t[0]] || 0;
        return '<button class="chip'+active+'" onclick="setLeadSourceFilter(\''+esc(t[0])+'\')">'+esc(t[1])+' <span class="badge" style="margin-left:6px">'+n+'</span></button>';
      }).join('')
      + '</div><div class="mini-note" style="margin-top:10px"><strong>Priority order:</strong> Email First → LinkedIn Verified → LinkedIn Verify → NPI/Phone → RSS/Research. Inside each tab, leads sort highest score to lowest score.</div></div></div>';
  }

  function workflowCounts(list){
    const c = {};
    list.forEach(w => { c[w.bucket || 'day1'] = (c[w.bucket || 'day1'] || 0) + 1; });
    return c;
  }

  window.renderLeadsWorkflowPage = function(){
    hardEnsure();
    const root = byId('leads-workflow-root');
    if(!root) return;

    const all = sortedWorkflow(STORE.leadWorkflow || []);
    const counts = sourceCounts(all);
    const visible = sortedWorkflow(all.filter(w => tabMatch(w, window.BASIN_LEAD_SOURCE_FILTER)));
    const buckets = [];
    for(let i=1;i<=10;i++) buckets.push(['day'+i,'Day '+i]);
    buckets.push(['callback','Callbacks'],['future','Long-Term Future'],['notinterested','Not Interested']);

    let html = '<div class="info gold"><strong>Leads Workflow:</strong> Source tabs let you work the right queue first. LinkedIn Verify leads are candidate LinkedIn URLs that need manual confirmation before full CRM enrichment.</div>';
    html += '<div class="grid3" style="margin-bottom:14px"><div class="stat"><div class="stat-val">'+visible.length+'</div><div class="stat-lbl">Visible Leads</div></div><div class="stat"><div class="stat-val">'+visible.filter(w => /^day/.test(w.bucket||'')).length+'</div><div class="stat-lbl">Active Lead Work</div></div><div class="stat"><div class="stat-val">'+((STORE.rejectedRadarLeads||[]).length)+'</div><div class="stat-lbl">Filtered / Not Usable</div></div></div>';
    html += tabsHtml(counts);

    const wc = workflowCounts(visible);
    buckets.forEach(([bucket,label]) => {
      const items = sortedWorkflow(visible.filter(w => (w.bucket || 'day1') === bucket));
      html += '<div class="panel" style="margin-bottom:14px"><div class="panel-hd"><div><div class="panel-title">'+esc(label)+'</div><div class="panel-sub">'+items.length+' leads · sorted by source priority and score high to low</div></div></div><div class="panel-bd">';
      html += items.length ? items.map(card).join('') : '<div class="empty"><div class="empty-title">No leads in '+esc(label)+'</div></div>';
      html += '</div></div>';
    });
    root.innerHTML = html;
  };

  function patchCounts(){
    try{
      if(typeof window.updateCounts === 'function' && !window.updateCounts.__v65){
        const old = window.updateCounts;
        window.updateCounts = function(){
          const ret = old.apply(this, arguments);
          try{
            hardEnsure();
            const all = STORE.leadWorkflow || [];
            const c = sourceCounts(all);
            const radarBadge = byId('radar-badge'); if(radarBadge) radarBadge.textContent = all.length || c.all || 0;
            const leadsBadge = byId('leads-badge'); if(leadsBadge) leadsBadge.textContent = all.length || 0;
          }catch(e){}
          return ret;
        };
        window.updateCounts.__v65 = true;
      }
    }catch(e){}
  }

  function boot(){
    patchCounts();
    try { if(byId('page-leads') && byId('page-leads').classList.contains('active')) renderLeadsWorkflowPage(); } catch(e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();


/* Basin OS V8.0 — Clean Routing + Source Filter Overlay
   Fixes:
   1. Source filters are injected into Leads Workflow even if the legacy renderer wins.
   2. Filters work across all workflow days, not just Day 1.
   3. Lead Factory floating button hidden because sync is automatic now.
   4. Tavily UI hidden; Groq auto-connect attempted on site load.
*/
(function(){
  'use strict';

  const STORE_KEY='basin_os_integrated';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const digits=v=>String(v||'').replace(/\D/g,'');
  const isEmail=v=>/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(v||''));
  const isLI=v=>/linkedin\.com\/in\//i.test(String(v||''));
  const isPhone=v=>digits(v).length>=10;
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  window.BASIN_LEAD_SOURCE_FILTER = window.BASIN_LEAD_SOURCE_FILTER || 'all';

  function getStore(){
    let s={}; 
    try { s=JSON.parse(localStorage.getItem(STORE_KEY)||'{}'); } catch(e){}
    if(window.STORE && typeof window.STORE === 'object') s = Object.assign({}, s, window.STORE);
    s.leadWorkflow=Array.isArray(s.leadWorkflow)?s.leadWorkflow:[];
    s.radarLeads=Array.isArray(s.radarLeads)?s.radarLeads:[];
    s.leads=Array.isArray(s.leads)?s.leads:[];
    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=Array.isArray(s.leadFactory.leads)?s.leadFactory.leads:[];
    s.leadFactory.research=Array.isArray(s.leadFactory.research)?s.leadFactory.research:[];
    return s;
  }
  function saveStore(s){
    try{
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
      window.STORE = Object.assign(window.STORE||{}, s);
      if(typeof window.save === 'function') window.save();
      if(typeof window.flushSave === 'function') window.flushSave(true);
    }catch(e){ console.warn('[V6.6] save failed', e); }
  }
  function contacts(l){
    const out=[];
    const add=(type,value,status)=>{
      value=clean(value); if(!value) return;
      const k=(type+'|'+value).toLowerCase();
      if(out.some(x=>(x.type+'|'+x.value).toLowerCase()===k)) return;
      out.push({type,value,status:status||''});
    };
    (Array.isArray(l.contactMethods)?l.contactMethods:[]).forEach(c=>add(c.type||c.kind||'', c.value||c.url||c.href||'', c.status||c.confidence||''));
    add('Email',l.email,'Verified');
    add('Phone',l.phone,'Verified');
    add('LinkedIn Profile',l.linkedin||l.linkedinUrl||l.linkedInUrl, l.linkedinVerified?'Verified':'Needs Manual Confirmation');
    add('LinkedIn Candidate URL',l.linkedinCandidateUrl||l.linkedInCandidateUrl,'Needs Manual Confirmation');
    return out;
  }
  function linkedStatus(l){
    const c=contacts(l);
    const verified=c.some(x=>/linkedin/i.test(x.type)&&isLI(x.value)&&(/verified/i.test(x.status)||x.verified));
    const cand=c.some(x=>/linkedin/i.test(x.type)&&isLI(x.value)&&!(/verified/i.test(x.status)||x.verified));
    if(verified) return 'verified';
    if(cand) return 'candidate';
    return '';
  }
  function sourceOf(l){
    const blob=[l.source,l.sourceType,l.queue,l.contactPriority,l.bestFirstAction,l.nextAction,l.url,l.sourceUrl,l.title,l.company,l.summary,l.signal,l.notes].join(' ').toLowerCase();
    const c=contacts(l);
    if(c.some(x=>/email/i.test(x.type)&&isEmail(x.value))) return 'email';
    if(linkedStatus(l)==='verified') return 'linkedin';
    if(linkedStatus(l)==='candidate' || /linkedin|salesnav|sales navigator/.test(blob)) return 'linkedin-verify';
    if(/npi|npiregistry|provider-view|orthopedic surgery|physician|surgeon|medical/.test(blob)) return 'npi';
    if(c.some(x=>/phone/i.test(x.type)&&isPhone(x.value)) || /phone|call first/.test(blob)) return 'phone';
    if(/rss|google news|news\.google|article|public source/.test(blob)) return 'rss';
    if(/manual/.test(blob)) return 'manual';
    if(/research/.test(blob)) return 'research';
    return 'other';
  }
  function grade(l){
    const s=Number(l.score||0);
    return l.grade || (s>=82?'A':s>=68?'B':s>=52?'C':'D');
  }
  function sourceRank(l){
    return {email:1,linkedin:2,'linkedin-verify':3,npi:4,phone:5,rss:6,manual:7,research:8,other:9}[sourceOf(l)]||9;
  }
  function score(l){ return Number(l.score||0); }
  function allLeads(){
    const s=getStore();
    const arr=[...(s.leadWorkflow||[]),...(s.leads||[]),...(s.radarLeads||[]),...(s.leadFactory.leads||[]),...(s.leadFactory.research||[])].filter(Boolean);
    const map=new Map();
    arr.forEach((l,i)=>{
      const id=l.leadId||l.id||('tmp'+i);
      const k=clean([l.name,l.company,l.title,l.sourceUrl||l.url,id].join('|')).toLowerCase();
      if(!map.has(k) || score(map.get(k)) < score(l)) map.set(k,l);
    });
    return [...map.values()].sort((a,b)=>{
      const f=window.BASIN_LEAD_SOURCE_FILTER;
      if(f==='all'){
        const sr=sourceRank(a)-sourceRank(b);
        if(sr) return sr;
      }
      return score(b)-score(a);
    });
  }
  function filterMatch(l,f){
    if(f==='all') return true;
    if(f==='a') return grade(l)==='A';
    if(f==='day1') return Number(l.day||l.workflowDay||1)===1 || /^day1$/i.test(l.bucket||'day1');
    return sourceOf(l)===f;
  }
  function counts(list){
    const c={all:list.length,a:0,email:0,linkedin:0,'linkedin-verify':0,npi:0,phone:0,rss:0,manual:0,research:0,other:0};
    list.forEach(l=>{
      if(grade(l)==='A') c.a++;
      const s=sourceOf(l);
      c[s]=(c[s]||0)+1;
    });
    return c;
  }
  function routeText(key){
    return ({
      all:'All working leads from every source and route.',
      a:'Highest preliminary grade first.',
      email:'Leads with email available. Work these first when possible.',
      linkedin:'Manually verified LinkedIn profile leads.',
      'linkedin-verify':'Candidate LinkedIn URLs that need manual confirmation and profile snapshot enrichment.',
      npi:'NPI/physician source leads, generally call/verify first unless email/LinkedIn exists.',
      phone:'Phone/call verification leads.',
      rss:'RSS/public-source trigger leads.',
      manual:'Manually entered leads.',
      research:'Research needed before outreach.'
    })[key] || '';
  }
  function tabsHtml(){
    const list=allLeads(), c=counts(list);
    const tabs=[
      ['all','All Sources'],['a','A Grade'],['email','Email First'],['linkedin','LinkedIn Verified'],
      ['linkedin-verify','LinkedIn Verify'],['npi','NPI / Physicians'],['phone','Ready: Phone'],
      ['rss','RSS / Public News'],['manual','Manual'],['research','Research']
    ];
    return '<div id="basin-v66-source-tabs" class="panel" style="margin-bottom:14px;border:1px solid rgba(216,148,36,.45)">'
      + '<div class="panel-hd"><div><div class="panel-title">Lead Source / Route Filters</div>'
      + '<div class="panel-sub">Filter across every workflow day. Use LinkedIn Verify first when you want to manually confirm profile URLs and enrich CRM cards.</div></div></div>'
      + '<div class="panel-bd"><div class="chips" style="gap:8px;display:flex;flex-wrap:wrap">'
      + tabs.map(t=>'<button class="chip '+(window.BASIN_LEAD_SOURCE_FILTER===t[0]?'active':'')+'" onclick="BasinV66SourceFilters.set(\''+esc(t[0])+'\')">'+esc(t[1])+' <span class="badge" style="margin-left:6px">'+(c[t[0]]||0)+'</span></button>').join('')
      + '</div><div class="mini-note" style="margin-top:10px"><strong>Current:</strong> '+esc(routeText(window.BASIN_LEAD_SOURCE_FILTER))+' Inside each filter, leads sort high score to low score.</div></div></div>';
  }
  function card(l){
    const c=contacts(l);
    const source=sourceOf(l);
    const id=esc(l.leadId||l.id||'');
    const contactHtml=c.slice(0,5).map(x=>{
      let val=esc(x.value), label=esc(x.type);
      if(/email/i.test(x.type)&&isEmail(x.value)) val='<a href="mailto:'+esc(x.value)+'" style="color:#8bd5ff">'+esc(x.value)+'</a>';
      else if(/phone/i.test(x.type)&&isPhone(x.value)) val='<a href="tel:'+digits(x.value)+'" style="color:#8bd5ff">'+esc(x.value)+'</a>';
      else if(/^https?:\/\//.test(x.value)) val='<a href="'+esc(x.value)+'" target="_blank" rel="noopener" style="color:#8bd5ff">Open</a>';
      return '<span class="tag gray">'+label+': '+val+'</span>';
    }).join('');
    const verify = source==='linkedin-verify' ? '<button class="btn btn-primary btn-sm" onclick="BasinLeadFactory&&BasinLeadFactory.openLead?BasinLeadFactory.openLead(\''+id+'\'):void(0)">Verify LinkedIn</button>' : '';
    const full = window.BasinLeadFactory ? '<button class="btn btn-primary btn-sm" onclick="BasinLeadFactory.openLead(\''+id+'\')">Open Full Lead Card</button>' : '';
    return '<div class="record" data-v66-source="'+esc(source)+'" data-v66-score="'+score(l)+'" style="grid-template-columns:46px 1fr auto">'
      + '<div class="score '+esc(grade(l))+'">'+esc(grade(l))+'</div>'
      + '<div><div class="rec-name">'+esc(l.name||'Unnamed Lead')+'</div>'
      + '<div class="rec-meta">'+esc([l.title,l.company,'Score '+score(l),l.status||'New'].filter(Boolean).join(' · '))+'</div>'
      + '<div class="rec-tags"><span class="tag gold">'+esc((l.bucket||'day1').toUpperCase())+'</span><span class="tag teal">'+esc(({email:'Email First',linkedin:'LinkedIn Verified','linkedin-verify':'LinkedIn Verify',npi:'NPI / Physician',phone:'Ready: Phone',rss:'RSS / Public',manual:'Manual',research:'Research',other:'Other'})[source])+'</span></div>'
      + '<div class="rec-tags" style="margin-top:8px">'+(contactHtml||'<span class="tag red">No visible contact route</span>')+'</div>'
      + '<div class="mini-note" style="margin-top:8px"><strong>Next:</strong> '+esc(l.bestFirstAction||l.nextAction||'Complete first action and log result.')+'</div></div>'
      + '<div class="rec-actions" style="max-width:360px;flex-wrap:wrap">'+verify+full+'</div></div>';
  }
  function renderFilteredPanel(){
    const anchor=findInsertionAnchor();
    if(!anchor) return;
    $('#basin-v66-source-tabs')?.remove();
    $('#basin-v66-filter-results')?.remove();
    anchor.insertAdjacentHTML('afterend', tabsHtml());

    if(window.BASIN_LEAD_SOURCE_FILTER !== 'all'){
      const leads=allLeads().filter(l=>filterMatch(l,window.BASIN_LEAD_SOURCE_FILTER));
      const html='<div id="basin-v66-filter-results" class="panel" style="margin-bottom:14px;border:1px solid rgba(77,209,185,.35)">'
        + '<div class="panel-hd"><div><div class="panel-title">Filtered Leads — '+esc((window.BASIN_LEAD_SOURCE_FILTER||'all').replace('-', ' '))+'</div>'
        + '<div class="panel-sub">'+leads.length+' leads across all workflow days · highest score first</div></div></div>'
        + '<div class="panel-bd">'+(leads.length?leads.map(card).join(''):'<div class="empty"><div class="empty-title">No leads match this filter.</div></div>')+'</div></div>';
      $('#basin-v66-source-tabs').insertAdjacentHTML('afterend', html);
    }
  }
  function findInsertionAnchor(){
    // Prefer the stats grid in Leads Workflow; fallback to the required daily execution info box.
    const activePage=$('.page.active') || document;
    const h=[...$$('h1,h2,.page-title')].find(x=>/leads workflow/i.test(x.textContent||''));
    const scope=h ? (h.closest('.page') || activePage) : activePage;
    const grids=$$('.grid3,.stats-grid,.kpi-grid', scope);
    if(grids.length) return grids[0];
    const info=[...$$('.info,.notice,.panel', scope)].find(x=>/Required Daily Execution|usable leads|active lead/i.test(x.textContent||''));
    return info || null;
  }
  function applyFilterToLegacyCards(){
    const f=window.BASIN_LEAD_SOURCE_FILTER;
    // If all, show the original day sections normally. If filtered, keep original below but dim/hide? Hide to avoid duplicates.
    const page=[...$$('.page')].find(p=>/Leads Workflow/i.test(p.textContent||'') && p.classList.contains('active')) || document;
    $$('.panel', page).forEach(p=>{
      if(p.id==='basin-v66-source-tabs'||p.id==='basin-v66-filter-results') return;
      if(window.BASIN_LEAD_SOURCE_FILTER==='all') p.style.display='';
      else if(/Day \d+|Callbacks|Long-Term Future|Not Interested/i.test(p.textContent||'')) p.style.display='none';
    });
  }
  function render(){
    hideRedundantUI();
    renderFilteredPanel();
    applyFilterToLegacyCards();
  }
  function set(filter){
    window.BASIN_LEAD_SOURCE_FILTER=filter||'all';
    render();
  }

  function hideRedundantUI(){
    // Lead Factory button is now redundant because V6.4/V6.6 auto-bridges on load/reload.
    const lf=$('#lf-launch');
    if(lf) lf.style.display='none';

    // Hide Tavily UI/fields/buttons because current plan uses free feeds + GitHub Models + Groq fallback.
    $$('label,.field,.form-row,.setting-row,.api-row,.panel-bd div,.panel-bd button,.panel-bd input').forEach(el=>{
      const txt=(el.textContent||'')+' '+(el.placeholder||'')+' '+(el.value||'')+' '+(el.getAttribute('id')||'')+' '+(el.getAttribute('name')||'');
      if(/tavily/i.test(txt)) {
        const row=el.closest('label,.field,.form-row,.setting-row,.api-row') || el;
        row.style.display='none';
      }
    });
    $$('button').forEach(b=>{
      if(/connect tavily|tavily/i.test(b.textContent||'')) b.style.display='none';
    });
  }

  function autoConnectGroq(){
    const s=getStore();
    const api=s.api||s.BV_API||{};
    const savedKey = localStorage.getItem('BASIN_GROQ_API_KEY') || localStorage.getItem('GROQ_API_KEY') || api.groqKey || api.groqApiKey || '';
    if(!savedKey && !(window.BV_API && (window.BV_API.groqKey || window.BV_API.groqLive))) return;
    try{
      window.BV_API = window.BV_API || {};
      if(savedKey) window.BV_API.groqKey=savedKey;
      window.BV_API.groqLive=true;
      window.BV_API.groqConnected=true;
      s.api=s.api||{};
      if(savedKey) s.api.groqKey=savedKey;
      s.api.groqLive=true;
      saveStore(s);
    }catch(e){}
    // Try existing connect function only if present and not expensive; otherwise status flags are enough for UI.
    ['connectGroq','basinConnectGroq','connectGroqApi','autoConnectGroq'].forEach(fn=>{
      try{ if(typeof window[fn]==='function' && fn!=='autoConnectGroq') window[fn](); }catch(e){}
    });
  }

  window.BasinV66SourceFilters={set,render,sourceOf,counts};

  function boot(){
    autoConnectGroq();
    hideRedundantUI();
    render();
    const mo=new MutationObserver(()=>{ clearTimeout(window.__basinV66Timer); window.__basinV66Timer=setTimeout(render,300); });
    mo.observe(document.body,{childList:true,subtree:true});
    setTimeout(render,800);
    setTimeout(render,2500);
    setTimeout(render,6000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();


/* Basin OS V8.0 — Ready to Work + Official Day 1-10 Cadence
   Corrects workflow architecture:
   - "Ready to Work" is removed as a bucket.
   - Ready to Work becomes the execution bucket.
   - Phone is only a best contact route inside Ready to Work when evidence supports it.
   - LinkedIn candidate, Contact Route Needed, Research Needed, Suppressed remain prep queues.
   - Official Basin Day 1/2/4/6/10 scripts and compliance blocks are attached to cards.
*/
(function(){
  'use strict';

  const STORE_KEY='basin_os_integrated';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const digits=v=>String(v||'').replace(/\D/g,'');
  const isEmail=v=>/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(v||''));
  const isLinkedIn=v=>/linkedin\.com\/in\//i.test(String(v||''));
  const isPhone=v=>digits(v).length>=10;
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const now=()=>new Date().toISOString();

  window.BASIN_LEAD_SOURCE_FILTER = window.BASIN_LEAD_SOURCE_FILTER || 'ready';

  const CADENCE = {
    day1: {
      title:'Day 1 — Evidence-Based Email / LinkedIn Touch',
      timing:'Use same day call only for high-confidence signals; otherwise make phone the Day 2 call after email/LinkedIn goes out.',
      prior:'Review evidence trail, send or queue the Day 1 evidence-based email/LinkedIn touch, and confirm the phone source is appropriate.',
      trigger:'Strong public signal, A-score lead, or clear business context.',
      noResponse:'If no response, queue Day 2 research-based intro call.',
      next:'Day 2 Research-Based Intro Call / Signal Reminder.',
      compliance:'Do not imply the signal means they need the investment. No guarantees. No tax advice. Make the director call educational and optional.',
      script:'Evidence-based first touch. Reference [Signal] and [Role]. Keep it short, educational, and optional. Use email or LinkedIn when available before phone.'
    },
    day2: {
      title:'Day 2 — Research-Based Intro Call / Signal Reminder',
      timing:'Best live windows: 10:30–11:45 AM and 3:30–5:00 PM local time.',
      prior:'Evidence-based email or LinkedIn touch should normally happen before calling.',
      trigger:'First normal phone attempt after Day 1 email/LinkedIn. Reference the signal clearly so the call does not feel random.',
      noResponse:'Leave the matching voicemail when available, log outcome, and send the matching follow-up touch from this cadence.',
      next:'Advance to the next scheduled channel step unless they answer, object, book, or request removal.',
      compliance:'Do not imply the signal means they need the investment. No guarantees. No tax advice. Make the director call educational and optional.',
      script:'Hi [Name], [Your Name] with Basin Ventures. I reached out because of [Signal], and I wanted to try you once more.\n\nThe reason I thought it might fit is that high-income professionals and business owners often want to understand tax-advantaged direct energy ownership, especially when income or liquidity events are in play. Your CPA would need to confirm fit.\n\nShould I send a brief overview or just get you directly to a 20-minute director call?'
    },
    day3: {
      title:'Day 3 — LinkedIn Touch / Engagement Follow-Up',
      timing:'Use after Day 1 evidence touch and Day 2 phone attempt.',
      prior:'Review Day 1 and Day 2 outcomes before sending.',
      trigger:'No answer or no clear response after first touch/call attempt.',
      noResponse:'Move to Day 4 credibility-angle call.',
      next:'Day 4 Credibility Angle.',
      compliance:'Keep language educational and optional. No promises, guarantees, or tax advice.',
      script:'Manual LinkedIn touch or short follow-up referencing the original signal. Keep it conversational and do not over-pitch.'
    },
    day4: {
      title:'Day 4 — Credibility Angle',
      timing:'Best live windows: 10:30–11:45 AM and 3:30–5:00 PM local time.',
      prior:'Evidence-based email or LinkedIn touch should normally happen before calling.',
      trigger:'Second call/research follow-up. Shift from signal to credibility and fit.',
      noResponse:'Leave the matching voicemail when available, log outcome, and send the matching follow-up touch from this cadence.',
      next:'Advance to the next scheduled channel step unless they answer, object, book, or request removal.',
      compliance:'Do not imply the signal means they need the investment. No guarantees. No tax advice. Make the director call educational and optional.',
      script:'Hi [Name], [Your Name] from Basin Ventures. I know we have not spoken before. Basin has managed over $1.25B since 2014, and we focus on direct energy opportunities for accredited investors.\n\nGiven [Signal], I thought it was worth making one clean introduction. If it is irrelevant, no problem. If it is worth understanding, I can schedule a short director call.\n\nDoes this deserve 20 minutes, or should I close the loop?'
    },
    day5: {
      title:'Day 5 — Value Follow-Up / Overview Send',
      timing:'Use after Day 4 if no answer or no clear decision.',
      prior:'Review evidence, prior touches, and objection history.',
      trigger:'No response after credibility angle.',
      noResponse:'Move to Day 6 final research-based call.',
      next:'Day 6 Final Research-Based Call.',
      compliance:'Educational only. Do not provide tax advice; use “your CPA would need to confirm fit.”',
      script:'Send a short value follow-up or overview. Focus on education, structure, and optional director conversation.'
    },
    day6: {
      title:'Day 6 — Final Research-Based Call',
      timing:'Best live windows: 10:30–11:45 AM and 3:30–5:00 PM local time.',
      prior:'Evidence-based email or LinkedIn touch should normally happen before calling.',
      trigger:'Use only as final research-based call or value follow-up before close-loop.',
      noResponse:'Leave the matching voicemail when available, log outcome, and send the matching follow-up touch from this cadence.',
      next:'Advance to the next scheduled channel step unless they answer, object, book, or request removal.',
      compliance:'Do not imply the signal means they need the investment. No guarantees. No tax advice. Make the director call educational and optional.',
      script:'Hi [Name], last attempt from [Your Name] at Basin Ventures. I reached out because [Signal] made your profile look potentially relevant for a direct energy conversation.\n\nI do not want to chase you. Should I mark this as not a fit, or would you like one short overview call before I close it out?'
    },
    day7: {
      title:'Day 7 — Light Touch / Objection-Aware Follow-Up',
      timing:'Use after final research-based call attempt.',
      prior:'Review likely objection and notes.',
      trigger:'No clear answer after Day 6.',
      noResponse:'Move to nurture/future decision.',
      next:'Day 8 Nurture Decision.',
      compliance:'Avoid pressure. No guarantees. No tax advice.',
      script:'Short objection-aware follow-up. Common frame: “Your CPA would need to confirm fit; this is just to understand the structure.”'
    },
    day8: {
      title:'Day 8 — Nurture Decision / Future Timing Check',
      timing:'Use when active sequence is cooling.',
      prior:'Review all prior attempts.',
      trigger:'No response but lead still appears relevant.',
      noResponse:'Move to final review / director-call push.',
      next:'Day 9 Final Review.',
      compliance:'Permission-based and optional.',
      script:'Decide whether to continue, future-date, or close. Keep it permission based.'
    },
    day9: {
      title:'Day 9 — Final Review / Director-Call Push',
      timing:'Use only if fit remains strong.',
      prior:'Review evidence, score, and all interactions.',
      trigger:'Strong fit but no completed director call.',
      noResponse:'Move to Day 10 close-loop / permission call.',
      next:'Day 10 Longer-Term Permission Call.',
      compliance:'Do not overstate urgency or outcomes.',
      script:'One final practical attempt to determine whether a director call is worth 20 minutes.'
    },
    day10: {
      title:'Day 10 — Longer-Term Permission Call',
      timing:'Best live windows: 10:30–11:45 AM and 3:30–5:00 PM local time.',
      prior:'Evidence-based email or LinkedIn touch should normally happen before calling.',
      trigger:'Close-loop or permission-based future nurture.',
      noResponse:'Leave the matching voicemail when available, log outcome, and send the matching follow-up touch from this cadence.',
      next:'Move to Future, Callback, Not Interested, or Suppressed based on outcome.',
      compliance:'Do not imply the signal means they need the investment. No guarantees. No tax advice. Make future updates permission-based.',
      script:'Hi [Name], [Your Name] with Basin Ventures. I am closing the loop on my outreach.\n\nIf now is not the time, I can leave you alone. If you want to be kept on the list for future fund windows or tax-planning updates, I can do that instead. What is better?'
    }
  };

  function store(){
    let s={}; try{s=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch(e){}
    if(window.STORE && typeof window.STORE==='object') s=Object.assign({},s,window.STORE);
    s.leadWorkflow=Array.isArray(s.leadWorkflow)?s.leadWorkflow:[];
    s.radarLeads=Array.isArray(s.radarLeads)?s.radarLeads:[];
    s.leads=Array.isArray(s.leads)?s.leads:[];
    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=Array.isArray(s.leadFactory.leads)?s.leadFactory.leads:[];
    s.leadFactory.research=Array.isArray(s.leadFactory.research)?s.leadFactory.research:[];
    s.suppressed=Array.isArray(s.suppressed)?s.suppressed:[];
    return s;
  }
  function save(s){
    try{
      localStorage.setItem(STORE_KEY,JSON.stringify(s));
      window.STORE=Object.assign(window.STORE||{},s);
      if(typeof window.save==='function') window.save();
      if(typeof window.flushSave==='function') window.flushSave(true);
    }catch(e){console.warn('[V6.7] save failed',e)}
  }
  function contacts(l){
    const out=[];
    const add=(type,value,status,confidence,source)=>{
      value=clean(value); if(!value) return;
      const k=(type+'|'+value).toLowerCase();
      if(out.some(x=>(x.type+'|'+x.value).toLowerCase()===k)) return;
      out.push({type,value,status:status||'',confidence:confidence||'',source:source||''});
    };
    (Array.isArray(l.contactMethods)?l.contactMethods:[]).forEach(c=>add(c.type||c.kind||'',c.value||c.url||c.href||'',c.status||'',c.confidence||'',c.source||''));
    add('Email',l.email,'Verified','High','lead field');
    add('Phone',l.phone,'Verified','High','lead field');
    add('LinkedIn Profile',l.linkedin||l.linkedinUrl||l.linkedInUrl,l.linkedinVerified?'Verified':'Needs Manual Confirmation',l.linkedinVerified?'Manual Verified':'Needs Manual Confirmation','lead field');
    add('LinkedIn Candidate URL',l.linkedinCandidateUrl||l.linkedInCandidateUrl,'Needs Manual Confirmation','Needs Manual Confirmation','public search/manual');
    if(l.npi) add('NPI Profile','https://npiregistry.cms.hhs.gov/provider-view/'+l.npi,'Verified','High','NPI Registry');
    return out;
  }
  function evidence(l){
    const ev=Array.isArray(l.evidenceTrail)?l.evidenceTrail:[];
    if(ev.length) return ev;
    const out=[];
    if(l.source||l.sourceUrl||l.url) out.push({source:l.source||'Source',url:l.sourceUrl||l.url||'',whatItProves:l.signal||l.summary||'Source evidence.',confidence:'Medium'});
    return out;
  }
  function linkedStatus(l){
    const c=contacts(l);
    if(c.some(x=>/linkedin/i.test(x.type)&&isLinkedIn(x.value)&&(/verified|manual verified/i.test([x.status,x.confidence].join(' '))))) return 'verified';
    if(c.some(x=>/linkedin/i.test(x.type)&&isLinkedIn(x.value))) return 'candidate';
    return '';
  }
  function bestRoute(l){
    const c=contacts(l);
    if(c.some(x=>/email/i.test(x.type)&&isEmail(x.value))) return 'Email';
    if(linkedStatus(l)==='verified') return 'LinkedIn';
    if(c.some(x=>/phone/i.test(x.type)&&isPhone(x.value)&&reliablePhone(l,x))) return 'Phone';
    return '';
  }
  function reliablePhone(l,c){
    const blob=[l.source,l.sourceType,l.url,l.sourceUrl,l.summary,l.signal,l.company,l.title,c&&c.source,c&&c.confidence].join(' ').toLowerCase();
    return /npi|npiregistry|provider-view|practice|clinic|company website|official|manual|verified|high/.test(blob);
  }
  function isRealishPerson(l){
    const name=clean(l.name||'');
    if(!name || name.length<3) return false;
    if(/\b(llc|inc|company|group|clinic|hospital|center|services|solutions|news|article|rss|error)\b/i.test(name)) return false;
    return /\s/.test(name);
  }
  function bucketStatus(l){
    const li=linkedStatus(l);
    if(l.status==='Suppressed'||l.bucket==='suppressed'||l.suppressed) return 'suppressed';
    if(li==='candidate') return 'linkedin-verify';
    if(!isRealishPerson(l)) return 'research';
    if(!bestRoute(l)) {
      const c=contacts(l), ev=evidence(l);
      if(ev.length || c.length) return 'contact-needed';
      return 'research';
    }
    if(!evidence(l).length) return 'research';
    return 'ready';
  }
  function sourceOf(l){
    const blob=[l.source,l.sourceType,l.queue,l.contactPriority,l.bestFirstAction,l.nextAction,l.url,l.sourceUrl,l.title,l.company,l.summary,l.signal,l.notes].join(' ').toLowerCase();
    if(bucketStatus(l)==='ready') return 'ready';
    if(bucketStatus(l)==='linkedin-verify') return 'linkedin-verify';
    if(bucketStatus(l)==='contact-needed') return 'contact-needed';
    if(bucketStatus(l)==='suppressed') return 'suppressed';
    if(/npi|npiregistry|provider-view|orthopedic surgery|physician|surgeon|medical/.test(blob)) return 'npi';
    if(/rss|google news|news\.google|article|public source/.test(blob)) return 'rss';
    if(/manual/.test(blob)) return 'manual';
    return 'research';
  }
  function score(l){return Number(l.score||0)}
  function grade(l){const s=score(l); return l.grade||(s>=82?'A':s>=68?'B':s>=52?'C':'D')}
  function currentDay(l){return Math.max(1,Math.min(10,Number(l.day||l.workflowDay||String(l.bucket||'day1').replace(/\D/g,'')||1)))}
  function cadenceFor(l){return CADENCE['day'+currentDay(l)]||CADENCE.day1}
  function nextActionFor(l){
    const st=bucketStatus(l), r=bestRoute(l), c=cadenceFor(l);
    if(st==='ready') return `${c.title}. Best contact route: ${r}. ${c.prior}`;
    if(st==='linkedin-verify') return 'Open candidate LinkedIn URL manually, confirm or reject the match, then paste profile snapshot to enrich CRM. Once confirmed, move to Ready to Work.';
    if(st==='contact-needed') return 'Find a reliable email, confirmed LinkedIn URL, or reliable phone tied to source evidence before moving to Ready to Work.';
    if(st==='research') return 'Confirm real person, role/company, fit, and source evidence before outreach.';
    if(st==='suppressed') return 'Do not work unless reactivated manually.';
    return c.title;
  }
  function key(l){return clean([l.name,l.company,l.title,l.sourceUrl||l.url,l.id].join('|')).toLowerCase()}
  function normalizeLead(l,i){
    const st=bucketStatus(l), day=currentDay(l), route=bestRoute(l), sc=score(l)||60;
    const bucket = st==='ready' ? ('day'+day) : st;
    return Object.assign({},l,{
      id:l.id||('lead_'+Date.now()+'_'+i+'_'+Math.random().toString(16).slice(2)),
      bucket,
      status: st==='ready' ? (l.status||'Ready to Work') : st==='linkedin-verify' ? 'LinkedIn Verify' : st==='contact-needed' ? 'Contact Route Needed' : st==='suppressed' ? 'Suppressed' : 'Research Needed',
      day: st==='ready' ? day : 0,
      workflowDay: st==='ready' ? day : 0,
      queue: st==='ready' ? 'Ready to Work' : st==='linkedin-verify' ? 'LinkedIn Verify' : st==='contact-needed' ? 'Contact Route Needed' : st==='suppressed' ? 'Suppressed' : 'Research Needed',
      contactPriority: route || (st==='linkedin-verify'?'LinkedIn Candidate':'Research'),
      bestContactRoute: route || '',
      bestFirstAction: nextActionFor(l),
      nextAction: nextActionFor(l),
      grade: grade(l),
      score: sc,
      cadenceTitle: st==='ready' ? cadenceFor(l).title : '',
      cadence: st==='ready' ? cadenceFor(l) : null,
      updatedAt:l.updatedAt||now()
    });
  }
  function collect(){
    const s=store(), raw=[];
    [s.leadWorkflow,s.leads,s.radarLeads,s.leadFactory.leads,s.leadFactory.research].forEach(a=>(Array.isArray(a)?a:[]).forEach(x=>x&&raw.push(x)));
    const map=new Map();
    raw.map(normalizeLead).forEach(l=>{
      const k=key(l); if(!k) return;
      if(!map.has(k)||score(map.get(k))<score(l)) map.set(k,l);
    });
    return [...map.values()];
  }
  function sortLeads(list){
    const order={ready:1,'linkedin-verify':2,'contact-needed':3,research:4,npi:5,rss:6,manual:7,suppressed:8};
    return (list||[]).slice().sort((a,b)=>{
      const f=window.BASIN_LEAD_SOURCE_FILTER;
      if(f==='ready') {
        const rg = (bestRoute(a)==='Email'?1:bestRoute(a)==='LinkedIn'?2:bestRoute(a)==='Phone'?3:4) - (bestRoute(b)==='Email'?1:bestRoute(b)==='LinkedIn'?2:bestRoute(b)==='Phone'?3:4);
        if(rg) return rg;
      }
      if(f==='all') {
        const og=(order[sourceOf(a)]||9)-(order[sourceOf(b)]||9);
        if(og) return og;
      }
      const sg=score(b)-score(a); if(sg) return sg;
      return clean(a.name).localeCompare(clean(b.name));
    });
  }
  function filterMatch(l,f){
    const s=sourceOf(l);
    if(f==='all') return true;
    if(f==='a') return grade(l)==='A';
    if(f==='ready') return s==='ready';
    if(f==='email') return s==='ready' && bestRoute(l)==='Email';
    if(f==='linkedin') return s==='ready' && bestRoute(l)==='LinkedIn';
    if(f==='phone') return s==='ready' && bestRoute(l)==='Phone';
    return s===f;
  }
  function counts(list){
    const c={all:list.length,ready:0,email:0,linkedin:0,phone:0,a:0,'linkedin-verify':0,'contact-needed':0,research:0,npi:0,rss:0,manual:0,suppressed:0};
    list.forEach(l=>{
      const s=sourceOf(l); c[s]=(c[s]||0)+1;
      if(s==='ready') {
        c.ready++;
        if(bestRoute(l)==='Email') c.email++;
        if(bestRoute(l)==='LinkedIn') c.linkedin++;
        if(bestRoute(l)==='Phone') c.phone++;
      }
      if(grade(l)==='A') c.a++;
    });
    return c;
  }
  function syncStore(){
    const s=store(), all=sortLeads(collect());
    const ready=all.filter(l=>sourceOf(l)==='ready'), prep=all.filter(l=>sourceOf(l)!=='ready');
    s.leads=ready;
    s.leadWorkflow=ready.concat(prep);
    s.radarLeads=all;
    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=ready;
    s.leadFactory.research=prep;
    s.lastV67CadenceSync=now();
    save(s);
    return all;
  }
  function tabsHtml(){
    const all=collect(), c=counts(all);
    const tabs=[
      ['ready','Ready to Work'],
      ['email','Ready: Email'],
      ['linkedin','Ready: LinkedIn'],
      ['phone','Ready: Phone'],
      ['a','A Grade'],
      ['linkedin-verify','LinkedIn Verify'],
      ['contact-needed','Contact Route Needed'],
      ['research','Research Needed'],
      ['npi','NPI / Physicians'],
      ['rss','RSS / Public News'],
      ['manual','Manual'],
      ['suppressed','Suppressed'],
      ['all','All Records']
    ];
    return '<div id="basin-v80-tabs" class="panel" style="margin-bottom:14px;border:1px solid rgba(216,148,36,.55)">'
      + '<div class="panel-hd"><div><div class="panel-title">Execution Queue / Source Filters</div>'
      + '<div class="panel-sub">Ready to Work is the true associate queue. Prep buckets stay separate until research/verification is complete.</div></div></div>'
      + '<div class="panel-bd"><div class="chips" style="gap:8px;display:flex;flex-wrap:wrap">'
      + tabs.map(t=>'<button class="chip '+(window.BASIN_LEAD_SOURCE_FILTER===t[0]?'active':'')+'" onclick="BasinV67Cadence.set(\''+esc(t[0])+'\')">'+esc(t[1])+' <span class="badge" style="margin-left:6px">'+(c[t[0]]||0)+'</span></button>').join('')
      + '</div><div class="mini-note" style="margin-top:10px"><strong>Rule:</strong> Phone is not a verification bucket. If the phone is reliable, the lead is Ready to Work with best route Phone. If it is not reliable, it stays Contact Route Needed or Research Needed.</div></div></div>';
  }
  function contactLine(l){
    const c=contacts(l);
    if(!c.length) return '<div class="rec-tags" style="margin-top:8px"><span class="tag red">No reliable contact route</span></div>';
    return '<div class="rec-tags" style="margin-top:8px">'+c.slice(0,5).map(x=>{
      let val=esc(x.value), label=esc(x.type);
      if(/email/i.test(x.type)&&isEmail(x.value)) val='<a href="mailto:'+esc(x.value)+'" style="color:#8bd5ff">'+esc(x.value)+'</a>';
      else if(/phone/i.test(x.type)&&isPhone(x.value)) val='<a href="tel:'+digits(x.value)+'" style="color:#8bd5ff">'+esc(x.value)+'</a>';
      else if(/^https?:\/\//.test(x.value)) val='<a href="'+esc(x.value)+'" target="_blank" rel="noopener" style="color:#8bd5ff">Open</a>';
      return '<span class="tag gray">'+label+': '+val+'</span>';
    }).join('')+'</div>';
  }
  function cadenceBlock(l){
    const c=cadenceFor(l);
    if(sourceOf(l)!=='ready') return '';
    return '<div class="mini-note" style="margin-top:8px"><strong>'+esc(c.title)+'</strong><br>'
      + '<strong>Timing:</strong> '+esc(c.timing)+'<br>'
      + '<strong>Prior touch:</strong> '+esc(c.prior)+'<br>'
      + '<strong>Compliance:</strong> '+esc(c.compliance)+'</div>';
  }
  function scriptButton(l){
    if(sourceOf(l)!=='ready') return '';
    const id=esc(l.id||l.leadId||'');
    return '<button class="btn btn-ghost btn-sm" onclick="BasinV67Cadence.copyScript(\''+id+'\')">Copy Day Script</button>';
  }
  function card(l){
    const s=sourceOf(l), r=bestRoute(l), id=esc(l.leadId||l.id||''), g=grade(l);
    const label={ready:'Ready to Work','linkedin-verify':'LinkedIn Verify','contact-needed':'Contact Route Needed',research:'Research Needed',npi:'NPI / Physicians',rss:'RSS / Public',manual:'Manual',suppressed:'Suppressed'}[s]||s;
    const verify=s==='linkedin-verify'?'<button class="btn btn-primary btn-sm" onclick="BasinLeadFactory&&BasinLeadFactory.openLead?BasinLeadFactory.openLead(\''+id+'\'):void(0)">Verify LinkedIn</button>':'';
    const full=window.BasinLeadFactory?'<button class="btn btn-primary btn-sm" onclick="BasinLeadFactory.openLead(\''+id+'\')">Open Full Lead Card</button>':'';
    return '<div class="record" data-v80-source="'+esc(s)+'" data-v80-score="'+score(l)+'" style="grid-template-columns:46px 1fr auto">'
      + '<div class="score '+esc(g)+'">'+esc(g)+'</div>'
      + '<div><div class="rec-name">'+esc(l.name||'Unnamed Lead')+'</div>'
      + '<div class="rec-meta">'+esc([l.title,l.company,'Score '+score(l),r?'Best Route: '+r:''].filter(Boolean).join(' · '))+'</div>'
      + '<div class="rec-tags"><span class="tag gold">'+esc((l.bucket||'').toUpperCase())+'</span><span class="tag teal">'+esc(label)+'</span><span class="tag gray">'+esc(l.updatedAt||'')+'</span></div>'
      + contactLine(l)
      + '<div class="mini-note" style="margin-top:8px"><strong>Next:</strong> '+esc(l.nextAction||l.bestFirstAction||nextActionFor(l))+'</div>'
      + cadenceBlock(l)+'</div>'
      + '<div class="rec-actions" style="max-width:380px;flex-wrap:wrap">'+verify+full+scriptButton(l)
      + (sourceOf(l)==='ready'?'<button class="btn btn-primary btn-sm" onclick="BasinV67Cadence.advance(\''+id+'\')">Complete / Next Day</button>':'')
      + '<button class="btn btn-ghost btn-sm" onclick="BasinV67Cadence.setBucket(\''+id+'\',\'callback\')">Callback</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="BasinV67Cadence.setBucket(\''+id+'\',\'future\')">Future</button>'
      + '<button class="btn btn-danger btn-sm" onclick="BasinV67Cadence.setBucket(\''+id+'\',\'suppressed\')">Suppress</button>'
      + '</div></div>';
  }
  function render(){
    const page=[...$$('.page')].find(p=>/Leads Workflow/i.test(p.textContent||'') && p.classList.contains('active')) || document;
    $('#basin-v66-source-tabs')?.remove(); $('#basin-v66-filter-results')?.remove();
    $('#basin-v80-tabs')?.remove(); $('#basin-v80-results')?.remove();
    const anchor=$('.grid3,.stats-grid,.kpi-grid',page) || $('.info,.notice,.panel',page);
    if(!anchor) return;
    const all=syncStore();
    anchor.insertAdjacentHTML('afterend',tabsHtml());
    const visible=sortLeads(all.filter(l=>filterMatch(l,window.BASIN_LEAD_SOURCE_FILTER)));
    const titleMap={ready:'Ready to Work',email:'Ready to Work — Email',linkedin:'Ready to Work — LinkedIn',phone:'Ready to Work — Phone',a:'A Grade',all:'All Records','linkedin-verify':'LinkedIn Verify','contact-needed':'Contact Route Needed',research:'Research Needed',npi:'NPI / Physicians',rss:'RSS / Public News',manual:'Manual',suppressed:'Suppressed'};
    const html='<div id="basin-v80-results" class="panel" style="margin-bottom:14px;border:1px solid rgba(77,209,185,.35)">'
      + '<div class="panel-hd"><div><div class="panel-title">'+esc(titleMap[window.BASIN_LEAD_SOURCE_FILTER]||'Filtered Leads')+'</div>'
      + '<div class="panel-sub">'+visible.length+' records · sorted highest score first</div></div></div>'
      + '<div class="panel-bd">'+(visible.length?visible.map(card).join(''):'<div class="empty"><div class="empty-title">No records in this queue.</div></div>')+'</div></div>';
    $('#basin-v80-tabs').insertAdjacentHTML('afterend',html);
    // Hide legacy day panels to avoid conflicting old wording.
    $$('.panel',page).forEach(p=>{
      if(p.id==='basin-v80-tabs'||p.id==='basin-v80-results') return;
      if(/Day \d+|Callbacks|Long-Term Future|Not Interested/i.test(p.textContent||'')) p.style.display='none';
    });
  }
  function set(filter){window.BASIN_LEAD_SOURCE_FILTER=filter||'ready'; render();}
  function find(id){return collect().find(l=>l.id===id||l.leadId===id)}
  function copyScript(id){
    const l=find(id); if(!l) return;
    const c=cadenceFor(l), signal=l.signal||l.summary||'[Signal]', role=l.title||'[Role]';
    const text=c.script.replaceAll('[Name]',l.name||'[Name]').replaceAll('[Signal]',signal).replaceAll('[Role]',role);
    navigator.clipboard?.writeText(text).then(()=>alert('Day script copied')).catch(()=>prompt('Copy script',text));
  }
  function advance(id){
    const s=store();
    const update=(l)=>{
      if(l.id===id||l.leadId===id){
        const d=Math.min(10,currentDay(l)+1);
        l.day=d; l.workflowDay=d; l.bucket='day'+d; l.status='Ready to Work'; l.nextAction=(CADENCE['day'+d]||CADENCE.day10).title; l.updatedAt=now();
      }
      return l;
    };
    ['leadWorkflow','leads','radarLeads'].forEach(k=>{s[k]=(s[k]||[]).map(update)});
    if(s.leadFactory){s.leadFactory.leads=(s.leadFactory.leads||[]).map(update);s.leadFactory.research=(s.leadFactory.research||[]).map(update)}
    save(s); render();
  }
  function setBucket(id,bucket){
    const s=store();
    const update=(l)=>{ if(l.id===id||l.leadId===id){l.bucket=bucket;l.status=bucket==='suppressed'?'Suppressed':bucket;l.updatedAt=now();} return l; };
    ['leadWorkflow','leads','radarLeads'].forEach(k=>{s[k]=(s[k]||[]).map(update)});
    save(s); render();
  }
  function patchExisting(){
    // Remove old wording if any old renderer still shows underneath before hidden.
    $$('*').forEach(el=>{
      if(el.childNodes.length===1 && el.childNodes[0].nodeType===3 && /Call First \/ Verify|Phone \/ Call Verify|Phone Verify/i.test(el.textContent||'')){
        el.textContent=el.textContent.replace(/Call First \/ Verify/gi,'Ready to Work').replace(/Phone \/ Call Verify/gi,'Ready: Phone').replace(/Phone Verify/gi,'Contact Route Needed');
      }
    });
  }
  window.BasinV67Cadence={set,render,copyScript,advance,setBucket,cadence:CADENCE};

  function boot(){
    patchExisting();
    render();
    const mo=new MutationObserver(()=>{clearTimeout(window.__basinV67Timer);window.__basinV67Timer=setTimeout(()=>{patchExisting();render();},350)});
    mo.observe(document.body,{childList:true,subtree:true});
    setTimeout(render,800); setTimeout(render,2500); setTimeout(render,6000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();


/* Basin OS V8.0 — Cross-Referenced Lead Display */
(function(){
  'use strict';
  const STORE_KEY='basin_os_integrated';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const isLI=v=>/linkedin\.com\/in\//i.test(String(v||''));
  const isEmail=v=>/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(v||''));
  const digits=v=>String(v||'').replace(/\D/g,'');
  const isPhone=v=>digits(v).length>=10;

  function getStore(){
    let s={}; try{s=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch(e){}
    if(window.STORE&&typeof window.STORE==='object') s=Object.assign({},s,window.STORE);
    s.leadWorkflow=Array.isArray(s.leadWorkflow)?s.leadWorkflow:[];
    s.radarLeads=Array.isArray(s.radarLeads)?s.radarLeads:[];
    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=Array.isArray(s.leadFactory.leads)?s.leadFactory.leads:[];
    s.leadFactory.research=Array.isArray(s.leadFactory.research)?s.leadFactory.research:[];
    return s;
  }
  function contacts(l){
    const arr=[];
    const add=(type,value,status)=>{value=clean(value); if(!value)return; const k=(type+'|'+value).toLowerCase(); if(arr.some(x=>(x.type+'|'+x.value).toLowerCase()===k))return; arr.push({type,value,status:status||''});};
    (Array.isArray(l.contactMethods)?l.contactMethods:[]).forEach(c=>add(c.type||c.kind||'',c.value||c.url||c.href||'',c.status||c.confidence||''));
    add('Email',l.email,'Verified'); add('Phone',l.phone,'Verified'); add('LinkedIn',l.linkedin||l.linkedinUrl,l.linkedinVerified?'Verified':'Needs Manual Confirmation');
    return arr;
  }
  function evidence(l){return Array.isArray(l.evidenceTrail)?l.evidenceTrail:[]}
  function confidence(l){
    if(l.sourceConfidence) return l.sourceConfidence;
    const e=evidence(l), c=contacts(l);
    const hasNpi=e.some(x=>/npi|npiregistry/i.test(`${x.source} ${x.url}`));
    const hasOther=e.some(x=>!/npi|npiregistry/i.test(`${x.source} ${x.url}`));
    if(c.some(x=>/linkedin/i.test(x.type)&&isLI(x.value)&&/verified/i.test(x.status))) return hasOther?'High — LinkedIn verified + second source':'Medium — LinkedIn verified';
    if(c.some(x=>/linkedin/i.test(x.type)&&isLI(x.value))) return 'Needs Manual LinkedIn Confirmation';
    if(c.some(x=>/email/i.test(x.type)&&isEmail(x.value))) return hasOther?'High — Email + second source':'Medium — Email available';
    if(c.some(x=>/phone/i.test(x.type)&&isPhone(x.value))) return hasNpi&&hasOther?'Medium — Phone + second source':hasNpi?'Phone Route Only — NPI single source':'Phone Route Only';
    return hasOther&&hasNpi?'Cross-Referenced — contact needed':'Single Source — needs enrichment';
  }
  function allLeads(){
    const s=getStore(), a=[...(s.leadWorkflow||[]),...(s.radarLeads||[]),...(s.leadFactory.leads||[]),...(s.leadFactory.research||[])].filter(Boolean), m=new Map();
    a.forEach((l,i)=>{const k=clean([l.name,l.company,l.title,l.sourceUrl||l.url,l.id||i].join('|')).toLowerCase(); if(!m.has(k)||(Number(m.get(k).score||0)<Number(l.score||0)))m.set(k,l)});
    return [...m.values()];
  }
  function counts(){
    const c={ready:0,high:0,cross:0,phoneonly:0,linkedin:0,contact:0,research:0,npi:0,rss:0,total:0};
    allLeads().forEach(l=>{
      c.total++;
      const conf=confidence(l).toLowerCase();
      const blob=[l.source,l.sourceType,l.sourceUrl,l.url,l.sourceConfidence,l.bucket,l.queue,l.status].join(' ').toLowerCase();
      if(/ready|phone route only|medium|high/.test(conf) && !/needed|confirmation/.test(conf)) c.ready++;
      if(/high/.test(conf)) c.high++;
      if(/cross|second source/.test(conf)) c.cross++;
      if(/phone route only/.test(conf)) c.phoneonly++;
      if(/linkedin verify|needs manual linkedin|linkedin-verify/.test(blob+' '+conf)) c.linkedin++;
      if(/contact route needed|contact-needed/.test(blob+' '+conf)) c.contact++;
      if(/research|backlog|single source/.test(blob+' '+conf)) c.research++;
      if(/npi|npiregistry|provider-view/.test(blob)) c.npi++;
      if(/rss|google news|news\.google|article/.test(blob)) c.rss++;
    });
    return c;
  }
  function addSummaryPanel(){
    const page=[...$$('.page')].find(p=>/Leads Workflow/i.test(p.textContent||'') && p.classList.contains('active')) || document;
    $('#v80-crossref-summary')?.remove();
    const anchor=$('#basin-v67-tabs',page)||$('#basin-v66-source-tabs',page)||$('.grid3,.stats-grid,.kpi-grid',page);
    if(!anchor) return;
    const c=counts();
    const html='<div id="v80-crossref-summary" class="panel" style="margin-bottom:14px;border:1px solid rgba(77,209,185,.35)"><div class="panel-hd"><div><div class="panel-title">Cross-Reference Quality</div><div class="panel-sub">NPI is now an identity seed. Stronger leads have second-source evidence, LinkedIn candidate/verified URL, email, or reliable phone.</div></div></div><div class="panel-bd"><div class="chips" style="display:flex;gap:8px;flex-wrap:wrap"><span class="chip">Ready '+c.ready+'</span><span class="chip">High Confidence '+c.high+'</span><span class="chip">Cross-Referenced '+c.cross+'</span><span class="chip">Phone Route Only '+c.phoneonly+'</span><span class="chip">LinkedIn Verify '+c.linkedin+'</span><span class="chip">Contact Needed '+c.contact+'</span><span class="chip">Research/Backlog '+c.research+'</span><span class="chip">NPI Seed '+c.npi+'</span><span class="chip">RSS/Public '+c.rss+'</span></div></div></div>';
    anchor.insertAdjacentHTML('afterend',html);
  }
  function injectLabels(){
    $$('.record').forEach(card=>{
      if(card.querySelector('.v80-confidence')) return;
      const name=clean((card.querySelector('.rec-name')||{}).textContent||'');
      if(!name) return;
      const l=allLeads().find(x=>clean(x.name)===name);
      if(!l) return;
      const target=card.querySelector('.rec-tags') || card.querySelector('.rec-meta');
      if(target) target.insertAdjacentHTML('afterend','<div class="mini-note v80-confidence" style="margin-top:7px"><strong>Source Confidence:</strong> '+esc(confidence(l))+'</div>');
    });
  }
  function run(){
    addSummaryPanel();
    injectLabels();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{setTimeout(run,400);setTimeout(run,1800);setTimeout(run,5000)}); else {setTimeout(run,400);setTimeout(run,1800);setTimeout(run,5000)}
  new MutationObserver(()=>{clearTimeout(window.__v80Timer); window.__v80Timer=setTimeout(run,350)}).observe(document.body,{childList:true,subtree:true});
})();



/* Basin OS V8.0 — Count Reconciliation + API Status Fix
   Fixes mismatched Lead Radar / Leads Workflow counts and API Command Center confusion.
   Truth source:
   - Raw found = latest GitHub radar JSON stats/leads/research totals
   - Usable/Ready = associate-ready records that landed in the working lead bucket
   - Filtered/Not usable = raw found minus usable, plus explicit rejected/suppressed when present
   - Brave is GitHub-runner-only. Browser cannot read GitHub Secrets. We show latest runner status instead.
*/
(function(){
  'use strict';

  const STORE_KEY='basin_os_integrated';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  function getStore(){
    let s={};
    try{s=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch(e){}
    if(window.STORE && typeof window.STORE==='object') s=Object.assign({},s,window.STORE);
    s.leadWorkflow=Array.isArray(s.leadWorkflow)?s.leadWorkflow:[];
    s.leads=Array.isArray(s.leads)?s.leads:[];
    s.radarLeads=Array.isArray(s.radarLeads)?s.radarLeads:[];
    s.rejectedRadarLeads=Array.isArray(s.rejectedRadarLeads)?s.rejectedRadarLeads:[];
    s.suppressed=Array.isArray(s.suppressed)?s.suppressed:[];
    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=Array.isArray(s.leadFactory.leads)?s.leadFactory.leads:[];
    s.leadFactory.research=Array.isArray(s.leadFactory.research)?s.leadFactory.research:[];
    return s;
  }
  function saveStore(s){
    try{
      localStorage.setItem(STORE_KEY,JSON.stringify(s));
      window.STORE=Object.assign(window.STORE||{},s);
      if(typeof window.save==='function') window.save();
      if(typeof window.flushSave==='function') window.flushSave(true);
    }catch(e){}
  }
  function key(l,i){
    return clean([l.name,l.company,l.title,l.sourceUrl||l.url,(l.contactMethods||[]).map(c=>c.value||c.url||'').join('|'),l.id||i].join('|')).toLowerCase();
  }
  function dedupe(arr){
    const m=new Map();
    (arr||[]).filter(Boolean).forEach((l,i)=>{
      const k=key(l,i);
      if(!k) return;
      if(!m.has(k) || Number(m.get(k).score||0)<Number(l.score||0)) m.set(k,l);
    });
    return [...m.values()];
  }
  function isReady(l){
    const blob=[l.queue,l.status,l.bucket,l.stage,l.sourceConfidence,l.bestContactRoute].join(' ').toLowerCase();
    if(/suppressed|not usable|research needed|contact route needed|linkedin verify|npi candidate backlog|backlog/.test(blob)) return false;
    return /ready to work|day\d|phone route only|reliable phone|high|medium/.test(blob) && ((l.contactMethods||[]).length || l.email || l.phone || l.linkedin);
  }
  function isResearch(l){
    const blob=[l.queue,l.status,l.bucket,l.stage,l.sourceConfidence].join(' ').toLowerCase();
    return /research|contact route needed|linkedin verify|backlog|single source|manual linkedin/.test(blob);
  }

  async function fetchJson(path){
    try{
      const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'});
      if(!r.ok) return null;
      const t=await r.text();
      if(!t.trim()) return null;
      return JSON.parse(t);
    }catch(e){return null}
  }
  async function latestRadarJson(){
    return (await fetchJson('data/radar-leads.json')) || (await fetchJson('radar-leads.json')) || null;
  }

  function computeLocalCounts(radarJson){
    const s=getStore();
    const jsonLeads=Array.isArray(radarJson?.leads)?radarJson.leads:[];
    const jsonResearch=Array.isArray(radarJson?.researchCandidates)?radarJson.researchCandidates:[];
    const ready = dedupe([
      ...jsonLeads,
      ...s.leads,
      ...s.leadFactory.leads,
      ...s.leadWorkflow.filter(isReady)
    ]).filter(isReady);

    const research = dedupe([
      ...jsonResearch,
      ...s.leadFactory.research,
      ...s.leadWorkflow.filter(isResearch),
      ...s.radarLeads.filter(isResearch)
    ]);

    const stats=radarJson?.stats||{};
    const jsonReady = Number(stats.readyToWork || stats.associateReady || (Array.isArray(radarJson?.leads)?radarJson.leads.length:0) || 0);
    const npiCollected = Number(stats.npiCollected || 0);
    const rssCollected = Number(stats.rssCollected || stats.rssReady || 0);
    const rawFromStats = Number(stats.totalFound || stats.rawFound || 0);
    const found = Math.max(
      rawFromStats,
      npiCollected + rssCollected,
      jsonReady + Number(stats.linkedinVerify||0) + Number(stats.contactNeeded||0) + Number(stats.research||0) + Number(stats.npiBacklog||0),
      ready.length + research.length,
      s.radarLeads.length
    );
    const usable = Math.max(jsonReady, ready.length);
    const filteredStat = Number(stats.filteredNotUsable || stats.filtered || stats.notUsable || 0);
    const filtered = Math.max(0, Math.max(filteredStat, found - usable, s.rejectedRadarLeads.length, s.suppressed.length));

    const sourceCounts = {
      all: found || usable + research.length,
      ready: usable,
      high: Number(stats.highConfidenceReady || ready.filter(l=>/^High/i.test(l.sourceConfidence||'')).length),
      cross: Number(stats.crossReferencedReady || ready.filter(l=>l.crossReferenced).length),
      phoneonly: Number(stats.phoneRouteOnlyReady || ready.filter(l=>/Phone Route Only/i.test(l.sourceConfidence||'')).length),
      linkedinVerify: Number(stats.linkedinVerify || research.filter(l=>/linkedin verify|manual linkedin|candidate linkedin/i.test([l.queue,l.status,l.bucket,l.sourceConfidence].join(' '))).length),
      contactNeeded: Number(stats.contactNeeded || research.filter(l=>/contact route needed|contact-needed/i.test([l.queue,l.status,l.bucket,l.sourceConfidence].join(' '))).length),
      research: Number(stats.research || research.length),
      npi: Number(stats.npiCollected || ready.concat(research).filter(l=>/npi|npiregistry|provider-view/i.test([l.source,l.sourceType,l.sourceUrl,l.url,l.sourceConfidence].join(' '))).length),
      rss: Number(stats.rssCollected || stats.rssReady || ready.concat(research).filter(l=>/rss|google news|news\.google|article/i.test([l.source,l.sourceType,l.sourceUrl,l.url].join(' '))).length),
      publicSearches: Number(stats.publicSearches || 0),
      aiCalls: Number(stats.aiCalls || 0),
      generatedAt: radarJson?.generatedAt || s.lastRadarLoadedAt || ''
    };

    return {found,usable,active:usable,filtered,ready,research,sourceCounts,radarJson};
  }

  function setText(el,val){
    if(!el) return;
    el.textContent = String(val);
  }
  function numericCardsInPage(){
    const page=$('.page.active')||document;
    const cards=$$('.stat,.kpi,.metric,.stat-card',page).filter(c=>/\d/.test(c.textContent||'') || /TOTAL|USABLE|ACTIVE|FILTERED|SUPPRESSED|CONTACT|LEADS|FOUND/i.test(c.textContent||''));
    return cards;
  }
  function updateCardByLabel(labelRegex,value){
    const page=$('.page.active')||document;
    const candidates=$$('.stat,.kpi,.metric,.stat-card,.grid3 > div,.stats-grid > div,.kpi-grid > div',page);
    candidates.forEach(card=>{
      const txt=card.textContent||'';
      if(labelRegex.test(txt)){
        const n=card.querySelector('.stat-val,.kpi-val,.metric-val,.num,.value') || [...card.querySelectorAll('*')].find(x=>/^\d+$/.test(clean(x.textContent))) || card.firstElementChild;
        if(n) setText(n,value);
      }
    });
  }
  function reconcileVisibleCounts(c){
    // Dashboard / Lead Radar / Leads Workflow cards
    updateCardByLabel(/total\s*found|total\s*leads|all\s*sources/i, c.found);
    updateCardByLabel(/usable\s*leads|ready\s*to\s*work/i, c.usable);
    updateCardByLabel(/active\s*lead\s*work|active\s*cadence/i, c.active);
    updateCardByLabel(/filtered\s*\/\s*not\s*usable|filtered|not\s*usable/i, c.filtered);
    updateCardByLabel(/has\s*contact/i, c.ready.filter(l=>(l.contactMethods||[]).length || l.email || l.phone || l.linkedin).length);
    updateCardByLabel(/a\s*leads|a-score|a\s*grade/i, c.ready.filter(l=>String(l.grade||'').toUpperCase()==='A').length);

    // Sidebar badges
    $$('a,button,.nav-item,.side-link,.menu-item').forEach(el=>{
      const txt=el.textContent||'';
      const badge=el.querySelector('.badge,.pill,.count,[class*="badge"],[class*="count"]');
      if(/Lead Radar/i.test(txt) && badge) badge.textContent = c.found || c.usable;
      if(/\bLeads\b/i.test(txt) && !/Radar/i.test(txt) && badge) badge.textContent = c.usable;
    });

    // Shared text line, if present
    $$('*').forEach(el=>{
      if(el.childNodes.length===1 && /Shared GitHub Radar:/i.test(el.textContent||'')){
        el.textContent = `Shared GitHub Radar: ${c.found} found · ${c.usable} usable/loaded · ${c.filtered} filtered/not actionable · ${c.sourceCounts.publicSearches} public searches · latest ${c.sourceCounts.generatedAt || 'local'}`;
      }
    });
  }

  function sourceTabPanel(c){
    return '<div id="v80-count-truth-panel" class="panel" style="margin-bottom:14px;border:1px solid rgba(77,209,185,.45)">'
      + '<div class="panel-hd"><div><div class="panel-title">Lead Count Reconciliation</div>'
      + '<div class="panel-sub">One source of truth: GitHub radar JSON + local working leads. These numbers should match Lead Radar, Leads Workflow, and Dashboard.</div></div></div>'
      + '<div class="panel-bd"><div class="chips" style="display:flex;gap:8px;flex-wrap:wrap">'
      + `<span class="chip">Raw Found ${c.found}</span>`
      + `<span class="chip">Ready / Usable ${c.usable}</span>`
      + `<span class="chip">Filtered / Prep ${c.filtered}</span>`
      + `<span class="chip">LinkedIn Verify ${c.sourceCounts.linkedinVerify}</span>`
      + `<span class="chip">Contact Needed ${c.sourceCounts.contactNeeded}</span>`
      + `<span class="chip">Research / Backlog ${c.sourceCounts.research}</span>`
      + `<span class="chip">NPI Seeds ${c.sourceCounts.npi}</span>`
      + `<span class="chip">RSS/Public ${c.sourceCounts.rss}</span>`
      + `<span class="chip">Brave/Public Searches ${c.sourceCounts.publicSearches}</span>`
      + '</div></div></div>';
  }

  function injectTruthPanel(c){
    const page=$('.page.active')||document;
    $('#v80-count-truth-panel')?.remove();
    if(!/Lead Radar|Leads Workflow|Lead Generation Dashboard/i.test(page.textContent||'')) return;
    const anchor=$('#v68-crossref-summary',page)||$('#basin-v67-tabs',page)||$('#basin-v66-source-tabs',page)||$('.grid3,.stats-grid,.kpi-grid',page);
    if(anchor) anchor.insertAdjacentHTML('afterend',sourceTabPanel(c));
  }

  function groqKeyPresent(){
    const s=getStore();
    const api=s.api||s.BV_API||{};
    return !!(localStorage.getItem('GROQ_API_KEY') || localStorage.getItem('BASIN_GROQ_API_KEY') || api.groqKey || api.groqApiKey || (window.BV_API && window.BV_API.groqKey));
  }
  function setGroqLive(){
    try{
      if(groqKeyPresent()){
        window.BV_API=window.BV_API||{};
        window.BV_API.groqLive=true;
        window.BV_API.groqConnected=true;
        const s=getStore(); s.api=s.api||{}; s.api.groqLive=true; saveStore(s);
      }
    }catch(e){}
  }
  async function apiStatusHtml(c){
    const braveActive = c.sourceCounts.publicSearches > 0;
    const groqActive = !!(window.BV_API && (window.BV_API.groqLive || window.BV_API.groqConnected)) || groqKeyPresent();
    return '<div id="v80-api-status-panel" class="panel" style="margin-bottom:14px;border:1px solid rgba(216,148,36,.45)">'
      + '<div class="panel-hd"><div><div class="panel-title">API Status — Browser vs GitHub Runner</div>'
      + '<div class="panel-sub">Brave runs only inside GitHub Actions from your repository secret. The browser cannot read or display GitHub Secrets.</div></div></div>'
      + '<div class="panel-bd"><div class="grid3">'
      + `<div class="stat"><div class="stat-val">${braveActive?'ON':'SECRET?'}</div><div class="stat-lbl">BRAVE RUNNER</div><div class="mini-note">Latest run public searches: ${c.sourceCounts.publicSearches}. If 0, check BRAVE_API_KEY secret and rerun Actions.</div></div>`
      + `<div class="stat"><div class="stat-val">${groqActive?'ON':'OFF'}</div><div class="stat-lbl">GROQ BROWSER</div><div class="mini-note">${groqActive?'Saved browser key detected / auto-connected.':'No saved browser Groq key detected.'}</div></div>`
      + `<div class="stat"><div class="stat-val">${c.sourceCounts.aiCalls}</div><div class="stat-lbl">AI CALLS LAST RUN</div><div class="mini-note">GitHub Models / Meta Llama first, Groq optional fallback.</div></div>`
      + '</div><div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">'
      + '<button class="btn btn-primary" onclick="BasinV70ApiStatus.saveGroq()">Save / Reconnect Groq</button>'
      + '<button class="btn btn-ghost" onclick="BasinV70ApiStatus.explainBrave()">Why Brave is not in browser</button>'
      + '</div></div></div>';
  }
  async function injectApiStatus(c){
    const page=$('.page.active')||document;
    if(!/API Command Center/i.test(page.textContent||'')) return;
    $('#v80-api-status-panel')?.remove();
    const anchor=$('.panel',page)||$('.grid3,.stats-grid,.kpi-grid',page);
    if(anchor) anchor.insertAdjacentHTML('beforebegin', await apiStatusHtml(c));

    // Remove/hide stale Tavily references and stale "blocked by CORS" notes from old UI text.
    $$('*',page).forEach(el=>{
      const txt=el.textContent||'';
      if(/TAVILY API KEY|Connect Tavily|Tavily/i.test(txt)){
        const row=el.closest('label,.field,.form-row,.setting-row,.api-row,.panel') || el;
        if(!/Groq|Brave|API Status/i.test(row.textContent||'')) row.style.display='none';
      }
    });
  }

  window.BasinV70ApiStatus = {
    saveGroq(){
      const existing = localStorage.getItem('GROQ_API_KEY') || localStorage.getItem('BASIN_GROQ_API_KEY') || '';
      const key = prompt('Paste Groq API key to save in this browser only:', existing);
      if(key === null) return;
      const cleaned=clean(key,300);
      if(cleaned){
        localStorage.setItem('GROQ_API_KEY',cleaned);
        localStorage.setItem('BASIN_GROQ_API_KEY',cleaned);
        setGroqLive();
        alert('Groq key saved in this browser and marked ON.');
      } else {
        localStorage.removeItem('GROQ_API_KEY');
        localStorage.removeItem('BASIN_GROQ_API_KEY');
        alert('Groq browser key cleared.');
      }
      setTimeout(run,200);
    },
    explainBrave(){
      alert('Brave API runs only in GitHub Actions using the BRAVE_API_KEY repository secret. Browser pages cannot read GitHub Secrets for security. To verify Brave is working, check the latest workflow run and the Public Searches count in this panel.');
    },
    refresh:()=>run()
  };

  async function run(){
    setGroqLive();
    const radarJson=await latestRadarJson();
    const c=computeLocalCounts(radarJson);
    reconcileVisibleCounts(c);
    injectTruthPanel(c);
    await injectApiStatus(c);
    // expose for debugging
    window.BASIN_V70_COUNTS=c;
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{setTimeout(run,300);setTimeout(run,1800);setTimeout(run,5000);});
  else {setTimeout(run,300);setTimeout(run,1800);setTimeout(run,5000);}
  new MutationObserver(()=>{clearTimeout(window.__v80CountTimer); window.__v80CountTimer=setTimeout(run,500);}).observe(document.body,{childList:true,subtree:true});
})();



/* Basin OS V8.0 — Integrated Lead Card CRM
   Makes the full lead card the operating hub:
   - Call notes attach to the lead ID.
   - Notes show at the bottom of every full lead card.
   - Disposition + follow-up updates lead status.
   - Director handoff can be copied/printed/saved from the card.
   - Follow-up/dashboard data stays connected.
   - Count/API status fix from V8.0 remains active.
*/
(function(){
  'use strict';

  const STORE_KEY='basin_os_integrated';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const now=()=>new Date().toISOString();
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const uid=p=>`${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  function getStore(){
    let s={}; try{s=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch(e){}
    if(window.STORE && typeof window.STORE==='object') s=Object.assign({},s,window.STORE);
    s.leads=Array.isArray(s.leads)?s.leads:[];
    s.radarLeads=Array.isArray(s.radarLeads)?s.radarLeads:[];
    s.leadWorkflow=Array.isArray(s.leadWorkflow)?s.leadWorkflow:[];
    s.callNotes=Array.isArray(s.callNotes)?s.callNotes:[];
    s.followUps=Array.isArray(s.followUps)?s.followUps:[];
    s.directorHandoffs=Array.isArray(s.directorHandoffs)?s.directorHandoffs:[];
    s.activities=Array.isArray(s.activities)?s.activities:[];
    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=Array.isArray(s.leadFactory.leads)?s.leadFactory.leads:[];
    s.leadFactory.research=Array.isArray(s.leadFactory.research)?s.leadFactory.research:[];
    return s;
  }
  function saveStore(s){
    try{
      localStorage.setItem(STORE_KEY,JSON.stringify(s));
      window.STORE=Object.assign(window.STORE||{},s);
      if(typeof window.save==='function') window.save();
      if(typeof window.flushSave==='function') window.flushSave(true);
    }catch(e){console.warn('[V8.0] save failed',e);}
  }
  function leadKey(l){
    return clean([l.id,l.leadId,l.name,l.company,l.title,l.sourceUrl||l.url].filter(Boolean).join('|')).toLowerCase();
  }
  function leadMatches(l,id){
    if(!l) return false;
    return l.id===id || l.leadId===id || leadKey(l)===id;
  }
  function allLeads(){
    const s=getStore(), arr=[...s.leads,...s.radarLeads,...s.leadWorkflow,...s.leadFactory.leads,...s.leadFactory.research].filter(Boolean);
    const m=new Map();
    arr.forEach((l,i)=>{
      const k=leadKey(l)||String(i);
      if(!m.has(k)||Number(m.get(k).score||0)<Number(l.score||0)) m.set(k,l);
    });
    return [...m.values()];
  }
  function findLead(id){
    const leads=allLeads();
    return leads.find(l=>leadMatches(l,id)) || leads.find(l=>clean(l.name).toLowerCase()===clean(id).toLowerCase());
  }
  function getLeadId(l){
    return l?.id || l?.leadId || leadKey(l) || uid('lead');
  }
  function updateLeadEverywhere(id, updater){
    const s=getStore();
    const apply=l=>{
      if(leadMatches(l,id)){
        const next=updater(Object.assign({},l)) || l;
        next.updatedAt=now();
        return next;
      }
      return l;
    };
    ['leads','radarLeads','leadWorkflow'].forEach(k=>{s[k]=(s[k]||[]).map(apply);});
    s.leadFactory=s.leadFactory||{};
    ['leads','research'].forEach(k=>{s.leadFactory[k]=(s.leadFactory[k]||[]).map(apply);});
    saveStore(s);
    return s;
  }
  function contactMethods(l){
    const arr=[];
    const add=(type,value,status)=>{
      value=clean(value); if(!value) return;
      const key=(type+'|'+value).toLowerCase();
      if(arr.some(x=>(x.type+'|'+x.value).toLowerCase()===key)) return;
      arr.push({type,value,status:status||''});
    };
    (Array.isArray(l.contactMethods)?l.contactMethods:[]).forEach(c=>add(c.type||c.kind||'',c.value||c.url||c.href||'',c.status||c.confidence||''));
    add('Email',l.email,'Verified');
    add('Phone',l.phone,'Verified');
    add('LinkedIn',l.linkedin||l.linkedinUrl||l.linkedInUrl,l.linkedinVerified?'Verified':'Needs Manual Confirmation');
    return arr;
  }
  function evidence(l){
    return Array.isArray(l.evidenceTrail)?l.evidenceTrail:[];
  }
  function currentDay(l){
    return Math.max(1,Math.min(10,Number(l.day||l.workflowDay||String(l.bucket||'day1').replace(/\D/g,'')||1)));
  }
  const cadenceTitles={
    1:'Day 1 — Evidence-Based Email / LinkedIn Touch',
    2:'Day 2 — Research-Based Intro Call / Signal Reminder',
    3:'Day 3 — LinkedIn Touch / Engagement Follow-Up',
    4:'Day 4 — Credibility Angle',
    5:'Day 5 — Value Follow-Up / Overview Send',
    6:'Day 6 — Final Research-Based Call',
    7:'Day 7 — Light Touch / Objection-Aware Follow-Up',
    8:'Day 8 — Nurture Decision / Future Timing Check',
    9:'Day 9 — Final Review / Director-Call Push',
    10:'Day 10 — Longer-Term Permission Call'
  };
  function defaultFollowUpFor(l, disposition){
    const d=currentDay(l);
    if(/callback/i.test(disposition)) return new Date(Date.now()+24*60*60*1000).toISOString().slice(0,16);
    if(/interested|director/i.test(disposition)) return new Date(Date.now()+2*60*60*1000).toISOString().slice(0,16);
    if(/no answer|left voicemail|sent touch/i.test(disposition)) return new Date(Date.now()+24*60*60*1000).toISOString().slice(0,16);
    if(d>=10) return '';
    return new Date(Date.now()+24*60*60*1000).toISOString().slice(0,16);
  }
  function nextActionAfter(l, disposition){
    const d=currentDay(l);
    if(/interested|director/i.test(disposition)) return 'Prepare / send director handoff and schedule director call.';
    if(/callback/i.test(disposition)) return 'Callback due at selected follow-up time.';
    if(/not interested|remove|do not contact/i.test(disposition)) return 'Do not continue outreach unless manually reactivated.';
    if(/research/i.test(disposition)) return 'Research needed before next outreach.';
    return cadenceTitles[Math.min(10,d+1)] || cadenceTitles[10];
  }
  function noteListFor(id){
    const s=getStore();
    return s.callNotes.filter(n=>n.leadId===id || n.leadKey===id || n.leadName===findLead(id)?.name)
      .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }
  function lastNoteFor(id){ return noteListFor(id)[0] || null; }
  function followUpsFor(id){
    const s=getStore();
    return s.followUps.filter(f=>f.leadId===id || f.leadKey===id || f.leadName===findLead(id)?.name)
      .sort((a,b)=>String(a.dueAt||'').localeCompare(String(b.dueAt||'')));
  }

  function directorHandoffText(l){
    const id=getLeadId(l);
    const notes=noteListFor(id).slice(0,8);
    const contacts=contactMethods(l);
    const ev=evidence(l);
    return [
      `BASIN VENTURES — DIRECTOR HANDOFF`,
      ``,
      `Lead: ${l.name||''}`,
      `Title / Role: ${l.title||l.role||l.specialty||''}`,
      `Company / Practice: ${l.company||''}`,
      `Location: ${l.practiceLocation||l.location||''}`,
      `Grade / Score: ${(l.grade||'')} / ${(l.score||'')}`,
      `Status: ${l.status||l.queue||''}`,
      `Best Contact Route: ${l.bestContactRoute||l.contactPriority||''}`,
      `Next Action: ${l.nextAction||l.bestFirstAction||''}`,
      ``,
      `Fit Reason:`,
      `${l.fitReason||'Potential fit based on role and public evidence.'}`,
      ``,
      `Accredited-Likely Reason:`,
      `${l.accreditedLikelyReason||'Not proven. Must be verified compliantly.'}`,
      ``,
      `Source Confidence:`,
      `${l.sourceConfidence||'Not labeled'}`,
      ``,
      `Evidence Trail:`,
      ...(ev.length?ev.slice(0,8).map(e=>`- ${e.source||'Source'}: ${e.whatItProves||''} ${e.url?`(${e.url})`:''}`):['- No evidence captured.']),
      ``,
      `Contact Methods:`,
      ...(contacts.length?contacts.map(c=>`- ${c.type}: ${c.value} ${c.status?`[${c.status}]`:''}`):['- No contact route captured.']),
      ``,
      `Recent Notes:`,
      ...(notes.length?notes.map(n=>`- ${n.createdAt||''} | ${n.disposition||''} | ${n.outcome||''}: ${n.note||''}`):['- No notes yet.']),
      ``,
      `Compliance Reminders:`,
      `- Educational director call only.`,
      `- No guarantees.`,
      `- No tax advice.`,
      `- Do not imply the signal means they need the investment.`,
      `- CPA/tax professional must confirm fit.`
    ].join('\n');
  }
  function saveDirectorHandoff(id){
    const l=findLead(id); if(!l) return alert('Lead not found.');
    const s=getStore();
    const text=directorHandoffText(l);
    const handoff={id:uid('handoff'),leadId:getLeadId(l),leadKey:leadKey(l),leadName:l.name||'',createdAt:now(),status:'Saved',text};
    s.directorHandoffs.unshift(handoff);
    s.activities.unshift({id:uid('act'),type:'director_handoff_saved',leadId:getLeadId(l),leadName:l.name||'',createdAt:now(),summary:'Director handoff saved.'});
    saveStore(s);
    updateLeadEverywhere(getLeadId(l), lead=>Object.assign(lead,{handoffStatus:'Saved',directorHandoffId:handoff.id,nextAction:'Director handoff saved. Schedule or complete director call.'}));
    alert('Director handoff saved.');
  }
  function printDirectorHandoff(id){
    const l=findLead(id); if(!l) return alert('Lead not found.');
    const text=directorHandoffText(l);
    const w=window.open('','_blank');
    if(!w) return alert('Popup blocked. Allow popups to print handoff.');
    w.document.write('<!doctype html><html><head><title>Director Handoff</title><style>body{font-family:Arial,sans-serif;line-height:1.45;padding:28px;color:#111}pre{white-space:pre-wrap;font-family:Arial,sans-serif}</style></head><body><pre>'+esc(text)+'</pre><script>window.onload=()=>window.print()<\/script></body></html>');
    w.document.close();
  }
  function copyDirectorHandoff(id){
    const l=findLead(id); if(!l) return alert('Lead not found.');
    const text=directorHandoffText(l);
    navigator.clipboard?.writeText(text).then(()=>alert('Director handoff copied.')).catch(()=>prompt('Copy director handoff:',text));
  }

  function addCallNote(id){
    const l=findLead(id); if(!l) return alert('Lead not found.');
    const leadId=getLeadId(l);
    const dispositionEl=$(`#v80-disposition-${CSS.escape(leadId)}`) || $('#v80-disposition');
    const outcomeEl=$(`#v80-outcome-${CSS.escape(leadId)}`) || $('#v80-outcome');
    const followEl=$(`#v80-follow-${CSS.escape(leadId)}`) || $('#v80-follow');
    const noteEl=$(`#v80-note-${CSS.escape(leadId)}`) || $('#v80-note');
    const disposition=clean(dispositionEl?.value||'');
    const outcome=clean(outcomeEl?.value||'');
    const note=clean(noteEl?.value||'',3000);
    let dueAt=clean(followEl?.value||'');
    if(!disposition) return alert('Select a disposition before saving the note.');
    if(!note || note.length<8) return alert('Add a real note before saving.');
    if(!dueAt) dueAt=defaultFollowUpFor(l,disposition);

    const s=getStore();
    const callNote={
      id:uid('note'),
      leadId,
      leadKey:leadKey(l),
      leadName:l.name||'',
      createdAt:now(),
      day:currentDay(l),
      cadenceTitle:cadenceTitles[currentDay(l)]||'',
      disposition,
      outcome,
      dueAt,
      note,
      source:'Lead Card'
    };
    s.callNotes.unshift(callNote);
    s.activities.unshift({id:uid('act'),type:'call_note',leadId,leadName:l.name||'',createdAt:now(),summary:`${disposition}: ${note.slice(0,120)}`});

    if(dueAt && !/not interested|remove|do not contact/i.test(disposition)){
      s.followUps.unshift({id:uid('fu'),leadId,leadKey:leadKey(l),leadName:l.name||'',createdAt:now(),dueAt,disposition,outcome,note:note.slice(0,300),status:'Open',nextAction:nextActionAfter(l,disposition)});
    }

    saveStore(s);

    updateLeadEverywhere(leadId, lead=>{
      const d=currentDay(lead);
      let patch={lastNote:note,lastNoteAt:now(),lastDisposition:disposition,lastOutcome:outcome,nextFollowUpAt:dueAt,nextAction:nextActionAfter(lead,disposition)};
      if(/interested|director/i.test(disposition)){
        patch.status='Director Handoff Needed';
        patch.bucket='director-ready';
        patch.handoffStatus='Needed';
      } else if(/callback/i.test(disposition)){
        patch.status='Callback';
        patch.bucket='callback';
      } else if(/not interested|remove|do not contact/i.test(disposition)){
        patch.status='Not Interested';
        patch.bucket='notinterested';
        patch.suppressed=true;
      } else if(/research/i.test(disposition)){
        patch.status='Research Needed';
        patch.bucket='research';
        patch.associateReady=false;
      } else {
        const nd=Math.min(10,d+1);
        patch.status='Ready to Work';
        patch.day=nd;
        patch.workflowDay=nd;
        patch.bucket='day'+nd;
      }
      return Object.assign(lead,patch);
    });

    if(noteEl) noteEl.value='';
    renderLeadCrmPanel(leadId,true);
    if(window.BasinV70ApiStatus && window.BasinV70ApiStatus.refresh) window.BasinV70ApiStatus.refresh();
    alert('Call note saved and lead updated.');
  }

  function crmPanelHtml(l){
    const leadId=getLeadId(l);
    const notes=noteListFor(leadId);
    const fus=followUpsFor(leadId).filter(f=>f.status!=='Closed');
    const last=notes[0];
    const nextFu=fus[0];
    const day=currentDay(l);
    const safeId=esc(leadId);
    return '<div id="v80-lead-crm-panel" class="panel" style="margin-top:14px;border:1px solid rgba(77,209,185,.45)">'
      + '<div class="panel-hd"><div><div class="panel-title">Lead CRM Hub — Notes, Follow-Up, Handoff</div>'
      + '<div class="panel-sub">This is attached directly to the lead card. Notes saved here update cadence, follow-up, and handoff status.</div></div></div>'
      + '<div class="panel-bd">'
      + '<div class="grid3" style="margin-bottom:12px">'
      + `<div class="stat"><div class="stat-val">${esc(String(day))}</div><div class="stat-lbl">CURRENT CADENCE DAY</div><div class="mini-note">${esc(cadenceTitles[day]||'')}</div></div>`
      + `<div class="stat"><div class="stat-val">${nextFu?esc(String(nextFu.dueAt||'Due')):'NONE'}</div><div class="stat-lbl">NEXT FOLLOW-UP</div><div class="mini-note">${esc(nextFu?.nextAction || l.nextAction || l.bestFirstAction || 'No follow-up set.')}</div></div>`
      + `<div class="stat"><div class="stat-val">${esc(l.handoffStatus||'OPEN')}</div><div class="stat-lbl">HANDOFF STATUS</div><div class="mini-note">${esc(last?('Last note: '+last.disposition):'No notes yet.')}</div></div>`
      + '</div>'
      + '<div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
      + '<div>'
      + '<label class="lbl">Disposition</label>'
      + `<select id="v80-disposition-${safeId}" class="input"><option value="">Select disposition...</option><option>No Answer / Left Voicemail</option><option>Sent Email / LinkedIn Touch</option><option>Callback</option><option>Interested / Director Handoff Needed</option><option>Needs Research</option><option>Not Interested / Remove</option></select>`
      + '<label class="lbl" style="margin-top:10px">Outcome / Objection</label>'
      + `<input id="v80-outcome-${safeId}" class="input" placeholder="Outcome, objection, interest level, gatekeeper notes..." />`
      + '<label class="lbl" style="margin-top:10px">Next Follow-Up</label>'
      + `<input id="v80-follow-${safeId}" class="input" type="datetime-local" />`
      + '</div><div>'
      + '<label class="lbl">Call / Touch Note</label>'
      + `<textarea id="v80-note-${safeId}" class="input" rows="7" placeholder="What happened? What was completed? Next reason?"></textarea>`
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'
      + `<button class="btn btn-primary" onclick="BasinV71CRM.addCallNote('${safeId}')">Save Note + Update Lead</button>`
      + `<button class="btn btn-ghost" onclick="BasinV71CRM.copyHandoff('${safeId}')">Copy Director Handoff</button>`
      + `<button class="btn btn-ghost" onclick="BasinV71CRM.printHandoff('${safeId}')">Print Handoff</button>`
      + `<button class="btn btn-primary" onclick="BasinV71CRM.saveHandoff('${safeId}')">Save Handoff</button>`
      + '</div></div></div>'
      + '<div class="panel" style="margin-top:12px"><div class="panel-hd"><div><div class="panel-title">Attached Call Notes</div><div class="panel-sub">Searchable from Call Notes, but stored here on the lead record.</div></div></div><div class="panel-bd">'
      + (notes.length?notes.slice(0,10).map(n=>'<div class="record" style="grid-template-columns:1fr auto"><div><div class="rec-name">'+esc(n.disposition||'Note')+'</div><div class="rec-meta">'+esc([n.createdAt,n.cadenceTitle,n.outcome].filter(Boolean).join(' · '))+'</div><div class="mini-note">'+esc(n.note||'')+'</div></div><div class="tag gray">'+esc(n.dueAt?'FU '+n.dueAt:'No FU')+'</div></div>').join(''):'<div class="empty"><div class="empty-title">No attached notes yet.</div></div>')
      + '</div></div>'
      + '</div></div>';
  }

  function renderLeadCrmPanel(id,force){
    const l=findLead(id);
    if(!l) return;
    $('#v80-lead-crm-panel')?.remove();

    // Locate the best place: existing full lead modal/drawer/card, else current page.
    const modal=$('.modal.show,.modal.active,.drawer.open,.drawer.active,.lead-card-modal,.full-lead-card,[role="dialog"]') || document.body;
    const fullCard=[...$$('.panel,.card,.modal,.drawer,.record',modal)].reverse().find(el=>/Full Lead|Lead Card|Contact|Evidence|Fit Reason|Accredited|CRM/i.test(el.textContent||'')) || modal;
    fullCard.insertAdjacentHTML('beforeend', crmPanelHtml(l));

    // Pre-fill follow-up with a sensible default when possible.
    const leadId=getLeadId(l);
    const follow=$(`#v80-follow-${CSS.escape(leadId)}`);
    if(follow && !follow.value) follow.value=defaultFollowUpFor(l,'No Answer / Left Voicemail');
  }

  function openLeadWrapper(id){
    const l=findLead(id);
    if(!l) return alert('Lead not found.');
    // Try existing full lead card first.
    try{
      if(window.BasinLeadFactory && typeof window.BasinLeadFactory.openLead==='function' && !openLeadWrapper.__inside){
        openLeadWrapper.__inside=true;
        window.BasinLeadFactory.openLead(getLeadId(l));
        openLeadWrapper.__inside=false;
        setTimeout(()=>renderLeadCrmPanel(getLeadId(l),true),500);
        setTimeout(()=>renderLeadCrmPanel(getLeadId(l),true),1400);
        return;
      }
    }catch(e){openLeadWrapper.__inside=false;}
    // Fallback simple card.
    const html='<div class="modal show active" id="v80-fallback-modal" style="position:fixed;inset:4%;z-index:99999;overflow:auto;background:#10141d;border:1px solid #344055;border-radius:16px;padding:18px;color:white">'
      + '<button class="btn btn-danger" style="float:right" onclick="document.getElementById(\'v80-fallback-modal\').remove()">Close</button>'
      + '<h2>'+esc(l.name||'Lead')+'</h2><p>'+esc([l.title,l.company,l.location].filter(Boolean).join(' · '))+'</p>'
      + '<p><strong>Next:</strong> '+esc(l.nextAction||l.bestFirstAction||'')+'</p>'
      + '</div>';
    document.body.insertAdjacentHTML('beforeend',html);
    renderLeadCrmPanel(getLeadId(l),true);
  }

  function patchOpenButtons(){
    $$('button,a').forEach(btn=>{
      const txt=clean(btn.textContent||'');
      if(!/Open Full Lead Card|Full CRM Card|Open Lead Card/i.test(txt)) return;
      if(btn.__v80Patched) return;
      btn.__v80Patched=true;
      btn.addEventListener('click',()=>{
        setTimeout(()=>{
          // Find the closest lead name near the clicked card.
          const rec=btn.closest('.record,.card,.panel');
          const name=clean((rec?.querySelector('.rec-name')||{}).textContent||'');
          const l=name ? allLeads().find(x=>clean(x.name)===name) : null;
          if(l) renderLeadCrmPanel(getLeadId(l),true);
        },700);
      },true);
    });
  }
  function injectQuickButtonsOnLeadCards(){
    $$('.record').forEach(rec=>{
      if(rec.querySelector('.v80-open-crm')) return;
      const name=clean((rec.querySelector('.rec-name')||{}).textContent||'');
      if(!name) return;
      const l=allLeads().find(x=>clean(x.name)===name);
      if(!l) return;
      const actions=rec.querySelector('.rec-actions') || rec;
      const id=esc(getLeadId(l));
      const btn=document.createElement('button');
      btn.className='btn btn-primary btn-sm v80-open-crm';
      btn.textContent='Open CRM Hub';
      btn.onclick=()=>openLeadWrapper(id);
      actions.appendChild(btn);
      const last=lastNoteFor(getLeadId(l));
      if(last && !rec.querySelector('.v80-last-note')){
        const info=document.createElement('div');
        info.className='mini-note v80-last-note';
        info.style.marginTop='7px';
        info.innerHTML='<strong>Last Note:</strong> '+esc(last.disposition)+' — '+esc((last.note||'').slice(0,160));
        (rec.querySelector('.rec-tags')||rec).insertAdjacentElement('afterend',info);
      }
      const fus=followUpsFor(getLeadId(l)).filter(f=>f.status!=='Closed');
      if(fus[0] && !rec.querySelector('.v80-next-fu')){
        const info=document.createElement('div');
        info.className='mini-note v80-next-fu';
        info.style.marginTop='7px';
        info.innerHTML='<strong>Next Follow-Up:</strong> '+esc(fus[0].dueAt||'')+' — '+esc(fus[0].nextAction||'');
        (rec.querySelector('.v80-last-note')||rec.querySelector('.rec-tags')||rec).insertAdjacentElement('afterend',info);
      }
    });
  }

  function renderCallNotesSearchPage(){
    const page=[...$$('.page')].find(p=>/Call Notes/i.test(p.textContent||'') && p.classList.contains('active'));
    if(!page || $('#v80-call-notes-library',page)) return;
    const s=getStore();
    const html='<div id="v80-call-notes-library" class="panel" style="margin:14px 0;border:1px solid rgba(77,209,185,.35)">'
      + '<div class="panel-hd"><div><div class="panel-title">Attached Call Notes Library</div><div class="panel-sub">Notes are created from lead cards and searchable here.</div></div></div>'
      + '<div class="panel-bd"><input class="input" id="v80-note-search" placeholder="Search notes by name, disposition, outcome, text..." oninput="BasinV71CRM.renderNoteLibrary()" />'
      + '<div id="v80-note-results" style="margin-top:12px"></div></div></div>';
    const anchor=$('.panel',page)||page;
    anchor.insertAdjacentHTML('beforebegin',html);
    renderNoteLibrary();
  }
  function renderNoteLibrary(){
    const box=$('#v80-note-results'); if(!box) return;
    const q=clean($('#v80-note-search')?.value||'').toLowerCase();
    const notes=getStore().callNotes.filter(n=>!q || [n.leadName,n.disposition,n.outcome,n.note,n.cadenceTitle].join(' ').toLowerCase().includes(q));
    box.innerHTML=notes.length?notes.slice(0,100).map(n=>'<div class="record" style="grid-template-columns:1fr auto"><div><div class="rec-name">'+esc(n.leadName||'Lead')+'</div><div class="rec-meta">'+esc([n.createdAt,n.disposition,n.outcome,n.cadenceTitle].filter(Boolean).join(' · '))+'</div><div class="mini-note">'+esc(n.note||'')+'</div></div><button class="btn btn-ghost btn-sm" onclick="BasinV71CRM.openLead(\''+esc(n.leadId||n.leadKey)+'\')">Open Lead</button></div>').join(''):'<div class="empty"><div class="empty-title">No notes found.</div></div>';
  }

  function renderFollowUpDashboard(){
    const page=[...$$('.page')].find(p=>/Follow-Up Dashboard/i.test(p.textContent||'') && p.classList.contains('active'));
    if(!page || $('#v80-followup-panel',page)) return;
    const fus=getStore().followUps.filter(f=>f.status!=='Closed').sort((a,b)=>String(a.dueAt||'').localeCompare(String(b.dueAt||'')));
    const html='<div id="v80-followup-panel" class="panel" style="margin:14px 0;border:1px solid rgba(216,148,36,.45)">'
      + '<div class="panel-hd"><div><div class="panel-title">Lead Card Follow-Ups</div><div class="panel-sub">Generated automatically when notes are saved from the lead card.</div></div></div><div class="panel-bd">'
      + (fus.length?fus.slice(0,100).map(f=>'<div class="record" style="grid-template-columns:1fr auto"><div><div class="rec-name">'+esc(f.leadName||'Lead')+'</div><div class="rec-meta">'+esc([f.dueAt,f.disposition,f.outcome].filter(Boolean).join(' · '))+'</div><div class="mini-note">'+esc(f.nextAction||f.note||'')+'</div></div><button class="btn btn-primary btn-sm" onclick="BasinV71CRM.openLead(\''+esc(f.leadId||f.leadKey)+'\')">Open Lead</button></div>').join(''):'<div class="empty"><div class="empty-title">No open follow-ups.</div></div>')
      + '</div></div>';
    const anchor=$('.panel',page)||page;
    anchor.insertAdjacentHTML('beforebegin',html);
  }

  function renderDirectorHandoffsPage(){
    const page=[...$$('.page')].find(p=>/Director Handoffs/i.test(p.textContent||'') && p.classList.contains('active'));
    if(!page || $('#v80-handoff-library',page)) return;
    const hs=getStore().directorHandoffs;
    const html='<div id="v80-handoff-library" class="panel" style="margin:14px 0;border:1px solid rgba(77,209,185,.35)">'
      + '<div class="panel-hd"><div><div class="panel-title">Saved Director Handoffs</div><div class="panel-sub">Created from lead cards.</div></div></div><div class="panel-bd">'
      + (hs.length?hs.slice(0,100).map(h=>'<div class="record" style="grid-template-columns:1fr auto"><div><div class="rec-name">'+esc(h.leadName||'Lead')+'</div><div class="rec-meta">'+esc([h.createdAt,h.status].filter(Boolean).join(' · '))+'</div><pre class="mini-note" style="white-space:pre-wrap;max-height:140px;overflow:auto">'+esc((h.text||'').slice(0,1200))+'</pre></div><div class="rec-actions"><button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('+JSON.stringify(h.text||'').replace(/</g,'\\u003c')+')">Copy</button><button class="btn btn-primary btn-sm" onclick="BasinV71CRM.openLead(\''+esc(h.leadId||h.leadKey)+'\')">Open Lead</button></div></div>').join(''):'<div class="empty"><div class="empty-title">No handoffs saved yet.</div></div>')
      + '</div></div>';
    const anchor=$('.panel',page)||page;
    anchor.insertAdjacentHTML('beforebegin',html);
  }

  function run(){
    patchOpenButtons();
    injectQuickButtonsOnLeadCards();
    renderCallNotesSearchPage();
    renderFollowUpDashboard();
    renderDirectorHandoffsPage();
  }

  window.BasinV71CRM={
    openLead:openLeadWrapper,
    renderLeadCrmPanel,
    addCallNote,
    copyHandoff:copyDirectorHandoff,
    printHandoff:printDirectorHandoff,
    saveHandoff:saveDirectorHandoff,
    renderNoteLibrary,
    allLeads,
    findLead
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{setTimeout(run,500);setTimeout(run,1800);setTimeout(run,5000);});
  else {setTimeout(run,500);setTimeout(run,1800);setTimeout(run,5000);}
  new MutationObserver(()=>{clearTimeout(window.__v80Timer); window.__v80Timer=setTimeout(run,500);}).observe(document.body,{childList:true,subtree:true});
})();



/* Basin OS V8.0 — API Command Center + NPI/LinkedIn Operational Fix
   - Adds clear Brave + Groq connection/status panel.
   - Hides stale old API connection block.
   - Makes LinkedIn candidate queue visible even when source is NPI.
   - Explains Brave is GitHub runner-only; browser key is optional test only.
*/
(function(){
  'use strict';
  const STORE_KEY='basin_os_integrated';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  function getStore(){
    let s={}; try{s=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch(e){}
    if(window.STORE && typeof window.STORE==='object') s=Object.assign({},s,window.STORE);
    s.leads=Array.isArray(s.leads)?s.leads:[];
    s.radarLeads=Array.isArray(s.radarLeads)?s.radarLeads:[];
    s.leadWorkflow=Array.isArray(s.leadWorkflow)?s.leadWorkflow:[];
    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=Array.isArray(s.leadFactory.leads)?s.leadFactory.leads:[];
    s.leadFactory.research=Array.isArray(s.leadFactory.research)?s.leadFactory.research:[];
    return s;
  }
  function saveStore(s){
    try{localStorage.setItem(STORE_KEY,JSON.stringify(s)); window.STORE=Object.assign(window.STORE||{},s); if(typeof window.save==='function')window.save();}catch(e){}
  }
  async function fetchJson(path){
    try{const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'}); if(!r.ok)return null; return await r.json();}catch(e){return null;}
  }
  async function latestRadar(){
    return (await fetchJson('data/radar-leads.json')) || (await fetchJson('radar-leads.json')) || {};
  }
  function allRecords(radar){
    const s=getStore();
    return [...(radar.leads||[]),...(radar.researchCandidates||[]),...s.leads,...s.radarLeads,...s.leadWorkflow,...s.leadFactory.leads,...s.leadFactory.research].filter(Boolean);
  }
  function contacts(l){return Array.isArray(l.contactMethods)?l.contactMethods:[];}
  function hasLiCandidate(l){
    const blob=[l.queue,l.status,l.bucket,l.sourceConfidence,l.source,l.sourceType,l.sourceUrl,l.url,contacts(l).map(c=>`${c.type} ${c.value} ${c.status} ${c.confidence}`).join(' ')].join(' ');
    return /linkedin verify|needs manual linkedin|linkedin candidate|linkedin\.com\/in\//i.test(blob) && !/verified linkedin|linkedin verified/i.test(blob);
  }
  function hasNpi(l){
    return /npi|npiregistry|provider-view/i.test([l.source,l.sourceType,l.sourceUrl,l.url,l.sourceConfidence,(l.evidenceTrail||[]).map(e=>`${e.source} ${e.url}`).join(' ')].join(' '));
  }
  function hasRss(l){
    return /rss|google news|news\.google|article/i.test([l.source,l.sourceType,l.sourceUrl,l.url].join(' '));
  }
  function isReady(l){
    const b=[l.queue,l.status,l.bucket,l.stage,l.sourceConfidence,l.bestContactRoute].join(' ').toLowerCase();
    if(/linkedin verify|contact route needed|research|backlog|suppressed|not interested/.test(b)) return false;
    return /ready to work|day\d|high|medium|phone route only/.test(b);
  }
  function sourceStats(radar){
    const recs=allRecords(radar);
    const stats=radar.stats||{};
    return {
      generatedAt:radar.generatedAt||'',
      ready:Number(stats.readyToWork||radar.leads?.length||recs.filter(isReady).length||0),
      found:Math.max(Number(stats.npiCollected||0)+Number(stats.rssCollected||0), recs.length, Number(stats.readyToWork||0)+Number(stats.research||0)+Number(stats.linkedinVerify||0)+Number(stats.contactNeeded||0)),
      npi:Number(stats.npiCollected||recs.filter(hasNpi).length||0),
      rss:Number(stats.rssCollected||stats.rssReady||recs.filter(hasRss).length||0),
      linkedinVerify:Number(stats.linkedinVerify||recs.filter(hasLiCandidate).length||0),
      linkedinCandidatesFound:Number(stats.linkedinCandidatesFound||recs.filter(hasLiCandidate).length||0),
      contactNeeded:Number(stats.contactNeeded||recs.filter(l=>/contact route needed|contact-needed/i.test([l.queue,l.status,l.bucket,l.sourceConfidence].join(' '))).length||0),
      research:Number(stats.research||recs.filter(l=>/research|backlog|single source/i.test([l.queue,l.status,l.bucket,l.sourceConfidence].join(' '))).length||0),
      publicSearches:Number(stats.publicSearches||0),
      aiCalls:Number(stats.aiCalls||0),
      strictNpi:String(stats.strictNpiSecondSource||'true'),
      liPriority:String(stats.linkedInCandidatePriority||'true')
    };
  }
  function groqKeyPresent(){
    const s=getStore(), api=s.api||s.BV_API||{};
    return !!(localStorage.getItem('GROQ_API_KEY') || localStorage.getItem('BASIN_GROQ_API_KEY') || api.groqKey || api.groqApiKey || (window.BV_API&&window.BV_API.groqKey));
  }
  function groqLive(){
    if(groqKeyPresent()){
      window.BV_API=window.BV_API||{};
      window.BV_API.groqLive=true;
      window.BV_API.groqConnected=true;
      const s=getStore(); s.api=s.api||{}; s.api.groqLive=true; saveStore(s);
      return true;
    }
    return false;
  }
  function saveGroq(){
    const current=localStorage.getItem('GROQ_API_KEY')||localStorage.getItem('BASIN_GROQ_API_KEY')||'';
    const key=prompt('Paste Groq API key for this browser:',current);
    if(key===null) return;
    if(clean(key)){
      localStorage.setItem('GROQ_API_KEY',clean(key,400));
      localStorage.setItem('BASIN_GROQ_API_KEY',clean(key,400));
      groqLive();
      alert('Groq saved and connected in this browser.');
    } else {
      localStorage.removeItem('GROQ_API_KEY'); localStorage.removeItem('BASIN_GROQ_API_KEY');
      alert('Groq browser key cleared.');
    }
    setTimeout(run,250);
  }
  function saveBraveLocal(){
    const current=localStorage.getItem('BASIN_BRAVE_API_KEY_TEST_ONLY')||'';
    const key=prompt('Optional browser-only Brave key for status/testing. GitHub Actions still uses BRAVE_API_KEY secret:',current);
    if(key===null) return;
    if(clean(key)){
      localStorage.setItem('BASIN_BRAVE_API_KEY_TEST_ONLY',clean(key,400));
      alert('Optional Brave browser test key saved locally. Production runner still uses GitHub Secret BRAVE_API_KEY.');
    } else {
      localStorage.removeItem('BASIN_BRAVE_API_KEY_TEST_ONLY');
      alert('Optional Brave browser test key cleared.');
    }
    setTimeout(run,250);
  }
  async function testBraveBrowser(){
    const key=localStorage.getItem('BASIN_BRAVE_API_KEY_TEST_ONLY')||'';
    if(!key) return alert('No optional browser Brave key saved. This is not required if GitHub Actions has BRAVE_API_KEY.');
    try{
      const r=await fetch('https://api.search.brave.com/res/v1/web/search?q='+encodeURIComponent('Basin Ventures Southlake')+'&count=1&country=us',{headers:{'Accept':'application/json','X-Subscription-Token':key}});
      alert(r.ok ? 'Browser Brave test succeeded.' : 'Browser Brave test failed: '+r.status+' '+r.statusText);
    }catch(e){ alert('Browser Brave test blocked or failed: '+e.message+'. GitHub Actions may still work because it runs server-side.');}
  }
  function apiPanel(st){
    const braveRunnerOn=st.publicSearches>0;
    const groqOn=groqLive();
    const braveLocal=!!localStorage.getItem('BASIN_BRAVE_API_KEY_TEST_ONLY');
    return '<div id="v80-api-command-panel" class="panel" style="margin-bottom:16px;border:1px solid rgba(77,209,185,.55)">'
      + '<div class="panel-hd"><div><div class="panel-title">API Command Center — Live Status</div>'
      + '<div class="panel-sub">Groq is browser-side. Brave is GitHub Actions runner-side through BRAVE_API_KEY. The browser cannot read GitHub Secrets, so runner activity is verified by Public Searches.</div></div></div>'
      + '<div class="panel-bd">'
      + '<div class="grid3">'
      + `<div class="stat"><div class="stat-val">${groqOn?'ON':'OFF'}</div><div class="stat-lbl">GROQ BROWSER</div><div class="mini-note">${groqOn?'Saved browser key detected and auto-connected.':'Click Save / Reconnect Groq.'}</div></div>`
      + `<div class="stat"><div class="stat-val">${braveRunnerOn?'ON':'CHECK'}</div><div class="stat-lbl">BRAVE GITHUB RUNNER</div><div class="mini-note">Latest run public searches: ${st.publicSearches}. If zero, rerun Action or verify BRAVE_API_KEY secret.</div></div>`
      + `<div class="stat"><div class="stat-val">${st.aiCalls}</div><div class="stat-lbl">AI CALLS LAST RUN</div><div class="mini-note">GitHub Models / Meta Llama first. Groq fallback/browser summaries.</div></div>`
      + '</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">'
      + '<button class="btn btn-primary" onclick="BasinV72API.saveGroq()">Save / Reconnect Groq</button>'
      + '<button class="btn btn-primary" onclick="BasinV72API.saveBraveLocal()">Optional: Save Brave Test Key</button>'
      + '<button class="btn btn-ghost" onclick="BasinV72API.testBraveBrowser()">Test Optional Brave Browser Key</button>'
      + '<button class="btn btn-ghost" onclick="BasinV72API.explain()">Explain Secrets vs Browser</button>'
      + '</div>'
      + '<div class="mini-note" style="margin-top:12px"><strong>Runner controls:</strong> Strict NPI second source = '+esc(st.strictNpi)+' · LinkedIn candidate priority = '+esc(st.liPriority)+' · LinkedIn candidates found = '+st.linkedinCandidatesFound+'</div>'
      + '</div></div>';
  }
  function countsPanel(st){
    return '<div id="v80-source-balance-panel" class="panel" style="margin-bottom:14px;border:1px solid rgba(216,148,36,.45)">'
      + '<div class="panel-hd"><div><div class="panel-title">Source Balance / Quality Control</div>'
      + '<div class="panel-sub">NPI is now an identity seed. LinkedIn candidates should be pulled into LinkedIn Verify even if they started from NPI.</div></div></div>'
      + '<div class="panel-bd"><div class="chips" style="display:flex;gap:8px;flex-wrap:wrap">'
      + `<span class="chip">Raw Found ${st.found}</span><span class="chip">Ready ${st.ready}</span><span class="chip">NPI Seeds ${st.npi}</span><span class="chip">RSS/Public ${st.rss}</span><span class="chip">LinkedIn Verify ${st.linkedinVerify}</span><span class="chip">LinkedIn Candidates ${st.linkedinCandidatesFound}</span><span class="chip">Contact Needed ${st.contactNeeded}</span><span class="chip">Research ${st.research}</span><span class="chip">Brave Searches ${st.publicSearches}</span>`
      + '</div></div></div>';
  }
  function hideOldApiPanels(page){
    // Hide the old Groq-only connection setup so the new clear panel is not buried underneath.
    $$('.panel',page).forEach(p=>{
      const t=p.textContent||'';
      if(/Connection Setup|GROQ API KEY|Run Limits & Automation/i.test(t) && !/API Command Center — Live Status/i.test(t)){
        p.style.display='none';
      }
    });
  }
  async function run(){
    const radar=await latestRadar();
    const st=sourceStats(radar);
    const page=$('.page.active')||document;
    const isApi=/API Command Center/i.test(page.textContent||'');
    const isLead=/Lead Radar|Leads Workflow|Lead Generation Dashboard/i.test(page.textContent||'');
    $('#v80-api-command-panel')?.remove();
    $('#v80-source-balance-panel')?.remove();

    if(isApi){
      hideOldApiPanels(page);
      const anchor=$('.panel',page)||page.firstElementChild||page;
      anchor.insertAdjacentHTML('beforebegin',apiPanel(st));
    }
    if(isLead){
      const anchor=$('#v80-count-truth-panel',page)||$('#v68-crossref-summary',page)||$('#basin-v67-tabs',page)||$('.grid3,.stats-grid,.kpi-grid',page);
      if(anchor) anchor.insertAdjacentHTML('afterend',countsPanel(st));
    }

    // fix tab text counts where old filter panel undercounts LinkedIn candidate URL found from NPI
    $$('button,.chip').forEach(el=>{
      const txt=el.textContent||'';
      if(/LinkedIn Verify/i.test(txt)){
        const badge=el.querySelector('.badge,.pill,.count,[class*="badge"],[class*="count"]');
        if(badge) badge.textContent=String(st.linkedinVerify || st.linkedinCandidatesFound || 0);
      }
      if(/NPI \/ Physicians/i.test(txt)){
        const badge=el.querySelector('.badge,.pill,.count,[class*="badge"],[class*="count"]');
        if(badge) badge.textContent=String(st.npi);
      }
    });
    window.BASIN_V72_SOURCE_STATS=st;
  }
  window.BasinV72API={
    saveGroq, saveBraveLocal, testBraveBrowser,
    explain(){alert('Groq runs in your browser because the browser needs it for summaries/briefs. Brave runs in GitHub Actions because the key is stored as a GitHub Secret. Browser pages cannot read repository secrets. Public Searches > 0 proves the runner used Brave/Tavily public search.');},
    refresh:run
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{setTimeout(run,300);setTimeout(run,1700);setTimeout(run,5000);});
  else {setTimeout(run,300);setTimeout(run,1700);setTimeout(run,5000);}
  new MutationObserver(()=>{clearTimeout(window.__v80Timer); window.__v80Timer=setTimeout(run,500);}).observe(document.body,{childList:true,subtree:true});
})();



/* Basin OS V8.0 — Priority, No-Cap Philosophy
   No hard cap on found or ready leads. Sort and display by quality:
   Tier 1: Email + LinkedIn + Phone + cross-reference
   Tier 2: Digital route + phone + cross-reference
   Tier 3: Digital route + cross-reference
   Tier 4: Phone + second source
   NPI phone-only stays prep unless explicitly enabled.
*/
(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORE_KEY='basin_os_integrated';

  function getStore(){
    let s={}; try{s=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch(e){}
    if(window.STORE && typeof window.STORE==='object') s=Object.assign({},s,window.STORE);
    s.leads=Array.isArray(s.leads)?s.leads:[];
    s.radarLeads=Array.isArray(s.radarLeads)?s.radarLeads:[];
    s.leadWorkflow=Array.isArray(s.leadWorkflow)?s.leadWorkflow:[];
    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=Array.isArray(s.leadFactory.leads)?s.leadFactory.leads:[];
    s.leadFactory.research=Array.isArray(s.leadFactory.research)?s.leadFactory.research:[];
    return s;
  }
  async function fetchJson(path){
    try{const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'}); if(!r.ok)return null; return await r.json();}catch(e){return null;}
  }
  async function latestRadar(){return (await fetchJson('data/radar-leads.json')) || (await fetchJson('radar-leads.json')) || {};}
  function recs(radar){
    const s=getStore();
    return [...(radar.leads||[]),...(radar.researchCandidates||[]),...s.leads,...s.radarLeads,...s.leadWorkflow,...s.leadFactory.leads,...s.leadFactory.research].filter(Boolean);
  }
  function tier(l){
    const t=l.qualityTier||'';
    if(t) return t;
    const blob=[l.sourceConfidence,l.bestContactRoute,l.queue,l.status,(l.contactMethods||[]).map(c=>`${c.type} ${c.value} ${c.status} ${c.confidence}`).join(' ')].join(' ').toLowerCase();
    const email=/email/.test(blob), li=/linkedin/.test(blob), phone=/phone/.test(blob), cross=/cross|second source|high|medium/.test(blob);
    if(email&&li&&phone&&cross) return 'Tier 1 — Email + LinkedIn + Phone + Cross-Referenced';
    if((email||li)&&phone&&cross) return 'Tier 2 — Digital Route + Phone + Cross-Referenced';
    if((email||li)&&cross) return 'Tier 3 — Digital Route + Cross-Referenced';
    if(phone&&cross) return 'Tier 4 — Phone + Second Source';
    if(phone) return 'Tier 5 — NPI/Phone Seed Only';
    return 'Prep — Needs Contact Route';
  }
  function stats(radar){
    const a=recs(radar), st=radar.stats||{};
    return {
      ready:Number(st.readyToWork||radar.leads?.length||0),
      found:Math.max(a.length, Number(st.npiCollected||0)+Number(st.rssCollected||0)),
      t1:Number(st.tier1Ready||a.filter(l=>/^Tier 1/.test(tier(l))).length),
      t2:Number(st.tier2Ready||a.filter(l=>/^Tier 2/.test(tier(l))).length),
      t3:Number(st.tier3Ready||a.filter(l=>/^Tier 3/.test(tier(l))).length),
      t4:Number(st.tier4Ready||a.filter(l=>/^Tier 4/.test(tier(l))).length),
      li:Number(st.linkedinCandidatesFound||st.linkedinVerify||a.filter(l=>/linkedin verify|linkedin candidate|linkedin\.com\/in/i.test([l.queue,l.status,l.bucket,l.sourceConfidence,(l.contactMethods||[]).map(c=>c.value).join(' ')].join(' '))).length),
      npi:Number(st.npiCollected||a.filter(l=>/npi|npiregistry|provider-view/i.test([l.source,l.sourceType,l.sourceUrl,l.url].join(' '))).length),
      searches:Number(st.publicSearches||0),
      noCap:String(st.noReadyCap||'true'),
      npiPhoneOnlyReady:String(st.npiPhoneOnlyReady||'false')
    };
  }
  function panel(st){
    return '<div id="v80-priority-panel" class="panel" style="margin-bottom:14px;border:1px solid rgba(77,209,185,.55)">'
      + '<div class="panel-hd"><div><div class="panel-title">Priority Engine — No Hard Ready Cap</div>'
      + '<div class="panel-sub">The OS now keeps everything it finds and ranks by quality. LinkedIn/email/cross-referenced leads outrank plain NPI phone-only seeds.</div></div></div>'
      + '<div class="panel-bd"><div class="chips" style="display:flex;gap:8px;flex-wrap:wrap">'
      + `<span class="chip">No Ready Cap ${esc(st.noCap)}</span><span class="chip">Ready ${st.ready}</span><span class="chip">Tier 1 ${st.t1}</span><span class="chip">Tier 2 ${st.t2}</span><span class="chip">Tier 3 ${st.t3}</span><span class="chip">Tier 4 ${st.t4}</span><span class="chip">LinkedIn Candidates ${st.li}</span><span class="chip">NPI Seeds ${st.npi}</span><span class="chip">Brave Searches ${st.searches}</span><span class="chip">NPI Phone-Only Ready ${esc(st.npiPhoneOnlyReady)}</span>`
      + '</div><div class="mini-note" style="margin-top:10px"><strong>Rule:</strong> NPI-only is not thrown away. It is searched/enriched. If email, LinkedIn, public bio, practice website, or second-source evidence is found, it moves up. If not, it stays lower priority/prep instead of pretending to be a premium lead.</div></div></div>';
  }
  function labelCards(){
    $$('.record').forEach(card=>{
      if(card.querySelector('.v80-tier')) return;
      const name=clean((card.querySelector('.rec-name')||{}).textContent||'');
      if(!name) return;
      const radar=window.__v80Radar||{};
      const l=recs(radar).find(x=>clean(x.name)===name);
      if(!l) return;
      const target=card.querySelector('.rec-tags')||card.querySelector('.rec-meta');
      if(target) target.insertAdjacentHTML('afterend','<div class="mini-note v80-tier" style="margin-top:7px"><strong>Priority Tier:</strong> '+esc(tier(l))+'</div>');
    });
  }
  async function run(){
    const radar=await latestRadar(); window.__v80Radar=radar;
    const st=stats(radar);
    $('#v80-priority-panel')?.remove();
    const page=$('.page.active')||document;
    if(/Lead Radar|Leads Workflow|Lead Generation Dashboard/i.test(page.textContent||'')){
      const anchor=$('#v80-source-balance-panel',page)||$('#v80-count-truth-panel',page)||$('#basin-v67-tabs',page)||$('.grid3,.stats-grid,.kpi-grid',page);
      if(anchor) anchor.insertAdjacentHTML('afterend',panel(st));
    }
    labelCards();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{setTimeout(run,400);setTimeout(run,1700);setTimeout(run,5000);});
  else {setTimeout(run,400);setTimeout(run,1700);setTimeout(run,5000);}
  new MutationObserver(()=>{clearTimeout(window.__v80Timer); window.__v80Timer=setTimeout(run,500);}).observe(document.body,{childList:true,subtree:true});
})();


/* Basin OS V8.0 — Hard Fix: API Panel, Priority Sort, Storage Guard
   This patch is intentionally aggressive because older UI blocks were still winning.
*/
(function(){
  'use strict';
  const STORE_KEY='basin_os_integrated';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function safeParse(v,d){try{return JSON.parse(v)}catch(e){return d}}
  function getStore(){
    const s=safeParse(localStorage.getItem(STORE_KEY)||'{}',{});
    s.leads=Array.isArray(s.leads)?s.leads:[];
    s.leadWorkflow=Array.isArray(s.leadWorkflow)?s.leadWorkflow:[];
    s.radarLeads=Array.isArray(s.radarLeads)?s.radarLeads:[];
    s.leadFactory=s.leadFactory||{};
    s.leadFactory.leads=Array.isArray(s.leadFactory.leads)?s.leadFactory.leads:[];
    s.leadFactory.research=Array.isArray(s.leadFactory.research)?s.leadFactory.research:[];
    return s;
  }
  function slimLead(l){
    if(!l||typeof l!=='object') return l;
    const keep=['id','leadId','name','title','role','specialty','company','location','practiceLocation','source','sourceType','sourceUrl','signal','summary','contactMethods','bestContactRoute','queue','status','bucket','day','workflowDay','grade','score','sourceConfidence','qualityTier','priorityRank','crossReferenced','fitReason','accreditedLikelyReason','evidenceTrail','nextAction','bestFirstAction','lastNote','lastDisposition','nextFollowUpAt','handoffStatus'];
    const o={}; keep.forEach(k=>{if(l[k]!==undefined)o[k]=l[k];});
    if(Array.isArray(o.evidenceTrail)) o.evidenceTrail=o.evidenceTrail.slice(0,8);
    if(Array.isArray(o.contactMethods)) o.contactMethods=o.contactMethods.slice(0,8);
    return o;
  }
  function safeSaveStore(s){
    const clone=Object.assign({},s);
    clone.leads=(clone.leads||[]).slice(0,1200).map(slimLead);
    clone.leadWorkflow=(clone.leadWorkflow||[]).slice(0,1200).map(slimLead);
    clone.radarLeads=(clone.radarLeads||[]).slice(0,1200).map(slimLead);
    clone.leadFactory=clone.leadFactory||{};
    clone.leadFactory.leads=(clone.leadFactory.leads||[]).slice(0,1200).map(slimLead);
    clone.leadFactory.research=(clone.leadFactory.research||[]).slice(0,1200).map(slimLead);
    clone.callNotes=(clone.callNotes||[]).slice(0,800);
    clone.followUps=(clone.followUps||[]).slice(0,800);
    clone.directorHandoffs=(clone.directorHandoffs||[]).slice(0,300);
    try{localStorage.setItem(STORE_KEY,JSON.stringify(clone)); window.STORE=Object.assign(window.STORE||{},clone); return true;}
    catch(e){
      console.warn('[V8.0] localStorage quota cleanup running',e);
      Object.keys(localStorage).forEach(k=>{
        if(/backup|archive|old|debug|radar_raw|basin_os_integrated_bak|basin-v/i.test(k)) {
          try{localStorage.removeItem(k)}catch(_){}
        }
      });
      clone.radarLeads=(clone.radarLeads||[]).slice(0,400).map(slimLead);
      clone.leadWorkflow=(clone.leadWorkflow||[]).slice(0,400).map(slimLead);
      clone.leadFactory.research=(clone.leadFactory.research||[]).slice(0,400).map(slimLead);
      try{localStorage.setItem(STORE_KEY,JSON.stringify(clone)); window.STORE=Object.assign(window.STORE||{},clone); return true;}catch(e2){console.error('[V8.0] save still failed',e2); return false;}
    }
  }
  window.BasinV74SaveStore=safeSaveStore;

  async function fetchJson(path){
    try{const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'}); if(!r.ok)return null; return await r.json();}catch(e){return null;}
  }
  async function radar(){return (await fetchJson('data/radar-leads.json')) || (await fetchJson('radar-leads.json')) || {};}
  function allRecords(r){
    const s=getStore();
    return [...(r.leads||[]),...(r.researchCandidates||[]),...s.leads,...s.leadWorkflow,...s.radarLeads,...s.leadFactory.leads,...s.leadFactory.research].filter(Boolean);
  }
  function contacts(l){return Array.isArray(l.contactMethods)?l.contactMethods:[]}
  function tierRank(l){
    const t=String(l.qualityTier||'');
    if(/^Tier 1/i.test(t)) return 1;
    if(/^Tier 2/i.test(t)) return 2;
    if(/^Tier 3/i.test(t)) return 3;
    if(/^Tier 4/i.test(t)) return 4;
    if(/^Tier 5/i.test(t)) return 5;
    const blob=[l.grade,l.sourceConfidence,l.bestContactRoute,l.queue,l.status,l.bucket,contacts(l).map(c=>`${c.type} ${c.value} ${c.status} ${c.confidence}`).join(' ')].join(' ').toLowerCase();
    const email=/email/.test(blob), li=/linkedin/.test(blob), phone=/phone/.test(blob), cross=/cross|second source|high|medium/.test(blob);
    if(email&&li&&phone&&cross) return 1;
    if((email||li)&&phone&&cross) return 2;
    if((email||li)&&cross) return 3;
    if(phone&&cross) return 4;
    if(phone) return 5;
    return 9;
  }
  function sortScoreFromText(rec){
    const txt=rec.textContent||'';
    const grade=(txt.match(/\b([ABCDR])\b/)||[])[1]||'Z';
    const score=Number((txt.match(/score\s*[: ]\s*(\d+)/i)||[])[1]||0);
    const li=/linkedin/i.test(txt)?-8:0, email=/email/i.test(txt)?-10:0, phone=/phone/i.test(txt)?-2:0;
    const g={A:0,B:20,C:40,D:60,R:80,Z:90}[grade]??90;
    return g - score/100 + email + li + phone;
  }
  function hardSortLeadCards(){
    const page=$('.page.active')||document;
    if(!/Leads Workflow|Lead Radar|Dashboard/i.test(page.textContent||'')) return;
    // sort every group containing records; old renderer ignores priority, so force DOM order
    $$('.panel,.card,section,div',page).forEach(container=>{
      const records=$$(':scope > .record',container);
      if(records.length<2) return;
      records.sort((a,b)=>sortScoreFromText(a)-sortScoreFromText(b));
      records.forEach(r=>container.appendChild(r));
    });
  }

  function stats(r){
    const st=r.stats||{}, rec=allRecords(r);
    return {
      publicSearches:Number(st.publicSearches||0),
      aiCalls:Number(st.aiCalls||0),
      li:Number(st.linkedinCandidatesFound||st.linkedinVerify||rec.filter(l=>/linkedin\.com\/in|linkedin verify|linkedin candidate/i.test([l.queue,l.status,l.bucket,l.sourceConfidence,contacts(l).map(c=>c.value).join(' ')].join(' '))).length),
      npi:Number(st.npiCollected||rec.filter(l=>/npi|npiregistry|provider-view/i.test([l.source,l.sourceType,l.sourceUrl,l.url].join(' '))).length),
      rss:Number(st.rssCollected||st.rssReady||rec.filter(l=>/rss|google news|news\.google|article/i.test([l.source,l.sourceType,l.sourceUrl,l.url].join(' '))).length),
      ready:Number(st.readyToWork||r.leads?.length||0),
      found:Math.max(rec.length, Number(st.npiCollected||0)+Number(st.rssCollected||0), Number(st.readyToWork||0)+Number(st.research||0)+Number(st.linkedinVerify||0)+Number(st.contactNeeded||0)),
      noCap:String(st.noReadyCap||'true'),
      npiPhoneOnlyReady:String(st.npiPhoneOnlyReady||'false')
    };
  }

  function groqKey(){return localStorage.getItem('GROQ_API_KEY')||localStorage.getItem('BASIN_GROQ_API_KEY')||''}
  function markGroq(){if(groqKey()){window.BV_API=window.BV_API||{};window.BV_API.groqLive=true;window.BV_API.groqConnected=true;return true;} return false;}
  function saveGroq(){
    const key=prompt('Paste Groq API key for this browser:',groqKey());
    if(key===null) return;
    if(clean(key)){localStorage.setItem('GROQ_API_KEY',clean(key,400));localStorage.setItem('BASIN_GROQ_API_KEY',clean(key,400));markGroq();alert('Groq saved and connected.');}
    else {localStorage.removeItem('GROQ_API_KEY');localStorage.removeItem('BASIN_GROQ_API_KEY');alert('Groq cleared.');}
    setTimeout(run,200);
  }
  function saveBrave(){
    const key=prompt('Optional Brave browser test key. Production uses GitHub Secret BRAVE_API_KEY:',localStorage.getItem('BASIN_BRAVE_API_KEY_TEST_ONLY')||'');
    if(key===null) return;
    if(clean(key)){localStorage.setItem('BASIN_BRAVE_API_KEY_TEST_ONLY',clean(key,400));alert('Optional Brave browser test key saved.');}
    else {localStorage.removeItem('BASIN_BRAVE_API_KEY_TEST_ONLY');alert('Optional Brave browser key cleared.');}
    setTimeout(run,200);
  }
  async function testBrave(){
    const key=localStorage.getItem('BASIN_BRAVE_API_KEY_TEST_ONLY')||'';
    if(!key) return alert('No optional browser Brave test key saved. GitHub Actions can still use BRAVE_API_KEY secret.');
    try{
      const res=await fetch('https://api.search.brave.com/res/v1/web/search?q='+encodeURIComponent('Basin Ventures')+'&count=1',{headers:{'Accept':'application/json','X-Subscription-Token':key}});
      alert(res.ok?'Brave browser test succeeded.':'Brave browser test failed: '+res.status);
    }catch(e){alert('Browser Brave test blocked/failed. GitHub Actions may still work server-side. '+e.message);}
  }
  function apiPanel(st){
    const groq=markGroq(), brave=st.publicSearches>0, localBrave=!!localStorage.getItem('BASIN_BRAVE_API_KEY_TEST_ONLY');
    return '<div id="v80-api-panel" class="panel" style="margin:0 0 16px 0;border:2px solid rgba(77,209,185,.75);box-shadow:0 0 0 1px rgba(77,209,185,.15)">'
      + '<div class="panel-hd"><div><div class="panel-title">API Command Center — Correct Live Status</div>'
      + '<div class="panel-sub">Groq connects in this browser. Brave runs in GitHub Actions from the BRAVE_API_KEY secret; browser cannot read GitHub Secrets.</div></div></div>'
      + '<div class="panel-bd"><div class="grid3">'
      + `<div class="stat"><div class="stat-val">${groq?'ON':'OFF'}</div><div class="stat-lbl">GROQ BROWSER</div><div class="mini-note">${groq?'Key saved and auto-connected.':'Click Save / Connect Groq.'}</div></div>`
      + `<div class="stat"><div class="stat-val">${brave?'ON':'CHECK'}</div><div class="stat-lbl">BRAVE GITHUB RUNNER</div><div class="mini-note">Latest public searches: ${st.publicSearches}. ${brave?'Runner used public search.':'If this stays 0 after Action run, check BRAVE_API_KEY secret.'}</div></div>`
      + `<div class="stat"><div class="stat-val">${st.aiCalls}</div><div class="stat-lbl">AI CALLS</div><div class="mini-note">Meta Llama/GitHub Models first. Groq fallback/browser summaries.</div></div>`
      + '</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">'
      + '<button class="btn btn-primary" onclick="BasinV74.saveGroq()">Save / Connect Groq</button>'
      + '<button class="btn btn-primary" onclick="BasinV74.saveBrave()">Optional: Save Brave Test Key</button>'
      + '<button class="btn btn-ghost" onclick="BasinV74.testBrave()">Test Optional Brave Browser Key</button>'
      + '<button class="btn btn-ghost" onclick="alert(\'Brave production key belongs in GitHub → Settings → Secrets and variables → Actions → BRAVE_API_KEY. The browser cannot display that secret. Public Searches > 0 proves the runner used Brave/Tavily public search.\')">Explain Brave</button>'
      + '</div>'
      + `<div class="mini-note" style="margin-top:12px"><strong>Status:</strong> LinkedIn candidates ${st.li} · NPI seeds ${st.npi} · RSS/Public ${st.rss} · No cap ${esc(st.noCap)} · NPI phone-only ready ${esc(st.npiPhoneOnlyReady)}</div>`
      + '</div></div>';
  }
  function priorityPanel(st){
    return '<div id="v80-priority-panel" class="panel" style="margin-bottom:14px;border:2px solid rgba(216,148,36,.6)">'
      + '<div class="panel-hd"><div><div class="panel-title">Priority / Source Truth</div><div class="panel-sub">A-grade and digitally enriched leads should sort first. Plain NPI remains lower value until enriched.</div></div></div>'
      + '<div class="panel-bd"><div class="chips" style="display:flex;gap:8px;flex-wrap:wrap">'
      + `<span class="chip">Raw Found ${st.found}</span><span class="chip">Ready ${st.ready}</span><span class="chip">LinkedIn Candidates ${st.li}</span><span class="chip">NPI Seeds ${st.npi}</span><span class="chip">RSS/Public ${st.rss}</span><span class="chip">Brave Searches ${st.publicSearches}</span><span class="chip">No Cap ${esc(st.noCap)}</span>`
      + '</div><div class="mini-note" style="margin-top:10px"><strong>Operational rule:</strong> Find everything. Do not cap. Rank by quality. Email/LinkedIn/cross-referenced records come before plain NPI phone-only records.</div></div></div>';
  }
  async function run(){
    const r=await radar(), st=stats(r), page=$('.page.active')||document;
    $('#v80-api-panel')?.remove(); $('#v80-priority-panel')?.remove();
    if(/API Command Center/i.test(page.textContent||'')){
      // hide old panels hard, not just visually underneath
      $$('.panel',page).forEach(p=>{
        const t=p.textContent||'';
        if(/Connection Setup|GROQ API KEY|Run Limits & Automation|Live API Status/i.test(t) && !/Correct Live Status/i.test(t)) p.style.display='none';
      });
      const header=$('h1,h2,.page-title',page)||page.firstElementChild||page;
      header.insertAdjacentHTML('afterend',apiPanel(st));
    }
    if(/Lead Radar|Leads Workflow|Lead Generation Dashboard/i.test(page.textContent||'')){
      const anchor=$('#v80-priority-panel',page)||$('#v80-source-balance-panel',page)||$('#basin-v67-tabs',page)||$('.grid3,.stats-grid,.kpi-grid',page);
      if(anchor) anchor.insertAdjacentHTML('afterend',priorityPanel(st));
      hardSortLeadCards();
    }
    // Re-label LinkedIn badges that old UI undercounts.
    $$('button,.chip').forEach(el=>{
      if(/LinkedIn Verify/i.test(el.textContent||'')){
        const b=el.querySelector('.badge,.pill,.count,[class*="badge"],[class*="count"]');
        if(b) b.textContent=String(st.li);
      }
      if(/RSS \/ Public News/i.test(el.textContent||'')){
        const b=el.querySelector('.badge,.pill,.count,[class*="badge"],[class*="count"]');
        if(b) b.textContent=String(st.rss);
      }
    });
  }
  window.BasinV74={saveGroq,saveBrave,testBrave,run};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{setTimeout(run,250);setTimeout(run,1500);setTimeout(run,4000);});
  else {setTimeout(run,250);setTimeout(run,1500);setTimeout(run,4000);}
  new MutationObserver(()=>{clearTimeout(window.__v80Timer); window.__v80Timer=setTimeout(run,450);}).observe(document.body,{childList:true,subtree:true});
})();

/* Basin OS V8.0 safe external marker — sidebar/data repair */
