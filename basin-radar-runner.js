#!/usr/bin/env node
'use strict';

/**
 * Basin OS V4 Free Radar Runner
 * No paid search API required.
 *
 * Sources:
 * - Google News RSS search feeds
 * - GDELT Doc API
 * - SEC Company Concept / Submissions-style search links are preserved as source links
 *
 * Optional:
 * - GROQ_API_KEY may be used later, but this runner does not require it.
 *
 * Outputs BOTH:
 * - radar-leads.json
 * - data/radar-leads.json
 * - radar-rejected.json
 * - data/radar-rejected.json
 * - data/radar-run-log.json
 */

const fs = require('fs');
const path = require('path');

const OUT_ROOT = path.join(process.cwd(), 'radar-leads.json');
const OUT_DATA = path.join(process.cwd(), 'data', 'radar-leads.json');
const REJ_ROOT = path.join(process.cwd(), 'radar-rejected.json');
const REJ_DATA = path.join(process.cwd(), 'data', 'radar-rejected.json');
const RUN_LOG = path.join(process.cwd(), 'data', 'radar-run-log.json');

const MAX_PER_FEED = Number(process.env.RADAR_MAX_PER_FEED || 12);
const MAX_LEADS = Number(process.env.RADAR_MAX_LEADS || 120);

function now(){ return new Date().toISOString(); }
function esc(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function clean(s, max=600){
  return String(s||'')
    .replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,max);
}
function decodeXml(s){ return clean(s, 2000); }
function id(prefix='rad-free'){ return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

const FEEDS = [
  {name:'Texas physician practice owners', type:'physician', priority:'texas', query:'("physician founder" OR "practice owner" OR "medical practice owner" OR "surgeon founder") Texas'},
  {name:'Nationwide physician practice openings', type:'physician', priority:'nationwide', query:'("opened" OR "launches" OR "joins") ("medical practice" OR "orthopedic" OR "gastroenterology" OR "dermatology" OR "urology") USA 2025 OR 2026'},
  {name:'Texas business owner liquidity events', type:'liquidity_event', priority:'texas', query:'("acquired" OR "sold his company" OR "sold her company" OR "founder exits" OR "liquidity event") Texas founder owner CEO'},
  {name:'Nationwide founder exits', type:'liquidity_event', priority:'nationwide', query:'("acquired" OR "sold" OR "merger") ("founder" OR "CEO" OR "owner") USA 2025 OR 2026'},
  {name:'Energy-state oil and gas executives', type:'energy', priority:'energy_states', query:'("oil and gas" OR "mineral rights" OR "royalty owner" OR "energy operator") (Texas OR Oklahoma OR Louisiana OR New Mexico OR Colorado OR Wyoming OR North Dakota) founder CEO owner president'},
  {name:'CPA tax planning partners', type:'cpa', priority:'nationwide', query:'("year-end tax planning" OR "tax strategy" OR "oil and gas tax") CPA "business owners" USA'},
  {name:'Law partners estate planning', type:'attorney', priority:'nationwide', query:'("named partner" OR "promoted to partner" OR "estate planning") attorney law firm USA 2025 OR 2026'},
  {name:'Speaker authority signals', type:'speaker', priority:'nationwide', query:'conference speaker physician founder attorney CPA business owner USA 2025 OR 2026'},
  {name:'Podcast media signals', type:'media', priority:'nationwide', query:'podcast interview founder physician attorney CPA business owner USA 2025 OR 2026'},
  {name:'Real estate developer signals', type:'real_estate', priority:'nationwide', query:'("real estate developer" OR "new project" OR "acquires") founder principal owner USA 2025 OR 2026'}
];

function googleNewsUrl(query){
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en';
}

async function fetchText(url){
  const res = await fetch(url, {headers:{'User-Agent':'BasinOSRadar/4.2'}});
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

function parseRss(xml){
  const items = [];
  const blocks = [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]);
  for(const b of blocks){
    const title = decodeXml((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]);
    const link = decodeXml((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1]);
    const pubDate = decodeXml((b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)||[])[1]);
    const description = decodeXml((b.match(/<description[^>]*>([\s\S]*?)<\/description>/i)||[])[1]);
    if(title || link) items.push({title, link, pubDate, description});
  }
  return items;
}

function looksLikeBadName(name){
  const n = String(name||'').trim().toLowerCase();
  if(!n) return true;
  if(n.length < 5) return true;
  const bad = [
    'united states','texas','houston','dallas','austin','san antonio','fort worth','nationwide',
    'new practice','medical practice','press release','business wire','pr newswire','globe newswire',
    'email addresses','via llp','charged with','licensure supervision','practice owner',
    'capital partners','private equity','company announces'
  ];
  if(bad.some(x=>n===x || n.includes(x))) return true;
  if(/\b(inc|llc|ltd|corp|company|capital|partners|ventures|health|medical|clinic|practice|dental|law firm)\b/i.test(name) && !/\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(name)) return true;
  return false;
}

function extractHumanName(title){
  const t = clean(title, 240).replace(/\s+-\s+[^-]+$/,'');
  const patterns = [
    /\bDr\.?\s+([A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+)\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+)\s+(?:named|joins|promoted|appointed|launches|opens|acquires|sells|speaks|discusses|leads|takes|talks)\b/,
    /\b(?:CEO|Founder|Owner|President|Surgeon|Attorney|CPA|Partner)\s+([A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+)\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+),?\s+(?:MD|DO|CPA|JD|CEO|Founder|Owner|President|Partner)\b/
  ];
  for(const p of patterns){
    const m = t.match(p);
    if(m && !looksLikeBadName(m[1])) return m[1].trim();
  }

  // Fallback: first likely two-word person near the beginning
  const names = [...t.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z]\.)?\s+[A-Z][a-z]{2,})\b/g)].map(m=>m[1]);
  for(const n of names){
    if(!looksLikeBadName(n)) return n;
  }
  return '';
}

function extractCompany(title, desc){
  const text = clean(`${title} ${desc}`, 500);
  const patterns = [
    /(?:at|with|joins|from|of)\s+([A-Z][A-Za-z0-9 &.,'’\-]{3,80})/,
    /([A-Z][A-Za-z0-9 &.,'’\-]{3,80})\s+(?:announces|acquires|opens|launches|names|promotes)/
  ];
  for(const p of patterns){
    const m = text.match(p);
    if(m){
      return clean(m[1].replace(/\s+(in|as|for|after|with|to|and)\s+.*/i,''), 90);
    }
  }
  return '';
}

function inferTitle(type, text){
  const s = String(text||'').toLowerCase();
  if(/surgeon|orthopedic|physician|doctor|medical practice|clinic|gastro|dermatology|urology|cardiology/.test(s)) return 'Physician / Medical Practice';
  if(/cpa|tax|accounting/.test(s)) return 'CPA / Tax Advisor';
  if(/attorney|law firm|estate planning|partner/.test(s)) return 'Attorney / Law Partner';
  if(/oil|gas|energy|mineral|royalty|operator/.test(s)) return 'Energy Executive';
  if(/real estate|developer/.test(s)) return 'Real Estate Developer';
  if(/founder|ceo|owner|president|business/.test(s)) return 'Business Owner / Executive';
  return type || 'Prospect Signal';
}

function scoreLead(l){
  const blob = [l.name,l.title,l.company,l.signal,l.summary,l.sourceFeed,l.priority].join(' ').toLowerCase();
  let s = 40;
  const signals = [];
  const add = (pts, txt)=>{s+=pts; signals.push(txt);};
  if(l.name) add(18,'named human contact found');
  if(l.contactMethods && l.contactMethods.length) add(12,'manual contact path available');
  if(/physician|surgeon|medical|clinic|doctor/.test(blob)) add(20,'physician/medical ICP');
  if(/owner|founder|ceo|president|partner|executive/.test(blob)) add(16,'owner/executive signal');
  if(/cpa|tax|accounting/.test(blob)) add(14,'CPA/tax planning signal');
  if(/attorney|law/.test(blob)) add(10,'attorney/referral partner signal');
  if(/oil|gas|energy|mineral|royalty|idc|depletion/.test(blob)) add(12,'energy/tax angle');
  if(/acquir|sold|exit|liquidity|opened|launch|promoted|named|speaker|podcast|interview/.test(blob)) add(10,'timely public trigger');
  if(/texas|dallas|houston|austin|fort worth|midland/.test(blob) || l.priority === 'texas') add(5,'Texas-first priority');
  s = Math.max(1, Math.min(98, Math.round(s)));
  l.scoreSignals = signals;
  l.score = s;
  l.grade = s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : 'D';
}

function makeContactMethods(name, company){
  const q = encodeURIComponent([name, company, 'contact LinkedIn email'].filter(Boolean).join(' '));
  const li = encodeURIComponent([name, company].filter(Boolean).join(' '));
  return [
    {type:'LinkedIn Search', value:`https://www.linkedin.com/search/results/people/?keywords=${li}`, confidence:'Medium', source:'free search path'},
    {type:'Google Search', value:`https://www.google.com/search?q=${q}`, confidence:'Medium', source:'free search path'}
  ];
}

function toLead(item, feed){
  const title = clean(item.title, 240);
  const summary = clean(item.description || title, 700);
  const name = extractHumanName(title);
  const company = extractCompany(title, summary);
  if(!name) return {reject:true, reason:'no named human contact', rawTitle:title, sourceFeed:feed.name};

  const role = inferTitle(feed.type, `${title} ${summary}`);
  const lead = {
    id: id(),
    name,
    title: role,
    company,
    location: feed.priority === 'texas' ? 'Texas-first' : 'Nationwide USA',
    url: item.link,
    sourceUrl: item.link,
    source: 'Free Feed Radar',
    sourceFeed: feed.name,
    sourceQuery: feed.query,
    sourceDate: item.pubDate || '',
    sourceType: feed.type,
    priority: feed.priority,
    summary,
    signal: title,
    foundAt: now(),
    status: 'New',
    leadType: 'basinos',
    contactMethods: makeContactMethods(name, company),
    qualificationStatus: 'Qualified',
    nextAction: `Day 1: verify ${name} and use the source signal for first email + LinkedIn/manual research touch. Do not call until contact route is confirmed.`,
    nurture: {
      subject: 'Reason for reaching out',
      body: `Hi ${name.split(' ')[0]}, I came across a public signal related to ${title}. Basin Ventures may be relevant if alternative investment planning is on your radar. Worth a short director call to see if there is a fit?`
    },
    contactable: true,
    usaBased: true,
    workflowEligible: true,
    missingQualificationFields: [],
    pipelineBlockReason: '',
    contactSummary: 'LinkedIn Search + Google Search'
  };
  scoreLead(lead);
  return lead;
}

function key(l){
  return [l.name,l.company,l.signal].join('|').toLowerCase().replace(/[^a-z0-9|]+/g,'');
}

async function gdeltSearch(query){
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(query) + '&mode=artlist&format=json&maxrecords=10&sort=HybridRel';
  const res = await fetch(url);
  if(!res.ok) throw new Error(`GDELT ${res.status}`);
  const json = await res.json();
  return (json.articles || []).map(a => ({
    title: a.title || '',
    link: a.url || '',
    pubDate: a.seendate || '',
    description: a.sourceCommonName || ''
  }));
}

async function main(){
  const started = now();
  const leads = [];
  const rejected = [];
  const errors = [];

  for(const feed of FEEDS){
    const url = googleNewsUrl(feed.query);
    try{
      const xml = await fetchText(url);
      const items = parseRss(xml).slice(0, MAX_PER_FEED);
      for(const item of items){
        const l = toLead(item, feed);
        if(l.reject) rejected.push(l); else leads.push(l);
      }
      console.log(`${feed.name}: ${items.length} RSS items`);
    }catch(e){
      errors.push({source:feed.name, error:String(e.message||e)});
      console.warn(`${feed.name} failed: ${e.message}`);
    }
  }

  // GDELT backup, also free
  for(const feed of FEEDS.slice(0,6)){
    try{
      const items = await gdeltSearch(feed.query);
      for(const item of items.slice(0,6)){
        const l = toLead(item, {...feed, name: feed.name + ' GDELT'});
        if(l.reject) rejected.push(l); else leads.push(l);
      }
      console.log(`${feed.name}: GDELT backup checked`);
    }catch(e){
      errors.push({source:feed.name + ' GDELT', error:String(e.message||e)});
    }
  }

  const seen = new Set();
  const usable = [];
  for(const l of leads.sort((a,b)=>(b.score||0)-(a.score||0))){
    const k = key(l);
    if(seen.has(k)) continue;
    seen.add(k);
    usable.push(l);
    if(usable.length >= MAX_LEADS) break;
  }

  const output = {
    generatedAt: now(),
    engine: 'Free Feed Radar V4.2',
    geoMode: 'texas_first_nationwide',
    tavilyUsed: false,
    sources: {
      googleNewsQueries: FEEDS.length,
      gdeltQueries: 6,
      paidSearchApis: 0
    },
    stats: {
      rawSignals: leads.length + rejected.length,
      candidates: leads.length,
      usableLeads: usable.length,
      rejected: rejected.length,
      collectionErrors: errors.length
    },
    errors,
    leads: usable
  };

  const rejectedOutput = {
    generatedAt: output.generatedAt,
    engine: output.engine,
    stats: {
      totalRejected: rejected.length,
      noHumanContact: rejected.filter(x=>x.reason==='no named human contact').length,
      collectionErrors: errors.length
    },
    errors,
    rejected: rejected.slice(0,500)
  };

  fs.mkdirSync(path.join(process.cwd(),'data'), {recursive:true});
  fs.writeFileSync(OUT_ROOT, JSON.stringify(output,null,2));
  fs.writeFileSync(OUT_DATA, JSON.stringify(output,null,2));
  fs.writeFileSync(REJ_ROOT, JSON.stringify(rejectedOutput,null,2));
  fs.writeFileSync(REJ_DATA, JSON.stringify(rejectedOutput,null,2));
  fs.writeFileSync(RUN_LOG, JSON.stringify({
    lastRunAt: output.generatedAt,
    startedAt: started,
    status: 'complete',
    usableLeads: usable.length,
    rejected: rejected.length,
    errors: errors.length,
    message: `Free radar completed with ${usable.length} usable leads.`
  }, null, 2));

  console.log(`Wrote ${usable.length} usable leads. Rejected ${rejected.length}. Errors ${errors.length}.`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
