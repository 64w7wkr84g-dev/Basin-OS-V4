#!/usr/bin/env node
'use strict';

/**
 * Basin OS Radar Runner V5.2 — HUMAN ONLY / CONTACT VERIFIED
 *
 * This runner fixes the core problem:
 *   "Former Assistant", "System Transactional", "Expert Advertising",
 *   "Regional Dermatology", "Tax Strategies", etc. are NOT leads.
 *
 * A record becomes a lead ONLY if:
 *   1. The visible lead name is a real individual person.
 *   2. The runner has an actual contact method:
 *      - email
 *      - phone
 *      - direct LinkedIn profile URL: linkedin.com/in/...
 *      - NPI/direct profile URL with phone/email in the record
 *
 * LinkedIn Search URLs and Google Search URLs are NOT treated as contact methods.
 * Those are research tasks, not leads.
 *
 * If the signal does not meet the rule, it is rejected/skipped for 14 days.
 */

const fs = require('fs');
const path = require('path');

const OUT_ROOT = path.join(process.cwd(), 'radar-leads.json');
const OUT_DATA = path.join(process.cwd(), 'data', 'radar-leads.json');
const REJ_ROOT = path.join(process.cwd(), 'radar-rejected.json');
const REJ_DATA = path.join(process.cwd(), 'data', 'radar-rejected.json');
const RUN_LOG = path.join(process.cwd(), 'data', 'radar-run-log.json');

const MAX_PER_FEED = Number(process.env.RADAR_MAX_PER_FEED || 18);
const MAX_LEADS = Number(process.env.RADAR_MAX_LEADS || 80);
const MAX_MODEL_ANALYSES = Number(process.env.GITHUB_MODELS_MAX_ANALYSES || 35);
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
function id(prefix='rad-human'){ return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function clean(s, max=900){
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
  return clean([x.name, x.company, x.signal, x.title, x.url, x.sourceUrl, x.rawTitle].filter(Boolean).join('|'), 600)
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, '');
}

const FEEDS = [
  { name:'Texas named physician signals', type:'physician', priority:'texas', query:'("Dr." OR "MD" OR "DO") ("joins" OR "named" OR "appointed" OR "promoted") ("Texas" OR "Dallas" OR "Houston" OR "Austin" OR "Fort Worth" OR "San Antonio")' },
  { name:'Nationwide named physician signals', type:'physician', priority:'nationwide', query:'("Dr." OR "MD" OR "DO") ("joins" OR "named" OR "appointed" OR "promoted") ("orthopedic" OR "dermatology" OR "gastroenterology" OR "urology" OR "cardiology") USA 2025 OR 2026' },
  { name:'Named founder owner liquidity signals', type:'liquidity_event', priority:'nationwide', query:'("founder" OR "CEO" OR "owner") ("sold" OR "acquired" OR "exits" OR "acquisition") ("said" OR "announced" OR "named") USA 2025 OR 2026' },
  { name:'Named energy executive signals', type:'energy', priority:'energy_states', query:'("oil and gas" OR "energy" OR "mineral rights" OR "royalty") ("CEO" OR "president" OR "founder" OR "owner") ("named" OR "appointed" OR "promoted" OR "joins")' },
  { name:'Named CPA partner signals', type:'cpa', priority:'nationwide', query:'("CPA" OR "tax partner") ("named partner" OR "promoted" OR "joins" OR "appointed") "business owners" USA' },
  { name:'Named attorney partner signals', type:'attorney', priority:'nationwide', query:'("attorney" OR "law partner") ("named partner" OR "promoted" OR "joins" OR "appointed") ("estate planning" OR tax OR business) USA' }
];

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

  if(!/^[A-Z][a-zA-Z'.-]{1,}(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]{1,}$/.test(n)) {
    return false;
  }

  return true;
}

function extractHumanNameStrict(title, desc=''){
  const t = clean(`${title} ${desc}`, 1100);

  // Do NOT use a blind "two capitalized words" fallback. That is what created garbage like Former Assistant.
  const patterns = [
    { re: /\bDr\.?\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/, source: 'honorific Dr.' },
    { re: /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+),?\s+(?:MD|DO|DMD|DDS|CPA|JD|Esq\.?|MBA|PhD)\b/, source: 'credential suffix' },
    { re: /\b(?:CEO|Founder|Owner|President|Partner|Attorney|CPA|Surgeon|Physician|Doctor)\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\b/, source: 'role before name' },
    { re: /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]+)\s+(?:joins|joined|named|appointed|promoted|launches|opens|founds|founded|acquires|acquired|sells|sold|exits|announces|speaks|speaker|interviewed)\b/i, source: 'name before action verb' }
  ];

  for(const p of patterns){
    const m = t.match(p.re);
    if(m && looksLikePersonName(m[1])){
      return { name: clean(m[1], 90), source: p.source };
    }
  }

  return { name: '', source: '' };
}

function googleNewsUrl(query){
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en';
}

async function fetchText(url){
  const res = await fetch(url, { headers: {'User-Agent':'BasinOSRadar/5.2 HumanOnly'} });
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

function extractEmail(text){
  const m = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : '';
}

function extractPhone(text){
  const m = String(text || '').match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/);
  return m ? m[0].replace(/[^\d+]/g, '').replace(/^1?(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') : '';
}

function extractDirectLinkedIn(text){
  const m = String(text || '').match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9%_\-./]+/i);
  return m ? m[0].replace(/[),.]+$/, '') : '';
}

function extractCompany(title, desc){
  const text = clean(`${title} ${desc}`, 900);
  const patterns = [
    /(?:at|with|joins|from|of)\s+([A-Z][A-Za-z0-9 &.,'’\-]{3,90})/,
    /([A-Z][A-Za-z0-9 &.,'’\-]{3,90})\s+(?:announces|acquires|opens|launches|names|promotes)/
  ];

  for(const p of patterns){
    const m = text.match(p);
    if(m){
      const c = clean(m[1].replace(/\s+(in|as|for|after|with|to|and)\s+.*/i, ''), 90);
      if(c && !looksLikePersonName(c)) return c;
    }
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

function makeVerifiedContactMethods(text){
  const methods = [];
  const email = extractEmail(text);
  const phone = extractPhone(text);
  const linkedin = extractDirectLinkedIn(text);

  if(email) methods.push({ type:'Email', value:email, confidence:'High', source:'source text' });
  if(phone) methods.push({ type:'Phone', value:phone, confidence:'High', source:'source text' });
  if(linkedin) methods.push({ type:'LinkedIn Profile', value:linkedin, confidence:'High', source:'source text' });

  return methods;
}

function hasVerifiedContactMethod(lead){
  const methods = Array.isArray(lead.contactMethods) ? lead.contactMethods : [];
  return methods.some(m => {
    const type = String(m.type || '').toLowerCase();
    const value = String(m.value || '');
    if(type.includes('email') && /@/.test(value)) return true;
    if(type.includes('phone') && value.replace(/\D/g, '').length >= 10) return true;
    if(/linkedin\.com\/in\//i.test(value)) return true;
    return false;
  });
}

function validLead(lead){
  return looksLikePersonName(lead.name) && hasVerifiedContactMethod(lead);
}

function scoreLead(l){
  const blob = [l.name, l.title, l.company, l.signal, l.summary, l.sourceFeed, l.priority].join(' ').toLowerCase();
  let s = 44;
  const signals = [];
  const add = (pts, txt) => { s += pts; signals.push(txt); };

  add(20, 'verified named human');
  add(20, 'verified contact method');

  if(/physician|surgeon|medical|clinic|doctor/.test(blob)) add(15, 'physician/medical ICP');
  if(/owner|founder|ceo|president|partner|executive/.test(blob)) add(12, 'owner/executive signal');
  if(/cpa|tax|accounting/.test(blob)) add(10, 'CPA/tax signal');
  if(/attorney|law/.test(blob)) add(8, 'attorney/referral signal');
  if(/oil|gas|energy|mineral|royalty|idc|depletion/.test(blob)) add(10, 'energy/tax angle');
  if(/acquir|sold|exit|liquidity|opened|launch|promoted|named|speaker|podcast|interview/.test(blob)) add(8, 'timely trigger');
  if(/texas|dallas|houston|austin|fort worth|midland/.test(blob) || l.priority === 'texas') add(4, 'Texas-first');

  s = Math.max(1, Math.min(98, Math.round(s)));
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
        if(r.nextEligibleCheck && new Date(r.nextEligibleCheck).getTime() > Date.now()){
          set.add(fingerprint(r));
        }
      }
    }catch(e){}
  }
  return set;
}

function reject(reason, raw, extra={}){
  return {
    reject: true,
    reason,
    ...raw,
    ...extra,
    skippedAt: now(),
    nextEligibleCheck: plusDays(14)
  };
}

function toLeadDeterministic(item, feed, skipSet){
  const title = clean(item.title, 260);
  const summary = clean(item.description || title, 900);
  const raw = { rawTitle:title, url:item.link, sourceUrl:item.link, sourceFeed:feed.name, sourceQuery:feed.query };
  const fp = fingerprint(raw);

  if(skipSet.has(fp)) return reject('skip window active', raw);

  const text = `${title} ${summary}`;
  const extracted = extractHumanNameStrict(title, summary);

  if(!extracted.name){
    return reject('no real named human contact found in headline/summary', raw);
  }

  const contactMethods = makeVerifiedContactMethods(text);

  if(!contactMethods.length){
    return reject('named human found but no verified contact method; not a lead', raw, { name: extracted.name });
  }

  const company = extractCompany(title, summary);

  const lead = {
    id:id(),
    name: extracted.name,
    personNameSource: extracted.source,
    title: inferTitle(feed.type, text),
    company,
    location: feed.priority === 'texas' ? 'Texas-first' : 'Nationwide USA',
    url:item.link,
    sourceUrl:item.link,
    source:'Free Feed Radar',
    sourceFeed:feed.name,
    sourceQuery:feed.query,
    sourceDate:item.pubDate || '',
    sourceType:feed.type,
    priority:feed.priority,
    summary,
    signal:title,
    foundAt:now(),
    status:'New',
    qualificationStatus:'Qualified',
    contactable:true,
    usaBased:true,
    workflowEligible:true,
    contactMethods,
    contactSummary: contactMethods.map(m => `${m.type}: ${m.value}`).join(' | '),
    nextAction:`Day 1: verify ${extracted.name}, confirm contact method, then send reviewed outreach tied to the public signal.`
  };

  if(!validLead(lead)){
    return reject('failed final human/contact validation', raw, { name: extracted.name, company });
  }

  scoreLead(lead);
  return lead;
}

function extractJson(text){
  const s = String(text || '').trim();
  try{ return JSON.parse(s); }catch(e){}
  const m = s.match(/\{[\s\S]*\}/);
  if(m){
    try{ return JSON.parse(m[0]); }catch(e){}
  }
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
        body:JSON.stringify({
          model,
          messages,
          temperature:0,
          max_tokens:700,
          response_format:{ type:'json_object' }
        })
      });

      const txt = await res.text();

      if(!res.ok){
        lastError = `GitHub Models ${model}: ${res.status} ${txt.slice(0, 250)}`;
        continue;
      }

      const j = JSON.parse(txt);
      const content = j.choices?.[0]?.message?.content || '';
      return { model, json:extractJson(content), raw:content };
    }catch(e){
      lastError = `GitHub Models ${model}: ${e.message || e}`;
    }
  }

  throw new Error(lastError || 'GitHub Models call failed');
}

async function llamaExtractAndValidateSignal(item, feed){
  if(!GH_MODELS_TOKEN) return null;

  const title = clean(item.title, 260);
  const summary = clean(item.description || title, 900);

  const system = [
    'You are a strict lead validation engine for Basin OS.',
    'Return ONLY compact JSON.',
    'A lead is valid ONLY if the source text contains an exact first-and-last-name individual person AND an actual contact method.',
    'Actual contact method means email, phone, or a direct linkedin.com/in profile URL.',
    'Google search URL, LinkedIn search URL, company website, and news article URL are NOT contact methods.',
    'Reject company names, article titles, roles, city names, generic topics, and phrases like Former Assistant or Expert Advertising.',
    'JSON keys: usable, name, title, company, email, phone, linkedinProfileUrl, rejectionReason, bestAngle, likelyObjection, nextAction.'
  ].join('\n');

  const user = JSON.stringify({
    feed: feed.name,
    title,
    summary,
    url: item.link
  });

  const result = await githubModelsChat([
    { role:'system', content:system },
    { role:'user', content:user }
  ]);

  if(!result || !result.json) return null;

  const a = result.json;
  const raw = { rawTitle:title, url:item.link, sourceUrl:item.link, sourceFeed:feed.name, sourceQuery:feed.query };

  if(a.usable !== true){
    return reject(clean(a.rejectionReason || 'Meta Llama rejected: not a verified human/contact lead', 240), raw);
  }

  const name = clean(a.name || '', 90);
  if(!looksLikePersonName(name)){
    return reject('Meta Llama did not return a valid first-and-last-name person', raw, { model: result.model });
  }

  const methods = [];
  if(a.email && /@/.test(String(a.email))) methods.push({ type:'Email', value:String(a.email).trim(), confidence:'High', source:'GitHub Models extracted from source text' });
  if(a.phone && String(a.phone).replace(/\D/g, '').length >= 10) methods.push({ type:'Phone', value:String(a.phone).trim(), confidence:'High', source:'GitHub Models extracted from source text' });
  if(a.linkedinProfileUrl && /linkedin\.com\/in\//i.test(String(a.linkedinProfileUrl))) methods.push({ type:'LinkedIn Profile', value:String(a.linkedinProfileUrl).trim(), confidence:'High', source:'GitHub Models extracted from source text' });

  if(!methods.length){
    return reject('Meta Llama found a person but no verified contact method', raw, { name, model: result.model });
  }

  const lead = {
    id:id(),
    name,
    personNameSource:'GitHub Models extraction',
    title: clean(a.title || inferTitle(feed.type, `${title} ${summary}`), 100),
    company: clean(a.company || extractCompany(title, summary), 100),
    location: feed.priority === 'texas' ? 'Texas-first' : 'Nationwide USA',
    url:item.link,
    sourceUrl:item.link,
    source:'Free Feed Radar + GitHub Models',
    sourceFeed:feed.name,
    sourceQuery:feed.query,
    sourceDate:item.pubDate || '',
    sourceType:feed.type,
    priority:feed.priority,
    summary,
    signal:title,
    foundAt:now(),
    status:'New',
    qualificationStatus:'Qualified',
    contactable:true,
    usaBased:true,
    workflowEligible:true,
    contactMethods:methods,
    contactSummary: methods.map(m => `${m.type}: ${m.value}`).join(' | '),
    aiProvider:'GitHub Models',
    aiModel: result.model,
    aiAnalyzedAt: now(),
    aiAngle: clean(a.bestAngle || '', 500),
    bestAngle: clean(a.bestAngle || '', 500),
    likelyObjection: clean(a.likelyObjection || 'Need to review with CPA first.', 240),
    nextAction: clean(a.nextAction || `Verify ${name}, confirm contact method, and complete first outreach.`, 360)
  };

  if(!validLead(lead)){
    return reject('failed final Meta Llama human/contact validation', raw, { name, model: result.model });
  }

  scoreLead(lead);
  lead.scoreSignals = Array.from(new Set([...(lead.scoreSignals || []), 'Meta Llama verified human/contact']));
  return lead;
}

async function main(){
  const startedAt = now();
  const leads = [];
  const rejected = [];
  const errors = [];
  let modelCalls = 0;
  let modelUsed = false;
  let modelName = '';
  const skipSet = loadExistingRejected();

  for(const feed of FEEDS){
    try{
      const xml = await fetchText(googleNewsUrl(feed.query));
      const items = parseRss(xml).slice(0, MAX_PER_FEED);

      for(const item of items){
        const deterministic = toLeadDeterministic(item, feed, skipSet);

        if(!deterministic.reject){
          leads.push(deterministic);
          continue;
        }

        // If deterministic extraction fails, allow Meta Llama to salvage ONLY if it finds a real person + actual contact method.
        if(modelCalls < MAX_MODEL_ANALYSES && !/skip window/i.test(deterministic.reason || '')){
          try{
            const aiLead = await llamaExtractAndValidateSignal(item, feed);
            if(aiLead){
              modelCalls++;
              if(aiLead.aiModel) modelName = aiLead.aiModel;
              modelUsed = true;

              if(aiLead.reject) rejected.push(aiLead);
              else leads.push(aiLead);
              continue;
            }
          }catch(e){
            errors.push({ source:'GitHub Models Meta Llama', error:String(e.message || e) });
            // If model fails, do not break the run. Just reject deterministically.
          }
        }

        rejected.push(deterministic);
      }

      console.log(`${feed.name}: ${items.length} items`);
    }catch(e){
      errors.push({ source:feed.name, error:String(e.message || e) });
    }
  }

  const seen = new Set();
  const usable = [];

  for(const l of leads.sort((a,b) => (b.score || 0) - (a.score || 0))){
    const k = fingerprint(l);
    if(!k || seen.has(k)) continue;
    seen.add(k);

    if(validLead(l)){
      usable.push(l);
    }else{
      rejected.push(reject('failed last-mile usable-lead validation', {
        rawTitle:l.signal || l.name || '',
        url:l.url || '',
        sourceFeed:l.sourceFeed || ''
      }, { name:l.name, company:l.company, original:l }));
    }

    if(usable.length >= MAX_LEADS) break;
  }

  const output = {
    generatedAt:now(),
    engine:'Human-Only Verified Contact Radar V5.2',
    geoMode:'texas_first_nationwide',
    tavilyUsed:false,
    braveUsed:false,
    githubModelsUsed:modelUsed,
    githubModelsModel:modelName,
    hardRules:{
      visibleLeadNameMustBeRealPerson:true,
      requiresActualContactMethod:true,
      linkedinSearchUrlDoesNotCount:true,
      googleSearchUrlDoesNotCount:true,
      skipRejectedForDays:14
    },
    sources:{ googleNewsQueries:FEEDS.length, paidSearchApis:0 },
    stats:{
      rawSignals:leads.length + rejected.length,
      usableLeads:usable.length,
      rejected:rejected.length,
      collectionErrors:errors.length,
      githubModelCalls:modelCalls
    },
    errors,
    leads:usable
  };

  const rejectedOutput = {
    generatedAt:output.generatedAt,
    engine:output.engine,
    stats:{
      totalRejected:rejected.length,
      noHumanContact:rejected.filter(x => /human|person|name/i.test(x.reason || '')).length,
      noVerifiedContact:rejected.filter(x => /contact/i.test(x.reason || '')).length,
      skipWindow:rejected.filter(x => /skip/i.test(x.reason || '')).length,
      collectionErrors:errors.length
    },
    errors,
    rejected:rejected.slice(0, 1500)
  };

  fs.mkdirSync(path.join(process.cwd(), 'data'), { recursive:true });
  fs.writeFileSync(OUT_ROOT, JSON.stringify(output, null, 2));
  fs.writeFileSync(OUT_DATA, JSON.stringify(output, null, 2));
  fs.writeFileSync(REJ_ROOT, JSON.stringify(rejectedOutput, null, 2));
  fs.writeFileSync(REJ_DATA, JSON.stringify(rejectedOutput, null, 2));
  fs.writeFileSync(RUN_LOG, JSON.stringify({
    lastRunAt:output.generatedAt,
    startedAt,
    status:'complete',
    usableLeads:usable.length,
    rejected:rejected.length,
    errors:errors.length,
    githubModelsUsed:modelUsed,
    githubModelsModel:modelName,
    githubModelCalls:modelCalls,
    message:`Human-only radar completed with ${usable.length} verified-contact leads. Rejected ${rejected.length}.`
  }, null, 2));

  console.log(`Wrote ${usable.length} verified-contact leads. Rejected ${rejected.length}. Errors ${errors.length}. GitHub Models calls: ${modelCalls}.`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
