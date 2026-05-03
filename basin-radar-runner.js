#!/usr/bin/env node
'use strict';

/**
 * Basin OS Lead Factory Runner V6
 * Free/public-source compliant signal builder.
 *
 * IMPORTANT:
 * - Does not scrape LinkedIn.
 * - Does not auto-message, auto-view, or bypass any paid tool restrictions.
 * - LinkedIn/SalesNav data enters through manual profile URLs, manual CSV, or manual user input in the OS.
 * - Public sources are used for evidence/signals and are rate-limited.
 *
 * Produces:
 * - radar-leads.json                 associate-ready/warm-route leads
 * - radar-phone-only-candidates.json phone/NPI candidates needing email/LinkedIn research
 * - radar-research-candidates.json   RSS/public-source research candidates
 * - data/radar-run-log.json
 */

const fs = require('fs');
const path = require('path');

const MAX_NPI = Number(process.env.NPI_MAX_PER_QUERY || 10);
const MAX_RSS = Number(process.env.RADAR_MAX_RSS_PER_FEED || 12);

const out = p => path.join(process.cwd(), p);
const now = () => new Date().toISOString();
const id = p => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const clean = (s,max=1200) => String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim().slice(0,max);
const digits = v => String(v||'').replace(/\D/g,'');
function fmtPhone(v){const d=digits(v); if(d.length===10)return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`; if(d.length===11&&d[0]==='1')return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`; return String(v||'').trim();}
function email(text){const m=String(text||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return m&&!/example|noreply|no-reply/i.test(m[0])?m[0]:''}
function phone(text){const m=String(text||'').match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/); return m?fmtPhone(m[0]):''}
function linkedIn(text){const m=String(text||'').match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9%_\-./]+/i); return m?m[0].replace(/[),.]+$/,''):''}

const FIRST_BAD = new Set('former system expert leading regional national global essential financial transactional advertising digital general senior assistant associate practice business tax legal medical clinical public blackrock names email local county state city new old best top chief daily annual'.split(' '));
const LAST_BAD = new Set('assistant transactional advertising strategies financial dermatology partners legal clinic medical health practice group capital ventures services associates advisors consulting solutions hospital center company firm llc inc news city owner partner physician attorney doctor cpa tax expert'.split(' '));
function person(name){
  name=clean(name,100);
  const parts=name.split(/\s+/);
  if(parts.length<2||parts.length>3)return false;
  const f=parts[0].replace(/[^a-zA-Z'-]/g,'').toLowerCase(), l=parts[parts.length-1].replace(/[^a-zA-Z'-]/g,'').toLowerCase();
  if(FIRST_BAD.has(f)||LAST_BAD.has(l)||/[0-9]/.test(name))return false;
  return /^[A-Z][a-zA-Z'.-]{1,}(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]{1,}$/.test(name);
}
function extractName(title, body=''){
  const t=clean(`${title} ${body}`,1600);
  const ps=[
    /\bDr\.?\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/,
    /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+),?\s+(?:MD|DO|DMD|DDS|CPA|JD|Esq\.?|MBA|PhD)\b/,
    /\b(?:CEO|Founder|Owner|President|Partner|Attorney|CPA|Surgeon|Physician|Doctor|Principal)\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/,
    /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\s+(?:joins|joined|named|appointed|promoted|launches|opens|founds|acquires|sold|speaks|interviewed)\b/i
  ];
  for(const p of ps){const m=t.match(p); if(m&&person(m[1]))return clean(m[1],100)}
  return '';
}
async function fetchText(url, timeout=12000){
  const ac = new AbortController();
  const tm = setTimeout(()=>ac.abort(), timeout);
  try{
    const r = await fetch(url,{signal:ac.signal,redirect:'follow',headers:{'User-Agent':'BasinOSLeadFactory/6.0'}});
    const txt = await r.text();
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return {text:txt,url:r.url||url};
  } finally { clearTimeout(tm); }
}
async function fetchJson(url){ return JSON.parse((await fetchText(url)).text); }

function contact(type,value,source,confidence='Medium'){return {id:id('ct'),type,value,source,confidence,createdAt:now()}}
function evidence(source,url,what,confidence='Medium'){return {id:id('ev'),source,url,whatItProves:what,confidence,capturedAt:now()}}
function score(raw,contacts){
  let s=40,b=[raw.title,raw.specialty,raw.company,raw.signal,raw.summary,raw.source].join(' ').toLowerCase();
  if(contacts.some(c=>/email/i.test(c.type)))s+=22;
  if(contacts.some(c=>/linkedin/i.test(c.type)))s+=18;
  if(contacts.some(c=>/phone/i.test(c.type)))s+=8;
  if(/physician|surgeon|doctor|anesth|orthop|plastic|cardio|derm|urology|gastro|radiology/.test(b))s+=16;
  if(/owner|founder|ceo|president|partner|principal/.test(b))s+=14;
  if(/sold|acquired|liquidity|exit|promoted|opened|launch/.test(b))s+=12;
  return Math.min(98,s);
}
function warm(contacts){return contacts.some(c=>/email/i.test(c.type)||/linkedin/i.test(c.type))}
function rawLead(o, contacts, ev, bucket){
  const sc=score(o,contacts);
  return {
    id:id('lead'), name:o.name, title:o.title||o.specialty||'Prospect', role:o.role||o.title||'', specialty:o.specialty||'',
    company:o.company||'', practiceLocation:o.location||'', location:o.location||'', source:o.source||'', sourceType:o.sourceType||'',
    sourceUrl:o.sourceUrl||'', signal:o.signal||'', summary:o.summary||'', contactMethods:contacts, evidenceTrail:ev,
    grade:sc>=85?'A':sc>=70?'B':sc>=55?'C':'R', score:sc,
    fitReason:o.fitReason||'Potential fit based on professional role, source signal, and public evidence.',
    accreditedLikelyReason:o.accreditedLikelyReason||'Accredited-likely proxy only; must be verified by compliant qualification/self-attestation.',
    bucket, foundAt:now()
  };
}

const NPI_SPECIALTIES=['Orthopaedic Surgery','Gastroenterology','Dermatology','Ophthalmology','Plastic Surgery','Urology','Anesthesiology','Radiology','Cardiovascular Disease'];
const NPI_GEOS=[['TX','Dallas'],['TX','Houston'],['TX','Austin'],['TX','Fort Worth'],['TX','San Antonio'],['TX','Midland'],['OK','Oklahoma City'],['CO','Denver'],['AZ','Phoenix']];
function npiUrl(spec,[state,city]){return `https://npiregistry.cms.hhs.gov/api/?version=2.1&enumeration_type=NPI-1&taxonomy_description=${encodeURIComponent(spec)}&state=${state}&city=${encodeURIComponent(city)}&limit=${MAX_NPI}`}
function npiName(b){if(!b?.first_name||!b?.last_name)return''; const fix=s=>s[0].toUpperCase()+s.slice(1).toLowerCase(); return `${fix(b.first_name)} ${fix(b.last_name)}`}
function addr(addrs){return (addrs||[]).find(a=>a.address_purpose==='LOCATION'&&a.telephone_number)||(addrs||[]).find(a=>a.telephone_number)||(addrs||[])[0]||{}}
async function collectNpi(){
  const phoneOnly=[], active=[];
  for(const geo of NPI_GEOS) for(const spec of NPI_SPECIALTIES){
    try{
      const j=await fetchJson(npiUrl(spec,geo));
      for(const rec of (j.results||[])){
        const b=rec.basic||{}, a=addr(rec.addresses), name=npiName(b), npi=rec.number||rec.npi||'', p=fmtPhone(a.telephone_number||'');
        if(!person(name)||!p)continue;
        const tax=(rec.taxonomies||[]).find(t=>t.primary)||(rec.taxonomies||[])[0]||{};
        const title=`${tax.desc||spec}${b.credential?' · '+b.credential:''}`;
        const npiLink=npi?`https://npiregistry.cms.hhs.gov/provider-view/${npi}`:'';
        const contacts=[contact('Phone',p,'NPI Registry','High'),contact('NPI Profile',npiLink,'NPI Registry','High')].filter(c=>c.value);
        const ev=[evidence('NPI Registry',npiLink,'Real provider identity, specialty, practice phone, and location.','High')];
        const lead=rawLead({name,title,specialty:tax.desc||spec,company:b.organization_name||'',location:[a.city,a.state].filter(Boolean).join(', '),source:'NPI Registry',sourceType:'npi',sourceUrl:npiLink,signal:`NPI verified provider: ${name}`,fitReason:'Specialist physician/high-income profession proxy; verified public provider record.',accreditedLikelyReason:'Specialist physician/high-income proxy. Accreditation must still be verified.'},contacts,ev,'phoneverify');
        phoneOnly.push(lead);
      }
    }catch(e){}
  }
  return {active,phoneOnly};
}

const RSS_FEEDS=[
  ['Physician practice openings','("Dr." OR "MD" OR "DO") ("opens" OR "launches" OR "joins" OR "named" OR "promoted") ("medical practice" OR orthopedic OR dermatology OR gastroenterology OR urology) USA 2025 OR 2026'],
  ['Founder liquidity events','("founder" OR "CEO" OR owner) ("sold" OR acquired OR exits OR acquisition) USA 2025 OR 2026'],
  ['CPA tax partner signals','("CPA" OR "tax partner") ("named partner" OR promoted OR joins OR speaker) "business owners" USA 2025 OR 2026'],
  ['Attorney estate/tax partner signals','("attorney" OR "law partner") ("named partner" OR promoted OR joins OR speaker) ("estate planning" OR tax OR business owner) USA 2025 OR 2026'],
  ['Energy executive signals','("oil and gas" OR energy OR mineral OR royalty) ("CEO" OR president OR founder OR owner) ("named" OR appointed OR promoted OR joins) USA 2025 OR 2026']
];
function rssUrl(q){return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`}
function parseRss(xml){return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]).map(b=>({title:clean((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1],260),link:clean((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1],700),description:clean((b.match(/<description[^>]*>([\s\S]*?)<\/description>/i)||[])[1],900),pubDate:clean((b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)||[])[1],120)}))}
async function collectRss(){
  const active=[],research=[];
  for(const [feed,q] of RSS_FEEDS){
    try{
      const xml=(await fetchText(rssUrl(q))).text;
      for(const item of parseRss(xml).slice(0,MAX_RSS)){
        const nm=extractName(item.title,item.description), text=item.title+' '+item.description, em=email(text), ph=phone(text), li=linkedIn(text);
        const contacts=[]; if(em)contacts.push(contact('Email',em,'Google RSS/article text','Medium')); if(li)contacts.push(contact('LinkedIn Profile',li,'Google RSS/article text','High')); if(ph)contacts.push(contact('Phone',ph,'Google RSS/article text','Medium'));
        const base={name:nm||item.title,title:'Public Source Signal',company:'',location:'USA',source:'Google RSS',sourceType:'rss',sourceUrl:item.link,signal:item.title,summary:item.description,fitReason:'Public trigger signal; needs verification before outreach unless contact method is present.',accreditedLikelyReason:'Accredited-likely not proven; requires further qualification.'};
        const ev=[evidence('Google RSS',item.link,item.title,'Medium')];
        if(nm && contacts.length) active.push(rawLead(base,contacts,ev,'day1'));
        else research.push(rawLead(base,contacts,ev,'needsresearch'));
      }
    }catch(e){}
  }
  return {active,research};
}
function dedupe(arr){const seen=new Set(),out=[];for(const x of arr.sort((a,b)=>b.score-a.score)){const k=[x.name,x.company,x.sourceUrl].join('|').toLowerCase();if(seen.has(k))continue;seen.add(k);out.push(x)}return out}
(async function main(){
  const npi=await collectNpi(), rss=await collectRss();
  const active=dedupe([...npi.active,...rss.active]).filter(x=>warm(x.contactMethods)||x.sourceType==='rss');
  const phoneOnly=dedupe(npi.phoneOnly).slice(0,250);
  const research=dedupe(rss.research).slice(0,300);
  const generatedAt=now();
  const radar={generatedAt,engine:'Basin Lead Factory V6',stats:{associateReady:active.length,phoneVerify:phoneOnly.length,research:research.length},leads:active,phoneOnlyCandidates:phoneOnly,researchCandidates:research};
  const phoneJson={generatedAt,engine:'Basin Lead Factory V6',candidates:phoneOnly,stats:{total:phoneOnly.length}};
  const researchJson={generatedAt,engine:'Basin Lead Factory V6',candidates:research,stats:{total:research.length}};
  fs.mkdirSync(out('data'),{recursive:true});
  fs.writeFileSync(out('radar-leads.json'),JSON.stringify(radar,null,2));
  fs.writeFileSync(out('data/radar-leads.json'),JSON.stringify(radar,null,2));
  fs.writeFileSync(out('radar-phone-only-candidates.json'),JSON.stringify(phoneJson,null,2));
  fs.writeFileSync(out('data/radar-phone-only-candidates.json'),JSON.stringify(phoneJson,null,2));
  fs.writeFileSync(out('radar-research-candidates.json'),JSON.stringify(researchJson,null,2));
  fs.writeFileSync(out('data/radar-research-candidates.json'),JSON.stringify(researchJson,null,2));
  fs.writeFileSync(out('data/radar-run-log.json'),JSON.stringify({lastRunAt:generatedAt,status:'complete',associateReady:active.length,phoneVerify:phoneOnly.length,research:research.length},null,2));
  console.log(`Lead Factory V6 complete: ${active.length} ready, ${phoneOnly.length} phone verify, ${research.length} research`);
})().catch(e=>{console.error(e);process.exitCode=1});