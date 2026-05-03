#!/usr/bin/env node
/**
 * Basin OS V2 Radar Runner
 *
 * Automated enrichment routing:
 * - NPI, RSS/public news, Brave public search, and LinkedIn URL discovery.
 * - No LinkedIn page scraping.
 * - LinkedIn URLs are found through Brave public search only and must be manually verified.
 * - No auto-send.
 */

const fs = require('fs/promises');
const path = require('path');

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const MAX_NPI = Number(process.env.MAX_NPI || 140);
const MAX_RSS = Number(process.env.MAX_RSS || 80);
const MAX_LINKEDIN_DISCOVERY = Number(process.env.MAX_LINKEDIN_DISCOVERY || 80);
const MAX_PUBLIC_SEARCHES = Number(process.env.MAX_PUBLIC_SEARCHES || 450);
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
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function uniqBy(list, fn) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const k = fn(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
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

function chooseBetterSource(a, b) {
  const order = { linkedin: 1, email: 2, rss: 3, public: 4, npi: 5, manual: 6 };
  return (order[b] || 9) < (order[a] || 9) ? b : a;
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
        score: Math.max(prev.score || 0, item.score || 0),
        sourceType: chooseBetterSource(prev.sourceType, item.sourceType)
      });
    }
  }
  return Array.from(map.values());
}

function hasContact(lead, type) {
  return (lead.contactMethods || []).some(c => {
    const blob = `${c.type} ${c.value}`.toLowerCase();
    if (!type) return clean(c.value);
    if (type === 'linkedin') return /linkedin\.com\/(in|pub)\//i.test(c.value) || blob.includes('linkedin');
    if (type === 'email') return c.type === 'email' || /@/.test(c.value);
    if (type === 'phone') return c.type === 'phone' || /\d{3}.*\d{3}.*\d{4}/.test(c.value);
    return blob.includes(type);
  });
}

function contactCount(lead) {
  return ['email', 'linkedin', 'phone'].filter(t => hasContact(lead, t)).length;
}

function isPersonName(name) {
  const n = clean(name);
  if (!n || n.length < 5) return false;
  if (/\b(inc|llc|company|group|associates|services|clinic|hospital|system|advertising|transactional|assistant|former|department|center|institute|strategies|financial|legal|tax|medical center|healthcare|university|academy)\b/i.test(n)) return false;
  const parts = n.split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.length <= 4 && parts.every(p => /^[A-Z][A-Za-z'.-]+$/.test(p));
}

function grade(score) {
  if (score >= 88) return 'A';
  if (score >= 72) return 'B';
  if (score >= 58) return 'C';
  return 'D';
}

function sourceRank(lead) {
  if (hasContact(lead, 'email') && hasContact(lead, 'linkedin')) return 1;
  if (hasContact(lead, 'email')) return 2;
  if (hasContact(lead, 'linkedin')) return 3;
  if (lead.sourceType === 'rss') return 4;
  if (hasContact(lead, 'phone')) return 5;
  if (lead.sourceType === 'npi') return 7;
  return 6;
}

function scoreLead(lead) {
  let score = Number(lead.score || 50);
  const evidenceCount = (lead.evidenceTrail || []).length;

  if (hasContact(lead, 'email')) score += 18;
  if (hasContact(lead, 'linkedin')) score += 16;
  if (hasContact(lead, 'phone')) score += 10;
  if (contactCount(lead) >= 2) score += 12;
  if (evidenceCount >= 2) score += 9;
  if (evidenceCount >= 3) score += 5;
  if (lead.sourceType === 'rss') score += 14;
  if (lead.sourceType === 'linkedin') score += 14;
  if (lead.sourceType === 'public') score += 6;
  if (lead.sourceType === 'npi') score -= 2;

  if (!hasContact(lead) && lead.sourceType === 'npi') score -= 24;
  if (!isPersonName(lead.name)) score -= 40;

  score = Math.max(0, Math.min(100, Math.round(score)));
  lead.score = score;
  lead.grade = grade(score);
  lead.qualityTier = score >= 88 ? 'A Lead' : score >= 72 ? 'Strong Lead' : score >= 58 ? 'Research Candidate' : 'Low Confidence';
  lead.sourceConfidence = [
    (lead.sourceType || '').toUpperCase(),
    hasContact(lead, 'email') ? 'EMAIL' : '',
    hasContact(lead, 'linkedin') ? 'LINKEDIN URL' : '',
    hasContact(lead, 'phone') ? 'PHONE' : '',
    evidenceCount ? `${evidenceCount} EVIDENCE` : ''
  ].filter(Boolean).join(' + ');
  return lead;
}

function routeLead(lead) {
  const namedPerson = isPersonName(lead.name);
  const hasEmail = hasContact(lead, 'email');
  const hasLinkedIn = hasContact(lead, 'linkedin');
  const hasPhone = hasContact(lead, 'phone');
  const evidenceCount = (lead.evidenceTrail || []).length;

  const trustedPhoneRoute = hasPhone && (
    lead.sourceType === 'npi' ||
    evidenceCount >= 2 ||
    /registry|provider|practice|public search/i.test((lead.evidenceTrail || []).map(e => `${e.source} ${e.whatItProves}`).join(' '))
  );

  const ready = Boolean(namedPerson && (hasEmail || hasLinkedIn || trustedPhoneRoute) && lead.score >= 58);

  lead.associateReady = ready;
  lead.status = ready ? 'Ready to Work' : (hasLinkedIn ? 'LinkedIn Verify' : 'Research Needed');
  lead.queue = ready ? 'Ready to Work' : (hasLinkedIn ? 'LinkedIn Verify' : (hasPhone ? 'Phone/Public Research' : 'Contact Route Needed'));
  lead.bucket = ready ? 'ready' : (hasLinkedIn ? 'linkedin-verify' : 'research');
  lead.workflowDay = ready ? 1 : 0;

  if (ready && hasEmail) lead.bestFirstAction = 'Day 1: send evidence-based email first, then call if appropriate.';
  else if (ready && hasLinkedIn) lead.bestFirstAction = 'Day 1: manually open LinkedIn URL, confirm identity, then send reviewed LinkedIn touch.';
  else if (ready && hasPhone) lead.bestFirstAction = 'Day 1: phone route is available from public/verified evidence. Review evidence first, then call and ask for correct email/direct contact.';
  else if (hasLinkedIn) lead.bestFirstAction = 'LinkedIn Verify: open the profile URL manually, confirm identity, then move to Ready.';
  else lead.bestFirstAction = 'Research needed: confirm email, direct LinkedIn URL, phone, or second public evidence source before associate cadence.';

  lead.priorityRank = sourceRank(lead);
  return lead;
}

async function braveSearch(query, count = 8) {
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
    return {
      query,
      results: (json.web?.results || []).map(r => ({
        title: clean(r.title),
        url: clean(r.url),
        description: clean(r.description)
      }))
    };
  } catch (err) {
    return { query, results: [], error: err.message };
  }
}

function addEvidence(lead, source, url, whatItProves) {
  if (!url) return;
  lead.evidenceTrail = lead.evidenceTrail || [];
  if (!lead.evidenceTrail.some(e => e.url === url)) {
    lead.evidenceTrail.push({ source: clean(source), url: clean(url), whatItProves: clean(whatItProves) });
  }
}

function addContact(lead, type, value, source) {
  if (!value) return;
  lead.contactMethods = lead.contactMethods || [];
  if (!lead.contactMethods.some(c => c.type === type && c.value === value)) {
    lead.contactMethods.push({ type, value: clean(value), source: clean(source) });
  }
}

function processSearchResultIntoLead(lead, r) {
  const blob = `${r.title} ${r.url} ${r.description}`;
  if (/linkedin\.com\/(in|pub)\//i.test(r.url)) {
    addContact(lead, 'linkedin', r.url, 'Brave public search');
    addEvidence(lead, 'LinkedIn URL found by public search', r.url, 'Possible LinkedIn profile URL; manual verification recommended.');
    if (lead.sourceType === 'npi') lead.sourceType = 'linkedin';
  }

  const email = blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) {
    addContact(lead, 'email', email[0], 'Public search result');
    if (lead.sourceType === 'npi') lead.sourceType = 'public';
  }

  const phone = blob.match(/(?:\+1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  if (phone && !hasContact(lead, 'phone')) addContact(lead, 'phone', phone[0], 'Public search result');

  if (!/google\.com\/search|webcache|translate\.google/i.test(r.url)) {
    addEvidence(lead, r.title || 'Public search result', r.url, r.description || 'Public evidence / cross-reference.');
  }
}

async function enrichLead(lead, searchBudget) {
  if (!BRAVE_API_KEY || searchBudget.remaining <= 0) return lead;

  const baseName = lead.name;
  const role = clean((lead.title || '').split('·')[0]);
  const loc = lead.location || 'USA';
  const company = lead.company || '';

  const queries = [
    `site:linkedin.com/in "${baseName}" "${role}" "${loc}"`,
    `"${baseName}" "${role}" LinkedIn`,
    `"${baseName}" "${company || role}" email phone`,
    `"${baseName}" "${loc}" "${role}"`,
    `"${baseName}" "${company || loc}" physician profile`
  ];

  for (const q of queries) {
    if (searchBudget.remaining <= 0) break;
    const res = await braveSearch(q, 8);
    searchBudget.remaining -= 1;
    searchBudget.used += 1;
    for (const r of res.results) processSearchResultIntoLead(lead, r);
    await sleep(125);
  }

  return lead;
}

async function fetchNpiSeeds(limit = MAX_NPI) {
  const taxonomies = [
    { name: 'Orthopaedic Surgery' },
    { name: 'Anesthesiology' },
    { name: 'Surgery' },
    { name: 'Internal Medicine' },
    { name: 'Family Medicine' },
    { name: 'General Dentistry' }
  ];
  const states = ['TX', 'OK', 'CO', 'AZ', 'FL', 'CA', 'TN', 'GA', 'NC'];
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
          const org = clean(basic.organization_name || addr.organization_name || '');

          out.push({
            id: `npi_${row.number}`,
            name,
            title: `${tx.name} · ${basic.credential || 'Provider'}`,
            company: org,
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
            score: 56,
            foundAt: now()
          });

          if (out.length >= limit) break;
        }
      } catch {}
      await sleep(100);
    }
  }
  return dedupe(out);
}

function extractXml(item, tag) {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i').exec(item);
  if (cdata) return clean(cdata[1]).replace(/&amp;/g, '&');
  const normal = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(item);
  return clean(normal?.[1] || '').replace(/&amp;/g, '&');
}

async function fetchRssSeeds(limit = MAX_RSS) {
  const feeds = [
    'https://news.google.com/rss/search?q=physician%20opened%20medical%20practice%20OR%20surgeon%20conference%20speaker%20USA&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=doctor%20joins%20practice%20OR%20surgeon%20named%20partner%20USA&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=CPA%20tax%20planning%20business%20owner%20liquidity%20event%20USA&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=attorney%20law%20partner%20award%20business%20owner%20USA&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=CEO%20founder%20acquisition%20business%20sale%20Texas%20Colorado%20Arizona%20Florida&hl=en-US&gl=US&ceid=US:en'
  ];
  const out = [];

  for (const url of feeds) {
    if (out.length >= limit) break;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = xml.split('<item>').slice(1, 30);

      for (const item of items) {
        const title = extractXml(item, 'title');
        const link = extractXml(item, 'link');
        const desc = extractXml(item, 'description').replace(/<[^>]+>/g, ' ');
        const name = extractLikelyName(title + ' ' + desc);
        if (!isPersonName(name)) continue;

        out.push({
          id: `rss_${slug(name + title)}`,
          name,
          title: inferTitleFromText(title + ' ' + desc),
          company: extractCompany(title),
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
          score: 64,
          foundAt: now()
        });

        if (out.length >= limit) break;
      }
    } catch {}
  }

  return dedupe(out);
}

async function fetchLinkedInDiscovery(limit = MAX_LINKEDIN_DISCOVERY) {
  if (!BRAVE_API_KEY) return [];
  const queries = [
    'site:linkedin.com/in physician founder medical practice Texas',
    'site:linkedin.com/in orthopedic surgeon partner Texas',
    'site:linkedin.com/in anesthesiologist medical director USA',
    'site:linkedin.com/in dentist practice owner Texas',
    'site:linkedin.com/in CPA tax partner business owner Texas',
    'site:linkedin.com/in attorney law partner business owner Texas',
    'site:linkedin.com/in CEO founder acquisition liquidity event Texas',
    'site:linkedin.com/in oil gas investor CPA tax planning'
  ];

  const out = [];

  for (const q of queries) {
    if (out.length >= limit) break;
    const res = await braveSearch(q, 10);

    for (const r of res.results) {
      if (!/linkedin\.com\/(in|pub)\//i.test(r.url)) continue;
      const name = extractLinkedInName(r.title);
      if (!isPersonName(name)) continue;

      out.push({
        id: `li_${slug(name + r.url)}`,
        name,
        title: inferTitleFromText(`${r.title} ${r.description}`),
        company: '',
        location: 'USA',
        sourceType: 'linkedin',
        source: 'LinkedIn URL via Brave public search',
        sourceUrl: r.url,
        signal: r.title,
        summary: r.description,
        fitReason: 'LinkedIn profile URL found by public search; higher priority for manual confirmation and CRM enrichment.',
        accreditedLikelyReason: 'Professional profile suggests screening potential only; accredited status must be confirmed.',
        contactMethods: [{ type: 'linkedin', value: r.url, source: 'Brave public search' }],
        evidenceTrail: [{ source: 'LinkedIn URL found by public search', url: r.url, whatItProves: 'Possible profile URL; manual verification recommended.' }],
        score: 70,
        foundAt: now()
      });
      if (out.length >= limit) break;
    }
    await sleep(150);
  }

  return dedupe(out);
}

function extractLinkedInName(title) {
  let t = clean(title).replace(/\s+\|\s+LinkedIn.*$/i, '').replace(/\s+-\s+LinkedIn.*$/i, '');
  t = t.split(' - ')[0].split(' | ')[0].trim();
  t = t.replace(/\b(MD|M\.D\.|DO|DDS|CPA|JD|MBA|Esq\.?)\b/gi, '').replace(/,+/g, ' ');
  return clean(t);
}

function extractLikelyName(text) {
  const cleaned = clean(text.replace(/&amp;/g, '&'));
  const patterns = [
    /\bDr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}),?\s+(?:MD|M\.D\.|DO|DDS|CPA|CEO|President|Founder|Partner|Attorney)\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:opens|joins|named|appointed|launches|speaks|wins|announces|receives)\b/,
    /\b(?:named|appoints|hires|promotes)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/
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
  if (/physician|doctor|medical|anesthes/i.test(text)) return 'Physician / Specialist';
  if (/dentist|dental/i.test(text)) return 'Dentist / Practice Owner';
  if (/attorney|law|partner|litigator/i.test(text)) return 'Attorney / Law Partner';
  if (/CEO|founder|president|owner|executive/i.test(text)) return 'Business Owner / Executive';
  return 'Professional / Business Signal';
}

function extractCompany(title) {
  const parts = clean(title).split(' - ');
  return parts.length > 1 ? parts[parts.length - 1].slice(0, 80) : '';
}

async function main() {
  const state = await readJson(STATE_PATH, { seen: {}, suppressed: {} });
  const errors = [];
  const searchBudget = { remaining: MAX_PUBLIC_SEARCHES, used: 0 };

  let npi = [];
  let rss = [];
  let linkedin = [];

  try { npi = await fetchNpiSeeds(MAX_NPI); } catch (err) { errors.push({ source: 'npi', reason: err.message }); }
  try { rss = await fetchRssSeeds(MAX_RSS); } catch (err) { errors.push({ source: 'rss', reason: err.message }); }
  try {
    linkedin = await fetchLinkedInDiscovery(MAX_LINKEDIN_DISCOVERY);
    searchBudget.used += linkedin.length ? Math.ceil(linkedin.length / 10) : 0;
    searchBudget.remaining = Math.max(0, searchBudget.remaining - Math.ceil(linkedin.length / 10));
  } catch (err) {
    errors.push({ source: 'linkedin-discovery', reason: err.message });
  }

  let all = dedupe([...rss, ...linkedin, ...npi]).filter(l => !state.suppressed?.[leadKey(l)]);

  const enriched = [];
  for (const lead of all) {
    if (searchBudget.remaining <= 0) {
      enriched.push(lead);
      continue;
    }
    try {
      enriched.push(await enrichLead(lead, searchBudget));
    } catch (err) {
      errors.push({ source: 'enrich', name: lead.name, reason: err.message });
      enriched.push(lead);
    }
  }

  all = dedupe(enriched)
    .map(scoreLead)
    .map(routeLead)
    .filter(l => isPersonName(l.name))
    .sort((a, b) => (a.priorityRank || 9) - (b.priorityRank || 9) || (b.associateReady - a.associateReady) || (b.score - a.score) || a.name.localeCompare(b.name));

  const ready = all.filter(l => l.associateReady);
  const research = all.filter(l => !l.associateReady);
  const linkedinCount = all.filter(l => hasContact(l, 'linkedin') || l.sourceType === 'linkedin').length;
  const emailCount = all.filter(l => hasContact(l, 'email')).length;
  const phoneCount = all.filter(l => hasContact(l, 'phone')).length;

  const output = {
    generatedAt: now(),
    engine: 'Basin OS V2 Radar Runner automated enrichment',
    compliance: {
      linkedin: 'Does not scrape LinkedIn pages. Stores possible profile URLs from Brave public search only; manual verification recommended.',
      outreach: 'No auto-send. Manual review required before email, LinkedIn, SMS, or phone outreach.',
      qualification: 'Accredited status is never assumed; professional role only supports screening priority.'
    },
    routingRules: {
      ready: 'Named person + email OR LinkedIn URL OR trusted public phone route; score >= 58.',
      linkedinPriority: 'LinkedIn/email/RSS enriched records rank above plain NPI seeds.',
      npi: 'NPI phone can become Ready when it is tied to a named provider; still ranks below email/LinkedIn/RSS.'
    },
    stats: {
      totalFound: all.length,
      readyToWork: ready.length,
      research: research.length,
      npiCollected: npi.length,
      rssCollected: rss.length,
      linkedinDiscoveryCollected: linkedin.length,
      linkedinCandidatesFound: linkedinCount,
      emailFound: emailCount,
      phoneFound: phoneCount,
      publicSearches: searchBudget.used,
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
    state.seen[leadKey(lead)] = { name: lead.name, lastSeen: now(), status: lead.status, score: lead.score };
  }

  await writeJson('data/radar-leads.json', output);
  await writeJson('radar-leads.json', output);
  await writeJson('data/radar-research-candidates.json', { generatedAt: now(), candidates: research });
  await writeJson('radar-research-candidates.json', { generatedAt: now(), candidates: research });
  await writeJson('data/radar-rejected.json', { generatedAt: now(), errors });
  await writeJson('radar-rejected.json', { generatedAt: now(), errors });
  await writeJson('data/radar-run-log.json', {
    generatedAt: now(),
    stats: output.stats,
    sampleReady: ready.slice(0, 8).map(l => ({ name: l.name, score: l.score, status: l.status, contacts: l.contactMethods.map(c => c.type) })),
    sampleResearch: research.slice(0, 8).map(l => ({ name: l.name, score: l.score, status: l.status, contacts: l.contactMethods.map(c => c.type) }))
  });
  await writeJson(STATE_PATH, state);

  console.log(JSON.stringify(output.stats, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
