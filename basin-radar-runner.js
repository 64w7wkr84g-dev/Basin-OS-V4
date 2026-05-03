#!/usr/bin/env node
'use strict';

/**
 * Basin OS Radar Runner V5.3
 * NPI VERIFIED LEADS + RSS RESEARCH CANDIDATES
 *
 * Why this exists:
 * V5.2 correctly blocked fake "leads" like Former Assistant and Expert Advertising,
 * but it also exposed the real issue: Google RSS almost never contains actual contact
 * methods. If we require real person + actual contact method, RSS alone produces few
 * or zero true leads.
 *
 * This runner fixes that by adding a true free verified-contact source:
 *   - Federal NPI Registry API
 *   - no API key
 *   - actual individual provider names
 *   - actual practice phone numbers
 *
 * Lead rule:
 *   - radar-leads.json only contains real named humans with an actual contact method.
 *   - RSS results without contact are saved as research candidates, not leads.
 */

const fs = require('fs');
const path = require('path');

const OUT_ROOT = path.join(process.cwd(), 'radar-leads.json');
const OUT_DATA = path.join(process.cwd(), 'data', 'radar-leads.json');
const REJ_ROOT = path.join(process.cwd(), 'radar-rejected.json');
const REJ_DATA = path.join(process.cwd(), 'data', 'radar-rejected.json');
const CAND_ROOT = path.join(process.cwd(), 'radar-research-candidates.json');
const CAND_DATA = path.join(process.cwd(), 'data', 'radar-research-candidates.json');
const RUN_LOG = path.join(process.cwd(), 'data', 'radar-run-log.json');

const MAX_NPI_PER_QUERY = Number(process.env.NPI_MAX_PER_QUERY || 25);
const MAX_LEADS = Number(process.env.RADAR_MAX_LEADS || 150);
const MAX_RSS_PER_FEED = Number(process.env.RADAR_MAX_RSS_PER_FEED || 12);
const MAX_MODEL_ANALYSES = Number(process.env.GITHUB_MODELS_MAX_ANALYSES || 20);

const GH_MODELS_TOKEN = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || '';
const GH_MODELS_ENDPOINT = process.env.GITHUB_MODELS_ENDPOINT || 'https://models.github.ai/inference/chat/completions';
const GH_MODELS = [
  process.env.GITHUB_MODELS_MODEL,
  'meta/Llama-4-Scout-17B-16E-Instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta/Meta-Llama-3.1-8B-Instruct'
].filter(Boolean);

function now(){ return new Date().toISOString(); }
function plusDays(days){ return new Date(Date.now() + days * 86400000).toISOString(); }
function id(prefix='rad-npi'){ return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function clean(s, max=1000){
  return String(s || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function fingerprint(x){
  return clean([x.npi, x.name, x.company, x.phone, x.signal, x.url, x.sourceUrl, x.rawTitle].filter(Boolean).join('|'), 700)
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, '');
}

function fmtPhone(p){
  const d = String(p || '').replace(/\D/g, '');
  if(d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if(d.length === 11 && d.startsWith('1')) return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p || '';
}

const FIRST_NAME_BLOCK = new Set([
  'former','system','expert','leading','regional','national','international','global','essential','financial',
  'transactional','advertising','digital','general','senior','assistant','associate','practice','business','tax',
  'legal','medical','clinical','licensed','professional','strategic','commercial','corporate','private','public',
  'blackrock','westlake','bay','names','email','patent','local','county','state','city','united','north','south',
  'east','west','new','old','best','top','chief','daily','weekly','monthly','annual','dear','press'
]);

const LAST_NAME_BLOCK = new Set([
  'assistant','transactional','advertising','strategies','financial','dermatology','partners','legal','clinic',
  'medical','health','practice','group','capital','ventures','services','associates','advisors','consulting',
  'solutions','network','hospital','center','company','firm','llc','inc','news','wire','times','journal',
  'county','state','city','owner','partner','physician','attorney','doctor','cpa','tax','expert','new'
]);

function looksLikePersonName(name){
  const n = clean(name, 90);
  if(!n) return false;

  const parts = n.split(/\s+/);
  if(parts.length < 2 || parts.length > 3) return false;

  const first = parts[0].replace(/[^a-zA-Z'-]/g, '').toLowerCase();
  const last = parts[parts.length - 1].replace(/[^a-zA-Z'-]/g, '').toLowerCase();

  if(FIRST_NAME_BLOCK.has(first)) return false;
  if(LAST_NAME_BLOCK.has(last)) return false;
  if(/[0-9]/.test(n)) return false;

  if(/\b(strategies|financial|partners|legal|capital|ventures|group|llc|inc|firm|clinic|practice|medical|health|associates|company|services|advisors|consulting|solutions|bank|hospital|center|university|news|county|city|state|advertising|transactional|assistant|dermatology)\b/i.test(n)) {
    return false;
  }

  return /^[A-Z][a-zA-Z'.-]{1,}(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]{1,}$/.test(n);
}

function actualContactMethods(lead){
  const methods = Array.isArray(lead.contactMethods) ? lead.contactMethods : [];
  return methods.filter(m => {
    const type = String(m.type || '').toLowerCase();
    const value = String(m.value || '');
    if(type.includes('email') && /@/.test(value)) return true;
    if(type.includes('phone') && value.replace(/\D/g, '').length >= 10) return true;
    if(/linkedin\.com\/in\//i.test(value)) return true;
    if(type.includes('npi') && value) return true;
    return false;
  });
}

function validLead(lead){
  return looksLikePersonName(lead.name) && actualContactMethods(lead).length > 0;
}

function scoreLead(l){
  const blob = [l.name, l.title, l.company, l.signal, l.summary, l.sourceFeed, l.priority, l.specialty].join(' ').toLowerCase();
  let s = 50;
  const signals = [];
  const add = (pts, txt) => { s += pts; signals.push(txt); };

  add(20, 'verified named human');
  add(20, 'actual contact method');

  if(/orthopaedic|orthopedic|plastic surgery|dermatology|gastroenterology|urology|ophthalmology|cardiovascular|cardiology|anesthesiology|radiology|oral|maxillofacial/.test(blob)) add(12, 'high-income physician specialty');
  if(/physician|surgeon|medical|clinic|doctor|provider|npi/.test(blob)) add(12, 'physician/medical ICP');
  if(/texas|dallas|houston|austin|fort worth|san antonio|midland/.test(blob) || l.priority === 'texas') add(5, 'Texas-first');
  if(l.phone) add(6, 'practice phone');
  if(l.npi) add(5, 'federal NPI record');

  s = Math.max(1, Math.min(98, Math.round(s)));
  l.score = s;
  l.grade = s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : 'D';
  l.scoreSignals = signals;
}

function reject(reason, raw, extra={}){
  return {
    id: id('reject'),
    reject: true,
    reason,
    ...raw,
    ...extra,
    skippedAt: now(),
    nextEligibleCheck: plusDays(14)
  };
}

function loadExistingRejected(){
  const set = new Set();
  for(const f of [REJ_ROOT, REJ_DATA]){
    try{
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const arr = Array.isArray(j.rejected) ? j.rejected : [];
      for(const r of arr){
        if(r.nextEligibleCheck && new Date(r.nextEligibleCheck).getTime() > Date.now()){
          set.add(fingerprint(r));
        }
      }
    }catch(e){}
  }
  return set;
}

async function fetchJson(url){
  const res = await fetch(url, { headers: {'User-Agent':'BasinOSRadar/5.3 NPI'} });
  const text = await res.text();
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function fetchText(url){
  const res = await fetch(url, { headers: {'User-Agent':'BasinOSRadar/5.3 RSS'} });
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

const NPI_SPECIALTIES = [
  'Orthopaedic Surgery',
  'Gastroenterology',
  'Dermatology',
  'Ophthalmology',
  'Plastic Surgery',
  'Urology',
  'Anesthesiology',
  'Radiology',
  'Cardiovascular Disease',
  'Oral & Maxillofacial Surgery'
];

const NPI_GEOS = [
  { state:'TX', city:'Dallas', priority:'texas' },
  { state:'TX', city:'Houston', priority:'texas' },
  { state:'TX', city:'Austin', priority:'texas' },
  { state:'TX', city:'Fort Worth', priority:'texas' },
  { state:'TX', city:'San Antonio', priority:'texas' },
  { state:'TX', city:'Midland', priority:'texas' },
  { state:'OK', city:'Oklahoma City', priority:'nearby' },
  { state:'CO', city:'Denver', priority:'nearby' },
  { state:'AZ', city:'Phoenix', priority:'nearby' },
  { state:'FL', city:'Miami', priority:'nationwide' }
];

function npiUrl(specialty, geo){
  const params = new URLSearchParams({
    version: '2.1',
    enumeration_type: 'NPI-1',
    taxonomy_description: specialty,
    state: geo.state,
    city: geo.city,
    limit: String(MAX_NPI_PER_QUERY)
  });
  return `https://npiregistry.cms.hhs.gov/api/?${params.toString()}`;
}

function npiName(basic){
  const first = clean(basic.first_name || '', 40);
  const last = clean(basic.last_name || '', 45);
  if(!first || !last) return '';
  return `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()} ${last.charAt(0).toUpperCase()}${last.slice(1).toLowerCase()}`;
}

function practiceAddress(addresses){
  const arr = Array.isArray(addresses) ? addresses : [];
  return arr.find(a => a.address_purpose === 'LOCATION' && a.telephone_number) ||
         arr.find(a => a.telephone_number) ||
         arr.find(a => a.address_purpose === 'LOCATION') ||
         arr[0] ||
         {};
}

function npiToLead(rec, specialty, geo){
  const basic = rec.basic || {};
  const name = npiName(basic);
  const addr = practiceAddress(rec.addresses);
  const phone = fmtPhone(addr.telephone_number || '');
  const tax = Array.isArray(rec.taxonomies) ? rec.taxonomies.find(t => t.primary) || rec.taxonomies[0] || {} : {};
  const credential = clean(basic.credential || '', 30);
  const taxonomy = clean(tax.desc || specialty, 100);
  const org = clean(basic.organization_name || addr.organization_name || '', 100);
  const addressLine = clean([addr.address_1, addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '), 200);
  const npi = clean(rec.number || rec.npi || '', 20);

  const raw = { npi, name, phone, specialty, sourceFeed:'NPI Registry', sourceUrl:npi ? `https://npiregistry.cms.hhs.gov/provider-view/${npi}` : '' };

  if(!looksLikePersonName(name)) return reject('NPI record did not contain valid individual first/last name', raw);
  if(!phone || phone.replace(/\D/g, '').length < 10) return reject('NPI individual found but no practice phone number', raw);

  const lead = {
    id: id(),
    npi,
    name,
    title: `${taxonomy}${credential ? ' · ' + credential : ''}`,
    specialty: taxonomy,
    credential,
    company: org,
    location: `${addr.city || geo.city}, ${addr.state || geo.state}`,
    address: addressLine,
    phone,
    url: npi ? `https://npiregistry.cms.hhs.gov/provider-view/${npi}` : '',
    sourceUrl: npi ? `https://npiregistry.cms.hhs.gov/provider-view/${npi}` : '',
    source: 'NPI Registry',
    sourceFeed: 'Federal NPI Registry',
    sourceType: 'npi',
    priority: geo.priority,
    foundAt: now(),
    status: 'New',
    qualificationStatus: 'Qualified',
    contactable: true,
    usaBased: true,
    workflowEligible: true,
    contactMethods: [
      { type:'Phone', value:phone, confidence:'High', source:'NPI Registry practice address' },
      { type:'NPI Profile', value:npi ? `https://npiregistry.cms.hhs.gov/provider-view/${npi}` : '', confidence:'High', source:'NPI Registry' }
    ].filter(m => m.value),
    contactSummary: `Practice phone: ${phone}`,
    summary: `${name} is listed in the federal NPI Registry as ${taxonomy}${credential ? ' (' + credential + ')' : ''}${org ? ' at ' + org : ''}.`,
    signal: `NPI verified provider: ${name} · ${taxonomy} · ${geo.city}, ${geo.state}`,
    nextAction: `Call practice phone ${phone}. Verify this is the right office for ${name}, then decide if this belongs in physician outreach.`
  };

  if(!validLead(lead)) return reject('failed final NPI lead validation', raw, { original: rec });
  scoreLead(lead);
  return lead;
}

async function collectNpiLeads(skipSet, errors, rejected){
  const leads = [];
  for(const geo of NPI_GEOS){
    for(const specialty of NPI_SPECIALTIES){
      try{
        const url = npiUrl(specialty, geo);
        const json = await fetchJson(url);
        const results = Array.isArray(json.results) ? json.results : [];

        for(const rec of results){
          const converted = npiToLead(rec, specialty, geo);
          const fp = fingerprint(converted);
          if(skipSet.has(fp)){
            rejected.push(reject('skip window active', converted));
            continue;
          }
          if(converted.reject) rejected.push(converted);
          else leads.push(converted);
        }

        console.log(`NPI ${specialty} ${geo.city}, ${geo.state}: ${results.length}`);
      }catch(e){
        errors.push({ source:`NPI ${specialty} ${geo.city}, ${geo.state}`, error:String(e.message || e) });
      }
    }
  }
  return leads;
}

/* RSS is retained, but it no longer creates leads unless a direct contact method exists.
   Most RSS results become research candidates instead of fake leads. */
const RSS_FEEDS = [
  { name:'Named physician news', type:'physician', query:'("Dr." OR "MD" OR "DO") ("joins" OR "named" OR "appointed" OR "promoted") Texas OR USA 2025 OR 2026' },
  { name:'Named business owner liquidity news', type:'liquidity_event', query:'("founder" OR "CEO" OR "owner") ("sold" OR "acquired" OR "exits" OR "acquisition") USA 2025 OR 2026' },
  { name:'Named CPA partner news', type:'cpa', query:'("CPA" OR "tax partner") ("named partner" OR promoted OR joins OR appointed) USA 2025 OR 2026' },
  { name:'Named attorney partner news', type:'attorney', query:'("attorney" OR "law partner") ("named partner" OR promoted OR joins OR appointed) USA 2025 OR 2026' }
];

function googleNewsUrl(query){
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en';
}

function parseRss(xml){
  return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map(m => m[0])
    .map(b => ({
      title: clean((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1], 260),
      link: clean((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1], 700),
      pubDate: clean((b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1], 120),
      description: clean((b.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1], 900)
    }))
    .filter(x => x.title || x.link);
}

function extractEmail(text){
  const m = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : '';
}

function extractPhone(text){
  const m = String(text || '').match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/);
  return m ? fmtPhone(m[0]) : '';
}

function extractDirectLinkedIn(text){
  const m = String(text || '').match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9%_\-./]+/i);
  return m ? m[0].replace(/[),.]+$/, '') : '';
}

function extractHumanNameStrict(title, desc=''){
  const t = clean(`${title} ${desc}`, 1100);
  const patterns = [
    { re: /\bDr\.?\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/, source: 'honorific Dr.' },
    { re: /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+),?\s+(?:MD|DO|DMD|DDS|CPA|JD|Esq\.?|MBA|PhD)\b/, source: 'credential suffix' },
    { re: /\b(?:CEO|Founder|Owner|President|Partner|Attorney|CPA|Surgeon|Physician|Doctor)\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/, source: 'role before name' },
    { re: /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\s+(?:joins|joined|named|appointed|promoted|launches|opens|founds|founded|acquires|acquired|sells|sold|exits|announces|speaks|speaker|interviewed)\b/i, source: 'name before action verb' }
  ];
  for(const p of patterns){
    const m = t.match(p.re);
    if(m && looksLikePersonName(m[1])) return { name: clean(m[1], 90), source: p.source };
  }
  return { name:'', source:'' };
}

function inferTitleFromRss(type, text){
  const s = String(text || '').toLowerCase();
  if(/physician|doctor|surgeon|medical|clinic|md|do/.test(s)) return 'Physician / Medical Signal';
  if(/cpa|tax|accounting/.test(s)) return 'CPA / Tax Signal';
  if(/attorney|law|partner/.test(s)) return 'Attorney / Law Signal';
  if(/founder|ceo|owner|president|acquired|sold/.test(s)) return 'Business Owner / Liquidity Signal';
  return type || 'Research Signal';
}

function rssToCandidate(item, feed){
  const title = clean(item.title, 260);
  const summary = clean(item.description || title, 900);
  const text = `${title} ${summary}`;
  const extracted = extractHumanNameStrict(title, summary);
  const email = extractEmail(text);
  const phone = extractPhone(text);
  const linkedin = extractDirectLinkedIn(text);
  const methods = [];
  if(email) methods.push({ type:'Email', value:email, confidence:'High', source:'RSS source text' });
  if(phone) methods.push({ type:'Phone', value:phone, confidence:'High', source:'RSS source text' });
  if(linkedin) methods.push({ type:'LinkedIn Profile', value:linkedin, confidence:'High', source:'RSS source text' });

  if(extracted.name && methods.length){
    const lead = {
      id:id('rss-lead'),
      name:extracted.name,
      title:inferTitleFromRss(feed.type, text),
      company:'',
      location:'USA',
      url:item.link,
      sourceUrl:item.link,
      source:'RSS Verified Contact',
      sourceFeed:feed.name,
      sourceType:'rss',
      sourceDate:item.pubDate || '',
      summary,
      signal:title,
      foundAt:now(),
      status:'New',
      qualificationStatus:'Qualified',
      contactable:true,
      usaBased:true,
      workflowEligible:true,
      contactMethods:methods,
      contactSummary:methods.map(m => `${m.type}: ${m.value}`).join(' | '),
      nextAction:`Verify ${extracted.name} and contact using the actual method found in the source.`
    };
    scoreLead(lead);
    return { lead };
  }

  return {
    candidate:{
      id:id('candidate'),
      name:extracted.name || '',
      title:inferTitleFromRss(feed.type, text),
      source:'RSS Research Candidate',
      sourceFeed:feed.name,
      sourceDate:item.pubDate || '',
      url:item.link,
      sourceUrl:item.link,
      signal:title,
      summary,
      reason: extracted.name ? 'real person found but no actual contact method' : 'no verified individual person name',
      nextAction: extracted.name ? `Research contact method for ${extracted.name}; do not count as a lead yet.` : 'Skip unless a real person can be identified.'
    }
  };
}

async function collectRssSignals(errors){
  const leads = [];
  const candidates = [];
  for(const feed of RSS_FEEDS){
    try{
      const xml = await fetchText(googleNewsUrl(feed.query));
      const items = parseRss(xml).slice(0, MAX_RSS_PER_FEED);
      for(const item of items){
        const r = rssToCandidate(item, feed);
        if(r.lead) leads.push(r.lead);
        else candidates.push(r.candidate);
      }
      console.log(`RSS ${feed.name}: ${items.length}`);
    }catch(e){
      errors.push({ source:`RSS ${feed.name}`, error:String(e.message || e) });
    }
  }
  return { leads, candidates };
}

function extractJson(text){
  const s = String(text || '').trim();
  try{ return JSON.parse(s); }catch(e){}
  const m = s.match(/\{[\s\S]*\}/);
  if(m){ try{ return JSON.parse(m[0]); }catch(e){} }
  return null;
}

async function githubModelsChat(messages){
  if(!GH_MODELS_TOKEN || !GH_MODELS.length) return null;
  let lastError = null;
  for(const model of GH_MODELS){
    try{
      const res = await fetch(GH_MODELS_ENDPOINT, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Accept':'application/vnd.github+json',
          'Authorization':`Bearer ${GH_MODELS_TOKEN}`
        },
        body:JSON.stringify({ model, messages, temperature:0.1, max_tokens:600, response_format:{type:'json_object'} })
      });
      const txt = await res.text();
      if(!res.ok){ lastError = `GitHub Models ${model}: ${res.status} ${txt.slice(0, 250)}`; continue; }
      const j = JSON.parse(txt);
      const content = j.choices?.[0]?.message?.content || '';
      return { model, json:extractJson(content), raw:content };
    }catch(e){
      lastError = `GitHub Models ${model}: ${e.message || e}`;
    }
  }
  throw new Error(lastError || 'GitHub Models call failed');
}

async function enhanceLeadsWithLlama(leads, errors){
  if(!GH_MODELS_TOKEN || !leads.length) return { leads, modelUsed:false, modelName:'', modelCalls:0 };
  const out = [];
  let calls = 0;
  let modelName = '';
  for(const lead of leads){
    if(calls >= MAX_MODEL_ANALYSES){ out.push(lead); continue; }
    try{
      const system = 'You are Basin OS lead analyst. Return ONLY JSON keys: bestAngle, likelyObjection, scoreAdjustment, nextAction. Do not guarantee returns. Keep it compliant.';
      const user = JSON.stringify({ name:lead.name, title:lead.title, specialty:lead.specialty, company:lead.company, location:lead.location, contactSummary:lead.contactSummary, signal:lead.signal });
      const r = await githubModelsChat([{role:'system',content:system},{role:'user',content:user}]);
      if(r && r.json){
        calls++;
        modelName = r.model || modelName;
        const a = r.json;
        const adj = Math.max(-10, Math.min(10, Number(a.scoreAdjustment || 0)));
        lead.score = Math.max(1, Math.min(98, Math.round((lead.score || 70) + adj)));
        lead.grade = lead.score >= 85 ? 'A' : lead.score >= 70 ? 'B' : lead.score >= 55 ? 'C' : 'D';
        lead.aiProvider = 'GitHub Models';
        lead.aiModel = r.model;
        lead.aiAnalyzedAt = now();
        lead.aiAngle = clean(a.bestAngle || lead.summary || '', 500);
        lead.bestAngle = lead.aiAngle;
        lead.likelyObjection = clean(a.likelyObjection || 'Need to review with CPA first.', 240);
        lead.nextAction = clean(a.nextAction || lead.nextAction, 360);
        lead.scoreSignals = Array.from(new Set([...(lead.scoreSignals || []), 'Meta Llama enrichment']));
      }
      out.push(lead);
    }catch(e){
      errors.push({ source:'GitHub Models enrichment', error:String(e.message || e) });
      out.push(lead);
      break;
    }
  }
  const usedKeys = new Set(out.map(fingerprint));
  for(const l of leads) if(!usedKeys.has(fingerprint(l))) out.push(l);
  return { leads:out, modelUsed:calls>0, modelName, modelCalls:calls };
}

async function main(){
  const startedAt = now();
  const errors = [];
  const rejected = [];
  const skipSet = loadExistingRejected();

  const npiLeads = await collectNpiLeads(skipSet, errors, rejected);
  const rss = await collectRssSignals(errors);

  const allLeadCandidates = [...npiLeads, ...rss.leads];

  const seen = new Set();
  const deduped = [];
  for(const l of allLeadCandidates.sort((a,b)=>(b.score||0)-(a.score||0))){
    const k = fingerprint(l);
    if(!k || seen.has(k)) continue;
    seen.add(k);
    if(validLead(l)) deduped.push(l);
    else rejected.push(reject('failed final human/contact validation', l, { original:l }));
    if(deduped.length >= MAX_LEADS) break;
  }

  const ai = await enhanceLeadsWithLlama(deduped, errors);

  const finalSeen = new Set();
  const usable = [];
  for(const l of ai.leads.sort((a,b)=>(b.score||0)-(a.score||0))){
    const k = fingerprint(l);
    if(!k || finalSeen.has(k)) continue;
    finalSeen.add(k);
    if(validLead(l)) usable.push(l);
    else rejected.push(reject('failed post-AI validation', l, { original:l }));
    if(usable.length >= MAX_LEADS) break;
  }

  const output = {
    generatedAt:now(),
    engine:'NPI Verified Leads + RSS Research Candidates V5.3',
    geoMode:'texas_first_nationwide',
    tavilyUsed:false,
    braveUsed:false,
    githubModelsUsed:ai.modelUsed,
    githubModelsModel:ai.modelName || '',
    hardRules:{
      visibleLeadNameMustBeRealPerson:true,
      requiresActualContactMethod:true,
      npiPhoneCounts:true,
      directLinkedInProfileCounts:true,
      linkedinSearchUrlDoesNotCount:true,
      googleSearchUrlDoesNotCount:true,
      rssWithoutContactGoesToResearchCandidates:true,
      skipRejectedForDays:14
    },
    stats:{
      usableLeads:usable.length,
      npiLeads:npiLeads.length,
      rssVerifiedLeads:rss.leads.length,
      rssResearchCandidates:rss.candidates.length,
      rejected:rejected.length,
      collectionErrors:errors.length,
      githubModelCalls:ai.modelCalls || 0
    },
    errors,
    leads:usable
  };

  const rejectedOutput = {
    generatedAt:output.generatedAt,
    engine:output.engine,
    stats:{
      totalRejected:rejected.length,
      noHumanContact:rejected.filter(x => /name|human|individual/i.test(x.reason || '')).length,
      noVerifiedContact:rejected.filter(x => /phone|contact/i.test(x.reason || '')).length,
      skipWindow:rejected.filter(x => /skip/i.test(x.reason || '')).length,
      collectionErrors:errors.length
    },
    errors,
    rejected:rejected.slice(0, 1500)
  };

  const candidateOutput = {
    generatedAt:output.generatedAt,
    engine:output.engine,
    note:'These are NOT leads yet. They need contact research. Do not import as active leads until a real contact method is found.',
    stats:{ totalCandidates:rss.candidates.length },
    candidates:rss.candidates.slice(0, 500)
  };

  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive:true });
  fs.writeFileSync(OUT_ROOT, JSON.stringify(output, null, 2));
  fs.writeFileSync(OUT_DATA, JSON.stringify(output, null, 2));
  fs.writeFileSync(REJ_ROOT, JSON.stringify(rejectedOutput, null, 2));
  fs.writeFileSync(REJ_DATA, JSON.stringify(rejectedOutput, null, 2));
  fs.writeFileSync(CAND_ROOT, JSON.stringify(candidateOutput, null, 2));
  fs.writeFileSync(CAND_DATA, JSON.stringify(candidateOutput, null, 2));
  fs.writeFileSync(RUN_LOG, JSON.stringify({
    lastRunAt:output.generatedAt,
    startedAt,
    status:'complete',
    usableLeads:usable.length,
    npiLeads:npiLeads.length,
    rssVerifiedLeads:rss.leads.length,
    rssResearchCandidates:rss.candidates.length,
    rejected:rejected.length,
    errors:errors.length,
    githubModelsUsed:ai.modelUsed,
    githubModelsModel:ai.modelName || '',
    githubModelCalls:ai.modelCalls || 0,
    message:`NPI verified radar completed with ${usable.length} actual-contact leads. RSS candidates needing research: ${rss.candidates.length}.`
  }, null, 2));

  console.log(`Wrote ${usable.length} actual-contact leads. NPI leads ${npiLeads.length}. RSS candidates ${rss.candidates.length}. Rejected ${rejected.length}.`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
