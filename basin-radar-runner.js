#!/usr/bin/env node
'use strict';

/**
 * Basin OS V6.5 Lead Factory Automation Runner
 *
 * Safe design:
 * - No LinkedIn/Sales Navigator scraping.
 * - No auto-opening LinkedIn profiles.
 * - No auto-messaging.
 * - Only stores candidate LinkedIn URLs from public search API results when available.
 * - User manually opens/confirms/rejects LinkedIn profile inside Basin OS.
 *
 * AI:
 * - GitHub Models / Meta Llama first.
 * - Groq optional fallback if GROQ_API_KEY exists.
 * - Rules-only fallback if AI unavailable.
 */

const fs = require('fs');
const path = require('path');

const MAX_NPI = Number(process.env.NPI_MAX_PER_QUERY || 12);
const MAX_RSS = Number(process.env.RADAR_MAX_RSS_PER_FEED || 14);
const MAX_SEARCH = Number(process.env.PUBLIC_SEARCH_MAX || 80);
const MAX_AI = Number(process.env.AI_MAX_LEAD_ANALYSES || 80);

const GH_TOKEN = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || '';
const GH_ENDPOINT = process.env.GITHUB_MODELS_ENDPOINT || 'https://models.github.ai/inference/chat/completions';
const GH_MODEL = process.env.GITHUB_MODELS_MODEL || 'meta/Llama-4-Scout-17B-16E-Instruct';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const BRAVE_KEY = process.env.BRAVE_API_KEY || '';
const TAVILY_KEY = process.env.TAVILY_API_KEY || '';

const out = p => path.join(process.cwd(), p);
const now = () => new Date().toISOString();
const uid = p => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function clean(s, max=1600){
  return String(s || '').replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0,max);
}
const digits = v => String(v||'').replace(/\D/g,'');
function fmtPhone(v){ const d=digits(v); if(d.length===10)return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`; if(d.length===11&&d[0]==='1')return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`; return String(v||'').trim(); }
function isEmail(v){ return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(String(v||'')); }
function extractEmail(text){ const m=String(text||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return m && !/example|noreply|no-reply|domain\.com|email\.com/i.test(m[0]) ? m[0] : ''; }
function extractPhone(text){ const m=String(text||'').match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/); return m ? fmtPhone(m[0]) : ''; }
function extractLinkedIn(text){ const m=String(text||'').match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9%_\-./]+/i); return m ? m[0].replace(/[),.]+$/,'') : ''; }

const FIRST_BAD = new Set('former system expert leading regional national global essential financial transactional advertising digital general senior assistant associate practice business tax legal medical clinical public names email local county state city new old best top chief daily annual press'.split(' '));
const LAST_BAD = new Set('assistant transactional advertising strategies financial dermatology partners legal clinic medical health practice group capital ventures services associates advisors consulting solutions hospital center company firm llc inc news city owner partner physician attorney doctor cpa tax expert'.split(' '));
function personOk(name){
  name=clean(name,100); const parts=name.split(/\s+/);
  if(parts.length<2 || parts.length>3) return false;
  const f=parts[0].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
  const l=parts[parts.length-1].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
  if(FIRST_BAD.has(f)||LAST_BAD.has(l)||/[0-9]/.test(name)) return false;
  if(/\b(llc|inc|company|group|partners|practice|clinic|hospital|center|services|solutions|news|advertising)\b/i.test(name)) return false;
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
function addContact(arr,type,value,source,confidence='Medium', extra={}){
  value=clean(value,700); if(!value) return;
  if(/phone/i.test(type)) value=fmtPhone(value);
  const key=`${type}|${value}`.toLowerCase(); if(arr.some(c=>`${c.type}|${c.value}`.toLowerCase()===key)) return;
  arr.push({id:uid('ct'),type,value,source,confidence,createdAt:now(),...extra});
}
function addEvidence(arr,source,url,what,confidence='Medium'){
  source=clean(source); url=clean(url,700); what=clean(what,700);
  if(!source && !url) return;
  const key=`${source}|${url}|${what}`.toLowerCase(); if(arr.some(e=>`${e.source}|${e.url}|${e.whatItProves}`.toLowerCase()===key)) return;
  arr.push({id:uid('ev'),source:source||'Source',url:url||'',whatItProves:what||'Supporting evidence.',confidence,capturedAt:now()});
}
function hasContact(contacts){
  return contacts.some(c=>{
    const t=String(c.type||'').toLowerCase(), v=String(c.value||'');
    return (t.includes('email') && isEmail(v)) || (t.includes('phone') && digits(v).length>=10) ||
      /linkedin\.com\/in\//i.test(v) || (t.includes('npi') && v);
  });
}
function hasLinkedInCandidate(contacts){ return contacts.some(c=>/linkedin/i.test(c.type) && /linkedin\.com\/in\//i.test(c.value) && !c.verified); }
function queueFor(contacts){
  if(contacts.some(c=>/email/i.test(c.type)&&isEmail(c.value))) return {queue:'Email First',first:'Day 1: send reviewed email first, then log outcome/disposition.'};
  if(contacts.some(c=>/linkedin/i.test(c.type)&&/linkedin\.com\/in\//i.test(c.value)&&c.verified)) return {queue:'LinkedIn First',first:'Day 1: open verified LinkedIn manually and complete appropriate manual action.'};
  if(hasLinkedInCandidate(contacts)) return {queue:'LinkedIn Verify',first:'Day 1: open candidate LinkedIn URL manually, confirm/reject match, paste snapshot if useful.'};
  if(contacts.some(c=>/phone/i.test(c.type)&&digits(c.value).length>=10)) return {queue:'Call First / Verify',first:'Day 1: call or verify by phone; ask for correct email/direct contact if needed.'};
  return {queue:'Research Needed',first:'Research: find usable contact method before outreach.'};
}
function contactStrength(contacts){
  const email=contacts.some(c=>/email/i.test(c.type)&&isEmail(c.value)), li=contacts.some(c=>/linkedin/i.test(c.type)&&/linkedin\.com\/in\//i.test(c.value)&&c.verified), cand=hasLinkedInCandidate(contacts), ph=contacts.some(c=>/phone/i.test(c.type)&&digits(c.value).length>=10);
  if(email&&li&&ph) return 'A1'; if(email||li) return 'A2'; if(cand) return 'LV'; if(ph) return 'B1'; return 'R';
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
function score(raw,contacts,evidence){
  let s=40, b=[raw.title,raw.role,raw.specialty,raw.company,raw.signal,raw.summary,raw.source].join(' ').toLowerCase();
  if(personOk(raw.name)) s+=10;
  if(contacts.some(c=>/email/i.test(c.type))) s+=20;
  if(contacts.some(c=>/linkedin/i.test(c.type)&&c.verified)) s+=17;
  if(hasLinkedInCandidate(contacts)) s+=10;
  if(contacts.some(c=>/phone/i.test(c.type))) s+=8;
  if(evidence.length>=1) s+=7; if(evidence.length>=2) s+=6;
  if(/physician|surgeon|doctor|md|do|anesth|orthop|plastic|cardio|derm|urology|gastro|radiology|ophthalmology/.test(b)) s+=16;
  if(/owner|founder|ceo|president|partner|principal|executive/.test(b)) s+=14;
  if(/sold|acquired|liquidity|exit|promoted|opened|launch|speaker|podcast/.test(b)) s+=10;
  return Math.min(98,Math.max(1,Math.round(s)));
}
function makeLead(raw,contacts,evidence,bucket='day1'){
  const q=queueFor(contacts), sc=score(raw,contacts,evidence);
  return {id:raw.id||uid('lead'),name:clean(raw.name,100),title:clean(raw.title||raw.role||raw.specialty||'Prospect',160),role:clean(raw.role||raw.title||'',160),specialty:clean(raw.specialty||'',160),company:clean(raw.company||raw.practice||'',160),practiceLocation:clean(raw.practiceLocation||raw.location||raw.address||'',220),location:clean(raw.location||raw.practiceLocation||'',220),source:clean(raw.source||'',120),sourceType:clean(raw.sourceType||'',80),sourceUrl:clean(raw.sourceUrl||raw.url||'',700),signal:clean(raw.signal||'',500),summary:clean(raw.summary||'',900),contactMethods:contacts,contactStrength:contactStrength(contacts),contactPriority:q.queue,queue:q.queue,bestFirstAction:q.first,fitReason:raw.fitReason||fitReason(raw),accreditedLikelyReason:raw.accreditedLikelyReason||accreditedReason(raw),evidenceTrail:evidence,grade:sc>=85?'A':sc>=70?'B':sc>=55?'C':'R',score:sc,associateReady:q.queue!=='Research Needed',workflowDay:q.queue==='Research Needed'?0:1,bucket:q.queue==='Research Needed'?'research':bucket,stage:q.queue==='Research Needed'?'research':bucket,workflow:{day:q.queue==='Research Needed'?0:1,stage:q.queue==='Research Needed'?'research':bucket,completedTasks:[],disposition:'',note:''},notes:[],foundAt:now(),updatedAt:now()};
}
async function fetchText(url,timeout=12000){
  const ac=new AbortController(), tm=setTimeout(()=>ac.abort(),timeout);
  try{ const r=await fetch(url,{signal:ac.signal,redirect:'follow',headers:{'User-Agent':'BasinOSLeadFactory/6.3'}}); const text=await r.text(); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return {text,url:r.url||url}; } finally { clearTimeout(tm); }
}
async function fetchJson(url){ return JSON.parse((await fetchText(url)).text); }

async function braveSearch(q){
  if(!BRAVE_KEY) return [];
  const url='https://api.search.brave.com/res/v1/web/search?q='+encodeURIComponent(q)+'&count=5&country=us&search_lang=en&text_decorations=false';
  const r=await fetch(url,{headers:{'Accept':'application/json','X-Subscription-Token':BRAVE_KEY,'User-Agent':'BasinOSLeadFactory/6.3'}});
  if(!r.ok) throw new Error('Brave '+r.status);
  const j=await r.json();
  return (j.web?.results||[]).map(x=>({title:x.title||'',url:x.url||'',description:x.description||'',source:'Brave Search'}));
}
async function tavilySearch(q){
  if(!TAVILY_KEY) return [];
  const r=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:TAVILY_KEY,query:q,search_depth:'basic',max_results:5,include_answer:false})});
  if(!r.ok) throw new Error('Tavily '+r.status);
  const j=await r.json();
  return (j.results||[]).map(x=>({title:x.title||'',url:x.url||'',description:x.content||'',source:'Tavily Search'}));
}
let searchCount=0;
async function publicSearch(q){
  if(searchCount>=MAX_SEARCH) return [];
  searchCount++;
  try { const r=await braveSearch(q); if(r.length) return r; } catch(e){}
  try { const r=await tavilySearch(q); if(r.length) return r; } catch(e){}
  return [];
}
async function enrichPublic(raw,contacts,evidence){
  const terms=[raw.name, raw.company, raw.location, raw.specialty||raw.title].filter(Boolean).join(' ');
  if(!raw.name || !personOk(raw.name)) return;
  const q=`"${raw.name}" "${raw.location||''}" "${raw.company||raw.specialty||raw.title||''}" LinkedIn profile`;
  const results=await publicSearch(q);
  for(const res of results){
    const blob=`${res.title} ${res.url} ${res.description}`;
    if(/linkedin\.com\/in\//i.test(res.url || blob)){
      const li=extractLinkedIn(res.url) || extractLinkedIn(blob);
      if(li) {
        addContact(contacts,'LinkedIn Candidate URL',li,res.source,'Needs Manual Confirmation',{status:'Needs Manual Confirmation',verified:false});
        addEvidence(evidence,'Public Search Result',res.url,'Possible LinkedIn profile URL. Needs manual confirmation.', 'Needs Manual Confirmation');
      }
    } else if(/^https?:\/\//i.test(res.url) && !/google|facebook|instagram|x\.com|twitter|linkedin\.com/i.test(res.url)) {
      addContact(contacts,'Company Website',res.url,res.source,'Medium');
      addEvidence(evidence,'Public Search Result',res.url,res.title || 'Public profile/company result.', 'Medium');
    }
    const em=extractEmail(blob), ph=extractPhone(blob);
    if(em) addContact(contacts,'Email',em,res.source,'Medium');
    if(ph) addContact(contacts,'Phone',ph,res.source,'Medium');
  }
}

async function aiEvaluate(lead){
  const system='You are Basin Ventures lead qualification AI. Return ONLY compact JSON: {"associateReady":boolean,"scoreAdjustment":number,"fitReason":"...","accreditedLikelyReason":"...","bestFirstAction":"...","opener":"...","likelyObjection":"...","riskNote":"..."}. Do not claim accreditation is proven.';
  const user=JSON.stringify({name:lead.name,title:lead.title,company:lead.company,location:lead.location,contacts:lead.contactMethods.map(c=>`${c.type}: ${c.value}`),evidence:lead.evidenceTrail.map(e=>`${e.source}: ${e.whatItProves}`),signal:lead.signal,summary:lead.summary});
  const messages=[{role:'system',content:system},{role:'user',content:user}];
  async function gh(){
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
  try { return {provider:'GitHub Models / Meta Llama',model:GH_MODEL,json:await gh()}; }
  catch(e1){ try { return {provider:'Groq fallback',model:GROQ_MODEL,json:await groq(),githubError:String(e1.message||e1)}; } catch(e2){ return {provider:'rules-only',model:'none',json:null,error:String(e1.message||e1),groqError:String(e2.message||e2)}; } }
}

const NPI_SPECIALTIES=['Orthopaedic Surgery','Gastroenterology','Dermatology','Ophthalmology','Plastic Surgery','Urology','Anesthesiology','Radiology','Cardiovascular Disease','Oral & Maxillofacial Surgery'];
const NPI_GEOS=[['TX','Dallas'],['TX','Houston'],['TX','Austin'],['TX','Fort Worth'],['TX','San Antonio'],['TX','Midland'],['OK','Oklahoma City'],['CO','Denver'],['AZ','Phoenix'],['FL','Miami']];
function npiUrl(spec,[state,city]){ return `https://npiregistry.cms.hhs.gov/api/?version=2.1&enumeration_type=NPI-1&taxonomy_description=${encodeURIComponent(spec)}&state=${state}&city=${encodeURIComponent(city)}&limit=${MAX_NPI}`; }
function npiName(b){ if(!b?.first_name||!b?.last_name)return''; const fix=s=>s[0].toUpperCase()+s.slice(1).toLowerCase(); return `${fix(b.first_name)} ${fix(b.last_name)}`; }
function addr(addrs){ return (addrs||[]).find(a=>a.address_purpose==='LOCATION'&&a.telephone_number)||(addrs||[]).find(a=>a.telephone_number)||(addrs||[]).find(a=>a.address_purpose==='LOCATION')||(addrs||[])[0]||{}; }
async function collectNpi(){
  const leads=[], rejected=[];
  for(const geo of NPI_GEOS) for(const spec of NPI_SPECIALTIES){
    try{
      const json=await fetchJson(npiUrl(spec,geo));
      for(const rec of (json.results||[])){
        const b=rec.basic||{}, a=addr(rec.addresses), name=npiName(b), p=fmtPhone(a.telephone_number||''), npi=rec.number||rec.npi||'';
        if(!personOk(name) || !p){ rejected.push({name,reason:'NPI missing valid person or phone'}); continue; }
        const tax=(rec.taxonomies||[]).find(t=>t.primary)||(rec.taxonomies||[])[0]||{};
        const title=`${tax.desc||spec}${b.credential?' · '+b.credential:''}`;
        const npiLink=npi?`https://npiregistry.cms.hhs.gov/provider-view/${npi}`:'';
        const contacts=[], ev=[];
        addContact(contacts,'Phone',p,'NPI Registry practice address','High');
        addContact(contacts,'NPI Profile',npiLink,'NPI Registry','High');
        addEvidence(ev,'NPI Registry',npiLink,'Real provider identity, specialty, practice phone, and location.','High');
        const raw={name,title,specialty:tax.desc||spec,company:b.organization_name||'',location:[a.city,a.state].filter(Boolean).join(', '),source:'NPI Registry',sourceType:'npi',sourceUrl:npiLink,signal:`NPI verified provider: ${name}`,summary:`${name} is listed in the federal NPI Registry as ${title}.`,fitReason:'Specialist physician/high-income profession proxy; public provider record verifies identity and practice phone.',accreditedLikelyReason:'Specialist physician/high-income proxy. Accreditation still requires compliant qualification/self-attestation.'};
        await enrichPublic(raw,contacts,ev);
        leads.push(makeLead(raw,contacts,ev,'day1'));
      }
    } catch(e){ rejected.push({source:`NPI ${spec} ${geo.join(',')}`,reason:String(e.message||e)}); }
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
  const ready=[], research=[];
  for(const [feed,q] of RSS_FEEDS){
    try{
      const xml=(await fetchText(rssUrl(q))).text;
      for(const item of parseRss(xml).slice(0,MAX_RSS)){
        const text=`${item.title} ${item.description}`, nm=extractName(item.title,item.description);
        const contacts=[], ev=[];
        addContact(contacts,'Email',extractEmail(text),'Google RSS/article text','Medium');
        addContact(contacts,'LinkedIn Candidate URL',extractLinkedIn(text),'Google RSS/article text','Needs Manual Confirmation',{status:'Needs Manual Confirmation'});
        addContact(contacts,'Phone',extractPhone(text),'Google RSS/article text','Medium');
        addEvidence(ev,'Google RSS',item.link,item.title,'Medium');
        const raw={name:nm||item.title,title:'Public Source Signal',company:'',location:'USA',source:'Google RSS',sourceType:'rss',sourceUrl:item.link,signal:item.title,summary:item.description,fitReason:'Public trigger signal; source should be reviewed before outreach.',accreditedLikelyReason:'Accredited-likely not proven; requires further qualification.'};
        if(nm) await enrichPublic(raw,contacts,ev);
        const lead=makeLead(raw,contacts,ev,nm&&hasContact(contacts)?'day1':'research');
        if(nm && hasContact(contacts)) ready.push(lead); else research.push({...lead,associateReady:false,bucket:'research',stage:'research',workflowDay:0,queue:'Research Needed',contactPriority:'Research Needed'});
      }
    } catch(e){ research.push({id:uid('rss_error'),name:`RSS error: ${feed}`,title:'RSS error',source:'Google RSS',signal:String(e.message||e),associateReady:false,bucket:'research',contactMethods:[],evidenceTrail:[]}); }
  }
  return {ready,research};
}
function dedupe(arr){ const seen=new Set(), out=[]; for(const l of arr.sort((a,b)=>(b.score||0)-(a.score||0))){ const key=[l.name,l.company,l.title,l.sourceUrl,(l.contactMethods||[]).map(c=>c.value).join('|')].join('|').toLowerCase(); if(seen.has(key))continue; seen.add(key); out.push(l); } return out; }
async function aiEnrich(leads){
  const out=[], errors=[]; let calls=0;
  for(const lead of leads){
    if(calls>=MAX_AI){ out.push(lead); continue; }
    const r=await aiEvaluate(lead); calls++;
    if(r.json){
      const adj=Math.max(-12,Math.min(12,Number(r.json.scoreAdjustment||0)));
      lead.score=Math.max(1,Math.min(98,Math.round((lead.score||70)+adj)));
      lead.grade=lead.score>=85?'A':lead.score>=70?'B':lead.score>=55?'C':'R';
      if(r.json.fitReason) lead.fitReason=clean(r.json.fitReason,500);
      if(r.json.accreditedLikelyReason) lead.accreditedLikelyReason=clean(r.json.accreditedLikelyReason,500);
      if(r.json.bestFirstAction) lead.bestFirstAction=clean(r.json.bestFirstAction,500);
      lead.opener=clean(r.json.opener||'',600); lead.likelyObjection=clean(r.json.likelyObjection||'',300); lead.riskNote=clean(r.json.riskNote||'',300);
      lead.aiProvider=r.provider; lead.aiModel=r.model; lead.aiAnalyzedAt=now();
      lead.associateReady = r.json.associateReady !== false && hasContact(lead.contactMethods);
    } else { lead.aiProvider='rules-only'; lead.aiError=r.error||'AI unavailable'; errors.push({lead:lead.name,error:r.error||r.githubError||r.groqError||'AI unavailable'}); }
    out.push(lead);
  }
  return {leads:out,errors,calls};
}

(async function main(){
  const npi=await collectNpi();
  const rss=await collectRss();
  let associateReady=dedupe([...npi.leads,...rss.ready]).filter(l=>personOk(l.name)&&hasContact(l.contactMethods));
  const research=dedupe(rss.research).slice(0,300);
  const ai=await aiEnrich(associateReady);
  associateReady=dedupe(ai.leads.filter(l=>l.associateReady&&hasContact(l.contactMethods))).slice(0,350);
  const generatedAt=now();
  const statBy=q=>associateReady.filter(l=>l.queue===q).length;
  const radar={generatedAt,engine:'Basin OS V6.5 Automated Lead Factory + Manual LinkedIn Verification',automationMode:'GitHub Actions first; public sources; public search candidate URLs; Meta Llama first; Groq optional fallback',compliance:{linkedinScraping:false,autoMessaging:false,autoProfileReading:false,candidateUrlsOnly:true,manualConfirmationRequired:true,accreditationProof:'Public data creates accredited-likely proxy only; qualification must be verified compliantly.'},stats:{associateReady:associateReady.length,emailFirst:statBy('Email First'),linkedinFirst:statBy('LinkedIn First'),linkedinVerify:statBy('LinkedIn Verify'),callFirstVerify:statBy('Call First / Verify'),research:research.length,npiCollected:npi.leads.length,rssReady:rss.ready.length,publicSearches:searchCount,aiCalls:ai.calls,aiErrors:ai.errors.length},leads:associateReady,researchCandidates:research,errors:[...npi.rejected.slice(0,50),...ai.errors.slice(0,50)]};
  const researchJson={generatedAt,engine:radar.engine,stats:{total:research.length},candidates:research};
  fs.mkdirSync(out('data'),{recursive:true});
  fs.writeFileSync(out('radar-leads.json'),JSON.stringify(radar,null,2));
  fs.writeFileSync(out('data/radar-leads.json'),JSON.stringify(radar,null,2));
  fs.writeFileSync(out('radar-research-candidates.json'),JSON.stringify(researchJson,null,2));
  fs.writeFileSync(out('data/radar-research-candidates.json'),JSON.stringify(researchJson,null,2));
  fs.writeFileSync(out('data/radar-run-log.json'),JSON.stringify({lastRunAt:generatedAt,status:'complete',...radar.stats,message:`V6.5 created ${associateReady.length} associate-ready leads.`},null,2));
  console.log(`V6.5 complete: ${associateReady.length} associate-ready, ${research.length} research, ${searchCount} public searches.`);
})().catch(e=>{ console.error(e); process.exitCode=1; });