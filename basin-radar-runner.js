#!/usr/bin/env node
/**
 * Basin OS Clean Radar Runner
 * Server-side GitHub Actions lead radar.
 *
 * Compliance posture:
 * - Uses public RSS, public search APIs, NPI public API, and manual profile URLs.
 * - Does not scrape LinkedIn pages.
 * - Uses Brave to find possible LinkedIn/profile URLs and public evidence links.
 * - Only marks a lead Ready when a real person and a usable route/evidence combination exists.
 */

const fs = require('fs/promises');
const path = require('path');

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const MAX_NPI = Number(process.env.MAX_NPI || 120);
const MAX_PUBLIC_SEARCHES = Number(process.env.MAX_PUBLIC_SEARCHES || 250);
const STATE_PATH = path.join('data', 'radar-state.json');

const now = () => new Date().toISOString();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function clean(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function slug(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function leadKey(l) {
  return [
    l.name,
    l.title,
    l.company,
    l.location,
    (l.contactMethods || []).map(c => c.value).join('|'),
    l.sourceUrl
  ].join('|').toLowerCase().replace(/\W+/g, '');
}

function dedupe(list) {
  const map = new Map();
  for (const item of list) {
    const k = leadKey(item);
    if (!k) continue;
    const prev = map.get(k);
    if (!prev) map.set(k, item);
    else {
      map.set(k, {
        ...prev,
        ...item,
        contactMethods: uniqBy([...(prev.contactMethods || []), ...(item.contactMethods || [])], c => `${c.type}|${c.value}`.toLowerCase()),
        evidenceTrail: uniqBy([...(prev.evidenceTrail || []), ...(item.evidenceTrail || [])], e => `${e.source}|${e.url}`.toLowerCase()),
        score: Math.max(prev.score || 0, item.score || 0)
      });
    }
  }
  return Array.from(map.values());
}

function uniqBy(list, fn) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const k = fn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function hasContact(lead, type) {
  return (lead.contactMethods || []).some(c => type ? c.type === type || String(c.type).includes(type) : c.value);
}

function isPersonName(name) {
  const n = clean(name);
  if (!n || n.length < 5) return false;
  if (/\b(inc|llc|company|group|associates|services|clinic|hospital|system|advertising|transactional|assistant|former|department|center|institute|strategies|financial|legal|tax)\b/i.test(n)) return false;
  const parts = n.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.length <= 4 && parts.every(p => /^[A-Z][A-Za-z'.-]+$/.test(p));
}

function grade(score) {
  if (score >= 88) return 'A';
  if (score >= 72) return 'B';
  if (score >= 58) return 'C';
  return 'D';
}

function scoreLead(lead) {
  let score = Number(lead.score || 50);
  if (hasContact(lead, 'email')) score += 15;
  if (hasContact(lead, 'linkedin')) score += 13;
  if (hasContact(lead, 'phone')) score += 7;
  if ((lead.evidenceTrail || []).length >= 2) score += 9;
  if (lead.sourceType === 'rss') score += 12;
  if (lead.sourceType === 'linkedin') score += 10;
  if (lead.sourceType === 'npi') score -= 5;
  if (!hasContact(lead) && lead.sourceType === 'npi') score -= 22;
  score = Math.max(0, Math.min(100, Math.round(score)));
  lead.score = score;
  lead.grade = grade(score);
  lead.qualityTier = score >= 88 ? 'A Lead' : score >= 72 ? 'Strong Lead' : score >= 58 ? 'Research Candidate' : 'Low Confidence';
  return lead;
}

function routeLead(lead) {
  const hasWarm = hasContact(lead, 'email') || hasContact(lead, 'linkedin');
  const hasPhone = hasContact(lead, 'phone');
  const hasEvidence = (lead.evidenceTrail || []).length >= 2 || lead.sourceType === 'rss';
  lead.associateReady = Boolean(isPersonName(lead.name) && (hasWarm || (hasPhone && hasEvidence)) && lead.score >= 65);
  lead.status = lead.associateReady ? 'Ready to Work' : 'Research Needed';
  lead.queue = lead.associateReady ? 'Ready to Work' : (hasPhone ? 'Phone Verify / Research' : 'Contact Route Needed');
  lead.bucket = lead.associateReady ? 'ready' : 'research';
  lead.workflowDay = lead.associateReady ? 1 : 0;
  lead.bestFirstAction = lead.associateReady
    ? hasContact(lead, 'email') ? 'Day 1: send evidence-based email first, then call if appropriate.'
      : hasContact(lead, 'linkedin') ? 'Day 1: manually confirm LinkedIn profile, then send reviewed LinkedIn touch.'
      : 'Day 1: phone available; review evidence and ask for correct email/direct contact.'
    : 'Research needed: confirm second evidence source and email/LinkedIn/direct contact before associate cadence.';
  return lead;
}

async function braveSearch(query, count = 5) {
  if (!BRAVE_API_KEY) return { query, results: [], error: 'BRAVE_API_KEY missing' };
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('country', 'US');
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });
    if (!res.ok) throw new Error(`Brave ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return { query, results: (json.web?.results || []).map(r => ({
      title: clean(r.title),
      url: clean(r.url),
      description: clean(r.description)
    })) };
  } catch (err) {
    return { query, results: [], error: err.message };
  }
}

async function fetchNpiSeeds(limit = MAX_NPI) {
  const taxonomies = [
    { code: '207X00000X', name: 'Orthopaedic Surgery' },
    { code: '207L00000X', name: 'Anesthesiology' },
    { code: '208600000X', name: 'Surgery' },
    { code: '1223G0001X', name: 'General Dentistry' },
    { code: '207R00000X', name: 'Internal Medicine' }
  ];
  const states = ['TX', 'OK', 'CO', 'AZ', 'FL', 'CA'];
  const out = [];
  for (const tx of taxonomies) {
    for (const state of states) {
      if (out.length >= limit) break;
      const url = new URL('https://npiregistry.cms.hhs.gov/api/');
      url.searchParams.set('version', '2.1');
      url.searchParams.set('taxonomy_description', tx.name);
      url.searchParams.set('state', state);
      url.searchParams.set('limit', '20');
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        for (const row of json.results || []) {
          const basic = row.basic || {};
          const first = basic.first_name || basic.authorized_official_first_name || '';
          const last = basic.last_name || basic.authorized_official_last_name || '';
          const name = clean(`${first} ${last}`);
          if (!isPersonName(name)) continue;
          const addr = (row.addresses || []).find(a => a.address_purpose === 'LOCATION') || (row.addresses || [])[0] || {};
          const phone = clean(addr.telephone_number || '');
          const cityState = clean([addr.city, addr.state].filter(Boolean).join(', '));
          const lead = {
            id: `npi_${row.number}`,
            name,
            title: `${tx.name} · ${basic.credential || 'Provider'}`,
            company: clean(basic.organization_name || ''),
            location: cityState,
            sourceType: 'npi',
            source: 'NPI Registry',
            sourceUrl: `https://npiregistry.cms.hhs.gov/provider-view/${row.number}`,
            signal: `NPI verified provider: ${name}`,
            summary: `${name} is listed in the federal NPI Registry as ${tx.name}.`,
            fitReason: 'High-income medical provider profile; possible accredited fit must be confirmed.',
            accreditedLikelyReason: 'Specialist/provider profile may indicate income above accredited threshold, but must be confirmed by prospect.',
            contactMethods: phone ? [{ type: 'phone', value: phone, source: 'NPI Registry' }] : [],
            evidenceTrail: [{ source: 'NPI Registry', url: `https://npiregistry.cms.hhs.gov/provider-view/${row.number}`, whatItProves: 'Named healthcare provider and public registry listing.' }],
            score: 54,
            foundAt: now()
          };
          out.push(lead);
          if (out.length >= limit) break;
        }
      } catch {}
      await sleep(150);
    }
  }
  return dedupe(out);
}

async function enrichLead(lead) {
  if (!BRAVE_API_KEY) return lead;
  const queries = [
    `"${lead.name}" "${lead.title.split('·')[0].trim()}" ${lead.location} email`,
    `"${lead.name}" "${lead.title.split('·')[0].trim()}" LinkedIn`,
    `"${lead.name}" "${lead.company || lead.location}" phone email`
  ];

  let searchCount = 0;
  for (const q of queries) {
    const res = await braveSearch(q, 5);
    searchCount++;
    for (const r of res.results) {
      const blob = `${r.title} ${r.url} ${r.description}`;
      if (/linkedin\.com\/in\//i.test(r.url) && !hasContact(lead, 'linkedin')) {
        lead.contactMethods.push({ type: 'linkedin', value: r.url, source: 'Brave public search' });
        lead.evidenceTrail.push({ source: 'LinkedIn URL found by public search', url: r.url, whatItProves: 'Possible profile URL; manual verification required.' });
      }
      const email = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (email && !hasContact(lead, 'email')) {
        lead.contactMethods.push({ type: 'email', value: email[0], source: 'Public search snippet/page' });
      }
      if (!/linkedin\.com/i.test(r.url)) {
        lead.evidenceTrail.push({ source: r.title || 'Public search result', url: r.url, whatItProves: r.description || 'Public evidence / cross-reference.' });
      }
    }
    await sleep(150);
  }
  lead._publicSearches = (lead._publicSearches || 0) + searchCount;
  return lead;
}

async function fetchRssSeeds() {
  const feeds = [
    'https://news.google.com/rss/search?q=physician%20opened%20medical%20practice%20OR%20surgeon%20conference%20speaker%20USA&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=CPA%20tax%20planning%20business%20owner%20liquidity%20event%20USA&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=attorney%20law%20partner%20award%20business%20owner%20USA&hl=en-US&gl=US&ceid=US:en'
  ];
  const out = [];
  for (const url of feeds) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = xml.split('<item>').slice(1, 15);
      for (const item of items) {
        const title = clean((item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s) || item.match(/<title>(.*?)<\/title>/s) || [])[1] || '');
        const link = clean((item.match(/<link>(.*?)<\/link>/s) || [])[1] || '');
        const desc = clean((item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s) || item.match(/<description>(.*?)<\/description>/s) || [])[1] || '').replace(/<[^>]+>/g, ' ');
        const name = extractLikelyName(title);
        if (!isPersonName(name)) continue;
        out.push({
          id: `rss_${slug(name + title)}`,
          name,
          title: inferTitleFromText(title + ' ' + desc),
          company: '',
          location: 'USA',
          sourceType: 'rss',
          source: 'Google News RSS',
          sourceUrl: link,
          signal: title,
          summary: desc || title,
          fitReason: 'Public signal may indicate professional/business context for a compliant educational intro.',
          accreditedLikelyReason: 'Public professional signal only; accredited status must be confirmed by prospect.',
          contactMethods: [],
          evidenceTrail: [{ source: 'Google News RSS', url: link, whatItProves: title }],
          score: 62,
          foundAt: now()
        });
      }
    } catch {}
  }
  return dedupe(out);
}

function extractLikelyName(text) {
  const cleaned = clean(text.replace(/&amp;/g, '&'));
  const patterns = [
    /\bDr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}),?\s+(?:MD|DO|DDS|CPA|CEO|President|Founder|Partner)\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:opens|joins|named|appointed|launches|speaks|wins|announces)\b/
  ];
  for (const p of patterns) {
    const m = cleaned.match(p);
    if (m) return clean(m[1]);
  }
  return '';
}

function inferTitleFromText(text) {
  if (/CPA|tax|account/i.test(text)) return 'CPA / Tax Professional';
  if (/surgeon|orthopedic/i.test(text)) return 'Surgeon / Specialist';
  if (/physician|doctor|medical/i.test(text)) return 'Physician / Specialist';
  if (/attorney|law|partner/i.test(text)) return 'Attorney / Law Partner';
  if (/CEO|founder|president|owner/i.test(text)) return 'Business Owner / Executive';
  return 'Professional / Business Signal';
}

async function main() {
  const state = await readJson(STATE_PATH, { seen: {}, suppressed: {} });
  const errors = [];
  let publicSearches = 0;

  let npi = [];
  let rss = [];
  try { npi = await fetchNpiSeeds(MAX_NPI); } catch (err) { errors.push({ source: 'npi', reason: err.message }); }
  try { rss = await fetchRssSeeds(); } catch (err) { errors.push({ source: 'rss', reason: err.message }); }

  let all = dedupe([...rss, ...npi]).filter(l => !state.suppressed?.[leadKey(l)]);

  const enriched = [];
  for (const lead of all) {
    if (publicSearches >= MAX_PUBLIC_SEARCHES) {
      enriched.push(lead);
      continue;
    }
    const before = lead._publicSearches || 0;
    try {
      const e = await enrichLead(lead);
      publicSearches += (e._publicSearches || 0) - before;
      enriched.push(e);
    } catch (err) {
      errors.push({ source: 'enrich', name: lead.name, reason: err.message });
      enriched.push(lead);
    }
  }

  all = dedupe(enriched)
    .map(scoreLead)
    .map(routeLead)
    .sort((a,b) => (b.associateReady - a.associateReady) || (b.score - a.score) || a.name.localeCompare(b.name));

  const ready = all.filter(l => l.associateReady);
  const research = all.filter(l => !l.associateReady);

  const output = {
    generatedAt: now(),
    engine: 'Basin OS Clean Radar Runner v1',
    compliance: {
      linkedin: 'Does not scrape LinkedIn pages. Stores possible profile URLs from public search only; manual verification required.',
      outreach: 'No auto-send. Manual review required before email, LinkedIn, SMS, or phone outreach.',
      qualification: 'Accredited status is never assumed; professional role only supports screening priority.'
    },
    stats: {
      totalFound: all.length,
      readyToWork: ready.length,
      research: research.length,
      npiCollected: npi.length,
      rssCollected: rss.length,
      linkedinCandidatesFound: all.filter(l => hasContact(l, 'linkedin')).length,
      emailFound: all.filter(l => hasContact(l, 'email')).length,
      phoneFound: all.filter(l => hasContact(l, 'phone')).length,
      publicSearches,
      braveConfigured: Boolean(BRAVE_API_KEY),
      groqConfigured: Boolean(GROQ_API_KEY),
      errors: errors.length
    },
    leads: ready,
    researchCandidates: research,
    allCandidates: all,
    errors
  };

  for (const lead of all) {
    state.seen[leadKey(lead)] = { name: lead.name, lastSeen: now(), status: lead.status };
  }

  await writeJson('data/radar-leads.json', output);
  await writeJson('radar-leads.json', output);
  await writeJson('data/radar-research-candidates.json', { generatedAt: now(), candidates: research });
  await writeJson('radar-research-candidates.json', { generatedAt: now(), candidates: research });
  await writeJson('data/radar-rejected.json', { generatedAt: now(), errors });
  await writeJson('radar-rejected.json', { generatedAt: now(), errors });
  await writeJson('data/radar-run-log.json', { generatedAt: now(), stats: output.stats, sample: all.slice(0, 5).map(l => ({ name: l.name, score: l.score, status: l.status })) });
  await writeJson(STATE_PATH, state);

  console.log(JSON.stringify(output.stats, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
