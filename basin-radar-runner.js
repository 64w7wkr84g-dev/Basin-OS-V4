#!/usr/bin/env node
'use strict';

/**
 * Basin OS V5 Strict Free Radar Runner
 * Groq = optional AI analyst only.
 * Discovery = free public feeds.
 *
 * Hard rule:
 * A usable lead MUST be a real named human contact AND have at least one contact/research path.
 * Company names, city names, article titles, topic names, and generic phrases are rejected.
 * Rejected items are skipped for at least 14 days by fingerprint.
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
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

function now(){ return new Date().toISOString(); }
function clean(s, max=700){
  return String(s||'')
    .replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\s+/g,' ').trim().slice(0,max);
}
function id(prefix='rad-strict'){ return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function fingerprint(x){ return clean([x.name,x.company,x.signal,x.url,x.sourceUrl,x.rawTitle].filter(Boolean).join('|'),400).toLowerCase().replace(/[^a-z0-9|]+/g,''); }

const FEEDS = [
  {name:'Texas physician practice owners', type:'physician', priority:'texas', query:'("Dr." OR "MD" OR "DO") ("opened" OR "launches" OR "joins" OR "named") ("medical practice" OR orthopedic OR gastroenterology OR dermatology OR urology) Texas'},
  {name:'Nationwide physician practice signals', type:'physician', priority:'nationwide', query:'("Dr." OR "MD" OR "DO") ("opened" OR "launches" OR "joins" OR "named") ("medical practice" OR orthopedic OR gastroenterology OR dermatology OR urology) USA 2025 OR 2026'},
  {name:'Founder owner liquidity events', type:'liquidity_event', priority:'nationwide', query:'("sold his company" OR "sold her company" OR "founder exits" OR "acquired by") ("CEO" OR founder OR owner) USA 2025 OR 2026'},
  {name:'Energy executives named signals', type:'energy', priority:'energy_states', query:'("oil and gas" OR "mineral rights" OR "royalty owner" OR "energy operator") ("CEO" OR president OR founder OR owner) (Texas OR Oklahoma OR Louisiana OR New Mexico OR Colorado OR Wyoming OR North Dakota)'},
  {name:'CPA partner named signals', type:'cpa', priority:'nationwide', query:'("CPA" OR "tax partner") ("named partner" OR promoted OR joins OR speaker) "business owners" USA'},
  {name:'Attorney partner named signals', type:'attorney', priority:'nationwide', query:'("attorney" OR "law partner") ("named partner" OR promoted OR joins OR speaker) ("estate planning" OR tax OR business) USA'},
  {name:'Podcast interview named signals', type:'media', priority:'nationwide', query:'podcast interview ("founder" OR "CEO" OR "physician" OR "attorney" OR "CPA") USA 2025 OR 2026'}
];

function googleNewsUrl(query){
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en';
}
async function fetchText(url){
  const res = await fetch(url, {headers:{'User-Agent':'BasinOSRadar/5.0'}});
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}
function parseRss(xml){
  return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]).map(b=>({
    title: clean((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1],240),
    link: clean((b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||[])[1],500),
    pubDate: clean((b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)||[])[1],120),
    description: clean((b.match(/<description[^>]*>([\s\S]*?)<\/description>/i)||[])[1],700)
  })).filter(x=>x.title||x.link);
}

function badName(name){
  const n=String(name||'').trim();
  const lower=n.toLowerCase();
  if(!n || n.length<5)return true;
  const bad=[
    'names new','tax strategies','essential financial','bay legal','virtruvian partners','practice owner',
    'business owner','email addresses','licensure supervision','via llp','los angeles','new york','houston',
    'dallas','austin','san antonio','nationwide','physician','doctor','attorney','law partner','cpa','tax advisor'
  ];
  if(bad.some(x=>lower===x || lower.includes(x)))return true;
  if(/\b(strategies|financial|partners|legal|capital|ventures|group|llc|inc|firm|clinic|practice|medical|health|associates|company|services|advisors|consulting|solutions|bank|hospital|center|university)\b/i.test(n))return true;
  if(!/^[A-Z][a-zA-Z'.-]{1,}(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.-]{1,}$/.test(n))return true;
  return false;
}

function extractHumanName(title){
  const t=clean(title,260).replace(/\s+-\s+[^-]+$/,'');
  const patterns=[
    /\bDr\.?\s+([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.)?\s+[A-Z][a-zA-Z'.-]+)\b/,
    /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.)?\s+[A-Z][a-zA-Z'.-]+),?\s+(?:MD|DO|CPA|JD|CEO|Founder|Owner|President|Partner)\b/,
    /\b([A-Z][a-zA-Z'.-]+(?:\s+[A-Z]\.)?\s+[A-Z][a-zA-Z'.-]+)\s+(?:named|joins|promoted|appointed|launches|opens|acquires|sells|speaks|discusses|leads|takes|talks)\b/
  ];
  for(const p of patterns){
    const m=t.match(p);
    if(m && !badName(m[1]))return m[1].trim();
  }
  const names=[...t.matchAll(/\b([A-Z][a-zA-Z'.-]{2,}(?:\s+[A-Z]\.)?\s+[A-Z][a-zA-Z'.-]{2,})\b/g)].map(m=>m[1]);
  for(const n of names)if(!badName(n))return n.trim();
  return '';
}
function extractCompany(title, desc){
  const text=clean(`${title} ${desc}`,600);
  const m=text.match(/(?:at|with|joins|from|of)\s+([A-Z][A-Za-z0-9 &.,'’\-]{3,70})/);
  if(!m)return '';
  return clean(m[1].replace(/\s+(in|as|for|after|with|to|and)\s+.*/i,''),90);
}
function inferTitle(type, text){
  const s=String(text||'').toLowerCase();
  if(/surgeon|orthopedic|physician|doctor|medical practice|clinic|gastro|dermatology|urology|cardiology/.test(s))return 'Physician / Medical Practice';
  if(/cpa|tax|accounting/.test(s))return 'CPA / Tax Advisor';
  if(/attorney|law firm|estate planning|partner/.test(s))return 'Attorney / Law Partner';
  if(/oil|gas|energy|mineral|royalty|operator/.test(s))return 'Energy Executive';
  if(/real estate|developer/.test(s))return 'Real Estate Developer';
  if(/founder|ceo|owner|president|business/.test(s))return 'Business Owner / Executive';
  return type || 'Prospect Signal';
}
function makeContactMethods(name, company){
  const li=encodeURIComponent([name,company].filter(Boolean).join(' '));
  const q=encodeURIComponent([name,company,'contact LinkedIn email'].filter(Boolean).join(' '));
  return [
    {type:'LinkedIn Search', value:`https://www.linkedin.com/search/results/people/?keywords=${li}`, confidence:'Medium', source:'manual verification path'},
    {type:'Google Search', value:`https://www.google.com/search?q=${q}`, confidence:'Medium', source:'manual verification path'}
  ];
}
function validLead(l){
  return !badName(l.name) && Array.isArray(l.contactMethods) && l.contactMethods.length>0;
}
function scoreLead(l){
  const blob=[l.name,l.title,l.company,l.signal,l.summary,l.sourceFeed,l.priority].join(' ').toLowerCase();
  let s=44, signals=[];
  const add=(n,t)=>{s+=n;signals.push(t)};
  add(15,'named human contact');
  add(10,'manual contact path');
  if(/physician|surgeon|medical|clinic|doctor/.test(blob))add(15,'physician/medical ICP');
  if(/owner|founder|ceo|president|partner|executive/.test(blob))add(12,'owner/executive signal');
  if(/cpa|tax|accounting/.test(blob))add(10,'CPA/tax signal');
  if(/attorney|law/.test(blob))add(8,'attorney/referral signal');
  if(/oil|gas|energy|mineral|royalty|idc|depletion/.test(blob))add(10,'energy/tax angle');
  if(/acquir|sold|exit|liquidity|opened|launch|promoted|named|speaker|podcast|interview/.test(blob))add(8,'timely trigger');
  if(/texas|dallas|houston|austin|fort worth|midland/.test(blob)||l.priority==='texas')add(4,'Texas-first');
  s=Math.max(1,Math.min(94,Math.round(s)));
  l.score=s; l.grade=s>=85?'A':s>=70?'B':s>=55?'C':'D'; l.scoreSignals=signals;
}
function toLead(item, feed, skipSet){
  const title=clean(item.title,240), summary=clean(item.description||title,700);
  const raw={rawTitle:title, url:item.link, sourceFeed:feed.name};
  const fp=fingerprint(raw);
  if(skipSet.has(fp))return {reject:true, reason:'skip window active', ...raw};

  const name=extractHumanName(title);
  if(!name || badName(name))return {reject:true, reason:'no real named human contact', ...raw, nextEligibleCheck:new Date(Date.now()+14*86400000).toISOString()};

  const company=extractCompany(title, summary);
  const lead={
    id:id(), name, title:inferTitle(feed.type, `${title} ${summary}`), company,
    location:feed.priority==='texas'?'Texas-first':'Nationwide USA',
    url:item.link, sourceUrl:item.link, source:'Free Feed Radar', sourceFeed:feed.name, sourceQuery:feed.query,
    sourceDate:item.pubDate||'', sourceType:feed.type, priority:feed.priority, summary, signal:title, foundAt:now(),
    status:'New', qualificationStatus:'Qualified', contactable:true, usaBased:true, workflowEligible:true,
    contactMethods:makeContactMethods(name, company), contactSummary:'LinkedIn Search + Google Search',
    nextAction:`Day 1: verify ${name}, confirm LinkedIn/contact path, then send reviewed email or LinkedIn touch using the public signal.`
  };
  if(!validLead(lead))return {reject:true, reason:'failed strict lead validation', ...raw, name, company, nextEligibleCheck:new Date(Date.now()+14*86400000).toISOString()};
  scoreLead(lead);
  return lead;
}
function loadExistingRejected(){
  const files=[REJ_ROOT,REJ_DATA];
  const set=new Set();
  for(const f of files){
    try{
      const j=JSON.parse(fs.readFileSync(f,'utf8'));
      const arr=Array.isArray(j.rejected)?j.rejected:[];
      for(const r of arr){
        if(r.nextEligibleCheck && new Date(r.nextEligibleCheck).getTime()>Date.now()){
          set.add(fingerprint(r));
        }
      }
    }catch(e){}
  }
  return set;
}
async function main(){
  const started=now(), leads=[], rejected=[], errors=[], skipSet=loadExistingRejected();
  for(const feed of FEEDS){
    try{
      const xml=await fetchText(googleNewsUrl(feed.query));
      const items=parseRss(xml).slice(0,MAX_PER_FEED);
      for(const item of items){
        const l=toLead(item,feed,skipSet);
        if(l.reject)rejected.push({...l, skippedAt:now(), nextEligibleCheck:l.nextEligibleCheck||new Date(Date.now()+14*86400000).toISOString()});
        else leads.push(l);
      }
      console.log(`${feed.name}: ${items.length} items`);
    }catch(e){errors.push({source:feed.name,error:String(e.message||e)});}
  }
  const seen=new Set(), usable=[];
  for(const l of leads.sort((a,b)=>(b.score||0)-(a.score||0))){
    const k=fingerprint(l); if(seen.has(k))continue; seen.add(k); usable.push(l); if(usable.length>=MAX_LEADS)break;
  }
  const output={generatedAt:now(),engine:'Strict Free Feed Radar V5',geoMode:'texas_first_nationwide',tavilyUsed:false,groqUsed:false,hardRules:{requiresRealHumanName:true,requiresContactMethod:true,skipRejectedForDays:14},sources:{googleNewsQueries:FEEDS.length,paidSearchApis:0},stats:{rawSignals:leads.length+rejected.length,candidates:leads.length,usableLeads:usable.length,rejected:rejected.length,collectionErrors:errors.length},errors,leads:usable};
  const rejectedOutput={generatedAt:output.generatedAt,engine:output.engine,stats:{totalRejected:rejected.length,noHumanContact:rejected.filter(x=>/human/i.test(x.reason)).length,noContactMethod:rejected.filter(x=>/contact/i.test(x.reason)).length,skipWindow:rejected.filter(x=>/skip/i.test(x.reason)).length,collectionErrors:errors.length},errors,rejected:rejected.slice(0,1000)};
  fs.mkdirSync(path.join(process.cwd(),'data'),{recursive:true});
  fs.writeFileSync(OUT_ROOT,JSON.stringify(output,null,2));
  fs.writeFileSync(OUT_DATA,JSON.stringify(output,null,2));
  fs.writeFileSync(REJ_ROOT,JSON.stringify(rejectedOutput,null,2));
  fs.writeFileSync(REJ_DATA,JSON.stringify(rejectedOutput,null,2));
  fs.writeFileSync(RUN_LOG,JSON.stringify({lastRunAt:output.generatedAt,startedAt:started,status:'complete',usableLeads:usable.length,rejected:rejected.length,errors:errors.length,message:`Strict free radar completed with ${usable.length} usable named-human leads.`},null,2));
  console.log(`Wrote ${usable.length} strict usable leads. Rejected ${rejected.length}. Errors ${errors.length}.`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
