#!/usr/bin/env node
'use strict';

/**
 * Basin OS Radar Runner — Free Discovery + GitHub Models Meta Llama Analysis
 *
 * Discovery:
 *   - Google News RSS / public free feeds
 *   - No Tavily / Brave required
 *
 * AI analysis:
 *   - GitHub Models using Meta Llama from GitHub Actions
 *   - Uses GITHUB_TOKEN automatically from Actions if workflow has permissions.models: read
 *   - Optional override: GITHUB_MODELS_TOKEN
 *   - Optional override: GITHUB_MODELS_MODEL
 *
 * Hard rule:
 *   - A usable lead MUST be a real named human contact
 *   - AND must have at least one contact/research path
 *   - Rejected records get nextEligibleCheck 14 days out
 */

const fs = require('fs');
const path = require('path');

const OUT_ROOT = path.join(process.cwd(), 'radar-leads.json');
const OUT_DATA = path.join(process.cwd(), 'data', 'radar-leads.json');
const REJ_ROOT = path.join(process.cwd(), 'radar-rejected.json');
const REJ_DATA = path.join(process.cwd(), 'data', 'radar-rejected.json');
const RUN_LOG = path.join(process.cwd(), 'data', 'radar-run-log.json');

const MAX_PER_FEED = Number(process.env.RADAR_MAX_PER_FEED || 16);
const MAX_LEADS = Number(process.env.RADAR_MAX_LEADS || 120);
const MAX_MODEL_ANALYSES = Number(process.env.GITHUB_MODELS_MAX_ANALYSES || 25);
const GH_MODELS_TOKEN = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || '';
const GH_MODELS_ENDPOINT = process.env.GITHUB_MODELS_ENDPOINT || 'https://models.github.ai/inference/chat/completions';

// If GitHub's model catalog shows a different exact Meta Llama ID, set GITHUB_MODELS_MODEL in radar.yml.
const GH_MODELS = [
  process.env.GITHUB_MODELS_MODEL,
  'meta/Llama-4-Scout-17B-16E-Instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta/Meta-Llama-3.1-8B-Instruct'
].filter(Boolean);

function now(){ return new Date().toISOString(); }
function plusDays(days){ return new Date(Date.now() + days * 86400000).toISOString(); }
function id(prefix='rad-llama'){ return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function clean(s, max=800){
  return String(s || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function fingerprint(x){
  return clean([x.name, x.company, x.signal, x.title, x.url, x.sourceUrl, x.rawTitle].filter(Boolean).join('|'), 500)
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, '');
}

const FEEDS = [
  { name:'Texas physician practice owners', type:'physician', priority:'texas', query:'("Dr." OR "MD" OR "DO") ("opened" OR "launches" OR "joins" OR "named") ("medical practice" OR orthopedic OR gastroenterology OR dermatology OR urology) Texas' },
  { name:'Nationwide physician practice signals', type:'physician', priority:'nationwide', query:'("Dr." OR "MD" OR "DO") ("opened" OR "launches" OR "joins" OR "named") ("medical practice" OR orthopedic OR gastroenterology OR dermatology OR urology) USA 2025 OR 2026' },
  { name:'Founder owner liquidity events', type:'liquidity_event', priority:'nationwide', query:'("sold his company" OR "sold her company" OR "founder exits" OR "acquired by") ("CEO" OR founder OR owner) USA 2025 OR 2026' },
  { name:'Energy executives named signals', type:'energy', priority:'energy_states', query:'("oil and gas" OR "mineral rights" OR "royalty owner" OR "energy operator") ("CEO" OR president OR founder OR owner) (Texas OR Oklahoma OR Louisiana OR New Mexico OR Colorado OR Wyoming OR North Dakota)' },
  { name:'CPA partner named signals', type:'cpa', priority:'nationwide', query:'("CPA" OR "tax partner") ("named partner" OR promoted OR joins OR speaker) "business owners" USA' },
  { name:'Attorney partner named signals', type:'attorney', priority:'nationwide', query:'("attorney" OR "law partner") ("named partner" OR promoted OR joins OR speaker) ("estate planning" OR tax OR business) USA' },
  { name:'Podcast interview named signals', type:'media', priority:'nationwide', query:'podcast interview ("founder" OR "CEO" OR "physician" OR "attorney" OR "CPA") USA 2025 OR 2026' }
];

function googleNewsUrl(query){
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en';
}

async function fetchText(url){
  const res = await fetch(url, { headers: {'User-Agent':'BasinOSRadar/5.1 GitHubModels'} });
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
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

function badName(name){
  const n = String(name || '').trim();
  const lower = n.toLowerCase();
  if(!n || n.length < 5) return true;

  const bad = ['names new','tax strategies','essential financial','bay legal','virtruvian partners','email addresses','licensure supervision','via llp','los angeles','new york','houston','dallas','austin','san antonio','nationwide','practice owner','business owner','law partner','attorney','physician','doctor','cpa','tax advisor'];
  if(bad.some(x => lower === x || lower.includes(x))) return true;
  if(/\b(strategies|financial|partners|legal|capital|ventures|group|llc|inc|firm|clinic|practice|medical|health|associates|company|services|advisors|consulting|solutions|bank|hospital|center|university|news|county|city|state)\b/i.test(n)) return true;
  if(!/^[A-Z][a-zA-Z'.-]{1,}(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]{1,}$/.test(n)) return true;
  return false;
}

function extractHumanName(title){
  const t = clean(title, 300).replace(/\s+-\s+[^-]+$/, '');
  const patterns = [
    /\bDr\.?\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/,
    /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+),?\s+(?:MD|DO|CPA|JD|CEO|Founder|Owner|President|Partner)\b/,
    /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\s+(?:named|joins|promoted|appointed|launches|opens|acquires|sells|speaks|discusses|leads|takes|talks)\b/
  ];
  for(const p of patterns){
    const m = t.match(p);
    if(m && !badName(m[1])) return m[1].trim();
  }
  const names = [...t.matchAll(/\b([A-Z][a-zA-Z'.-]{2,}(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]{2,})\b/g)].map(m => m[1]);
  for(const n of names) if(!badName(n)) return n.trim();
  return '';
}

function extractCompany(title, desc){
  const text = clean(`${title} ${desc}`, 700);
  const patterns = [
    /(?:at|with|joins|from|of)\s+([A-Z][A-Za-z0-9 &.,'’\-]{3,90})/,
    /([A-Z][A-Za-z0-9 &.,'’\-]{3,90})\s+(?:announces|acquires|opens|launches|names|promotes)/
  ];
  for(const p of patterns){
    const m = text.match(p);
    if(m) return clean(m[1].replace(/\s+(in|as|for|after|with|to|and)\s+.*/i, ''), 90);
  }
  return '';
}

function inferTitle(type, text){
  const s = String(text || '').toLowerCase();
  if(/surgeon|orthopedic|physician|doctor|medical practice|clinic|gastro|dermatology|urology|cardiology/.test(s)) return 'Physician / Medical Practice';
  if(/cpa|tax|accounting/.test(s)) return 'CPA / Tax Advisor';
  if(/attorney|law firm|estate planning|partner/.test(s)) return 'Attorney / Law Partner';
  if(/oil|gas|energy|mineral|royalty|operator/.test(s)) return 'Energy Executive';
  if(/real estate|developer/.test(s)) return 'Real Estate Developer';
  if(/founder|ceo|owner|president|business/.test(s)) return 'Business Owner / Executive';
  return type || 'Prospect Signal';
}

function makeContactMethods(name, company){
  const li = encodeURIComponent([name, company].filter(Boolean).join(' '));
  const q = encodeURIComponent([name, company, 'contact LinkedIn email'].filter(Boolean).join(' '));
  return [
    { type:'LinkedIn Search', value:`https://www.linkedin.com/search/results/people/?keywords=${li}`, confidence:'Medium', source:'manual verification path' },
    { type:'Google Search', value:`https://www.google.com/search?q=${q}`, confidence:'Medium', source:'manual verification path' }
  ];
}

function validLead(l){
  return !badName(l.name) && Array.isArray(l.contactMethods) && l.contactMethods.length > 0;
}

function scoreLead(l){
  const blob = [l.name,l.title,l.company,l.signal,l.summary,l.sourceFeed,l.priority].join(' ').toLowerCase();
  let s = 44;
  const signals = [];
  const add = (pts, txt) => { s += pts; signals.push(txt); };
  add(15, 'named human contact');
  add(10, 'manual contact path');
  if(/physician|surgeon|medical|clinic|doctor/.test(blob)) add(15, 'physician/medical ICP');
  if(/owner|founder|ceo|president|partner|executive/.test(blob)) add(12, 'owner/executive signal');
  if(/cpa|tax|accounting/.test(blob)) add(10, 'CPA/tax signal');
  if(/attorney|law/.test(blob)) add(8, 'attorney/referral signal');
  if(/oil|gas|energy|mineral|royalty|idc|depletion/.test(blob)) add(10, 'energy/tax angle');
  if(/acquir|sold|exit|liquidity|opened|launch|promoted|named|speaker|podcast|interview/.test(blob)) add(8, 'timely trigger');
  if(/texas|dallas|houston|austin|fort worth|midland/.test(blob) || l.priority === 'texas') add(4, 'Texas-first');
  s = Math.max(1, Math.min(94, Math.round(s)));
  l.score = s;
  l.grade = s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : 'D';
  l.scoreSignals = signals;
}

function loadExistingRejected(){
  const set = new Set();
  for(const f of [REJ_ROOT, REJ_DATA]){
    try{
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const arr = Array.isArray(j.rejected) ? j.rejected : [];
      for(const r of arr){
        if(r.nextEligibleCheck && new Date(r.nextEligibleCheck).getTime() > Date.now()) set.add(fingerprint(r));
      }
    }catch(e){}
  }
  return set;
}

function toLead(item, feed, skipSet){
  const title = clean(item.title, 260);
  const summary = clean(item.description || title, 900);
  const raw = { rawTitle:title, url:item.link, sourceFeed:feed.name };
  if(skipSet.has(fingerprint(raw))) return { reject:true, reason:'skip window active', ...raw };
  const name = extractHumanName(title);
  if(!name || badName(name)) return { reject:true, reason:'no real named human contact', ...raw, nextEligibleCheck:plusDays(14) };
  const company = extractCompany(title, summary);
  const lead = {
    id:id(), name, title:inferTitle(feed.type, `${title} ${summary}`), company,
    location:feed.priority === 'texas' ? 'Texas-first' : 'Nationwide USA',
    url:item.link, sourceUrl:item.link, source:'Free Feed Radar', sourceFeed:feed.name, sourceQuery:feed.query,
    sourceDate:item.pubDate || '', sourceType:feed.type, priority:feed.priority, summary, signal:title, foundAt:now(),
    status:'New', qualificationStatus:'Qualified', contactable:true, usaBased:true, workflowEligible:true,
    contactMethods:makeContactMethods(name, company), contactSummary:'LinkedIn Search + Google Search',
    nextAction:`Day 1: verify ${name}, confirm LinkedIn/contact path, then send reviewed email or LinkedIn touch using the public signal.`
  };
  if(!validLead(lead)) return { reject:true, reason:'failed strict lead validation', ...raw, name, company, nextEligibleCheck:plusDays(14) };
  scoreLead(lead);
  return lead;
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
        headers:{ 'Content-Type':'application/json', 'Accept':'application/vnd.github+json', 'Authorization':`Bearer ${GH_MODELS_TOKEN}` },
        body:JSON.stringify({ model, messages, temperature:0.1, max_tokens:650, response_format:{type:'json_object'} })
      });
      const txt = await res.text();
      if(!res.ok){ lastError = `GitHub Models ${model}: ${res.status} ${txt.slice(0,250)}`; continue; }
      const j = JSON.parse(txt);
      const content = j.choices?.[0]?.message?.content || '';
      return { model, json:extractJson(content), raw:content };
    }catch(e){ lastError = `GitHub Models ${model}: ${e.message || e}`; }
  }
  throw new Error(lastError || 'GitHub Models call failed');
}

async function llamaAnalyzeLead(lead){
  if(!GH_MODELS_TOKEN) return { used:false, lead };
  const system = [
    'You are Basin OS lead quality analyst. Return ONLY compact JSON.',
    'Hard rules: usable=false unless this is a real named human person and there is a contact/research path.',
    'Reject company names, article topics, city names, generic phrases, and non-person strings.',
    'Do not guarantee investment returns. Keep compliance-safe wording.',
    'JSON keys: usable, realHuman, contactPath, title, company, scoreAdjustment, bestAngle, likelyObjection, nextAction, rejectionReason.'
  ].join('\n');
  const user = JSON.stringify({ name:lead.name, title:lead.title, company:lead.company, signal:lead.signal, summary:lead.summary, source:lead.sourceFeed, sourceUrl:lead.sourceUrl, contactMethods:lead.contactMethods });
  const result = await githubModelsChat([{role:'system',content:system},{role:'user',content:user}]);
  if(!result || !result.json) return { used:false, lead };
  const a = result.json;
  const usable = a.usable === true && a.realHuman !== false && a.contactPath !== false;
  if(!usable) return { used:true, model:result.model, reject:true, reason:clean(a.rejectionReason || 'Meta Llama rejected lead',220), nextEligibleCheck:plusDays(14), lead };
  if(typeof a.title === 'string' && a.title.trim()) lead.title = clean(a.title, 100);
  if(typeof a.company === 'string' && a.company.trim()) lead.company = clean(a.company, 100);
  const adj = Math.max(-15, Math.min(15, Number(a.scoreAdjustment || 0)));
  lead.score = Math.max(1, Math.min(98, Math.round((lead.score || 60) + adj)));
  lead.grade = lead.score >= 85 ? 'A' : lead.score >= 70 ? 'B' : lead.score >= 55 ? 'C' : 'D';
  lead.aiProvider = 'GitHub Models';
  lead.aiModel = result.model;
  lead.aiAnalyzedAt = now();
  lead.aiAngle = clean(a.bestAngle || lead.aiAngle || lead.summary || '', 500);
  lead.bestAngle = lead.aiAngle;
  lead.likelyObjection = clean(a.likelyObjection || 'Need to review with CPA first.', 240);
  lead.nextAction = clean(a.nextAction || lead.nextAction, 360);
  lead.scoreSignals = Array.from(new Set([...(lead.scoreSignals || []), 'Meta Llama quality check']));
  return { used:true, model:result.model, lead };
}

async function enhanceWithLlama(leads, rejected, errors){
  if(!GH_MODELS_TOKEN || !leads.length) return { leads, modelUsed:false, modelName:'', modelCalls:0 };
  const out = [];
  let modelName = '', modelCalls = 0;
  for(const lead of leads){
    if(modelCalls >= MAX_MODEL_ANALYSES){ out.push(lead); continue; }
    try{
      const result = await llamaAnalyzeLead(lead);
      if(result.used){ modelCalls++; if(result.model) modelName = result.model; }
      if(result.reject){
        rejected.push({ id:id('reject'), name:lead.name, company:lead.company, source:lead.source || lead.sourceFeed || 'GitHub Models', reason:result.reason, skippedAt:now(), nextEligibleCheck:result.nextEligibleCheck || plusDays(14), original:lead });
      }else out.push(result.lead || lead);
    }catch(e){
      errors.push({source:'GitHub Models Meta Llama', error:String(e.message || e)});
      out.push(lead);
      break;
    }
  }
  const existing = new Set(out.map(fingerprint));
  for(const l of leads){ if(!existing.has(fingerprint(l))) out.push(l); }
  return { leads:out, modelUsed:modelCalls>0, modelName, modelCalls };
}

async function main(){
  const startedAt = now();
  const leads = [], rejected = [], errors = [];
  const skipSet = loadExistingRejected();
  for(const feed of FEEDS){
    try{
      const xml = await fetchText(googleNewsUrl(feed.query));
      const items = parseRss(xml).slice(0, MAX_PER_FEED);
      for(const item of items){
        const l = toLead(item, feed, skipSet);
        if(l.reject) rejected.push({...l, skippedAt:now(), nextEligibleCheck:l.nextEligibleCheck || plusDays(14)});
        else leads.push(l);
      }
      console.log(`${feed.name}: ${items.length} items`);
    }catch(e){ errors.push({source:feed.name, error:String(e.message || e)}); }
  }
  const seen = new Set(), strictUsable = [];
  for(const l of leads.sort((a,b)=>(b.score||0)-(a.score||0))){
    const k = fingerprint(l); if(!k || seen.has(k)) continue; seen.add(k);
    if(validLead(l)) strictUsable.push(l);
    else rejected.push({id:id('reject'), name:l.name, company:l.company, source:l.source || l.sourceFeed, reason:'failed final strict validation', skippedAt:now(), nextEligibleCheck:plusDays(14), original:l});
    if(strictUsable.length >= MAX_LEADS) break;
  }
  const ai = await enhanceWithLlama(strictUsable, rejected, errors);
  const finalSeen = new Set(), usable = [];
  for(const l of ai.leads.sort((a,b)=>(b.score||0)-(a.score||0))){
    const k = fingerprint(l); if(!k || finalSeen.has(k)) continue; finalSeen.add(k);
    if(validLead(l)) usable.push(l);
    if(usable.length >= MAX_LEADS) break;
  }
  const output = {
    generatedAt:now(), engine:'Free Feed Radar + GitHub Models Meta Llama V5.1', geoMode:'texas_first_nationwide', tavilyUsed:false, braveUsed:false,
    githubModelsUsed:ai.modelUsed, githubModelsModel:ai.modelName || '', hardRules:{requiresRealHumanName:true, requiresContactMethodOrResearchPath:true, skipRejectedForDays:14},
    sources:{googleNewsQueries:FEEDS.length, paidSearchApis:0},
    stats:{rawSignals:leads.length+rejected.length, deterministicCandidates:strictUsable.length, usableLeads:usable.length, rejected:rejected.length, collectionErrors:errors.length, githubModelCalls:ai.modelCalls || 0},
    errors, leads:usable
  };
  const rejectedOutput = { generatedAt:output.generatedAt, engine:output.engine, stats:{totalRejected:rejected.length, noHumanContact:rejected.filter(x=>/human/i.test(x.reason||'')).length, noContactMethod:rejected.filter(x=>/contact/i.test(x.reason||'')).length, skipWindow:rejected.filter(x=>/skip/i.test(x.reason||'')).length, modelRejected:rejected.filter(x=>/llama|model|github/i.test(x.reason||'')).length, collectionErrors:errors.length}, errors, rejected:rejected.slice(0,1000) };
  fs.mkdirSync(path.join(process.cwd(), 'data'), {recursive:true});
  fs.writeFileSync(OUT_ROOT, JSON.stringify(output, null, 2));
  fs.writeFileSync(OUT_DATA, JSON.stringify(output, null, 2));
  fs.writeFileSync(REJ_ROOT, JSON.stringify(rejectedOutput, null, 2));
  fs.writeFileSync(REJ_DATA, JSON.stringify(rejectedOutput, null, 2));
  fs.writeFileSync(RUN_LOG, JSON.stringify({lastRunAt:output.generatedAt, startedAt, status:'complete', usableLeads:usable.length, rejected:rejected.length, errors:errors.length, githubModelsUsed:ai.modelUsed, githubModelsModel:ai.modelName || '', githubModelCalls:ai.modelCalls || 0, message:`Radar completed with ${usable.length} usable named-human leads. GitHub Models calls: ${ai.modelCalls || 0}.`}, null, 2));
  console.log(`Wrote ${usable.length} usable leads. Rejected ${rejected.length}. Errors ${errors.length}. GitHub Models calls: ${ai.modelCalls || 0}.`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
