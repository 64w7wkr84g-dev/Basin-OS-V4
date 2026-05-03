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

const MAX_PUBLIC_SEARCHES = Number(process.env.MAX_PUBLIC_SEARCHES || 300);
const MAX_GROQ_CALLS = Number(process.env.MAX_GROQ_CALLS || 80);
const MAX_NPI = Number(process.env.MAX_NPI || 80);
const MAX_RSS = Number(process.env.MAX_RSS || 80);
const MAX_LINKEDIN_DISCOVERY = Number(process.env.MAX_LINKEDIN_DISCOVERY || 120);
const MAX_CPA_DISCOVERY = Number(process.env.MAX_CPA_DISCOVERY || 60);

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
  const score = 50;
  return { name: null, company: null, title: null, isPerson: false, isCPA: /cpa|tax|account/i.test(snippet), score, grade: gradeFromScore(score), fitReason: "Default fallback score because AI parsing was unavailable. Manual verification required." };
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
- Score 0-100 for usefulness as a compliant educational lead or CPA/referral path for Basin Ventures.
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
function routeLead(lead) {
  const isPerson = lead.isPerson === true;
  const isCPA = lead.isCPA === true;
  const score = Math.max(0, Math.min(100, Number(lead.score || 0)));
  const hasEmail = hasContact(lead, "email");
  const hasLinkedIn = hasContact(lead, "linkedin");
  const ready = Boolean(isPerson && hasEmail && score >= 58);
  const linkedinVerify = Boolean(isPerson && !ready && hasLinkedIn);
  const cpaVerify = Boolean(isPerson && !ready && !linkedinVerify && isCPA);
  lead.score = score;
  lead.grade = gradeFromScore(score);
  lead.isPerson = isPerson;
  lead.isCPA = isCPA;
  lead.associateReady = ready;
  lead.linkedinVerify = linkedinVerify;
  lead.cpaVerify = cpaVerify;
  lead.skipped = Boolean(!ready && !linkedinVerify && !cpaVerify);
  lead.bucket = ready ? "ready" : linkedinVerify ? "linkedinVerify" : cpaVerify ? "cpaVerify" : "skipped";
  lead.status = ready ? "Ready to Work" : linkedinVerify ? "LinkedIn Verify" : cpaVerify ? "CPA Verify" : "Skipped / No Warm Route";
  lead.queue = lead.status;
  lead.workflowDay = ready ? 1 : 0;
  lead.type = isCPA ? "cpa" : "investor";
  lead.priorityRank = ready ? 1 : linkedinVerify ? 2 : cpaVerify ? 3 : 9;
  if (ready) lead.bestFirstAction = "Day 1: send evidence-based email first. Phone follow-up only after reviewing the evidence trail.";
  else if (linkedinVerify) lead.bestFirstAction = "Open LinkedIn manually, verify the person, paste the bio, then generate compliant outreach.";
  else if (cpaVerify) lead.bestFirstAction = "Review CPA/referral relevance and manually promote if useful.";
  else lead.bestFirstAction = "Skipped: no email, no LinkedIn URL, and no CPA/referral route.";
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
    'site:linkedin.com/in "physician" "practice owner" Texas',
    'site:linkedin.com/in "orthopedic surgeon" Texas',
    'site:linkedin.com/in "anesthesiologist" "medical director"',
    'site:linkedin.com/in "dentist" "practice owner"',
    'site:linkedin.com/in "attorney" "law partner" Texas',
    'site:linkedin.com/in "CEO" "founder" acquisition',
    'site:linkedin.com/in "CPA" "tax partner" Texas',
    'site:linkedin.com/in "business owner" "liquidity event"'
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
    "https://news.google.com/rss/search?q=doctor%20joins%20practice%20OR%20surgeon%20named%20partner%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=physician%20opened%20medical%20practice%20OR%20surgeon%20conference%20speaker%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=CPA%20tax%20planning%20business%20owner%20liquidity%20event%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=attorney%20law%20partner%20award%20business%20owner%20USA&hl=en-US&gl=US&ceid=US:en"
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
  try { linkedin = await fetchLinkedInDiscovery(); } catch (error) { errors.push({ source: "linkedinDiscovery", reason: error.message }); }
  try { cpa = await fetchCpaDiscovery(); } catch (error) { errors.push({ source: "cpaDiscovery", reason: error.message }); }
  try { rss = await fetchRssSeeds(); } catch (error) { errors.push({ source: "rss", reason: error.message }); }
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
  const ready = all.filter(lead => lead.associateReady);
  const linkedinVerify = all.filter(lead => lead.linkedinVerify);
  const cpaVerify = all.filter(lead => lead.cpaVerify);
  const skipped = all.filter(lead => lead.skipped);
  const active = [...ready, ...linkedinVerify, ...cpaVerify, ...all.filter(l => l.bucket === "research")];
  const output = {
    generatedAt: now(),
    engine: "Basin OS V4.1 Full Migration Radar Runner",
    compliance: { linkedin: "No LinkedIn page scraping. Stores possible LinkedIn profile URLs from Brave public search results only.", outreach: "No auto-send. Manual review required before every outreach.", qualification: "Accredited status is never assumed." },
    routingRules: { ready: "Groq says real person + email + score >= 58.", linkedinVerify: "Groq says real person + LinkedIn URL but no email.", cpaVerify: "Groq says real person + CPA/tax/referral relevance.", skipped: "No email, no LinkedIn URL, no CPA/referral path." },
    stats: { totalFound: all.length, activeVisible: active.length, readyToWork: ready.length, linkedinVerify: linkedinVerify.length, cpaVerify: cpaVerify.length, skipped: skipped.length, npiCollected: npi.length, rssCollected: rss.length, linkedinDiscoveryCollected: linkedin.length, cpaCollected: cpa.length, emailFound: active.filter(l => hasContact(l, "email")).length, linkedinCandidatesFound: active.filter(l => hasContact(l, "linkedin")).length, phoneFound: active.filter(l => hasContact(l, "phone")).length, publicSearches: runtime.publicSearches, groqCalls: runtime.groqCalls, groqFailures: runtime.groqFailures, braveFailures: runtime.braveFailures, braveConfigured: Boolean(BRAVE_API_KEY), groqConfigured: Boolean(GROQ_API_KEY), errors: errors.length },
    leads: ready,
    linkedinVerifyCandidates: linkedinVerify,
    cpaVerifyCandidates: cpaVerify,
    researchCandidates: [],
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
