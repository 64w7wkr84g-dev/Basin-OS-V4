/* Basin OS V6 — Lead Factory / CRM Overlay
   Append-only module. It does not scrape LinkedIn or automate outreach.
   It turns raw public/source records into CRM-style lead cards with:
   - visible clickable contact methods
   - evidence trail
   - accredited-likely reason
   - first-action routing based on available contact method
   - Day 1–10 gated workflow
   - editable contacts, notes, disposition, and stage
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

  function loadStore(){
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch(e) { s = {}; }
    s.radarLeads = Array.isArray(s.radarLeads) ? s.radarLeads : [];
    s.leadWorkflow = Array.isArray(s.leadWorkflow) ? s.leadWorkflow : [];
    s.investors = Array.isArray(s.investors) ? s.investors : [];
    s.leadFactory = s.leadFactory || {};
    s.leadFactory.leads = Array.isArray(s.leadFactory.leads) ? s.leadFactory.leads : [];
    s.leadFactory.research = Array.isArray(s.leadFactory.research) ? s.leadFactory.research : [];
    s.leadFactory.phoneVerify = Array.isArray(s.leadFactory.phoneVerify) ? s.leadFactory.phoneVerify : [];
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
    t._timer=setTimeout(()=>t.style.display='none',2200);
  }

  function digits(v){ return String(v||'').replace(/\D/g,''); }
  function fmtPhone(v){
    const d = digits(v);
    if(d.length===10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    if(d.length===11 && d[0]==='1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
    return String(v||'').trim();
  }
  function isEmail(v){ return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(v||'')); }
  function isLinkedInProfile(v){ return /linkedin\.com\/in\//i.test(String(v||'')); }
  function isPhone(v){ return digits(v).length >= 10; }
  function clean(v){ return String(v??'').replace(/\s+/g,' ').trim(); }
  function fp(x){ return [x.name,x.title,x.company,x.location,x.phone,x.email,x.linkedin,x.sourceUrl,x.npi].filter(Boolean).join('|').toLowerCase().replace(/[^a-z0-9|]+/g,''); }

  const FIRST_BAD = new Set('former system expert leading regional national international global essential financial transactional advertising digital general senior assistant associate practice business tax legal medical clinical licensed professional strategic commercial corporate private public blackrock westlake bay names email patent local county state city united north south east west new old best top chief daily weekly monthly annual dear press capital'.split(' '));
  const LAST_BAD = new Set('assistant transactional advertising strategies financial dermatology partners legal clinic medical health practice group capital ventures services associates advisors consulting solutions network hospital center company firm llc inc news wire times journal county state city owner partner physician attorney doctor cpa tax expert new'.split(' '));
  function looksLikePersonName(name){
    name = clean(name);
    const parts = name.split(/\s+/);
    if(parts.length < 2 || parts.length > 3) return false;
    const first = parts[0].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
    const last = parts[parts.length-1].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
    if(FIRST_BAD.has(first) || LAST_BAD.has(last)) return false;
    if(/[0-9]/.test(name)) return false;
    if(/\b(strategies|financial|partners|legal|capital|ventures|group|llc|inc|firm|clinic|practice|medical|health|associates|company|services|advisors|consulting|solutions|bank|hospital|center|university|news|county|city|state|advertising|transactional|assistant|dermatology)\b/i.test(name)) return false;
    return /^[A-Z][a-zA-Z'.-]{1,}(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]{1,}$/.test(name);
  }

  function normalizeContact(c){
    if(typeof c === 'string') return null;
    const type = clean(c?.type || c?.kind || 'Contact');
    let value = clean(c?.value || c?.url || c?.href || '');
    if(!value) return null;
    let action = 'open';
    if(/phone/i.test(type)) { value = fmtPhone(value); action = 'call'; }
    else if(/email/i.test(type)) action = 'email';
    else if(/linkedin/i.test(type)) action = 'linkedin';
    else if(/npi/i.test(type)) action = 'open';
    return { id:c.id || uid('ct'), type, value, action, source:c.source||'', confidence:c.confidence||'Medium', createdAt:c.createdAt||now() };
  }

  function contactsFromRaw(r){
    const out = [];
    const add = (type,value,source='lead data',confidence='Medium') => {
      value = clean(value);
      if(!value) return;
      const c = normalizeContact({type,value,source,confidence});
      if(!c) return;
      const key = `${c.type}|${c.value}`.toLowerCase();
      if(!out.some(x => `${x.type}|${x.value}`.toLowerCase() === key)) out.push(c);
    };
    (Array.isArray(r.contactMethods) ? r.contactMethods : []).forEach(c => {
      const n = normalizeContact(c);
      if(n && !out.some(x => `${x.type}|${x.value}`.toLowerCase() === `${n.type}|${n.value}`.toLowerCase())) out.push(n);
    });
    add('Phone', r.phone, 'lead field', 'High');
    add('Email', r.email, 'lead field', 'High');
    add('LinkedIn Profile', r.linkedin || r.linkedinUrl || r.linkedInUrl, 'lead field', 'High');
    if(r.npi) add('NPI Profile', `https://npiregistry.cms.hhs.gov/provider-view/${r.npi}`, 'NPI Registry', 'High');
    if(r.url && /npiregistry/i.test(r.url)) add('NPI Profile', r.url, 'NPI Registry', 'High');
    if(r.sourceUrl && /npiregistry/i.test(r.sourceUrl)) add('NPI Profile', r.sourceUrl, 'NPI Registry', 'High');
    add('Company Website', r.website || r.companyUrl || r.companyURL, 'lead field', 'Low');
    if(r.url && !/npiregistry/i.test(r.url)) add('Source Link', r.url, r.source || 'source', 'Medium');
    return out;
  }

  function contactStrength(contacts){
    const hasEmail = contacts.some(c => /email/i.test(c.type) && isEmail(c.value));
    const hasLinkedIn = contacts.some(c => /linkedin/i.test(c.type) && isLinkedInProfile(c.value));
    const hasPhone = contacts.some(c => /phone/i.test(c.type) && isPhone(c.value));
    const hasNpi = contacts.some(c => /npi/i.test(c.type));
    if(hasEmail && hasLinkedIn && hasPhone) return 'A1';
    if(hasEmail || hasLinkedIn) return 'A2';
    if(hasPhone && !hasEmail && !hasLinkedIn) return hasNpi ? 'B2' : 'B1';
    return 'R';
  }

  function bestFirstAction(lead){
    const cs = lead.contactStrength;
    const hasEmail = lead.contactMethods.some(c => /email/i.test(c.type) && isEmail(c.value));
    const hasLinkedIn = lead.contactMethods.some(c => /linkedin/i.test(c.type) && isLinkedInProfile(c.value));
    const hasPhone = lead.contactMethods.some(c => /phone/i.test(c.type) && isPhone(c.value));
    if(hasEmail) return { queue:'Email First', stage:'day1', text:'Day 1: send reviewed email first, then log result, disposition, and next step.' };
    if(hasLinkedIn) return { queue:'LinkedIn First', stage:'day1', text:'Day 1: open LinkedIn/SalesNav profile manually, review profile, send manual connection/message if appropriate, then log result.' };
    if(hasPhone) return { queue:'Phone Verify', stage:'phoneverify', text:'Phone Verify: find email or direct LinkedIn before full Day 1 cadence. Call only after research or when no warm route exists.' };
    return { queue:'Research Needed', stage:'research', text:'Research: verify person, company, and usable contact route before creating Day 1 lead.' };
  }

  function fitReason(r){
    const blob = [r.title,r.role,r.specialty,r.company,r.signal,r.summary,r.source].join(' ').toLowerCase();
    const reasons = [];
    if(/orthop|surgeon|anesthes|plastic|dermatology|gastro|cardio|urology|ophthalmology|radiology|physician|doctor|md|do/.test(blob)) reasons.push('high-income medical specialty / physician proxy');
    if(/owner|founder|ceo|president|partner|principal|managing director|executive/.test(blob)) reasons.push('owner/executive decision-maker proxy');
    if(/cpa|tax|accounting/.test(blob)) reasons.push('CPA/tax-advisor referral pathway');
    if(/attorney|law|estate/.test(blob)) reasons.push('attorney/estate/referral pathway');
    if(/oil|gas|energy|mineral|royalty|idc|depletion/.test(blob)) reasons.push('oil/gas or tax-angle relevance');
    if(/sold|acquired|liquidity|exit|promoted|named|opened|launch|speaker|podcast/.test(blob)) reasons.push('timely public trigger');
    return reasons.length ? reasons.join('; ') : 'Potential high-income / business-owner profile; needs further verification.';
  }

  function accreditedReason(r, contacts){
    const blob = [r.title,r.role,r.specialty,r.company,r.signal,r.summary,r.source].join(' ').toLowerCase();
    const parts = [];
    if(/physician|surgeon|anesthes|orthop|plastic|cardio|dermatology|gastro|urology|radiology|ophthalmology|md|do/.test(blob)) parts.push('specialist physician/high-income profession proxy');
    if(/founder|owner|ceo|president|partner|principal|managing director/.test(blob)) parts.push('business owner/executive/partner proxy');
    if(/sold|acquired|exit|liquidity/.test(blob)) parts.push('possible liquidity event');
    if(/form d|sec|issuer|private placement/.test(blob)) parts.push('securities/private-placement signal');
    if(!parts.length) parts.push('accredited-likely not proven; requires manual qualification');
    return parts.join('; ') + '. Accreditation must still be verified by compliant prospect qualification/self-attestation.';
  }

  function evidenceFromRaw(r){
    const out = [];
    const add = (source,url,proves,confidence='Medium') => {
      if(!source && !url) return;
      const key = `${source}|${url}|${proves}`.toLowerCase();
      if(out.some(e => `${e.source}|${e.url}|${e.whatItProves}`.toLowerCase() === key)) return;
      out.push({ id:uid('ev'), source:source||'Source', url:url||'', whatItProves:proves||'Supporting evidence', confidence, capturedAt:now() });
    };
    if(r.npi || /npi/i.test(r.source||'') || /npiregistry/i.test(r.url||r.sourceUrl||'')) {
      add('NPI Registry', r.url || r.sourceUrl || (r.npi ? `https://npiregistry.cms.hhs.gov/provider-view/${r.npi}` : ''), 'Real provider identity, specialty, practice location, and practice phone.', 'High');
    }
    if(r.sourceUrl || r.url) add(r.source || r.sourceFeed || 'Public source', r.sourceUrl || r.url, r.signal || r.summary || 'Public signal / source evidence.', 'Medium');
    (Array.isArray(r.evidenceTrail) ? r.evidenceTrail : []).forEach(e => add(e.source, e.url, e.whatItProves || e.proves, e.confidence));
    (Array.isArray(r.publicEvidence) ? r.publicEvidence : []).forEach(e => add(e.source || 'Public evidence', e.url, e.title || e.whatItProves || 'Public evidence found.', 'Medium'));
    return out;
  }

  function normalizeLead(raw, forcedBucket){
    const contacts = contactsFromRaw(raw);
    const strength = contactStrength(contacts);
    const action = bestFirstAction({ contactMethods: contacts, contactStrength: strength });
    const bucket = forcedBucket || raw.bucket || action.stage;
    const title = clean(raw.title || raw.role || raw.specialty || 'Prospect');
    const specialty = clean(raw.specialty || (/physician|doctor|surgeon|md|do/i.test(title) ? title : ''));
    const lead = {
      id: raw.id || uid('lead'),
      name: clean(raw.name || raw.fullName || ''),
      title,
      role: clean(raw.role || title),
      specialty,
      company: clean(raw.company || raw.practice || raw.organization || ''),
      practiceLocation: clean(raw.practiceLocation || raw.location || raw.address || ''),
      location: clean(raw.location || raw.practiceLocation || ''),
      fitReason: clean(raw.fitReason || fitReason(raw)),
      accreditedLikelyReason: clean(raw.accreditedLikelyReason || accreditedReason(raw, contacts)),
      source: clean(raw.source || raw.sourceFeed || raw.sourceType || ''),
      sourceType: clean(raw.sourceType || raw.source || ''),
      sourceUrl: clean(raw.sourceUrl || raw.url || ''),
      signal: clean(raw.signal || raw.summary || ''),
      summary: clean(raw.summary || ''),
      contactMethods: contacts,
      contactStrength: strength,
      bestFirstAction: action.text,
      contactPriority: action.queue,
      queue: action.queue,
      bucket,
      stage: bucket,
      workflowDay: bucket === 'day1' ? 1 : (Number(raw.workflowDay)||0),
      grade: raw.grade || (strength==='A1'?'A':strength==='A2'?'A':strength==='B1'?'B':'R'),
      score: Number(raw.score || (strength==='A1'?92:strength==='A2'?86:strength==='B1'?74:strength==='B2'?66:40)),
      workflow: raw.workflow || {
        day: bucket === 'day1' ? 1 : 0,
        stage: bucket,
        requiredTasks: [],
        completedTasks: [],
        disposition: '',
        note: ''
      },
      notes: Array.isArray(raw.notes) ? raw.notes : [],
      evidenceTrail: evidenceFromRaw(raw),
      createdAt: raw.createdAt || raw.foundAt || now(),
      updatedAt: now()
    };
    if(!looksLikePersonName(lead.name)) lead.queue = 'Research Needed';
    return lead;
  }

  const WORKFLOW_TASKS = {
    phoneverify: ['Research email or direct LinkedIn', 'Verify workplace/practice', 'Add or correct contact method', 'Decide promote to Day 1 or keep research', 'Log note'],
    research: ['Verify real person', 'Verify workplace/company/practice', 'Find phone/email/direct LinkedIn', 'Add evidence link', 'Log note'],
    day1: ['Review evidence trail', 'Use best first contact route', 'Complete first touch manually', 'Select disposition', 'Add note'],
    day2: ['Check replies/engagement', 'Second touch through best available route', 'Update contact confidence', 'Select disposition', 'Add note'],
    day3: ['Manual LinkedIn/profile review if available', 'Alternate-channel touch', 'Record objection/no answer/result', 'Select disposition', 'Add note'],
    day4: ['Call or direct contact attempt if appropriate', 'Use trigger-specific opener', 'Record result', 'Select disposition', 'Add note'],
    day5: ['Value/tax-angle follow-up if compliant', 'Review whether still viable', 'Record result', 'Select disposition', 'Add note'],
    day6: ['Final major contact attempt', 'Ask for director call only if appropriate', 'Record result', 'Select disposition', 'Add note'],
    day7: ['Personalized note or short follow-up', 'Avoid repeated generic message', 'Record result', 'Select disposition', 'Add note'],
    day8: ['Light touch / nurture decision', 'Check contact accuracy', 'Record result', 'Select disposition', 'Add note'],
    day9: ['Final qualification review', 'Decide continue/pause/close', 'Record reason', 'Select disposition', 'Add note'],
    day10: ['Close-loop or breakup message', 'Final disposition', 'Document final reason', 'Select disposition', 'Add note']
  };

  function rebuildLeadFactory(){
    const s = loadStore();
    const allRaw = []
      .concat((s.radarLeads||[]).map(x => ({...x, __bucket:x.bucket})))
      .concat((s.leadWorkflow||[]).map(x => ({...x, __bucket:x.bucket})))
      .concat((s.investors||[]).map(x => ({...x, __bucket:'investor'})));

    const seen = new Set();
    const leads = [];
    const research = [];
    const phoneVerify = [];

    allRaw.forEach(r => {
      if(!r || !r.name) return;
      const lead = normalizeLead(r, r.__bucket);
      const key = fp(lead);
      if(!key || seen.has(key)) return;
      seen.add(key);
      if(lead.queue === 'Phone Verify' || lead.bucket === 'phoneverify') phoneVerify.push(lead);
      else if(lead.queue === 'Research Needed' || lead.bucket === 'research' || lead.bucket === 'needsresearch') research.push(lead);
      else leads.push(lead);
    });

    s.leadFactory.leads = leads.sort((a,b)=>b.score-a.score);
    s.leadFactory.phoneVerify = phoneVerify.sort((a,b)=>b.score-a.score);
    s.leadFactory.research = research.sort((a,b)=>b.score-a.score);
    s.leadFactory.lastRebuiltAt = now();

    // Keep old workflow usable: active leads only in day1 unless already in workflow.
    s.leadWorkflow = leads.map(l => ({...l, bucket:l.bucket && /^day/.test(l.bucket) ? l.bucket : 'day1', workflowDay:l.workflowDay||1}))
      .concat(phoneVerify.map(l => ({...l,bucket:'phoneverify',workflowDay:0})))
      .concat(research.map(l => ({...l,bucket:'needsresearch',workflowDay:0})));

    s.radarLeads = leads.concat(phoneVerify);
    saveStore(s);
    return s.leadFactory;
  }

  function routeHref(c){
    const v = c.value || '';
    if(c.action==='email' || /email/i.test(c.type)) return `mailto:${v}`;
    if(c.action==='call' || /phone/i.test(c.type)) return `tel:${digits(v)}`;
    if(/^https?:\/\//i.test(v)) return v;
    return '';
  }
  function contactRow(c, leadId){
    const href = routeHref(c);
    const action = href ? `<a class="lf-btn primary small" ${/^http/.test(href)?'target="_blank"':''} href="${attr(href)}">${/phone/i.test(c.type)?'Call':/email/i.test(c.type)?'Email':'Open'}</a>` : '';
    return `<div class="lf-contact-row">
      <div><b>${esc(c.type)}</b><span>${esc(c.value)}</span><em>${esc(c.confidence||'')} ${c.source?`· ${esc(c.source)}`:''}</em></div>
      <div class="lf-actions">${action}<button class="lf-btn small" data-copy="${attr(c.value)}" onclick="BasinLeadFactory.copy(this)">Copy</button><button class="lf-btn small" onclick="BasinLeadFactory.editContact('${attr(leadId)}','${attr(c.id)}')">Edit</button></div>
    </div>`;
  }
  function evidenceRow(e){
    return `<div class="lf-evidence-row">
      <div><b>${esc(e.source)}</b><span>${esc(e.whatItProves)}</span><em>${esc(e.confidence||'')}</em></div>
      ${e.url?`<a class="lf-btn small primary" target="_blank" href="${attr(e.url)}">Open Source</a>`:''}
    </div>`;
  }

  function tasksFor(lead){
    const stage = lead.bucket || lead.stage || 'research';
    return WORKFLOW_TASKS[stage] || WORKFLOW_TASKS.day1;
  }
  function taskChecked(lead, i){
    return !!(lead.workflow && Array.isArray(lead.workflow.completedTasks) && lead.workflow.completedTasks[i]);
  }
  function canAdvance(lead){
    const tasks = tasksFor(lead);
    const done = tasks.every((_,i)=>taskChecked(lead,i));
    const disp = clean(lead.workflow?.disposition);
    const note = clean(lead.workflow?.note);
    return done && disp && note;
  }

  function leadCard(lead){
    const cm = lead.contactMethods || [];
    const primary = cm.filter(c => /email|phone|linkedin/i.test(c.type)).slice(0,3);
    return `<div class="lf-card" data-lead-id="${attr(lead.id)}">
      <div class="lf-score">${esc(lead.grade||'R')}<small>${esc(lead.score||0)}</small></div>
      <div class="lf-card-main">
        <div class="lf-name">${esc(lead.name)}</div>
        <div class="lf-meta">${esc(lead.title)} ${lead.company?'· '+esc(lead.company):''} ${lead.practiceLocation||lead.location?'· '+esc(lead.practiceLocation||lead.location):''}</div>
        <div class="lf-tags"><span>${esc(lead.queue)}</span><span>${esc(lead.contactStrength)}</span><span>${esc(lead.source||'Source')}</span></div>
        <div class="lf-why"><b>Why fit:</b> ${esc(lead.fitReason)}</div>
        <div class="lf-why"><b>Accredited-likely:</b> ${esc(lead.accreditedLikelyReason)}</div>
        <div class="lf-mini-contacts">${primary.map(c => `<button class="lf-chip" onclick="BasinLeadFactory.openLead('${attr(lead.id)}')">${esc(c.type)}: ${esc(c.value)}</button>`).join('') || '<span class="lf-missing">No contact method yet</span>'}</div>
      </div>
      <div class="lf-card-actions">
        <button class="lf-btn primary" onclick="BasinLeadFactory.openLead('${attr(lead.id)}')">Open Lead Card</button>
        <button class="lf-btn" onclick="BasinLeadFactory.quickAdvance('${attr(lead.id)}')">${canAdvance(lead)?'Move Next':'Locked'}</button>
      </div>
    </div>`;
  }

  function dashboardHtml(){
    const s = loadStore();
    const lf = s.leadFactory || rebuildLeadFactory();
    const queues = [
      ['leads','Associate Ready',lf.leads||[]],
      ['phoneVerify','Phone Verify',lf.phoneVerify||[]],
      ['research','Research Needed',lf.research||[]]
    ];
    return `<div class="lf-shell">
      <div class="lf-head">
        <div>
          <h2>Basin Lead Factory</h2>
          <p>Candidate → verified prospect → associate-ready lead. No LinkedIn scraping; manual links and public evidence only.</p>
        </div>
        <div class="lf-actions">
          <button class="lf-btn" onclick="BasinLeadFactory.rebuild()">Rebuild from Current Data</button>
          <button class="lf-btn primary" onclick="BasinLeadFactory.addManualLead()">+ Manual Lead</button>
          <button class="lf-btn danger" onclick="BasinLeadFactory.close()">Close</button>
        </div>
      </div>
      <div class="lf-stats">
        <div><b>${(lf.leads||[]).length}</b><span>Associate Ready</span></div>
        <div><b>${(lf.phoneVerify||[]).length}</b><span>Phone Verify</span></div>
        <div><b>${(lf.research||[]).length}</b><span>Research</span></div>
        <div><b>${[].concat(lf.leads||[],lf.phoneVerify||[],lf.research||[]).filter(l=>l.contactMethods?.some(c=>/email/i.test(c.type))).length}</b><span>With Email</span></div>
        <div><b>${[].concat(lf.leads||[],lf.phoneVerify||[],lf.research||[]).filter(l=>l.contactMethods?.some(c=>/linkedin/i.test(c.type))).length}</b><span>With LinkedIn</span></div>
      </div>
      <div class="lf-tabs">${queues.map((q,i)=>`<button class="lf-tab ${i===0?'active':''}" onclick="BasinLeadFactory.showQueue('${q[0]}',this)">${q[1]} <b>${q[2].length}</b></button>`).join('')}</div>
      <div id="lf-queue-body">${(lf.leads||[]).map(leadCard).join('') || '<div class="lf-empty">No associate-ready leads yet. Use Phone Verify / Research to add email or direct LinkedIn before Day 1.</div>'}</div>
    </div>`;
  }

  function findLead(s,id){
    const pools = [s.leadFactory.leads,s.leadFactory.phoneVerify,s.leadFactory.research,s.leadWorkflow,s.radarLeads,s.investors];
    for(const p of pools){
      const l = (p||[]).find(x => x.id === id);
      if(l) return l;
    }
    return null;
  }
  function updateLead(id, updater){
    const s = loadStore();
    const pools = [s.leadFactory.leads,s.leadFactory.phoneVerify,s.leadFactory.research,s.leadWorkflow,s.radarLeads,s.investors];
    pools.forEach(p => (p||[]).forEach((l,i)=>{ if(l.id===id) p[i] = updater({...l}); }));
    saveStore(s);
  }

  function leadDetailHtml(lead){
    const tasks = tasksFor(lead);
    return `<div class="lf-detail">
      <div class="lf-detail-head">
        <div>
          <h2>${esc(lead.name)}</h2>
          <p>${esc(lead.title)} ${lead.company?'· '+esc(lead.company):''}</p>
          <div class="lf-tags"><span>${esc(lead.queue)}</span><span>${esc(lead.contactStrength)}</span><span>${esc(lead.grade)} ${esc(lead.score)}</span></div>
        </div>
        <button class="lf-btn danger" onclick="BasinLeadFactory.closeDetail()">Close</button>
      </div>
      <div class="lf-detail-grid">
        <section>
          <h3>Lead Overview</h3>
          <label>Name<input id="lf-edit-name" value="${attr(lead.name)}"></label>
          <label>Title / Role / Specialty<input id="lf-edit-title" value="${attr(lead.title)}"></label>
          <label>Company / Practice<input id="lf-edit-company" value="${attr(lead.company)}"></label>
          <label>Practice Location<input id="lf-edit-location" value="${attr(lead.practiceLocation||lead.location)}"></label>
          <label>Why They Fit<textarea id="lf-edit-fit">${esc(lead.fitReason)}</textarea></label>
          <label>Accredited-Likely Reason<textarea id="lf-edit-accredited">${esc(lead.accreditedLikelyReason)}</textarea></label>
          <button class="lf-btn primary" onclick="BasinLeadFactory.saveOverview('${attr(lead.id)}')">Save Overview</button>
        </section>
        <section>
          <h3>Contact Methods</h3>
          <div id="lf-contact-list">${(lead.contactMethods||[]).map(c => contactRow(c,lead.id)).join('') || '<div class="lf-empty">No contact methods yet.</div>'}</div>
          <div class="lf-add-row">
            <select id="lf-new-contact-type"><option>Phone</option><option>Email</option><option>LinkedIn Profile</option><option>NPI Profile</option><option>Company Website</option><option>Source Link</option></select>
            <input id="lf-new-contact-value" placeholder="Phone, email, or URL">
            <button class="lf-btn primary" onclick="BasinLeadFactory.addContact('${attr(lead.id)}')">Add Contact</button>
          </div>
          <h3>Evidence Trail</h3>
          <div>${(lead.evidenceTrail||[]).map(evidenceRow).join('') || '<div class="lf-empty">No evidence yet.</div>'}</div>
          <div class="lf-add-row">
            <input id="lf-new-evidence-source" placeholder="Source, e.g. NPI / SEC / Practice site">
            <input id="lf-new-evidence-url" placeholder="URL">
            <input id="lf-new-evidence-proves" placeholder="What this proves">
            <button class="lf-btn primary" onclick="BasinLeadFactory.addEvidence('${attr(lead.id)}')">Add Evidence</button>
          </div>
        </section>
        <section>
          <h3>Workflow Gate</h3>
          <div class="lf-callout"><b>Best first action:</b> ${esc(lead.bestFirstAction)}</div>
          ${tasks.map((t,i)=>`<label class="lf-check"><input type="checkbox" ${taskChecked(lead,i)?'checked':''} onchange="BasinLeadFactory.toggleTask('${attr(lead.id)}',${i},this.checked)"> ${esc(t)}</label>`).join('')}
          <label>Disposition<select id="lf-disposition" onchange="BasinLeadFactory.setDisposition('${attr(lead.id)}',this.value)">
            ${['','Callback','Future','Research','Not Interested','Pipeline','Director Ready','Completed'].map(o=>`<option ${lead.workflow?.disposition===o?'selected':''}>${esc(o||'Select disposition...')}</option>`).join('')}
          </select></label>
          <label>Required Note<textarea id="lf-workflow-note" onblur="BasinLeadFactory.setWorkflowNote('${attr(lead.id)}',this.value)">${esc(lead.workflow?.note||'')}</textarea></label>
          <button class="lf-btn primary" onclick="BasinLeadFactory.quickAdvance('${attr(lead.id)}')">${canAdvance(lead)?'Move to Next Stage':'Locked Until Complete'}</button>
        </section>
        <section>
          <h3>Notes</h3>
          <div id="lf-note-list">${(lead.notes||[]).map(n=>`<div class="lf-note"><b>${esc(n.createdAt||'')}</b><p>${esc(n.text||n.note||'')}</p></div>`).join('') || '<div class="lf-empty">No notes yet.</div>'}</div>
          <label>Add Note<textarea id="lf-new-note" placeholder="Call result, correction, source update, objection, etc."></textarea></label>
          <button class="lf-btn primary" onclick="BasinLeadFactory.addNote('${attr(lead.id)}')">Add Note</button>
        </section>
      </div>
    </div>`;
  }

  function openOverlay(){
    let o = $('#lf-overlay');
    if(!o){
      o = document.createElement('div');
      o.id='lf-overlay';
      o.innerHTML='<div id="lf-overlay-inner"></div>';
      document.body.appendChild(o);
    }
    $('#lf-overlay-inner').innerHTML = dashboardHtml();
    o.style.display='block';
  }
  function closeOverlay(){ const o=$('#lf-overlay'); if(o) o.style.display='none'; }
  function openDetail(lead){
    let d = $('#lf-detail-overlay');
    if(!d){
      d = document.createElement('div');
      d.id='lf-detail-overlay';
      d.innerHTML='<div id="lf-detail-inner"></div>';
      document.body.appendChild(d);
    }
    $('#lf-detail-inner').innerHTML = leadDetailHtml(lead);
    d.style.display='block';
  }

  function addCss(){
    if($('#lf-css')) return;
    const s = document.createElement('style');
    s.id='lf-css';
    s.textContent = `
#lf-launch{position:fixed;right:18px;top:88px;z-index:99990;background:#d89424;color:#061018;border:0;border-radius:999px;padding:11px 15px;font:900 13px system-ui;box-shadow:0 16px 50px rgba(0,0,0,.35)}
#lf-overlay,#lf-detail-overlay{display:none;position:fixed;inset:0;z-index:99991;background:rgba(2,5,10,.78);backdrop-filter:blur(8px);overflow:auto;padding:28px}
#lf-detail-overlay{z-index:99992}
#lf-overlay-inner,#lf-detail-inner{max-width:1320px;margin:0 auto}
.lf-shell,.lf-detail{background:#0e1623;border:1px solid #2a3546;border-radius:22px;box-shadow:0 30px 100px rgba(0,0,0,.55);color:#eef4ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden}
.lf-head,.lf-detail-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:22px 24px;border-bottom:1px solid #263246;background:linear-gradient(135deg,#111c2c,#0a111c)}
.lf-head h2,.lf-detail h2{margin:0;font-size:28px}.lf-head p,.lf-detail p{color:#aab6c8;margin:6px 0 0}
.lf-actions{display:flex;gap:8px;flex-wrap:wrap}.lf-btn{border:1px solid #39475c;background:#202a3a;color:#edf4ff;border-radius:10px;padding:9px 11px;font-weight:800;cursor:pointer;text-decoration:none}.lf-btn.primary{background:#d89424;color:#071018;border-color:#d89424}.lf-btn.danger{background:#3b1820;color:#ff9aa9;border-color:#74303b}.lf-btn.small{padding:6px 8px;font-size:11px}
.lf-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;padding:16px 24px}.lf-stats div{background:#101b2a;border:1px solid #283548;border-radius:14px;padding:14px}.lf-stats b{display:block;color:#d89424;font-size:30px}.lf-stats span{font-size:11px;color:#9ca9bd;text-transform:uppercase;letter-spacing:.08em}
.lf-tabs{display:flex;gap:8px;padding:0 24px 16px}.lf-tab{background:#1d2736;color:#d4deef;border:1px solid #344258;border-radius:999px;padding:9px 12px;font-weight:800}.lf-tab.active{background:#d89424;color:#071018;border-color:#d89424}
#lf-queue-body{padding:0 24px 24px}.lf-card{display:grid;grid-template-columns:58px 1fr auto;gap:14px;align-items:start;border:1px solid #2a3648;background:#111b2a;border-radius:18px;padding:14px;margin:10px 0}.lf-score{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;border:2px solid #d89424;color:#d89424;font-weight:900;font-size:20px}.lf-score small{display:block;font-size:10px;color:#b6c3d7}.lf-name{font-size:18px;font-weight:900}.lf-meta{color:#aeb9ca;margin-top:3px}.lf-tags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.lf-tags span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;background:#223049;border:1px solid #3a4d6f;border-radius:999px;padding:5px 7px;color:#bcd0ee}.lf-why{font-size:12px;color:#c4cedd;margin-top:4px}.lf-mini-contacts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.lf-chip{background:#0d2a26;color:#9ff5dc;border:1px solid #205f52;border-radius:8px;padding:5px 7px;font-size:11px}.lf-missing{color:#ff8da0}.lf-empty{padding:24px;color:#9eabbf;text-align:center}
.lf-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px}.lf-detail section{background:#111b2a;border:1px solid #2a3648;border-radius:18px;padding:16px}.lf-detail h3{margin:0 0 12px}.lf-detail label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#9ca9bd;margin:10px 0}.lf-detail input,.lf-detail textarea,.lf-detail select,.lf-add-row input,.lf-add-row select{width:100%;box-sizing:border-box;background:#0b111b;border:1px solid #344258;border-radius:10px;color:#eef4ff;padding:10px;margin-top:5px}.lf-detail textarea{min-height:78px}.lf-add-row{display:grid;grid-template-columns:1fr 1.3fr auto;gap:8px;align-items:end;margin:10px 0}.lf-contact-row,.lf-evidence-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid #27364a;background:#0c1522;border-radius:12px;padding:10px;margin:8px 0}.lf-contact-row b,.lf-evidence-row b{display:block}.lf-contact-row span,.lf-evidence-row span{display:block;color:#c5d0df;word-break:break-word}.lf-contact-row em,.lf-evidence-row em{display:block;color:#8190a6;font-size:11px}.lf-check{display:flex!important;align-items:flex-start;gap:8px;text-transform:none!important;letter-spacing:0!important;font-size:13px!important;color:#d5deec!important}.lf-callout{background:#102923;border:1px solid #285e51;color:#cffce8;padding:10px;border-radius:12px}.lf-note{background:#0b111b;border:1px solid #2a3648;border-radius:12px;padding:10px;margin:8px 0}
@media(max-width:900px){.lf-card{grid-template-columns:52px 1fr}.lf-card-actions{grid-column:1/3}.lf-detail-grid{grid-template-columns:1fr}.lf-stats{grid-template-columns:repeat(2,1fr)}#lf-overlay,#lf-detail-overlay{padding:12px}.lf-add-row{grid-template-columns:1fr}.lf-contact-row,.lf-evidence-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function addLaunchButton(){
    if($('#lf-launch')) return;
    const b = document.createElement('button');
    b.id='lf-launch';
    b.textContent='Lead Factory';
    b.onclick=() => { rebuildLeadFactory(); openOverlay(); };
    document.body.appendChild(b);
  }

  window.BasinLeadFactory = {
    open(){ rebuildLeadFactory(); openOverlay(); },
    close: closeOverlay,
    closeDetail(){ const d=$('#lf-detail-overlay'); if(d) d.style.display='none'; },
    rebuild(){ const lf=rebuildLeadFactory(); openOverlay(); toast(`Lead Factory rebuilt: ${(lf.leads||[]).length} ready, ${(lf.phoneVerify||[]).length} phone verify, ${(lf.research||[]).length} research`); },
    showQueue(key,btn){
      $$('.lf-tab').forEach(x=>x.classList.remove('active')); if(btn) btn.classList.add('active');
      const s=loadStore(), lf=s.leadFactory||rebuildLeadFactory();
      const arr = key==='phoneVerify'?lf.phoneVerify:key==='research'?lf.research:lf.leads;
      $('#lf-queue-body').innerHTML = (arr||[]).map(leadCard).join('') || '<div class="lf-empty">No records in this queue.</div>';
    },
    openLead(id){ const s=loadStore(); const lead=findLead(s,id); if(lead) openDetail(normalizeLead(lead,lead.bucket)); },
    copy(btn){ const v=btn?.dataset?.copy||''; if(!v) return; navigator.clipboard?.writeText(v).then(()=>toast('Copied')).catch(()=>prompt('Copy',v)); },
    editContact(leadId, contactId){
      const s=loadStore(), lead=findLead(s,leadId); if(!lead) return;
      const c=(lead.contactMethods||[]).find(x=>x.id===contactId); if(!c) return;
      const val=prompt(`Edit ${c.type}`, c.value); if(val===null) return;
      updateLead(leadId,l=>{ l.contactMethods=(l.contactMethods||[]).map(x=>x.id===contactId?{...x,value:val,updatedAt:now()}:x); return normalizeLead(l,l.bucket); });
      this.openLead(leadId); toast('Contact updated');
    },
    addContact(leadId){
      const type=$('#lf-new-contact-type')?.value||'Phone', value=$('#lf-new-contact-value')?.value||'';
      if(!value.trim()) return toast('Enter a contact value');
      updateLead(leadId,l=>{ l.contactMethods=contactsFromRaw(l); l.contactMethods.push(normalizeContact({type,value,source:'manual associate entry',confidence:'Manual'})); return normalizeLead(l,l.bucket); });
      this.openLead(leadId); toast('Contact added');
    },
    addEvidence(leadId){
      const source=$('#lf-new-evidence-source')?.value||'', url=$('#lf-new-evidence-url')?.value||'', proves=$('#lf-new-evidence-proves')?.value||'';
      if(!source && !url && !proves) return toast('Enter evidence details');
      updateLead(leadId,l=>{ l.evidenceTrail=evidenceFromRaw(l); l.evidenceTrail.push({id:uid('ev'),source,url,whatItProves:proves,confidence:'Manual',capturedAt:now()}); return l; });
      this.openLead(leadId); toast('Evidence added');
    },
    saveOverview(leadId){
      updateLead(leadId,l=>{
        l.name=$('#lf-edit-name')?.value||l.name;
        l.title=$('#lf-edit-title')?.value||l.title;
        l.company=$('#lf-edit-company')?.value||l.company;
        l.practiceLocation=$('#lf-edit-location')?.value||l.practiceLocation||l.location;
        l.location=l.practiceLocation;
        l.fitReason=$('#lf-edit-fit')?.value||l.fitReason;
        l.accreditedLikelyReason=$('#lf-edit-accredited')?.value||l.accreditedLikelyReason;
        l.updatedAt=now();
        return normalizeLead(l,l.bucket);
      });
      this.openLead(leadId); toast('Overview saved');
    },
    toggleTask(leadId,i,checked){ updateLead(leadId,l=>{ l.workflow=l.workflow||{}; l.workflow.completedTasks=Array.isArray(l.workflow.completedTasks)?l.workflow.completedTasks:[]; l.workflow.completedTasks[i]=!!checked; return l; }); },
    setDisposition(leadId,value){ updateLead(leadId,l=>{ l.workflow=l.workflow||{}; l.workflow.disposition=value; return l; }); },
    setWorkflowNote(leadId,value){ updateLead(leadId,l=>{ l.workflow=l.workflow||{}; l.workflow.note=value; return l; }); },
    addNote(leadId){
      const txt=$('#lf-new-note')?.value||''; if(!txt.trim()) return toast('Enter a note');
      updateLead(leadId,l=>{ l.notes=Array.isArray(l.notes)?l.notes:[]; l.notes.unshift({id:uid('note'),text:txt,createdAt:now()}); l.workflow=l.workflow||{}; l.workflow.note=txt; return l; });
      this.openLead(leadId); toast('Note added');
    },
    quickAdvance(leadId){
      const s=loadStore(), lead=normalizeLead(findLead(s,leadId)||{}, undefined);
      if(!canAdvance(lead)) return toast('Locked: complete tasks, disposition, and note first');
      const stages = ['phoneverify','research','day1','day2','day3','day4','day5','day6','day7','day8','day9','day10'];
      let idx = stages.indexOf(lead.bucket||lead.stage||'day1');
      let next = stages[Math.min(stages.length-1, idx+1)];
      // Phone/research promotes to day1 only if warm contact exists.
      if((lead.bucket==='phoneverify'||lead.bucket==='research'||lead.bucket==='needsresearch') && !['A1','A2'].includes(lead.contactStrength)){
        return toast('Needs email or direct LinkedIn before Day 1');
      }
      updateLead(leadId,l=>{ l.bucket=next; l.stage=next; l.workflowDay=next.startsWith('day')?Number(next.replace('day','')):0; l.workflow={day:l.workflowDay,stage:next,completedTasks:[],disposition:'',note:''}; return normalizeLead(l,next); });
      toast(`Moved to ${next.toUpperCase()}`); this.rebuild();
    },
    addManualLead(){
      const name=prompt('Lead full name'); if(!name) return;
      const title=prompt('Title / role / specialty')||'';
      const company=prompt('Company / practice')||'';
      const phone=prompt('Phone, email, or LinkedIn URL')||'';
      const raw={id:uid('manual'),name,title,company,source:'Manual Entry'};
      if(isEmail(phone)) raw.email=phone; else if(isPhone(phone)) raw.phone=phone; else if(phone) raw.linkedin=phone;
      const s=loadStore(); s.radarLeads.unshift(normalizeLead(raw)); saveStore(s); this.rebuild();
    }
  };

  function enhanceExistingCards(){
    // Adds "Open Lead Card" to visible old workflow/radar cards where names match.
    const s=loadStore();
    const all = [].concat(s.leadFactory.leads||[],s.leadFactory.phoneVerify||[],s.leadFactory.research||[],s.leadWorkflow||[],s.radarLeads||[]);
    $$('.record,.radar-lead,.lead-work-card').forEach(card=>{
      if(card.querySelector('.lf-open-inline')) return;
      const nameEl = card.querySelector('.rec-name,.radar-name,.name');
      if(!nameEl) return;
      const name = clean(nameEl.textContent);
      const lead = all.find(l=>clean(l.name).toLowerCase()===name.toLowerCase());
      if(!lead) return;
      const btn=document.createElement('button');
      btn.className='lf-btn primary small lf-open-inline';
      btn.textContent='Open Full Lead Card';
      btn.onclick=()=>BasinLeadFactory.openLead(lead.id);
      (card.querySelector('.rec-actions,.radar-actions')||card).appendChild(btn);
    });
  }

  function init(){
    addCss();
    addLaunchButton();
    try { rebuildLeadFactory(); } catch(e) { console.warn('Lead Factory rebuild skipped', e); }
    enhanceExistingCards();
    const mo = new MutationObserver(()=>{ clearTimeout(window.__lfEnhanceTimer); window.__lfEnhanceTimer=setTimeout(enhanceExistingCards,250); });
    mo.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();