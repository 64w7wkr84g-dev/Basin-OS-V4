#!/usr/bin/env node
'use strict';

/**
 * Basin OS V6.9 Cross-Referenced Lead Engine
 *
 * Key fix:
 * - NPI is treated as an identity seed, not the whole lead.
 * - Runner attempts second-source enrichment before promoting records.
 * - Candidate LinkedIn URLs are stored only from public search results.
 * - No LinkedIn/SalesNav page reading, scraping, profile viewing, or auto-messaging.
 */

const fs = require('fs');
const path = require('path');

const MAX_NPI_PER_QUERY = Number(process.env.NPI_MAX_PER_QUERY || 10);
const MAX_RSS_PER_FEED = Number(process.env.RADAR_MAX_RSS_PER_FEED || 14);
const ENRICH_NPI_LIMIT = Number(process.env.ENRICH_NPI_LIMIT || 120);
const MAX_READY_TOTAL = Number(process.env.MAX_READY_TOTAL || 175);
const MAX_READY_NPI_PHONE_ONLY = Number(process.env.MAX_READY_NPI_PHONE_ONLY || 50);
const NPI_BACKLOG_LIMIT = Number(process.env.NPI_BACKLOG_LIMIT || 500);
const MAX_PUBLIC_SEARCHES = Number(process.env.PUBLIC_SEARCH_MAX || 120);
const MAX_AI = Number(process.env.AI_MAX_LEAD_ANALYSES || 80);

const BRAVE_KEY = process.env.BRAVE_API_KEY || '';
const TAVILY_KEY = process.env.TAVILY_API_KEY || '';
const GH_TOKEN = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || '';
const GH_ENDPOINT = process.env.GITHUB_MODELS_ENDPOINT || 'https://models.github.ai/inference/chat/completions';
const GH_MODEL = process.env.GITHUB_MODELS_MODEL || 'meta/Llama-4-Scout-17B-16E-Instruct';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const out = p => path.join(process.cwd(), p);
const now = () => new Date().toISOString();
const uid = p => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function clean(s, max=2000){
  return String(s || '')
    .replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\s+/g,' ').trim().slice(0,max);
}
const digits = v => String(v || '').replace(/\D/g,'');
function fmtPhone(v){ const d=digits(v); if(d.length===10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`; if(d.length===11 && d[0]==='1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`; return clean(v,60); }
function isEmail(v){ return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(v || '')); }
function isPhone(v){ return digits(v).length >= 10; }
function isLinkedIn(v){ return /linkedin\.com\/in\//i.test(String(v || '')); }
function extractEmail(text){ const m=String(text||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return m && !/example|noreply|no-reply|domain\.com|email\.com/i.test(m[0]) ? m[0] : ''; }
function extractPhone(text){ const m=String(text||'').match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/); return m ? fmtPhone(m[0]) : ''; }
function extractLinkedIn(text){ const m=String(text||'').match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9%_\-./]+/i); return m ? m[0].replace(/[),.]+$/,'') : ''; }

const badFirst = new Set('former system expert leading regional national global essential financial transactional advertising digital general senior assistant associate practice business tax legal medical clinical public names email local county state city new old best top chief daily annual press'.split(' '));
const badLast = new Set('assistant transactional advertising strategies financial dermatology partners legal clinic medical health practice group capital ventures services associates advisors consulting solutions hospital center company firm llc inc news city owner partner physician attorney doctor cpa tax expert'.split(' '));
function personOk(name){
  name=clean(name,100); const parts=name.split(/\s+/);
  if(parts.length<2 || parts.length>3) return false;
  const f=parts[0].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
  const l=parts[parts.length-1].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
  if(badFirst.has(f) || badLast.has(l) || /[0-9]/.test(name)) return false;
  if(/\b(llc|inc|company|group|partners|practice|clinic|hospital|center|services|solutions|news|advertising|capital|ventures)\b/i.test(name)) return false;
  return /^[A-Z][a-zA-Z'.-]{1,}(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]{1,}$/.test(name);
}
function extractName(title, body=''){
  const t=clean(`${title} ${body}`,1800);
  const patterns=[
    /\bDr\.?\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/,
    /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+),?\s+(?:MD|DO|DMD|DDS|CPA|JD|Esq\.?|MBA|PhD)\b/,
    /\b(?:CEO|Founder|Owner|President|Partner|Attorney|CPA|Surgeon|Physician|Doctor|Principal|Managing Director)\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/,
    /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\s+(?:joins|joined|named|appointed|promoted|launches|opens|founds|acquires|sold|speaks|interviewed)\b/i
  ];
  for(const p of patterns){ const m=t.match(p); if(m && personOk(m[1])) return clean(m[1],100); }
  return '';
}

function addContact(arr,type,value,source='source',confidence='Medium',extra={}){
  value=clean(value,700); if(!value) return;
  if(/phone/i.test(type)) value=fmtPhone(value);
  const key=`${type}|${value}`.toLowerCase();
  if(arr.some(c => `${c.type}|${c.value}`.toLowerCase() === key)) return;
  arr.push({id:uid('ct'),type,value,source,confidence,createdAt:now(),...extra});
}
function addEvidence(arr,source,url,what,confidence='Medium'){
  source=clean(source,160); url=clean(url,700); what=clean(what,800);
  if(!source && !url && !what) return;
  const key=`${source}|${url}|${what}`.toLowerCase();
  if(arr.some(e => `${e.source}|${e.url}|${e.whatItProves}`.toLowerCase() === key)) return;
  arr.push({id:uid('ev'),source:source||'Source',url:url||'',whatItProves:what||'Supporting evidence.',confidence,capturedAt:now()});
}
function sourceFamily(s){
  s=String(s||'').toLowerCase();
  if(/npi|npiregistry|provider-view/.test(s)) return 'npi';
  if(/linkedin/.test(s)) return 'linkedin';
  if(/rss|google news|news\.google|article|public source/.test(s)) return 'rss';
  if(/brave|tavily|public search|search result/.test(s)) return 'search';
  if(/website|practice|company|official|bio|profile|provider page/.test(s)) return 'website';
  if(/manual/.test(s)) return 'manual';
  return s ? 'other' : 'unknown';
}
function evidenceFamilies(ev){ return new Set((ev||[]).map(e => sourceFamily(`${e.source} ${e.url} ${e.whatItProves}`)).filter(x=>x && x!=='unknown')); }
function hasSecondSource(ev){
  const fam = evidenceFamilies(ev);
  return fam.size >= 2 || (fam.has('npi') && (fam.has('website') || fam.has('search') || fam.has('rss') || fam.has('linkedin') || fam.has('manual')));
}
function hasEmailContact(c){ return (c||[]).some(x => /email/i.test(x.type) && isEmail(x.value)); }
function hasVerifiedLinkedIn(c){ return (c||[]).some(x => /linkedin/i.test(x.type) && isLinkedIn(x.value) && (/verified|manual verified/i.test(`${x.status||''} ${x.confidence||''}`) || x.verified)); }
function hasLinkedInCandidate(c){ return (c||[]).some(x => /linkedin/i.test(x.type) && isLinkedIn(x.value) && !(/verified|manual verified/i.test(`${x.status||''} ${x.confidence||''}`) || x.verified)); }
function hasReliablePhone(c,ev){
  const evBlob=(ev||[]).map(e=>`${e.source} ${e.url} ${e.whatItProves} ${e.confidence}`).join(' ').toLowerCase();
  return (c||[]).some(x => /phone/i.test(x.type) && isPhone(x.value) && /npi|npiregistry|provider-view|practice|official|company website|manual|verified|high/.test(`${x.source} ${x.confidence} ${evBlob}`.toLowerCase()));
}
function bestRoute(c,ev){
  if(hasEmailContact(c)) return 'Email';
  if(hasVerifiedLinkedIn(c)) return 'LinkedIn';
  if(hasReliablePhone(c,ev)) return 'Phone';
  return '';
}
function confidenceFor(c,ev){
  if(hasEmailContact(c) && hasSecondSource(ev)) return 'High — Email + cross-referenced evidence';
  if(hasVerifiedLinkedIn(c) && hasSecondSource(ev)) return 'High — LinkedIn verified + cross-referenced evidence';
  if(hasLinkedInCandidate(c)) return 'Needs Manual LinkedIn Confirmation';
  if(hasReliablePhone(c,ev) && hasSecondSource(ev)) return 'Medium — Reliable phone + second source';
  if(hasReliablePhone(c,ev)) return 'Phone Route Only — single-source evidence';
  if(hasSecondSource(ev)) return 'Contact route needed — cross-referenced but no route';
  return 'Single Source — needs enrichment';
}
function queueFor(c,ev){
  if(hasLinkedInCandidate(c) && !hasEmailContact(c) && !hasReliablePhone(c,ev)) return {queue:'LinkedIn Verify',bucket:'linkedin-verify',first:'Open candidate LinkedIn URL manually, confirm/reject match, then paste profile snapshot to enrich CRM.'};
  const route = bestRoute(c,ev);
  if(route) return {queue:'Ready to Work',bucket:'day1',first: route==='Email' ? 'Day 1: send/queue evidence-based email first, then follow cadence.' : route==='LinkedIn' ? 'Day 1: use verified LinkedIn route for evidence-based touch, then follow cadence.' : 'Day 1: review evidence. Phone is the best route; use call step according to cadence.'};
  if(hasSecondSource(ev)) return {queue:'Contact Route Needed',bucket:'contact-needed',first:'Find a reliable email, confirmed LinkedIn URL, or reliable phone tied to evidence before outreach.'};
  return {queue:'Research Needed',bucket:'research',first:'Confirm real person, role/company, fit, and source evidence before outreach.'};
}

function fitReason(raw){
  const b=[raw.title,raw.role,raw.specialty,raw.company,raw.signal,raw.summary,raw.source].join(' ').toLowerCase(), r=[];
  if(/physician|surgeon|doctor|md|do|anesth|orthop|plastic|cardio|derm|urology|gastro|radiology|ophthalmology/.test(b)) r.push('high-income medical profession proxy');
  if(/owner|founder|ceo|president|partner|principal|executive|managing director/.test(b)) r.push('owner/executive/partner proxy');
  if(/cpa|tax|accounting/.test(b)) r.push('CPA/tax referral pathway');
  if(/attorney|law|estate/.test(b)) r.push('law/estate/referral pathway');
  if(/oil|gas|energy|mineral|royalty|idc/.test(b)) r.push('oil/gas or tax-angle relevance');
  if(/sold|acquired|liquidity|exit|promoted|opened|launch|speaker|podcast|appointed|named/.test(b)) r.push('timely public trigger');
  return r.length ? r.join('; ') : 'Potential fit based on professional role and public evidence.';
}
function accreditedReason(raw){
  const b=[raw.title,raw.role,raw.specialty,raw.company,raw.signal,raw.summary,raw.source].join(' ').toLowerCase(), r=[];
  if(/physician|surgeon|doctor|md|do|anesth|orthop|plastic|cardio|derm|urology|gastro|radiology|ophthalmology/.test(b)) r.push('specialist physician/high-income proxy');
  if(/owner|founder|ceo|president|partner|principal|executive/.test(b)) r.push('owner/executive/partner proxy');
  if(/sold|acquired|liquidity|exit/.test(b)) r.push('possible liquidity event');
  if(!r.length) r.push('accredited-likely not proven by public data');
  return r.join('; ') + '. Accreditation must still be verified through compliant qualification/self-attestation.';
}
function score(raw,c,ev){
  let s=40, b=[raw.title,raw.role,raw.specialty,raw.company,raw.signal,raw.summary,raw.source].join(' ').toLowerCase();
  if(personOk(raw.name)) s+=10;
  if(hasEmailContact(c)) s+=22;
  if(hasVerifiedLinkedIn(c)) s+=20;
  if(hasLinkedInCandidate(c)) s+=11;
  if(hasReliablePhone(c,ev)) s+=8;
  if(hasSecondSource(ev)) s+=12;
  if(/physician|surgeon|doctor|md|do|anesth|orthop|plastic|cardio|derm|urology|gastro|radiology|ophthalmology/.test(b)) s+=16;
  if(/owner|founder|ceo|president|partner|principal|executive/.test(b)) s+=14;
  if(/sold|acquired|liquidity|exit|promoted|opened|launch|speaker|podcast/.test(b)) s+=10;
  return Math.min(98,Math.max(1,Math.round(s)));
}
function makeLead(raw,c,ev){
  const q=queueFor(c,ev), sc=score(raw,c,ev), route=bestRoute(c,ev), fam=[...evidenceFamilies(ev)];
  return {
    id: raw.id || uid('lead'),
    name: clean(raw.name,100),
    title: clean(raw.title||raw.role||raw.specialty||'Prospect',180),
    role: clean(raw.role||raw.title||'',180),
    specialty: clean(raw.specialty||'',160),
    company: clean(raw.company||raw.practice||'',160),
    practiceLocation: clean(raw.practiceLocation||raw.location||raw.address||'',220),
    location: clean(raw.location||raw.practiceLocation||'',220),
    source: clean(raw.source||'',120),
    sourceType: clean(raw.sourceType||'',80),
    sourceUrl: clean(raw.sourceUrl||raw.url||'',700),
    signal: clean(raw.signal||'',600),
    summary: clean(raw.summary||'',1000),
    contactMethods:c,
    contactPriority:q.queue,
    bestContactRoute:route,
    queue:q.queue,
    bestFirstAction:q.first,
    nextAction:q.first,
    sourceConfidence:confidenceFor(c,ev),
    sourceFamilies:fam,
    crossReferenced:hasSecondSource(ev),
    fitReason:raw.fitReason||fitReason(raw),
    accreditedLikelyReason:raw.accreditedLikelyReason||accreditedReason(raw),
    evidenceTrail:ev,
    grade: sc>=85?'A':sc>=70?'B':sc>=55?'C':'R',
    score: sc,
    associateReady:q.queue==='Ready to Work',
    workflowDay:q.queue==='Ready to Work'?1:0,
    day:q.queue==='Ready to Work'?1:0,
    bucket:q.bucket,
    stage:q.bucket,
    status:q.queue,
    workflow:{day:q.queue==='Ready to Work'?1:0,stage:q.bucket,completedTasks:[],disposition:'',note:''},
    notes:[],
    foundAt:now(),
    updatedAt:now()
  };
}
function dedupe(arr){
  const seen=new Set(), out=[];
  for(const l of (arr||[]).sort((a,b)=>(b.score||0)-(a.score||0))){
    const k=[l.name,l.company,l.title,l.sourceUrl,(l.contactMethods||[]).map(c=>c.value).join('|')].join('|').toLowerCase();
    if(seen.has(k)) continue; seen.add(k); out.push(l);
  }
  return out;
}

async function fetchText(url, timeout=12000){
  const ac=new AbortController(), tm=setTimeout(()=>ac.abort(),timeout);
  try{
    const r=await fetch(url,{signal:ac.signal,redirect:'follow',headers:{'User-Agent':'BasinOSLeadFactory/6.8'}});
    const text=await r.text();
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return {text,url:r.url||url};
  } finally { clearTimeout(tm); }
}
async function fetchJson(url){ return JSON.parse((await fetchText(url)).text); }

let searchCount=0;
async function braveSearch(q){
  if(!BRAVE_KEY) return [];
  const url='https://api.search.brave.com/res/v1/web/search?q='+encodeURIComponent(q)+'&count=5&country=us&search_lang=en&text_decorations=false';
  const r=await fetch(url,{headers:{'Accept':'application/json','X-Subscription-Token':BRAVE_KEY,'User-Agent':'BasinOSLeadFactory/6.8'}});
  if(!r.ok) throw new Error(`Brave ${r.status}`);
  const j=await r.json();
  return (j.web?.results||[]).map(x=>({title:x.title||'',url:x.url||'',description:x.description||'',source:'Brave Search'}));
}
async function tavilySearch(q){
  if(!TAVILY_KEY) return [];
  const r=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:TAVILY_KEY,query:q,search_depth:'basic',max_results:5,include_answer:false})});
  if(!r.ok) throw new Error(`Tavily ${r.status}`);
  const j=await r.json();
  return (j.results||[]).map(x=>({title:x.title||'',url:x.url||'',description:x.content||'',source:'Tavily Search'}));
}
async function publicSearch(q){
  if(searchCount>=MAX_PUBLIC_SEARCHES) return [];
  searchCount++;
  try{ const r=await braveSearch(q); if(r.length) return r; }catch(e){}
  try{ const r=await tavilySearch(q); if(r.length) return r; }catch(e){}
  return [];
}
async function enrichPublic(raw,c,ev){
  if(!raw.name || !personOk(raw.name)) return;
  const queries=[
    `"${raw.name}" "${raw.company||raw.specialty||raw.title||''}" "${raw.location||''}" LinkedIn`,
    `"${raw.name}" "${raw.company||raw.specialty||raw.title||''}" "${raw.location||''}" bio`,
    `"${raw.name}" "${raw.company||raw.specialty||raw.title||''}" email phone`
  ];
  for(const q of queries){
    const results=await publicSearch(q);
    for(const res of results){
      const blob=`${res.title} ${res.url} ${res.description}`;
      const li=extractLinkedIn(blob);
      if(li){
        addContact(c,'LinkedIn Candidate URL',li,res.source,'Needs Manual Confirmation',{status:'Needs Manual Confirmation',verified:false});
        addEvidence(ev,'LinkedIn Candidate from Public Search',res.url,'Possible LinkedIn profile URL. Needs manual confirmation.','Needs Manual Confirmation');
        continue;
      }
      const email=extractEmail(blob), phone=extractPhone(blob);
      if(email) addContact(c,'Email',email,res.source,'Medium');
      if(phone) addContact(c,'Phone',phone,res.source,'Medium');
      if(/^https?:\/\//i.test(res.url) && !/google|facebook|instagram|x\.com|twitter|linkedin\.com/i.test(res.url)){
        const siteType=/bio|profile|physician|doctor|provider|practice|company|about/i.test(blob) ? 'Practice/Company Website' : 'Public Search Result';
        addContact(c,'Company Website',res.url,res.source,'Medium');
        addEvidence(ev,siteType,res.url,res.title || 'Public profile/company result.','Medium');
      }
    }
    await sleep(40);
  }
}

const NPI_SPECIALTIES=['Orthopaedic Surgery','Gastroenterology','Dermatology','Ophthalmology','Plastic Surgery','Urology','Anesthesiology','Radiology','Cardiovascular Disease','Oral & Maxillofacial Surgery'];
const NPI_GEOS=[['TX','Dallas'],['TX','Houston'],['TX','Austin'],['TX','Fort Worth'],['TX','San Antonio'],['TX','Midland'],['OK','Oklahoma City'],['CO','Denver'],['AZ','Phoenix'],['FL','Miami']];
function npiUrl(spec,[state,city]){ return `https://npiregistry.cms.hhs.gov/api/?version=2.1&enumeration_type=NPI-1&taxonomy_description=${encodeURIComponent(spec)}&state=${state}&city=${encodeURIComponent(city)}&limit=${MAX_NPI_PER_QUERY}`; }
function npiName(b){ if(!b?.first_name || !b?.last_name) return ''; const fix=s=>s[0].toUpperCase()+s.slice(1).toLowerCase(); return `${fix(b.first_name)} ${fix(b.last_name)}`; }
function addr(addrs){ return (addrs||[]).find(a=>a.address_purpose==='LOCATION'&&a.telephone_number)||(addrs||[]).find(a=>a.telephone_number)||(addrs||[]).find(a=>a.address_purpose==='LOCATION')||(addrs||[])[0]||{}; }

async function collectNpi(){
  const leads=[], rejected=[]; let seen=0;
  for(const geo of NPI_GEOS){
    for(const spec of NPI_SPECIALTIES){
      try{
        const json=await fetchJson(npiUrl(spec,geo));
        for(const rec of (json.results||[])){
          const b=rec.basic||{}, a=addr(rec.addresses), name=npiName(b), phone=fmtPhone(a.telephone_number||''), npi=rec.number||rec.npi||'';
          if(!personOk(name)){ rejected.push({name,reason:'NPI missing valid person'}); continue; }
          const tax=(rec.taxonomies||[]).find(t=>t.primary)||(rec.taxonomies||[])[0]||{};
          const title=`${tax.desc||spec}${b.credential?' · '+b.credential:''}`;
          const link=npi?`https://npiregistry.cms.hhs.gov/provider-view/${npi}`:'';
          const c=[], ev=[];
          if(phone) addContact(c,'Phone',phone,'NPI Registry practice address','High');
          if(link) addContact(c,'NPI Profile',link,'NPI Registry','High');
          addEvidence(ev,'NPI Registry',link,'Real provider identity, specialty, practice phone, and location.','High');
          const raw={name,title,specialty:tax.desc||spec,company:b.organization_name||'',location:[a.city,a.state].filter(Boolean).join(', '),source:'NPI Registry',sourceType:'npi',sourceUrl:link,signal:`NPI verified provider: ${name}`,summary:`${name} is listed in the federal NPI Registry as ${title}.`,fitReason:'Specialist physician/high-income profession proxy; NPI verifies identity and practice phone but should be cross-referenced.',accreditedLikelyReason:'Specialist physician/high-income proxy. Accreditation still requires compliant qualification/self-attestation.'};
          if(seen < ENRICH_NPI_LIMIT) await enrichPublic(raw,c,ev);
          seen++;
          leads.push(makeLead(raw,c,ev));
        }
      }catch(e){ rejected.push({source:`NPI ${spec} ${geo.join(',')}`,reason:String(e.message||e)}); }
    }
  }
  return {leads,rejected};
}

const RSS_FEEDS=[
  ['Physician practice openings','("Dr." OR "MD" OR "DO") ("opens" OR "launches" OR "joins" OR "named" OR "promoted") ("medical practice" OR orthopedic OR dermatology OR gastroenterology OR urology) USA 2025 OR 2026'],
  ['Founder liquidity events','("founder" OR "CEO" OR owner) ("sold" OR acquired OR exits OR acquisition) USA 2025 OR 2026'],
  ['CPA tax partner signals','("CPA" OR "tax partner") ("named partner" OR promoted OR joins OR speaker) "business owners" USA 2025 OR 2026'],
  ['Attorney estate/tax partner signals','("attorney" OR "law partner") ("named partner" OR promoted OR joins OR speaker) ("estate planning" OR tax OR business owner) USA 2025 OR 2026'],
  ['Energy executive signals','("oil and gas" OR energy OR mineral OR royalty) ("CEO" OR president OR founder OR owner) ("named" OR appointed OR promoted OR joins) USA 2025 OR 2026']
];
function rssUrl(q){ return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`; }
function parseRss(xml){ return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]).map(b=>({title:clean((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1],300),link:clean((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1],800),description:clean((b.match(/<description[^>]*>([\s\S]*?)<\/description>/i)||[])[1],1000),pubDate:clean((b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)||[])[1],140)})).filter(x=>x.title||x.link); }
async function collectRss(){
  const leads=[], errors=[];
  for(const [feed,q] of RSS_FEEDS){
    try{
      const xml=(await fetchText(rssUrl(q))).text;
      for(const item of parseRss(xml).slice(0,MAX_RSS_PER_FEED)){
        const text=`${item.title} ${item.description}`;
        const name=extractName(item.title,item.description);
        const c=[], ev=[];
        addContact(c,'Email',extractEmail(text),'Google RSS/article text','Medium');
        addContact(c,'LinkedIn Candidate URL',extractLinkedIn(text),'Google RSS/article text','Needs Manual Confirmation',{status:'Needs Manual Confirmation'});
        addContact(c,'Phone',extractPhone(text),'Google RSS/article text','Medium');
        addEvidence(ev,'Google RSS',item.link,item.title,'Medium');
        const raw={name:name||item.title,title:'Public Source Signal',company:'',location:'USA',source:'Google RSS',sourceType:'rss',sourceUrl:item.link,signal:item.title,summary:item.description,fitReason:'Public trigger signal; source should be reviewed before outreach.',accreditedLikelyReason:'Accredited-likely not proven; requires further qualification.'};
        if(name) await enrichPublic(raw,c,ev);
        leads.push(makeLead(raw,c,ev));
      }
    }catch(e){ errors.push({source:feed,reason:String(e.message||e)}); }
  }
  return {leads,errors};
}

async function aiEvaluate(lead){
  const system='You are Basin Ventures lead qualification AI. Return only compact JSON: {"scoreAdjustment":number,"fitReason":"...","accreditedLikelyReason":"...","bestFirstAction":"...","opener":"...","likelyObjection":"...","riskNote":"..."}. Never claim accreditation is proven.';
  const user=JSON.stringify({name:lead.name,title:lead.title,company:lead.company,location:lead.location,contacts:lead.contactMethods,evidence:lead.evidenceTrail,sourceConfidence:lead.sourceConfidence,signal:lead.signal,summary:lead.summary});
  const messages=[{role:'system',content:system},{role:'user',content:user}];
  async function githubModels(){
    if(!GH_TOKEN) throw new Error('No GitHub token');
    const r=await fetch(GH_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/vnd.github+json','Authorization':`Bearer ${GH_TOKEN}`},body:JSON.stringify({model:GH_MODEL,messages,temperature:0.1,max_tokens:700,response_format:{type:'json_object'}})});
    const txt=await r.text(); if(!r.ok) throw new Error(`GitHub Models ${r.status}: ${txt.slice(0,160)}`);
    const j=JSON.parse(txt); return JSON.parse(j.choices?.[0]?.message?.content||'{}');
  }
  async function groq(){
    if(!GROQ_KEY) throw new Error('No Groq key');
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_KEY}`},body:JSON.stringify({model:GROQ_MODEL,messages,temperature:0.1,max_tokens:700,response_format:{type:'json_object'}})});
    const txt=await r.text(); if(!r.ok) throw new Error(`Groq ${r.status}: ${txt.slice(0,160)}`);
    const j=JSON.parse(txt); return JSON.parse(j.choices?.[0]?.message?.content||'{}');
  }
  try{ return {provider:'GitHub Models / Meta Llama',json:await githubModels()}; }
  catch(e1){ try{return {provider:'Groq fallback',json:await groq(),githubError:String(e1.message||e1)};}catch(e2){return {provider:'rules-only',json:null,error:String(e1.message||e1),groqError:String(e2.message||e2)};} }
}
async function aiEnrich(leads){
  const out=[], errors=[]; let calls=0;
  for(const lead of leads){
    if(calls>=MAX_AI){ out.push(lead); continue; }
    const r=await aiEvaluate(lead); calls++;
    if(r.json){
      const adj=Math.max(-12,Math.min(12,Number(r.json.scoreAdjustment||0)));
      lead.score=Math.max(1,Math.min(98,Math.round((lead.score||60)+adj)));
      lead.grade=lead.score>=85?'A':lead.score>=70?'B':lead.score>=55?'C':'R';
      if(r.json.fitReason) lead.fitReason=clean(r.json.fitReason,700);
      if(r.json.accreditedLikelyReason) lead.accreditedLikelyReason=clean(r.json.accreditedLikelyReason,700);
      if(r.json.bestFirstAction) lead.bestFirstAction=clean(r.json.bestFirstAction,700);
      lead.opener=clean(r.json.opener||'',700);
      lead.likelyObjection=clean(r.json.likelyObjection||'',400);
      lead.riskNote=clean(r.json.riskNote||'',400);
      lead.aiProvider=r.provider;
      lead.aiAnalyzedAt=now();
    } else {
      lead.aiProvider='rules-only';
      lead.aiError=r.error||'AI unavailable';
      errors.push({lead:lead.name,error:r.error||r.groqError||'AI unavailable'});
    }
    out.push(lead);
  }
  return {leads:out,errors,calls};
}

(async function main(){
  const npi=await collectNpi();
  const rss=await collectRss();

  let allCandidates=dedupe([...npi.leads,...rss.leads]).filter(l => personOk(l.name) || l.bucket !== 'day1');
  const aiTarget=allCandidates.filter(l => l.associateReady || l.bucket==='linkedin-verify' || l.bucket==='contact-needed').slice(0,MAX_AI);
  const ai=await aiEnrich(aiTarget);
  const aiMap=new Map(ai.leads.map(l=>[l.id,l]));
  allCandidates=allCandidates.map(l=>aiMap.get(l.id)||l);

  let ready=dedupe(allCandidates.filter(l => l.associateReady && l.queue==='Ready to Work'));
  const linkedinVerify=dedupe(allCandidates.filter(l => l.bucket==='linkedin-verify' || l.queue==='LinkedIn Verify'));
  const contactNeeded=dedupe(allCandidates.filter(l => l.bucket==='contact-needed' || l.queue==='Contact Route Needed'));
  let research=dedupe(allCandidates.filter(l => l.bucket==='research' || l.queue==='Research Needed'));

  const readyStrong=ready.filter(l => l.crossReferenced || hasEmailContact(l.contactMethods) || hasVerifiedLinkedIn(l.contactMethods));
  const readyNpiPhoneOnly=ready.filter(l => !readyStrong.includes(l) && /npi/i.test(`${l.source} ${l.sourceType} ${l.sourceConfidence}`));
  const readyOther=ready.filter(l => !readyStrong.includes(l) && !readyNpiPhoneOnly.includes(l));
  const balancedPhoneOnly=readyNpiPhoneOnly.slice(0,MAX_READY_NPI_PHONE_ONLY);
  const npiBacklog=readyNpiPhoneOnly.slice(MAX_READY_NPI_PHONE_ONLY,NPI_BACKLOG_LIMIT).map(l=>({...l,bucket:'npi-backlog',stage:'npi-backlog',queue:'NPI Candidate Backlog',status:'NPI Candidate Backlog',associateReady:false,bestFirstAction:'Backlog: needs second-source enrichment before priority work.',sourceConfidence:l.sourceConfidence||'Phone Route Only — single-source evidence'}));

  ready=dedupe([...readyStrong,...balancedPhoneOnly,...readyOther]).slice(0,MAX_READY_TOTAL);
  research=dedupe([...contactNeeded,...research,...npiBacklog]).slice(0,700);

  const generatedAt=now();
  const radar={
    generatedAt,
    engine:'Basin OS V6.9 Cross-Referenced Lead Engine',
    automationMode:'NPI/RSS seeds → public search enrichment → source confidence → Meta Llama/Groq evaluation → balanced work queues',
    compliance:{linkedinScraping:false,autoMessaging:false,autoProfileReading:false,candidateUrlsOnly:true,manualConfirmationRequired:true,accreditationProof:'Public data creates accredited-likely proxy only; qualification must be verified compliantly.'},
    stats:{
      readyToWork:ready.length,
      highConfidenceReady:ready.filter(l=>/^High/i.test(l.sourceConfidence)).length,
      crossReferencedReady:ready.filter(l=>l.crossReferenced).length,
      phoneRouteOnlyReady:ready.filter(l=>/Phone Route Only/i.test(l.sourceConfidence)).length,
      linkedinVerify:linkedinVerify.length,
      contactNeeded:contactNeeded.length,
      research:research.length,
      npiCollected:npi.leads.length,
      npiReadyPhoneOnly:balancedPhoneOnly.length,
      npiBacklog:npiBacklog.length,
      rssCollected:rss.leads.length,
      publicSearches:searchCount,
      aiCalls:ai.calls,
      aiErrors:ai.errors.length
    },
    leads:ready,
    researchCandidates:dedupe([...linkedinVerify,...contactNeeded,...research]),
    npiCandidateBacklog:npiBacklog,
    errors:[...npi.rejected.slice(0,50),...rss.errors.slice(0,50),...ai.errors.slice(0,50)]
  };
  const researchJson={generatedAt,engine:radar.engine,stats:{total:radar.researchCandidates.length,linkedinVerify:linkedinVerify.length,contactNeeded:contactNeeded.length,research:research.length,npiBacklog:npiBacklog.length},candidates:radar.researchCandidates};

  fs.mkdirSync(out('data'),{recursive:true});
  fs.writeFileSync(out('radar-leads.json'),JSON.stringify(radar,null,2));
  fs.writeFileSync(out('data/radar-leads.json'),JSON.stringify(radar,null,2));
  fs.writeFileSync(out('radar-research-candidates.json'),JSON.stringify(researchJson,null,2));
  fs.writeFileSync(out('data/radar-research-candidates.json'),JSON.stringify(researchJson,null,2));
  fs.writeFileSync(out('data/radar-run-log.json'),JSON.stringify({lastRunAt:generatedAt,status:'complete',...radar.stats,message:`V6.9 created ${ready.length} ready-to-work leads, ${linkedinVerify.length} LinkedIn verify, ${contactNeeded.length} contact needed.`},null,2));
  console.log(`V6.9 complete: ${ready.length} ready-to-work, ${linkedinVerify.length} LinkedIn verify, ${contactNeeded.length} contact needed, ${research.length} research/backlog, ${searchCount} public searches.`);
})().catch(e=>{ console.error(e); process.exitCode=1; });
