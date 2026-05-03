#!/usr/bin/env node
/**
 * Basin OS V4.1 Radar Runner
 * GitHub Actions backend:
 * - Brave Search public discovery
 * - Groq/Llama extraction and scoring
 * - Writes JSON consumed by Next.js frontend at public/data/radar-leads.json
 *
 * No LinkedIn page scraping. No automated outreach. No tax advice.
 */

const fs = require("fs/promises");
const path = require("path");

if (typeof fetch !== "function") {
  console.error("Fatal: native fetch() unavailable. Use Node 20+.");
  process.exit(1);
}

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const MAX_PUBLIC_SEARCHES = Number(process.env.MAX_PUBLIC_SEARCHES || 500);
const MAX_GROQ_CALLS = Number(process.env.MAX_GROQ_CALLS || 140);
// NPI/MPI is a seed source, not the main lead engine.
const MAX_NPI = Number(process.env.MAX_NPI || 45);
const MAX_RSS = Number(process.env.MAX_RSS || 160);
const MAX_LINKEDIN_DISCOVERY = Number(process.env.MAX_LINKEDIN_DISCOVERY || 200);
const MAX_CPA_DISCOVERY = Number(process.env.MAX_CPA_DISCOVERY || 100);

const STATE_PATH = path.join("public", "data", "radar-state.json");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => new Date().toISOString();

const runtime = { publicSearches: 0, groqCalls: 0, groqFailures: 0, braveFailures: 0 };

function clean(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
function slug(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || `lead-${Date.now()}`; }
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; } }
async function writeJson(file, data) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8"); }
function gradeFromScore(score) { score = Number(score || 0); if (score >= 88) return "A"; if (score >= 72) return "B"; if (score >= 58) return "C"; return "D"; }

function hasContact(lead, type) {
  const contacts = Array.isArray(lead?.contactMethods) ? lead.contactMethods : [];
  return contacts.some(contact => {
    const contactType = clean(contact.type).toLowerCase();
    const value = clean(contact.value);
    const blob = `${contactType} ${value}`.toLowerCase();
    if (!type) return Boolean(value);
    if (type === "email") return contactType === "email" || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value);
    if (type === "linkedin") return contactType === "linkedin" || /linkedin\.com\/(in|pub)\//i.test(value);
    if (type === "phone") return contactType === "phone" || /\d{3}.*\d{3}.*\d{4}/.test(value);
    return blob.includes(String(type).toLowerCase());
  });
}
function addContact(lead, type, value, source) {
  const v = clean(value);
  if (!v) return;
  lead.contactMethods ||= [];
  if (!lead.contactMethods.some(c => c.type === type && c.value === v)) lead.contactMethods.push({ type, value: v, source: clean(source || "public") });
}
function addEvidence(lead, source, url, whatItProves) {
  const u = clean(url);
  if (!u) return;
  lead.evidenceTrail ||= [];
  if (!lead.evidenceTrail.some(e => e.url === u)) lead.evidenceTrail.push({ source: clean(source || "Public Source"), url: u, whatItProves: clean(whatItProves || "Public source evidence.") });
}
function normalizeUrl(raw) {
  const value = clean(raw);
  if (!value) return "";
  try {
    const url = new URL(value);
    for (const key of ["url", "u", "q", "target"]) {
      const nested = url.searchParams.get(key);
      if (nested && /^https?:\/\//i.test(nested)) return decodeURIComponent(nested);
    }
  } catch {}
  return value;
}
function extractEmail(text) {
  const match = clean(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!match) return "";
  const email = match[0].replace(/[),.;]+$/, "");
  if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(email)) return "";
  return email;
}
function extractPhone(text) {
  const match = clean(text).match(/(?:\+1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  return match ? match[0] : "";
}
function extractLinkedInUrl(text) {
  const value = clean(text);
  const full = value.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9%_.\-]+\/?/i);
  if (full) return full[0];
  const partial = value.match(/(?:www\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9%_.\-]+\/?/i);
  return partial ? `https://${partial[0].replace(/^https?:\/\//i, "")}` : "";
}
function linkedinFromResult(result) {
  return extractLinkedInUrl([result.url, result.title, result.description, result.profile?.url, result.meta_url?.url, result.meta_url?.hostname, result.meta_url?.netloc].map(normalizeUrl).join(" "));
}
function defaultExtraction(textSnippet) {
  const snippet = clean(textSnippet);
  const isLinkedIn = /linkedin\.com\/(in|pub)\//i.test(snippet);
  const isCPA = /(cpa|certified public accountant|tax partner|tax advisor|tax planning|accounting firm)/i.test(snippet);
  const isMedical = /(physician|surgeon|orthopaedic|orthopedic|anesthesiology|dentist|doctor|medical director|provider)/i.test(snippet);
  const isAttorney = /(attorney|law partner|partner at|law firm|litigator)/i.test(snippet);
  const likelyPerson = /[A-Z][a-z]+ [A-Z][a-z]+/.test(snippet);
  const base = isCPA ? 78 : isLinkedIn ? 74 : isAttorney ? 70 : isMedical ? 62 : 50;
  const score = likelyPerson ? base : Math.min(base, 55);
  return {
    name: null,
    company: null,
    title: isCPA ? "CPA / Tax Professional" : isMedical ? "Medical Professional" : isAttorney ? "Attorney / Partner" : null,
    isPerson: likelyPerson,
    isCPA,
    score,
    grade: gradeFromScore(score),
    fitReason: "Fallback parser classified this public signal; manual verification still required."
  };
}
function parseGroqJson(content) {
  const cleaned = String(content || "").trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Groq returned non-JSON output");
  }
}
async function extractWithGroq(textSnippet) {
  if (!GROQ_API_KEY) return defaultExtraction(textSnippet);
  const systemPrompt = `You are a strict JSON extraction engine for a high-compliance Oil & Gas investment CRM.

Return ONLY a raw JSON object. No markdown formatting. No backticks. No explanation.

Exact schema:
{ "name": "string or null", "company": "string or null", "title": "string or null", "isPerson": boolean, "isCPA": boolean, "score": number, "grade": "A, B, C, or D", "fitReason": "string" }

Rules:
- Extract a real human person, not a company, clinic, school, department, article title, award, or office.
- If a real human cannot be clearly identified, set name to null and isPerson to false.
- isCPA true only for a CPA, tax partner, accounting professional, tax-planning professional, or accountant.
- Score 0-100 for usefulness as a compliant educational lead or CPA/referral path for Basin Ventures. LinkedIn profile URL + professional/business owner signal should score above bare NPI-only provider records. NPI-only records should normally score 50-62 unless enriched with email, LinkedIn, business ownership, award, practice growth, or CPA/referral context.
- Grade must match score: A=88+, B=72-87, C=58-71, D<58.
- Do not say or imply they are accredited.
- Do not give tax advice.
- fitReason must be compliance-safe and explain why this is worth manual review.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: 450,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: clean(textSnippet).slice(0, 7000) }]
    })
  });
  if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);
  const json = await response.json();
  const parsed = parseGroqJson(json.choices?.[0]?.message?.content || "");
  const score = Math.max(0, Math.min(100, Number(parsed.score || 0)));
  runtime.groqCalls += 1;
  return {
    name: parsed.name ? clean(parsed.name) : null,
    company: parsed.company ? clean(parsed.company) : null,
    title: parsed.title ? clean(parsed.title) : null,
    isPerson: Boolean(parsed.isPerson),
    isCPA: Boolean(parsed.isCPA),
    score,
    grade: ["A", "B", "C", "D"].includes(parsed.grade) ? parsed.grade : gradeFromScore(score),
    fitReason: clean(parsed.fitReason || "Public professional signal; fit must be manually verified.")
  };
}
async function braveSearch(query, count = 10) {
  if (!BRAVE_API_KEY) return { query, results: [], error: "BRAVE_API_KEY missing" };
  if (runtime.publicSearches >= MAX_PUBLIC_SEARCHES) return { query, results: [], error: "MAX_PUBLIC_SEARCHES reached" };
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("country", "US");
  url.searchParams.set("search_lang", "en");
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": BRAVE_API_KEY } });
    runtime.publicSearches += 1;
    if (!response.ok) throw new Error(`Brave ${response.status}: ${await response.text()}`);
    const json = await response.json();
    return { query, results: (json.web?.results || []).map(result => ({ title: clean(result.title), url: normalizeUrl(result.url || ""), description: clean(result.description), profile: result.profile || null, meta_url: result.meta_url || null })) };
  } catch (error) {
    runtime.braveFailures += 1;
    return { query, results: [], error: error.message };
  }
}
async function processSearchResultIntoLead(result, sourceContext = {}) {
  const resultText = [result.title, result.url, result.description, JSON.stringify(result.profile || {}), JSON.stringify(result.meta_url || {}), sourceContext.query || "", sourceContext.source || ""].join("\\n");
  let extracted;
  try {
    if (runtime.groqCalls >= MAX_GROQ_CALLS) extracted = defaultExtraction(resultText);
    else {
      extracted = await extractWithGroq(resultText);
      await sleep(2000);
    }
  } catch (error) {
    runtime.groqFailures += 1;
    extracted = { ...defaultExtraction(resultText), score: 50, grade: "D", fitReason: `AI parsing failed; manual review required. ${clean(error.message).slice(0, 120)}` };
  }
  const linkedinUrl = linkedinFromResult(result);
  const email = extractEmail(resultText);
  const phone = extractPhone(resultText);
  const sourceType = extracted.isCPA ? "cpa" : linkedinUrl ? "linkedin" : sourceContext.sourceType || "public";
  const lead = {
    id: `${sourceType}_${slug((extracted.name || "unknown") + (linkedinUrl || result.url || result.title))}`,
    name: extracted.name || "",
    company: extracted.company || "",
    title: extracted.title || sourceContext.defaultTitle || "Professional / Business Signal",
    location: sourceContext.location || "USA",
    sourceType,
    source: sourceContext.source || "Brave Public Search",
    sourceUrl: linkedinUrl || result.url || "",
    signal: result.title || sourceContext.query || "",
    summary: result.description || "",
    fitReason: extracted.fitReason,
    accreditedLikelyReason: "Professional role/context supports screening only. Accredited status must be confirmed by the prospect.",
    contactMethods: [],
    evidenceTrail: [],
    score: extracted.score || 50,
    grade: extracted.grade || gradeFromScore(extracted.score || 50),
    type: extracted.isCPA ? "cpa" : "investor",
    isPerson: extracted.isPerson,
    isCPA: extracted.isCPA,
    foundAt: now(),
    rawSearchResult: result
  };
  if (linkedinUrl) addContact(lead, "linkedin", linkedinUrl, "Brave public search");
  if (email) addContact(lead, "email", email, "Brave public search");
  if (phone) addContact(lead, "phone", phone, "Brave public search");
  addEvidence(lead, sourceContext.source || "Brave Public Search", linkedinUrl || result.url, result.description || result.title || "Public search result evidence.");
  return lead;
}
function leadKey(lead) { return [lead.name, lead.company, lead.title, lead.sourceUrl, (lead.contactMethods || []).map(c => `${c.type}:${c.value}`).sort().join("|")].join("|").toLowerCase().replace(/\W+/g, ""); }
function uniqueBy(list, keyFn) { const seen = new Set(); const out = []; for (const item of list || []) { const key = keyFn(item); if (!key || seen.has(key)) continue; seen.add(key); out.push(item); } return out; }
function dedupeLeads(leads) {
  const map = new Map();
  for (const lead of leads || []) {
    if (!lead || !lead.name) continue;
    const key = leadKey(lead);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) { map.set(key, lead); continue; }
    const score = Math.max(Number(existing.score || 0), Number(lead.score || 0));
    map.set(key, { ...existing, ...lead, score, grade: gradeFromScore(score), contactMethods: uniqueBy([...(existing.contactMethods || []), ...(lead.contactMethods || [])], c => `${c.type}|${c.value}`.toLowerCase()), evidenceTrail: uniqueBy([...(existing.evidenceTrail || []), ...(lead.evidenceTrail || [])], e => `${e.source}|${e.url}`.toLowerCase()) });
  }
  return Array.from(map.values());
}
function isNamedPerson(lead) {
  const name = clean(lead.name || "");
  if (!name || name.length < 4) return false;
  if (!/\s/.test(name)) return false;
  if (/\b(inc|llc|pllc|corp|clinic|center|hospital|university|department|group|associates|advisors|capital|partners)\b/i.test(name)) return false;
  return lead.isPerson === true;
}

function evidenceCount(lead) {
  return Array.isArray(lead.evidenceTrail) ? lead.evidenceTrail.filter(e => clean(e.url || e.whatItProves || "")).length : 0;
}

function ensureTag(lead, tag) {
  lead.tags ||= [];
  if (!lead.tags.includes(tag)) lead.tags.push(tag);
}

function clearRouteTags(lead) {
  lead.tags = (lead.tags || []).filter(tag => ![
    "Ready for Associate",
    "LinkedIn Verify",
    "LinkedIn Verified",
    "CPA Verify",
    "CPA",
    "Research / Enrich",
    "Skipped",
    "A Grade",
    "B Grade",
    "C Grade",
    "D Grade",
    "Email",
    "Phone",
    "LinkedIn",
    "RSS/Public",
    "NPI/MPI",
    "Brave Enriched"
  ].includes(tag));
}

function addSourceTags(lead) {
  const blob = `${lead.sourceType || ""} ${lead.source || ""} ${lead.sourceUrl || ""}`.toLowerCase();

  if (/rss|news|public/.test(blob)) ensureTag(lead, "RSS/Public");
  if (/npi|mpi|npiregistry/.test(blob)) ensureTag(lead, "NPI/MPI");
  if (/cpa|tax|account/.test(blob) || lead.isCPA) ensureTag(lead, "CPA");
  if (hasContact(lead, "email")) ensureTag(lead, "Email");
  if (hasContact(lead, "phone")) ensureTag(lead, "Phone");
  if (hasContact(lead, "linkedin")) ensureTag(lead, "LinkedIn");
  if (evidenceCount(lead) >= 2) ensureTag(lead, "Brave Enriched");
}

function routeLead(lead) {
  clearRouteTags(lead);

  const isPerson = isNamedPerson(lead);
  const isCPA = lead.isCPA === true;
  const score = Math.max(0, Math.min(100, Number(lead.score || 0)));
  const email = hasContact(lead, "email");
  const phone = hasContact(lead, "phone");
  const linkedIn = hasContact(lead, "linkedin");
  const evidenceN = evidenceCount(lead);
  const npiOnly = /npi|mpi/i.test(`${lead.sourceType || ""} ${lead.source || ""}`) && !linkedIn && !email && evidenceN <= 1;

  lead.score = score;
  lead.grade = gradeFromScore(score);
  lead.isPerson = isPerson;
  lead.isCPA = isCPA;

  ensureTag(lead, `${lead.grade} Grade`);
  addSourceTags(lead);

  // Closed-circuit CRM rules:
  // Ready for Associate = real named person + email + phone + evidence/enrichment + score >= 58.
  // LinkedIn Verify = LinkedIn URL found but human verification still needed.
  // CPA Verify = CPA/referral route needing review.
  // Research / Enrich = partial but not associate-ready.
  // Skipped = no usable route.
  const readyForAssociate = Boolean(isPerson && email && phone && evidenceN >= 1 && score >= 58);
  const linkedinVerify = Boolean(isPerson && !readyForAssociate && linkedIn);
  const cpaVerify = Boolean(isPerson && !readyForAssociate && !linkedinVerify && isCPA);
  const research = Boolean(isPerson && !readyForAssociate && !linkedinVerify && !cpaVerify && !npiOnly && (email || phone || score >= 70));
  const skipped = Boolean(!readyForAssociate && !linkedinVerify && !cpaVerify && !research);

  lead.associateReady = readyForAssociate;
  lead.readyForAssociate = readyForAssociate;
  lead.linkedinVerify = linkedinVerify;
  lead.linkedinVerified = Boolean(lead.linkedinVerified && readyForAssociate);
  lead.cpaVerify = cpaVerify;
  lead.needsResearch = research;
  lead.skipped = skipped;

  lead.bucket = readyForAssociate ? "readyForAssociate" : linkedinVerify ? "linkedinVerify" : cpaVerify ? "cpaVerify" : research ? "research" : "skipped";
  lead.status = readyForAssociate ? "Ready for Associate" : linkedinVerify ? "LinkedIn Verify" : cpaVerify ? "CPA Verify" : research ? "Research / Enrich" : "Skipped / No Warm Route";
  lead.queue = lead.status;
  lead.workflowDay = readyForAssociate ? (lead.workflowDay || 1) : 0;
  lead.type = isCPA ? "cpa" : "investor";
  lead.priorityRank = readyForAssociate ? 1 : linkedinVerify ? 2 : cpaVerify ? 3 : research ? 6 : 9;

  if (readyForAssociate) ensureTag(lead, "Ready for Associate");
  if (linkedinVerify) ensureTag(lead, "LinkedIn Verify");
  if (lead.linkedinVerified) ensureTag(lead, "LinkedIn Verified");
  if (cpaVerify) ensureTag(lead, "CPA Verify");
  if (research) ensureTag(lead, "Research / Enrich");
  if (skipped) ensureTag(lead, "Skipped");

  if (readyForAssociate) {
    lead.bestFirstAction = "Ready for Associate: email + phone + evidence exist. Start Day 1 with email or LinkedIn touch, then call only after review.";
  } else if (linkedinVerify) {
    lead.bestFirstAction = "LinkedIn Verify: open the profile manually, confirm identity, paste bio/contact context, then move to Ready for Associate.";
  } else if (cpaVerify) {
    lead.bestFirstAction = "CPA Verify: review referral/tax-professional relevance before outreach.";
  } else if (research) {
    lead.bestFirstAction = "Research / Enrich: incomplete route. Needs enrichment before associate workflow.";
  } else {
    lead.bestFirstAction = "Skipped: no email + phone + LinkedIn/manual verification route.";
  }

  lead.disposition = lead.disposition || "New / Not Worked";
  lead.requiredTasks = lead.requiredTasks || [];
  lead.callHistory = lead.callHistory || [];

  return lead;
}
async function fetchBraveQueryLeads(query, count, sourceContext) {
  const response = await braveSearch(query, count);
  const out = [];
  for (const result of response.results || []) {
    const lead = await processSearchResultIntoLead(result, { ...sourceContext, query });
    if (lead.name && lead.isPerson) out.push(lead);
  }
  return out;
}
async function fetchLinkedInDiscovery() {
  const queries = [
    'site:linkedin.com/in ("physician" OR "surgeon" OR "dentist") ("owner" OR "partner" OR "founder") Texas',
    'site:linkedin.com/in "orthopedic surgeon" ("owner" OR "partner" OR "private practice")',
    'site:linkedin.com/in "anesthesiologist" ("medical director" OR "partner")',
    'site:linkedin.com/in "dentist" "practice owner"',
    'site:linkedin.com/in "attorney" ("law partner" OR "managing partner") Texas',
    'site:linkedin.com/in ("CEO" OR "founder" OR "owner") ("acquisition" OR "exit" OR "sold")',
    'site:linkedin.com/in "CPA" ("tax partner" OR "tax advisor" OR "tax planning") Texas',
    'site:linkedin.com/in "business owner" ("liquidity event" OR "private equity" OR "M&A")'
  ];
  const out = [];
  for (const query of queries) {
    if (out.length >= MAX_LINKEDIN_DISCOVERY) break;
    out.push(...await fetchBraveQueryLeads(query, 10, { source: "LinkedIn URL via Brave public search", sourceType: "linkedin", defaultTitle: "Professional / LinkedIn Signal" }));
  }
  return dedupeLeads(out).slice(0, MAX_LINKEDIN_DISCOVERY);
}
async function fetchCpaDiscovery() {
  const queries = [
    '"CPA" "tax planning" "high net worth" Texas email',
    '"CPA" "oil and gas" "tax deductions" Texas',
    '"tax partner" "business owners" "investment tax planning"',
    'site:linkedin.com/in "CPA" "tax partner" Texas',
    '"CPA firm" "oil and gas" "tax deductions"'
  ];
  const out = [];
  for (const query of queries) {
    if (out.length >= MAX_CPA_DISCOVERY) break;
    out.push(...await fetchBraveQueryLeads(query, 10, { source: "CPA public search", sourceType: "cpa", defaultTitle: "CPA / Tax Professional" }));
  }
  return dedupeLeads(out).slice(0, MAX_CPA_DISCOVERY);
}
function extractXml(item, tag) {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i").exec(item);
  if (cdata) return clean(cdata[1]);
  const normal = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i").exec(item);
  return clean(normal?.[1] || "");
}
async function fetchRssSeeds() {
  const feeds = [
    "https://news.google.com/rss/search?q=(doctor%20OR%20surgeon%20OR%20physician)%20(owner%20OR%20partner%20OR%20founder)%20practice%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=(orthopedic%20surgeon%20OR%20dentist%20OR%20anesthesiologist)%20(named%20OR%20joins%20OR%20opens%20OR%20acquires)%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=(CPA%20OR%20tax%20partner%20OR%20tax%20advisor)%20(tax%20planning%20OR%20high%20net%20worth%20OR%20business%20owner)%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=(attorney%20OR%20law%20partner%20OR%20managing%20partner)%20(award%20OR%20named%20OR%20business%20owner)%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=(founder%20OR%20CEO%20OR%20business%20owner)%20(sold%20company%20OR%20acquisition%20OR%20liquidity%20event)%20USA&hl=en-US&gl=US&ceid=US:en"
  ];
  const out = [];
  for (const feed of feeds) {
    if (out.length >= MAX_RSS) break;
    try {
      const response = await fetch(feed);
      if (!response.ok) continue;
      const xml = await response.text();
      for (const item of xml.split("<item>").slice(1, 18)) {
        if (out.length >= MAX_RSS) break;
        const title = extractXml(item, "title");
        const link = extractXml(item, "link");
        const description = extractXml(item, "description");
        const lead = await processSearchResultIntoLead({ title, url: link, description }, { source: "Google News RSS", sourceType: /cpa|tax|account/i.test(`${title} ${description}`) ? "cpa" : "rss", defaultTitle: "Public News Signal" });
        if (lead.name && lead.isPerson) out.push(lead);
      }
    } catch (error) { console.warn("RSS fetch failed:", error.message); }
  }
  return dedupeLeads(out).slice(0, MAX_RSS);
}
async function fetchNpiSeeds() {
  const out = [];
  const taxonomies = ["Orthopaedic Surgery", "Anesthesiology", "Surgery", "Internal Medicine", "Family Medicine", "General Dentistry"];
  const states = ["TX", "OK", "CO", "AZ", "FL", "CA", "TN", "GA", "NC"];
  for (const taxonomy of taxonomies) {
    for (const state of states) {
      if (out.length >= MAX_NPI) break;
      const url = new URL("https://npiregistry.cms.hhs.gov/api/");
      url.searchParams.set("version", "2.1");
      url.searchParams.set("taxonomy_description", taxonomy);
      url.searchParams.set("state", state);
      url.searchParams.set("limit", "10");
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const json = await response.json();
        for (const row of json.results || []) {
          if (out.length >= MAX_NPI) break;
          const basic = row.basic || {};
          const name = clean(`${basic.first_name || ""} ${basic.last_name || ""}`);
          if (!name) continue;
          const address = (row.addresses || []).find(a => a.address_purpose === "LOCATION") || (row.addresses || [])[0] || {};
          const phone = clean(address.telephone_number || "");
          const company = clean(basic.organization_name || address.organization_name || "");
          const location = clean([address.city, address.state].filter(Boolean).join(", "));
          const sourceUrl = `https://npiregistry.cms.hhs.gov/provider-view/${row.number}`;
          const snippet = [`Name: ${name}`, `Title: ${taxonomy} ${basic.credential || ""}`, `Company: ${company}`, `Location: ${location}`, `Source: NPI Registry`, sourceUrl].join("\\n");
          let extracted;
          try {
            if (runtime.groqCalls < MAX_GROQ_CALLS) { extracted = await extractWithGroq(snippet); await sleep(2000); }
            else extracted = { name, company, title: taxonomy, isPerson: true, isCPA: false, score: 50, grade: "D", fitReason: "NPI provider record. Manual review required." };
          } catch {
            runtime.groqFailures += 1;
            extracted = { name, company, title: taxonomy, isPerson: true, isCPA: false, score: 50, grade: "D", fitReason: "NPI provider record. Manual review required." };
          }
          const lead = { id: `npi_${row.number}`, name: extracted.name || name, company: extracted.company || company, title: extracted.title || taxonomy, location, sourceType: "npi", source: "NPI Registry", sourceUrl, signal: `NPI provider record: ${name}`, summary: snippet, fitReason: extracted.fitReason, accreditedLikelyReason: "Professional role/context supports screening only. Accredited status must be confirmed by the prospect.", contactMethods: [], evidenceTrail: [{ source: "NPI Registry", url: sourceUrl, whatItProves: `Named provider in NPI Registry: ${taxonomy}` }], score: extracted.score || 50, grade: extracted.grade || gradeFromScore(extracted.score || 50), type: "investor", isPerson: Boolean(extracted.isPerson), isCPA: Boolean(extracted.isCPA), foundAt: now() };
          if (phone) addContact(lead, "phone", phone, "NPI Registry");
          out.push(lead);
        }
      } catch (error) { console.warn("NPI fetch failed:", error.message); }
      await sleep(80);
    }
  }
  return dedupeLeads(out);
}
async function enrichLeadWithBrave(lead) {
  if (!lead.name || runtime.publicSearches >= MAX_PUBLIC_SEARCHES) return lead;
  if (hasContact(lead, "email") && hasContact(lead, "linkedin")) return lead;
  const query = `"${lead.name}" "${lead.company || lead.title || ""}" email LinkedIn`;
  const response = await braveSearch(query, 5);
  for (const result of response.results || []) {
    const text = `${result.title} ${result.url} ${result.description}`;
    const email = extractEmail(text);
    const phone = extractPhone(text);
    const linkedin = linkedinFromResult(result);
    if (email) addContact(lead, "email", email, "Brave enrichment");
    if (phone) addContact(lead, "phone", phone, "Brave enrichment");
    if (linkedin) addContact(lead, "linkedin", linkedin, "Brave enrichment");
    addEvidence(lead, result.title || "Brave enrichment", linkedin || result.url, result.description || "Public enrichment result.");
  }
  return lead;
}
async function main() {
  console.log("Basin Radar V4.1 starting");
  console.log(JSON.stringify({ node: process.version, braveConfigured: Boolean(BRAVE_API_KEY), groqConfigured: Boolean(GROQ_API_KEY), groqModel: GROQ_MODEL }, null, 2));
  const radarState = await readJson(STATE_PATH, { seen: {}, suppressed: {} });
  const errors = [];
  let linkedin = [], cpa = [], rss = [], npi = [];

  // Pull warm/contextual sources first. NPI is a backup seed source and should not dominate or consume all Groq calls.
  try { rss = await fetchRssSeeds(); } catch (error) { errors.push({ source: "rss", reason: error.message }); }
  try { linkedin = await fetchLinkedInDiscovery(); } catch (error) { errors.push({ source: "linkedinDiscovery", reason: error.message }); }
  try { cpa = await fetchCpaDiscovery(); } catch (error) { errors.push({ source: "cpaDiscovery", reason: error.message }); }
  try { npi = await fetchNpiSeeds(); } catch (error) { errors.push({ source: "npi", reason: error.message }); }
  let all = dedupeLeads([...linkedin, ...cpa, ...rss, ...npi]).filter(lead => !radarState.suppressed?.[leadKey(lead)]);
  all.sort((a, b) => { const rank = lead => lead.sourceType === "linkedin" ? 1 : lead.sourceType === "cpa" ? 2 : lead.sourceType === "rss" ? 3 : 4; return rank(a) - rank(b) || Number(b.score || 0) - Number(a.score || 0); });
  const enriched = [];
  for (const lead of all) {
    try { if (!hasContact(lead, "email") || !hasContact(lead, "linkedin")) await enrichLeadWithBrave(lead); }
    catch (error) { errors.push({ source: "enrich", name: lead.name, reason: error.message }); }
    enriched.push(lead);
  }
  all = dedupeLeads(enriched).map(routeLead).filter(lead => lead.isPerson === true).sort((a, b) => (a.priorityRank || 9) - (b.priorityRank || 9) || Number(b.score || 0) - Number(a.score || 0) || a.name.localeCompare(b.name));
  const ready = all.filter(lead => lead.readyForAssociate || lead.associateReady);
  const linkedinVerify = all.filter(lead => lead.linkedinVerify);
  const cpaVerify = all.filter(lead => lead.cpaVerify);
  const research = all.filter(lead => lead.bucket === "research");
  const skipped = all.filter(lead => lead.skipped);
  const active = [...ready, ...linkedinVerify, ...cpaVerify, ...research];
  const output = {
    generatedAt: now(),
    engine: "Basin OS V4.1 Full Migration Radar Runner",
    compliance: { linkedin: "No LinkedIn page scraping. Stores possible LinkedIn profile URLs from Brave public search results only.", outreach: "No auto-send. Manual review required before every outreach.", qualification: "Accredited status is never assumed." },
    routingRules: { readyForAssociate: "Real person + email + phone + evidence/enrichment + score >= 58.", linkedinVerify: "LinkedIn URL found but manual profile/contact verification is still needed.", cpaVerify: "CPA/tax/referral candidate requiring manual review.", research: "Partial route, not associate-ready.", skipped: "No email + phone + LinkedIn/manual verification route." },
    stats: { totalFound: all.length, activeVisible: active.length, readyForAssociate: ready.length, readyToWork: ready.length, linkedinVerify: linkedinVerify.length, cpaVerify: cpaVerify.length, skipped: skipped.length, npiCollected: npi.length, rssCollected: rss.length, linkedinDiscoveryCollected: linkedin.length, cpaCollected: cpa.length, emailFound: active.filter(l => hasContact(l, "email")).length, linkedinCandidatesFound: active.filter(l => hasContact(l, "linkedin")).length, phoneFound: active.filter(l => hasContact(l, "phone")).length, publicSearches: runtime.publicSearches, groqCalls: runtime.groqCalls, groqFailures: runtime.groqFailures, braveFailures: runtime.braveFailures, braveConfigured: Boolean(BRAVE_API_KEY), groqConfigured: Boolean(GROQ_API_KEY), errors: errors.length },
    leads: ready,
    linkedinVerifyCandidates: linkedinVerify,
    cpaVerifyCandidates: cpaVerify,
    researchCandidates: research,
    skippedCandidates: skipped,
    allCandidates: active,
    errors
  };
  for (const lead of all) radarState.seen[leadKey(lead)] = { name: lead.name, status: lead.status, score: lead.score, lastSeen: now() };
  await writeJson("public/data/radar-leads.json", output);
  await writeJson("radar-leads.json", output);
  await writeJson("public/data/radar-research-candidates.json", { generatedAt: now(), candidates: [] });
  await writeJson("radar-research-candidates.json", { generatedAt: now(), candidates: [] });
  await writeJson("public/data/radar-rejected.json", { generatedAt: now(), skipped: skipped.length, errors });
  await writeJson("radar-rejected.json", { generatedAt: now(), skipped: skipped.length, errors });
  await writeJson("public/data/radar-run-log.json", { generatedAt: now(), stats: output.stats });
  await writeJson(STATE_PATH, radarState);
  console.log(JSON.stringify(output.stats, null, 2));
}
main().catch(async error => {
  console.error(error);
  const fallback = { generatedAt: now(), engine: "Basin OS V4.1 fallback output", fatalError: clean(error.stack || error.message || error), stats: { totalFound: 0, activeVisible: 0, readyToWork: 0, linkedinVerify: 0, cpaVerify: 0, skipped: 0, npiCollected: 0, rssCollected: 0, linkedinDiscoveryCollected: 0, cpaCollected: 0, emailFound: 0, linkedinCandidatesFound: 0, phoneFound: 0, publicSearches: runtime.publicSearches, groqCalls: runtime.groqCalls, groqFailures: runtime.groqFailures, braveFailures: runtime.braveFailures, braveConfigured: Boolean(BRAVE_API_KEY), groqConfigured: Boolean(GROQ_API_KEY), errors: 1 }, leads: [], linkedinVerifyCandidates: [], cpaVerifyCandidates: [], researchCandidates: [], skippedCandidates: [], allCandidates: [], errors: [{ source: "fatal", reason: clean(error.message || error) }] };
  await writeJson("public/data/radar-run-log.json", fallback);
  process.exit(0);
});
