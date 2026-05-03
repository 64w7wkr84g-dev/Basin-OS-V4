#!/usr/bin/env node
'use strict';

/**
 * Basin OS V7.5 — Hard Repair Runner
 *
 * Repairs the live failure mode:
 * - Always writes valid JSON to root + data folders.
 * - Never leaves radar-leads.json empty.
 * - RSS is collected before NPI.
 * - Brave enriches public source / LinkedIn candidate / website evidence when BRAVE_API_KEY is present.
 * - NPI is an identity seed. NPI-only phone records go to Contact Route Needed, not premium ready.
 * - No hard cap on discovered records. Priority sorting decides what appears first.
 */

const fs = require('fs');
const path = require('path');

const BRAVE_KEY = process.env.BRAVE_API_KEY || '';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GH_TOKEN = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || '';
const GH_ENDPOINT = process.env.GITHUB_MODELS_ENDPOINT || 'https://models.github.ai/inference/chat/completions';
const GH_MODEL = process.env.GITHUB_MODELS_MODEL || 'meta/Llama-4-Scout-17B-16E-Instruct';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const NPI_MAX_PER_QUERY = Number(process.env.NPI_MAX_PER_QUERY || 10);
const RSS_MAX_PER_FEED = Number(process.env.RADAR_MAX_RSS_PER_FEED || 18);
const PUBLIC_SEARCH_MAX = Number(process.env.PUBLIC_SEARCH_MAX || 500);
const BRAVE_RESULT_COUNT = Number(process.env.BRAVE_RESULT_COUNT || 10);
const ENRICH_NPI_LIMIT = Number(process.env.ENRICH_NPI_LIMIT || 500);
const AI_MAX = Number(process.env.AI_MAX_LEAD_ANALYSES || 80);

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
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,max);
}
const digits = v => String(v || '').replace(/\D/g,'');
function fmtPhone(v){
  const d=digits(v);
  if(d.length===10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if(d.length===11 && d[0]==='1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return clean(v,80);
}
function isEmail(v){ return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(v||'')); }
function isPhone(v){ return digits(v).length >= 10; }
function isLinkedIn(v){ return /linkedin\.com\/in\//i.test(String(v||'')); }
function extractEmail(t){ const m=String(t||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return m && !/example|noreply|no-reply|domain\.com|email\.com/i.test(m[0]) ? m[0] : ''; }
function extractPhone(t){ const m=String(t||'').match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/); return m ? fmtPhone(m[0]) : ''; }
function extractLinkedIn(t){ const m=String(t||'').match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9%_\-./]+/i); return m ? m[0].replace(/[),.]+$/,'') : ''; }

const badFirst = new Set('former system expert leading regional national global essential financial transactional advertising digital general senior assistant associate practice business tax legal medical clinical public names email local county state city new old best top chief daily annual press'.split(' '));
const badLast = new Set('assistant transactional advertising strategies financial dermatology partners legal clinic medical health practice group capital ventures services associates advisors consulting solutions hospital center company firm llc inc news city owner partner physician attorney doctor cpa tax expert'.split(' '));
function personOk(name){
  name=clean(name,100);
  const parts=name.split(/\s+/);
  if(parts.length<2 || parts.length>3) return false;
  const f=parts[0].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
  const l=parts[parts.length-1].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
  if(badFirst.has(f) || badLast.has(l) || /[0-9]/.test(name)) return false;
  if(/\b(llc|inc|company|group|partners|practice|clinic|hospital|center|services|solutions|news|advertising|capital|ventures)\b/i.test(name)) return false;
  return /^[A-Z][a-zA-Z'.-]{1,}(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]{1,}$/.test(name);
}
function extractName(title, body=''){
  const t=clean(`${title} ${body}`,2000);
  const patterns=[
    /\bDr\.?\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/,
    /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+),?\s+(?:MD|DO|DMD|DDS|CPA|JD|Esq\.?|MBA|PhD)\b/,
    /\b(?:CEO|Founder|Owner|President|Partner|Attorney|CPA|Surgeon|Physician|Doctor|Principal|Managing Director)\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/,
    /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\s+(?:joins|joined|named|appointed|promoted|launches|opens|founds|acquires|sold|speaks|interviewed)\b/i
  ];
  for(const p of patterns){
    const m=t.match(p);
    if(m && personOk(m[1])) return clean(m[1],100);
  }
  return '';
}
function addContact(arr,type,value,source='source',confidence='Medium',extra={}){
  value=clean(value,700);
  if(!value) return;
  if(/phone/i.test(type)) value=fmtPhone(value);
  const key=`${type}|${value}`.toLowerCase();
  if(arr.some(c => `${c.type}|${c.value}`.toLowerCase() === key)) return;
  arr.push({id:uid('ct'),type,value,source,confidence,status:extra.status||'',verified:!!extra.verified,createdAt:now(),...extra});
}
function addEvidence(arr,source,url,what,confidence='Medium'){
  source=clean(source,160); url=clean(url,700); what=clean(what,900);
  if(!source && !url && !what) return;
  const key=`${source}|${url}|${what}`.toLowerCase();
  if(arr.some(e => `${e.source}|${e.url}|${e.whatItProves}`.toLowerCase() === key)) return;
  arr.push({id:uid('ev'),source:source||'Source',url:url||'',whatItProves:what||'Supporting evidence.',confidence,capturedAt:now()});
}
function hasEmail(c){ return (c||[]).some(x => /email/i.test(x.type) && isEmail(x.value)); }
function hasVerifiedLinkedIn(c){ return (c||[]).some(x => /linkedin/i.test(x.type) && isLinkedIn(x.value) && (x.verified || /verified/i.test(`${x.status||''} ${x.confidence||''}`))); }
function hasLinkedInCandidate(c){ return (c||[]).some(x => /linkedin/i.test(x.type) && isLinkedIn(x.value) && !x.verified); }
function hasPhone(c){ return (c||[]).some(x => /phone/i.test(x.type) && isPhone(x.value)); }
function hasSecondSource(ev){
  const fam=new Set((ev||[]).map(e=>{
    const s=`${e.source} ${e.url} ${e.whatItProves}`.toLowerCase();
    if(/npi|npiregistry|provider-view/.test(s)) return 'npi';
    if(/linkedin/.test(s)) return 'linkedin';
    if(/rss|google news|news\.google|article/.test(s)) return 'rss';
    if(/practice|company|official|bio|profile|website|provider page/.test(s)) return 'website';
    if(/brave|public search|search result/.test(s)) return 'search';
    return s ? 'other' : '';
  }).filter(Boolean));
  return fam.size >= 2 || (fam.has('npi') && (fam.has('website') || fam.has('linkedin') || fam.has('rss') || fam.has('search')));
}
function sourceConfidence(c,ev){
  if(hasEmail(c) && hasLinkedInCandidate(c) && hasPhone(c) && hasSecondSource(ev)) return 'High — Email + LinkedIn Candidate + Phone + Cross-Referenced';
  if(hasEmail(c) && hasSecondSource(ev)) return 'High — Email + cross-referenced evidence';
  if(hasVerifiedLinkedIn(c) && hasSecondSource(ev)) return 'High — LinkedIn verified + cross-referenced evidence';
  if(hasLinkedInCandidate(c)) return 'Needs Manual LinkedIn Confirmation';
  if(hasPhone(c) && hasSecondSource(ev)) return 'Medium — Reliable phone + second source';
  if(hasPhone(c)) return 'NPI/Phone Seed Only — needs enrichment';
  if(hasSecondSource(ev)) return 'Contact route needed — cross-referenced but no route';
  return 'Single Source — needs enrichment';
}
function qualityTier(c,ev){
  const email=hasEmail(c), vli=hasVerifiedLinkedIn(c), cli=hasLinkedInCandidate(c), phone=hasPhone(c), second=hasSecondSource(ev);
  if(email && (vli || cli) && phone && second) return 'Tier 1 — Email + LinkedIn + Phone + Cross-Referenced';
  if((email || vli) && phone && second) return 'Tier 2 — Digital Route + Phone + Cross-Referenced';
  if((email || vli || cli) && second) return 'Tier 3 — Digital Route + Cross-Referenced';
  if(phone && second) return 'Tier 4 — Phone + Second Source';
  if(phone) return 'Tier 5 — NPI/Phone Seed Only';
  return 'Prep — Needs Contact Route';
}
function priorityRank(t){
  if(/^Tier 1/.test(t)) return 1;
  if(/^Tier 2/.test(t)) return 2;
  if(/^Tier 3/.test(t)) return 3;
  if(/^Tier 4/.test(t)) return 4;
  if(/^Tier 5/.test(t)) return 5;
  return 9;
}
function queueFor(c,ev,raw){
  // Candidate LinkedIn is a better bucket than a blind NPI call.
  if(hasLinkedInCandidate(c) && !hasEmail(c) && !hasVerifiedLinkedIn(c)) {
    return {queue:'LinkedIn Verify',bucket:'linkedin-verify',associateReady:false,first:'Open candidate LinkedIn URL manually, confirm/reject match, then enrich CRM card.'};
  }
  if(hasEmail(c)) return {queue:'Ready to Work',bucket:'day1',associateReady:true,first:'Day 1: send/queue evidence-based email first, then follow cadence.'};
  if(hasVerifiedLinkedIn(c)) return {queue:'Ready to Work',bucket:'day1',associateReady:true,first:'Day 1: use verified LinkedIn route for evidence-based touch, then follow cadence.'};
  if(hasPhone(c) && hasSecondSource(ev)) return {queue:'Ready to Work',bucket:'day1',associateReady:true,first:'Day 1: phone route is usable because a second source exists; review evidence and follow cadence.'};
  if(hasPhone(c)) return {queue:'Contact Route Needed',bucket:'contact-needed',associateReady:false,first:'NPI/phone seed only. Find email, LinkedIn, public bio, practice site, or second source before premium work.'};
  if(hasSecondSource(ev)) return {queue:'Contact Route Needed',bucket:'contact-needed',associateReady:false,first:'Cross-referenced person, but no usable outreach route yet.'};
  return {queue:'Research Needed',bucket:'research',associateReady:false,first:'Confirm real person, role/company, fit, and usable contact method.'};
}
function fitReason(raw){
  const b=[raw.title,raw.role,raw.specialty,raw.company,raw.signal,raw.summary,raw.source].join(' ').toLowerCase(), r=[];
  if(/physician|surgeon|doctor|md|do|anesth|orthop|plastic|cardio|derm|urology|gastro|radiology|ophthalmology/.test(b)) r.push('high-income medical profession proxy');
  if(/owner|founder|ceo|president|partner|principal|executive|managing director/.test(b)) r.push('owner/executive/partner proxy');
  if(/cpa|tax|accounting/.test(b)) r.push('CPA/tax referral pathway');
  if(/attorney|law|estate/.test(b)) r.push('law/estate/referral pathway');
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
  if(hasEmail(c)) s+=22;
  if(hasVerifiedLinkedIn(c)) s+=20;
  if(hasLinkedInCandidate(c)) s+=14;
  if(hasPhone(c)) s+=8;
  if(hasSecondSource(ev)) s+=15;
  if(/physician|surgeon|doctor|md|do|anesth|orthop|plastic|cardio|derm|urology|gastro|radiology|ophthalmology/.test(b)) s+=14;
  if(/owner|founder|ceo|president|partner|principal|executive/.test(b)) s+=14;
  if(/sold|acquired|liquidity|exit|promoted|opened|launch|speaker|podcast/.test(b)) s+=10;
  return Math.min(98,Math.max(1,Math.round(s)));
}
function makeLead(raw,c,ev){
  const q=queueFor(c,ev,raw);
  const sc=score(raw,c,ev);
  const tier=qualityTier(c,ev);
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
    bestContactRoute: hasEmail(c) ? 'Email' : hasVerifiedLinkedIn(c) ? 'LinkedIn' : hasPhone(c) ? 'Phone' : '',
    queue:q.queue,
    status:q.queue,
    bucket:q.bucket,
    stage:q.bucket,
    associateReady:q.associateReady,
    bestFirstAction:q.first,
    nextAction:q.first,
    sourceConfidence:sourceConfidence(c,ev),
    qualityTier:tier,
    priorityRank:priorityRank(tier),
    crossReferenced:hasSecondSource(ev),
    fitReason:raw.fitReason||fitReason(raw),
    accreditedLikelyReason:raw.accreditedLikelyReason||accreditedReason(raw),
    evidenceTrail:ev,
    grade: sc>=85?'A':sc>=70?'B':sc>=55?'C':'R',
    score: sc,
    workflowDay:q.associateReady?1:0,
    day:q.associateReady?1:0,
    workflow:{day:q.associateReady?1:0,stage:q.bucket,completedTasks:[],disposition:'',note:''},
    notes:[],
    foundAt:now(),
    updatedAt:now()
  };
}
function dedupe(arr){
  const m=new Map();
  (arr||[]).forEach((l,i)=>{
    const key=[l.name,l.company,l.title,l.sourceUrl,(l.contactMethods||[]).map(c=>c.value).join('|')].join('|').toLowerCase();
    if(!key) return;
    if(!m.has(key) || (Number(m.get(key).score||0) < Number(l.score||0))) m.set(key,l);
  });
  return [...m.values()];
}
function sortQuality(arr){
  return dedupe(arr).sort((a,b)=> (a.priorityRank||9)-(b.priorityRank||9) || (b.score||0)-(a.score||0) || String(a.name||'').localeCompare(String(b.name||'')));
}
async function fetchText(url, timeout=15000){
  const ac=new AbortController(), tm=setTimeout(()=>ac.abort(),timeout);
  try{
    const r=await fetch(url,{signal:ac.signal,redirect:'follow',headers:{'User-Agent':'BasinOSLeadFactory/7.5'}});
    const text=await r.text();
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return {text,url:r.url||url};
  } finally { clearTimeout(tm); }
}
async function fetchJson(url){ return JSON.parse((await fetchText(url)).text); }

let publicSearches=0;
async function braveSearch(q){
  if(!BRAVE_KEY || publicSearches>=PUBLIC_SEARCH_MAX) return [];
  publicSearches++;
  const url='https://api.search.brave.com/res/v1/web/search?q='+encodeURIComponent(q)+'&count='+BRAVE_RESULT_COUNT+'&country=us&search_lang=en&text_decorations=false';
  const r=await fetch(url,{headers:{'Accept':'application/json','X-Subscription-Token':BRAVE_KEY,'User-Agent':'BasinOSLeadFactory/7.5'}});
  if(!r.ok) throw new Error(`Brave ${r.status}`);
  const j=await r.json();
  return (j.web?.results||[]).map(x=>({title:x.title||'',url:x.url||'',description:x.description||'',source:'Brave Search'}));
}
async function publicSearch(q){
  try{ return await braveSearch(q); }
  catch(e){ return []; }
}
async function enrichPublic(raw,c,ev){
  if(!raw.name || !personOk(raw.name)) return;
  const role = raw.company || raw.specialty || raw.title || '';
  const city = raw.location || '';
  const queries=[
    `site:linkedin.com/in "${raw.name}" "${role}"`,
    `"${raw.name}" "${role}" "${city}" LinkedIn`,
    `"${raw.name}" "${role}" "${city}" bio profile`,
    `"${raw.name}" "${role}" "${city}" practice website`,
    `"${raw.name}" "${role}" email phone`
  ];
  for(const q of queries){
    const results=await publicSearch(q);
    for(const res of results){
      const blob=`${res.title} ${res.url} ${res.description}`;
      const li=extractLinkedIn(blob);
      if(li){
        addContact(c,'LinkedIn Candidate URL',li,res.source,'Needs Manual Confirmation',{status:'Needs Manual Confirmation'});
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
    await sleep(35);
  }
}

const RSS_FEEDS=[
  ['Business owner liquidity/public signal','("sold his company" OR "sold her company" OR "acquired by" OR founder OR CEO) (Texas OR Dallas OR Houston OR Fort Worth OR Austin) 2025 OR 2026'],
  ['Medical practice expansion signal','("opened a new practice" OR joins OR named OR launches) (orthopedic OR gastroenterology OR dermatology OR urology OR anesthesiology OR physician) (Texas OR Dallas OR Houston OR Fort Worth) 2025 OR 2026'],
  ['Physician practice openings','("Dr." OR MD OR DO) (opens OR launches OR joins OR named OR promoted) ("medical practice" OR orthopedic OR dermatology OR gastroenterology OR urology) USA 2025 OR 2026'],
  ['Founder liquidity events','(founder OR CEO OR owner) (sold OR acquired OR exits OR acquisition) USA 2025 OR 2026'],
  ['CPA tax partner signals','(CPA OR "tax partner") ("named partner" OR promoted OR joins OR speaker) "business owners" USA 2025 OR 2026'],
  ['Attorney estate/tax partner signals','(attorney OR "law partner") ("named partner" OR promoted OR joins OR speaker) ("estate planning" OR tax OR business owner) USA 2025 OR 2026'],
  ['Energy executive signals','("oil and gas" OR energy OR mineral OR royalty) (CEO OR president OR founder OR owner) (named OR appointed OR promoted OR joins) USA 2025 OR 2026']
];
function rssUrl(q){ return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`; }
function parseRss(xml){
  return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]).map(b=>({
    title:clean((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1],300),
    link:clean((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1],800),
    description:clean((b.match(/<description[^>]*>([\s\S]*?)<\/description>/i)||[])[1],1000),
    pubDate:clean((b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)||[])[1],140)
  })).filter(x=>x.title||x.link);
}
async function collectRss(){
  const leads=[], errors=[];
  for(const [feed,q] of RSS_FEEDS){
    try{
      const xml=(await fetchText(rssUrl(q))).text;
      for(const item of parseRss(xml).slice(0,RSS_MAX_PER_FEED)){
        const text=`${item.title} ${item.description}`;
        const name=extractName(item.title,item.description);
        const c=[], ev=[];
        addEvidence(ev,'Google RSS',item.link,item.title,'Medium');
        const raw={name:name||'',title:'Public Source Signal',company:'',location:'USA',source:'Google RSS',sourceType:'rss',sourceUrl:item.link,signal:item.title,summary:item.description,fitReason:'Public trigger signal; source should be reviewed before outreach.',accreditedLikelyReason:'Accredited-likely not proven; requires further qualification.'};
        if(name){
          addContact(c,'Email',extractEmail(text),'Google RSS/article text','Medium');
          addContact(c,'Phone',extractPhone(text),'Google RSS/article text','Medium');
          addContact(c,'LinkedIn Candidate URL',extractLinkedIn(text),'Google RSS/article text','Needs Manual Confirmation',{status:'Needs Manual Confirmation'});
          await enrichPublic(raw,c,ev);
          leads.push(makeLead(raw,c,ev));
        } else {
          // Keep source-level RSS as research so RSS does not disappear from the system.
          leads.push({
            id:uid('rss'),
            name:clean(item.title,100),
            title:'RSS Public Signal — needs person extraction',
            source:'Google RSS',
            sourceType:'rss',
            sourceUrl:item.link,
            signal:item.title,
            summary:item.description,
            contactMethods:[],
            queue:'Research Needed',
            status:'Research Needed',
            bucket:'research',
            stage:'research',
            associateReady:false,
            sourceConfidence:'RSS public signal — person not extracted yet',
            qualityTier:'Prep — Needs Contact Route',
            priorityRank:9,
            grade:'R',
            score:35,
            evidenceTrail:ev,
            foundAt:now(),
            updatedAt:now()
          });
        }
      }
    }catch(e){ errors.push({source:feed,reason:String(e.message||e)}); }
  }
  return {leads,errors};
}

const NPI_SPECIALTIES=['Orthopaedic Surgery','Gastroenterology','Dermatology','Ophthalmology','Plastic Surgery','Urology','Anesthesiology','Radiology','Cardiovascular Disease','Oral & Maxillofacial Surgery'];
const NPI_GEOS=[['TX','Dallas'],['TX','Houston'],['TX','Austin'],['TX','Fort Worth'],['TX','San Antonio'],['TX','Midland'],['OK','Oklahoma City'],['CO','Denver'],['AZ','Phoenix'],['FL','Miami']];
function npiUrl(spec,[state,city]){
  return `https://npiregistry.cms.hhs.gov/api/?version=2.1&enumeration_type=NPI-1&taxonomy_description=${encodeURIComponent(spec)}&state=${state}&city=${encodeURIComponent(city)}&limit=${NPI_MAX_PER_QUERY}`;
}
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
async function aiEnrich(leads){
  // Keep this safe: AI is optional. Do not let AI failure break JSON output.
  return {leads,calls:0,errors:[]};
}
function writeJson(rel,obj){
  fs.mkdirSync(path.dirname(out(rel)),{recursive:true});
  fs.writeFileSync(out(rel),JSON.stringify(obj,null,2));
}
function statsFor(all,ready,research,errors){
  return {
    totalFound: all.length,
    readyToWork: ready.length,
    filteredNotUsable: research.length + errors.length,
    research: research.length,
    npiCollected: all.filter(l=>/npi/i.test(`${l.source} ${l.sourceType}`)).length,
    rssCollected: all.filter(l=>/rss|google rss/i.test(`${l.source} ${l.sourceType}`)).length,
    linkedinVerify: all.filter(l=>/linkedin verify/i.test(`${l.queue} ${l.status}`)).length,
    linkedinCandidatesFound: all.filter(l=>(l.contactMethods||[]).some(c=>/linkedin/i.test(c.type))).length,
    contactNeeded: all.filter(l=>/contact route needed/i.test(`${l.queue} ${l.status}`)).length,
    publicSearches,
    aiCalls:0,
    noReadyCap:true,
    npiPhoneOnlyReady:false,
    tier1Ready:ready.filter(l=>/^Tier 1/.test(l.qualityTier||'')).length,
    tier2Ready:ready.filter(l=>/^Tier 2/.test(l.qualityTier||'')).length,
    tier3Ready:ready.filter(l=>/^Tier 3/.test(l.qualityTier||'')).length,
    tier4Ready:ready.filter(l=>/^Tier 4/.test(l.qualityTier||'')).length,
    braveConfigured:!!BRAVE_KEY,
    groqConfigured:!!GROQ_KEY
  };
}
(async function main(){
  const generatedAt=now();
  let rss={leads:[],errors:[]}, npi={leads:[],rejected:[]}, ai={leads:[],calls:0,errors:[]};
  const runtimeErrors=[];
  try{ rss=await collectRss(); }catch(e){ runtimeErrors.push({source:'RSS runtime',reason:String(e.message||e)}); }
  try{ npi=await collectNpi(); }catch(e){ runtimeErrors.push({source:'NPI runtime',reason:String(e.message||e)}); }

  let all=sortQuality([...rss.leads,...npi.leads]);
  try{ ai=await aiEnrich(all.slice(0,AI_MAX)); all=sortQuality(ai.leads.length?ai.leads:all); }catch(e){ runtimeErrors.push({source:'AI runtime',reason:String(e.message||e)}); }

  const ready=sortQuality(all.filter(l=>l.associateReady));
  const research=sortQuality(all.filter(l=>!l.associateReady));
  const errors=[...(rss.errors||[]),...(npi.rejected||[]),...(ai.errors||[]),...runtimeErrors];
  const stats=statsFor(all,ready,research,errors);

  const radar={
    generatedAt,
    engine:'Basin OS V7.5 Hard Repair Runner',
    automationMode:'RSS first → NPI identity seeds → Brave public enrichment → quality tiers → no hard cap',
    compliance:{linkedinScraping:false,autoMessaging:false,autoProfileReading:false,candidateUrlsOnly:true,manualConfirmationRequired:true,accreditationProof:'Public data creates accredited-likely proxy only; qualification must be verified compliantly.'},
    stats,
    leads:ready,
    researchCandidates:research,
    allCandidates:all,
    errors
  };
  const researchJson={generatedAt,engine:radar.engine,stats:{total:research.length,linkedinVerify:stats.linkedinVerify,contactNeeded:stats.contactNeeded,research:stats.research},candidates:research};
  const log={lastRunAt:generatedAt,status:'complete',message:`Generated ${all.length} total candidates, ${ready.length} ready, ${research.length} prep/research, ${publicSearches} public searches.`,...stats};

  writeJson('radar-leads.json',radar);
  writeJson('data/radar-leads.json',radar);
  writeJson('radar-research-candidates.json',researchJson);
  writeJson('data/radar-research-candidates.json',researchJson);
  writeJson('radar-rejected.json',{generatedAt,errors});
  writeJson('data/radar-rejected.json',{generatedAt,errors});
  writeJson('data/radar-run-log.json',log);
  console.log(log.message);
})().catch(e=>{
  const generatedAt=now();
  const fallback={generatedAt,engine:'Basin OS V7.5 Hard Repair Runner',stats:{totalFound:0,readyToWork:0,research:0,publicSearches,runnerFatal:true},leads:[],researchCandidates:[],errors:[{source:'Fatal runner',reason:String(e.stack||e.message||e)}]};
  writeJson('radar-leads.json',fallback);
  writeJson('data/radar-leads.json',fallback);
  writeJson('radar-research-candidates.json',{generatedAt,candidates:[],stats:{total:0}});
  writeJson('data/radar-research-candidates.json',{generatedAt,candidates:[],stats:{total:0}});
  writeJson('data/radar-run-log.json',{generatedAt,status:'fatal',error:String(e.stack||e.message||e)});
  console.error(e);
  process.exitCode=1;
});
