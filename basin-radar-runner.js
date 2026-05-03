#!/usr/bin/env node
/**
 * Basin OS V3 — Groq Parsed Radar Runner
 *
 * Backend:
 * - Runs in GitHub Actions on Node 20+
 * - Uses Brave Search for public discovery/enrichment
 * - Uses Groq/Llama to parse snippets into structured lead objects
 * - Maintains JSON file output used by the static GitHub Pages frontend
 *
 * Compliance:
 * - Does not scrape LinkedIn pages.
 * - Stores public LinkedIn URLs from Brave result URLs/snippets only.
 * - Does not auto-message, auto-email, auto-call, or bypass any platform limits.
 * - Accredited status is never assumed. Public role/context only supports prioritization.
 */

const fs = require("fs/promises");
const path = require("path");

if (typeof fetch !== "function") {
  console.error("Fatal: global fetch is not available. Use Node 18+ / Node 24 in GitHub Actions.");
  process.exit(1);
}

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const MAX_NPI = Number(process.env.MAX_NPI || 80);
const MAX_RSS = Number(process.env.MAX_RSS || 80);
const MAX_LINKEDIN_DISCOVERY = Number(process.env.MAX_LINKEDIN_DISCOVERY || 120);
const MAX_CPA_DISCOVERY = Number(process.env.MAX_CPA_DISCOVERY || 60);
const MAX_PUBLIC_SEARCHES = Number(process.env.MAX_PUBLIC_SEARCHES || 350);
const MAX_GROQ_CALLS = Number(process.env.MAX_GROQ_CALLS || 70);

const STATE_PATH = path.join("data", "radar-state.json");

const now = () => new Date().toISOString();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function clean(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || `lead-${Date.now()}`;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function uniqBy(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function leadKey(lead) {
  return [
    lead.name,
    lead.company,
    lead.title,
    lead.location,
    lead.sourceUrl,
    (lead.contactMethods || []).map(c => `${c.type}:${c.value}`).sort().join("|")
  ].join("|").toLowerCase().replace(/\W+/g, "");
}

function betterSource(a, b) {
  const rank = { email: 1, linkedin: 2, cpa: 3, rss: 4, public: 5, npi: 8, unknown: 9 };
  return (rank[b] || 9) < (rank[a] || 9) ? b : a;
}

function dedupeLeads(list) {
  const map = new Map();
  for (const lead of list || []) {
    if (!lead || !lead.name) continue;
    const key = leadKey(lead);
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, lead);
      continue;
    }

    map.set(key, {
      ...existing,
      ...lead,
      score: Math.max(Number(existing.score || 0), Number(lead.score || 0)),
      grade: gradeFromScore(Math.max(Number(existing.score || 0), Number(lead.score || 0))),
      sourceType: betterSource(existing.sourceType, lead.sourceType),
      contactMethods: uniqBy([...(existing.contactMethods || []), ...(lead.contactMethods || [])], c => `${c.type}|${c.value}`.toLowerCase()),
      evidenceTrail: uniqBy([...(existing.evidenceTrail || []), ...(lead.evidenceTrail || [])], e => `${e.source}|${e.url}`.toLowerCase())
    });
  }
  return Array.from(map.values());
}

function gradeFromScore(score) {
  score = Number(score || 0);
  if (score >= 88) return "A";
  if (score >= 72) return "B";
  if (score >= 58) return "C";
  return "D";
}

function fallbackIsPersonName(name) {
  const n = clean(name);
  if (!n || n.length < 5) return false;
  if (/\b(inc|llc|company|group|associates|services|clinic|hospital|system|advertising|transactional|assistant|former|department|center|institute|strategies|financial|legal|tax|medical center|healthcare|university|academy|award|news|partners|office|firm)\b/i.test(n)) return false;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every(p => /^[A-Z][A-Za-z'.-]+$/.test(p));
}

function normalizeUrl(raw) {
  const value = clean(raw);
  if (!value) return "";
  try {
    const url = new URL(value);
    for (const param of ["url", "u", "q", "target"]) {
      const nested = url.searchParams.get(param);
      if (nested && /https?:\/\//i.test(nested)) return decodeURIComponent(nested);
    }
  } catch {}
  return value;
}

function extractLinkedInUrlFromText(text) {
  const t = clean(text);
  const full = t.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9%_.\-]+\/?/i);
  if (full) return full[0];
  const partial = t.match(/(?:www\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9%_.\-]+\/?/i);
  return partial ? `https://${partial[0].replace(/^https?:\/\//, "")}` : "";
}

function extractLinkedInUrl(result) {
  return extractLinkedInUrlFromText([
    result.url,
    result.profile?.url,
    result.meta_url?.url,
    result.meta_url?.hostname,
    result.meta_url?.netloc,
    result.title,
    result.description
  ].map(normalizeUrl).join(" "));
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


function fallbackName(text) {
  const t = clean(text);
  const patterns = [
    /\bDr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,2})\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,2}),?\s+(?:MD|M\.D\.|DO|DDS|CPA|CEO|President|Founder|Partner|Attorney)\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,2})\s+(?:opens|joins|named|appointed|launches|speaks|wins|announces|receives|promoted|selected)\b/i,
    /\b(?:named|appoints|hires|promotes|welcomes)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,2})\b/i
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match && fallbackIsPersonName(match[1])) return clean(match[1]);
  }
  return "";
}

function fallbackLinkedInName(title) {
  let t = clean(title)
    .replace(/\s+\|\s+LinkedIn.*$/i, "")
    .replace(/\s+-\s+LinkedIn.*$/i, "")
    .replace(/\b(MD|M\.D\.|DO|DDS|CPA|JD|MBA|Esq\.?|FACS|CFA|CFP)\b/gi, "")
    .replace(/[,|]+/g, " ");
  t = t.split(" - ")[0].split(" | ")[0].trim();
  const possible = t.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3})\b/);
  return clean(possible ? possible[1] : t);
}

function fallbackTitle(text) {
  if (/CPA|tax|account/i.test(text)) return "CPA / Tax Professional";
  if (/surgeon|orthopedic|orthopaedic/i.test(text)) return "Surgeon / Specialist";
  if (/physician|doctor|medical|anesthes|cardio|dermat|gastro/i.test(text)) return "Physician / Specialist";
  if (/dentist|dental/i.test(text)) return "Dentist / Practice Owner";
  if (/attorney|law|partner|litigator/i.test(text)) return "Attorney / Law Partner";
  if (/CEO|founder|president|owner|executive|principal/i.test(text)) return "Business Owner / Executive";
  return "Professional / Business Signal";
}

function fallbackCompany(title) {
  const parts = clean(title).split(/\s+-\s+/);
  return parts.length > 1 ? parts[parts.length - 1].replace(/LinkedIn/i, "").trim().slice(0, 90) : "";
}

function fallbackExtract(textSnippet) {
  const text = clean(textSnippet);
  let name = fallbackName(text);
  if (!name && /linkedin/i.test(text)) name = fallbackLinkedInName(text);
  const title = fallbackTitle(text);
  const isCPA = /CPA|tax|account/i.test(text);
  const isPerson = fallbackIsPersonName(name);
  let score = isPerson ? 52 : 20;
  if (isCPA) score += 8;
  if (/linkedin\.com\/(in|pub)\//i.test(text)) score += 20;
  if (extractEmail(text)) score += 25;
  if (extractPhone(text)) score += 4;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    name: isPerson ? name : null,
    company: fallbackCompany(text) || null,
    title,
    isPerson,
    isCPA,
    score,
    grade: gradeFromScore(score),
    fitReason: isCPA
      ? "CPA/tax professional may be useful as a referral path or tax-planning education source."
      : "Public professional signal may support a compliant educational introduction."
  };
}

function safeJsonParse(raw) {
  const text = clean(raw).replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Groq returned non-JSON content");
  }
}

/**
 * TASK 1 required function.
 * Uses Groq to convert messy snippets into one strict JSON object.
 */
async function extractWithGroq(textSnippet) {
  if (!GROQ_API_KEY) return fallbackExtract(textSnippet);

  const system = `You are a strict JSON extraction engine for a high-compliance oil and gas investment CRM.

Return ONLY a raw JSON object. No markdown. No backticks. No explanation.

Schema:
{ "name": "string or null", "company": "string or null", "title": "string or null", "isPerson": boolean, "isCPA": boolean, "score": number, "grade": "A, B, C, or D", "fitReason": "string" }

Rules:
- Extract a real human person only. Do not return company names as people.
- If no clear person exists, set name to null and isPerson to false.
- isCPA true only for CPA, accountant, tax partner, tax planning, accounting firm professional, or similar.
- Score 0-100 based on investor/referral usefulness for a compliant educational intro.
- Grade must match score: A=88+, B=72-87, C=58-71, D<58.
- Do not assume accredited investor status. Only explain likely professional fit.
- Keep fitReason compliance-safe: no guarantees, no tax advice.`;

  const user = clean(textSnippet).slice(0, 6000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 420,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Groq ${response.status}: ${await response.text()}`);
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(content);

    const score = Math.max(0, Math.min(100, Number(parsed.score || 0)));
    return {
      name: parsed.name ? clean(parsed.name) : null,
      company: parsed.company ? clean(parsed.company) : null,
      title: parsed.title ? clean(parsed.title) : null,
      isPerson: Boolean(parsed.isPerson),
      isCPA: Boolean(parsed.isCPA),
      score,
      grade: ["A", "B", "C", "D"].includes(parsed.grade) ? parsed.grade : gradeFromScore(score),
      fitReason: clean(parsed.fitReason || "Public professional signal; fit must be verified.")
    };
  } catch (error) {
    console.warn("Groq extraction failed; using fallback:", error.message);
    return fallbackExtract(textSnippet);
  }
}

async function braveSearch(query, count = 10) {
  if (!BRAVE_API_KEY) return { query, results: [], error: "BRAVE_API_KEY missing" };

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("country", "US");
  url.searchParams.set("search_lang", "en");

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`Brave ${response.status}: ${await response.text()}`);
    }

    const json = await response.json();
    return {
      query,
      results: (json.web?.results || []).map(result => ({
        title: clean(result.title),
        url: normalizeUrl(result.url || ""),
        description: clean(result.description),
        profile: result.profile || null,
        meta_url: result.meta_url || null
      }))
    };
  } catch (error) {
    return { query, results: [], error: error.message };
  }
}

function addContact(lead, type, value, source) {
  const cleanValue = clean(value);
  if (!cleanValue) return;
  lead.contactMethods ||= [];
  if (!lead.contactMethods.some(c => c.type === type && c.value === cleanValue)) {
    lead.contactMethods.push({ type, value: cleanValue, source: clean(source || "public") });
  }
}

function addEvidence(lead, source, url, whatItProves) {
  const cleanUrl = clean(url);
  if (!cleanUrl) return;
  lead.evidenceTrail ||= [];
  if (!lead.evidenceTrail.some(e => e.url === cleanUrl)) {
    lead.evidenceTrail.push({
      source: clean(source),
      url: cleanUrl,
      whatItProves: clean(whatItProves || "Public evidence / cross-reference.")
    });
  }
}

function processSearchResultIntoLead(lead, result) {
  const text = [
    result.title,
    result.url,
    result.description,
    JSON.stringify(result.meta_url || {}),
    JSON.stringify(result.profile || {})
  ].join(" ");

  const linkedin = extractLinkedInUrl(result);
  if (linkedin) {
    addContact(lead, "linkedin", linkedin, "Brave public search");
    addEvidence(lead, "LinkedIn URL found by public search", linkedin, "Possible LinkedIn profile URL; manual verification required.");
    lead.sourceType = betterSource(lead.sourceType, "linkedin");
  }

  const email = extractEmail(text);
  if (email) {
    addContact(lead, "email", email, "Brave public search");
    addEvidence(lead, "Public email source", result.url, result.title || "Email discovered in public search result.");
    lead.sourceType = betterSource(lead.sourceType, "email");
  }

  const phone = extractPhone(text);
  if (phone) addContact(lead, "phone", phone, "Brave public search");

  if (result.url && !/google\.com\/search|webcache|translate\.google/i.test(result.url)) {
    addEvidence(lead, result.title || "Public search result", result.url, result.description || "Public evidence / cross-reference.");
  }
}

async function enrichLead(lead, budget, groqBudget, mode = "standard") {
  if (!BRAVE_API_KEY || budget.remaining <= 0) return lead;

  const name = lead.name;
  const role = clean((lead.title || "").split("·")[0]);
  const company = lead.company || "";
  const location = lead.location || "USA";

  const queries = mode === "light"
    ? [
        `"${name}" LinkedIn ${role}`,
        `"${name}" "${company || role}" email`
      ]
    : [
        `site:linkedin.com/in "${name}"`,
        `"${name}" LinkedIn "${role}"`,
        `"${name}" "${company || role}" email`,
        `"${name}" "${company || role}" contact`,
        `"${name}" "${location}" "${role}" profile`
      ];

  const seenResults = [];

  for (const query of queries) {
    if (budget.remaining <= 0) break;

    const response = await braveSearch(query, 10);
    budget.remaining -= 1;
    budget.used += 1;

    for (const result of response.results || []) {
      processSearchResultIntoLead(lead, result);
      seenResults.push(`${result.title}\n${result.url}\n${result.description}`);
    }

    await sleep(150);
  }

  if (groqBudget.remaining > 0 && seenResults.length) {
    const extracted = await extractWithGroq([
      lead.name,
      lead.title,
      lead.company,
      lead.signal,
      lead.summary,
      ...seenResults.slice(0, 5)
    ].join("\n\n"));

    groqBudget.remaining -= 1;
    groqBudget.used += 1;

    if (extracted.isPerson && extracted.name) {
      lead.name = extracted.name;
      lead.company = extracted.company || lead.company;
      lead.title = extracted.title || lead.title;
      lead.isPerson = extracted.isPerson;
      lead.isCPA = extracted.isCPA;
      lead.score = Math.max(Number(lead.score || 0), Number(extracted.score || 0));
      lead.grade = extracted.grade || gradeFromScore(lead.score);
      lead.fitReason = extracted.fitReason || lead.fitReason;
      if (extracted.isCPA) {
        lead.type = "cpa";
        lead.sourceType = betterSource(lead.sourceType, "cpa");
      }
    }

    await sleep(2000);
  }

  return lead;
}

async function leadFromSnippet({ idPrefix, sourceType, source, sourceUrl, snippet, defaultTitle, defaultType = "investor", baseScore = 50 }) {
  const extracted = await extractWithGroq(snippet);
  await sleep(GROQ_API_KEY ? 2000 : 0);

  if (!extracted.isPerson || !extracted.name) return null;

  const lead = {
    id: `${idPrefix}_${slug(extracted.name + sourceUrl)}`,
    name: extracted.name,
    title: extracted.title || defaultTitle || "Professional / Business Signal",
    company: extracted.company || fallbackCompany(snippet),
    location: "USA",
    sourceType: extracted.isCPA ? "cpa" : sourceType,
    source,
    sourceUrl,
    signal: clean(snippet).slice(0, 240),
    summary: clean(snippet).slice(0, 500),
    fitReason: extracted.fitReason,
    accreditedLikelyReason: "Professional role supports screening only. Accredited status must be confirmed by the prospect.",
    contactMethods: [],
    evidenceTrail: [{ source, url: sourceUrl, whatItProves: clean(snippet).slice(0, 220) }],
    score: Math.max(baseScore, extracted.score || 0),
    grade: extracted.grade || gradeFromScore(extracted.score),
    type: extracted.isCPA ? "cpa" : defaultType,
    isPerson: extracted.isPerson,
    isCPA: extracted.isCPA,
    foundAt: now()
  };

  const email = extractEmail(snippet);
  const phone = extractPhone(snippet);
  const linkedin = extractLinkedInUrlFromText(snippet);
  if (email) addContact(lead, "email", email, source);
  if (phone) addContact(lead, "phone", phone, source);
  if (linkedin) addContact(lead, "linkedin", linkedin, source);

  return lead;
}

async function fetchLinkedInDiscovery(limit = MAX_LINKEDIN_DISCOVERY, groqBudget) {
  if (!BRAVE_API_KEY) return [];

  const queries = [
    'site:linkedin.com/in "physician" "practice owner" Texas',
    'site:linkedin.com/in "orthopedic surgeon" Texas',
    'site:linkedin.com/in "anesthesiologist" "medical director"',
    'site:linkedin.com/in "dentist" "practice owner"',
    'site:linkedin.com/in "CPA" "tax partner" Texas',
    'site:linkedin.com/in "attorney" "law partner" Texas',
    'site:linkedin.com/in "CEO" "founder" acquisition',
    'site:linkedin.com/in "business owner" "liquidity event"',
    'site:linkedin.com/in "oil and gas" "investor" "CPA"'
  ];

  const out = [];

  for (const query of queries) {
    if (out.length >= limit) break;

    const response = await braveSearch(query, 20);
    for (const result of response.results || []) {
      if (out.length >= limit) break;
      const linkedin = extractLinkedInUrl(result);
      if (!linkedin) continue;

      const snippet = `${result.title}\n${linkedin}\n${result.description}`;
      let extracted;

      if (groqBudget.remaining > 0) {
        extracted = await extractWithGroq(snippet);
        groqBudget.remaining -= 1;
        groqBudget.used += 1;
        await sleep(2000);
      } else {
        extracted = fallbackExtract(snippet);
      }

      if (!extracted.isPerson || !extracted.name) continue;

      const lead = {
        id: `li_${slug(extracted.name + linkedin)}`,
        name: extracted.name,
        title: extracted.title || fallbackTitle(snippet),
        company: extracted.company || fallbackCompany(result.title),
        location: "USA",
        sourceType: "linkedin",
        source: "LinkedIn URL via Brave public search",
        sourceUrl: linkedin,
        signal: result.title,
        summary: result.description,
        fitReason: extracted.fitReason || "LinkedIn URL found by public search; manual verification route available.",
        accreditedLikelyReason: "Professional profile suggests screening potential only. Accredited status must be confirmed.",
        contactMethods: [{ type: "linkedin", value: linkedin, source: "Brave public search" }],
        evidenceTrail: [{ source: "LinkedIn URL found by public search", url: linkedin, whatItProves: "Possible LinkedIn profile URL; manual verification required." }],
        score: extracted.score || 70,
        grade: extracted.grade || gradeFromScore(extracted.score || 70),
        type: extracted.isCPA ? "cpa" : "investor",
        isPerson: extracted.isPerson,
        isCPA: extracted.isCPA,
        foundAt: now()
      };

      processSearchResultIntoLead(lead, result);
      out.push(lead);
    }

    await sleep(150);
  }

  return dedupeLeads(out);
}

async function fetchCpaDiscovery(limit = MAX_CPA_DISCOVERY, groqBudget) {
  if (!BRAVE_API_KEY) return [];

  const queries = [
    '"CPA" "tax planning" "high net worth" Texas email',
    '"CPA" "oil and gas" "tax deductions" Texas',
    '"tax partner" "accredited investor" CPA LinkedIn',
    '"CPA firm" "oil and gas" "tax deductions"',
    '"tax partner" "business owners" "investment tax planning"'
  ];

  const out = [];

  for (const query of queries) {
    if (out.length >= limit) break;

    const response = await braveSearch(query, 10);
    for (const result of response.results || []) {
      if (out.length >= limit) break;

      const snippet = `${result.title}\n${result.url}\n${result.description}`;
      let extracted;

      if (groqBudget.remaining > 0) {
        extracted = await extractWithGroq(snippet);
        groqBudget.remaining -= 1;
        groqBudget.used += 1;
        await sleep(2000);
      } else {
        extracted = fallbackExtract(snippet);
      }

      if (!extracted.isPerson || !extracted.name) continue;

      const linkedin = extractLinkedInUrl(result);
      const lead = {
        id: `cpa_${slug(extracted.name + (linkedin || result.url))}`,
        name: extracted.name,
        title: extracted.title || "CPA / Tax Professional",
        company: extracted.company || fallbackCompany(result.title),
        location: "USA",
        sourceType: linkedin ? "linkedin" : "cpa",
        source: "CPA public search",
        sourceUrl: linkedin || result.url,
        signal: result.title,
        summary: result.description,
        fitReason: extracted.fitReason || "CPA/tax professional may be useful as referral partner or education source for tax-aware investors.",
        accreditedLikelyReason: "CPA route is referral-focused; do not treat as investor qualification without confirmation.",
        contactMethods: [],
        evidenceTrail: [{ source: "CPA public search", url: linkedin || result.url, whatItProves: result.description || result.title }],
        score: extracted.score || 65,
        grade: extracted.grade || gradeFromScore(extracted.score || 65),
        type: "cpa",
        isPerson: true,
        isCPA: true,
        foundAt: now()
      };

      if (linkedin) addContact(lead, "linkedin", linkedin, "Brave public search");
      processSearchResultIntoLead(lead, result);
      out.push(lead);
    }

    await sleep(150);
  }

  return dedupeLeads(out);
}

function extractXml(item, tag) {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i").exec(item);
  if (cdata) return clean(cdata[1]);
  const normal = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i").exec(item);
  return clean(normal?.[1] || "");
}

async function fetchRssSeeds(limit = MAX_RSS, groqBudget) {
  const feeds = [
    "https://news.google.com/rss/search?q=doctor%20joins%20practice%20OR%20surgeon%20named%20partner%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=physician%20opened%20medical%20practice%20OR%20surgeon%20conference%20speaker%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=CPA%20tax%20planning%20business%20owner%20liquidity%20event%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=attorney%20law%20partner%20award%20business%20owner%20USA&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=CEO%20founder%20acquisition%20business%20sale%20Texas%20Colorado%20Arizona%20Florida&hl=en-US&gl=US&ceid=US:en"
  ];

  const out = [];

  for (const feed of feeds) {
    if (out.length >= limit) break;

    try {
      const response = await fetch(feed);
      if (!response.ok) continue;
      const xml = await response.text();

      for (const item of xml.split("<item>").slice(1, 26)) {
        if (out.length >= limit) break;

        const title = extractXml(item, "title");
        const link = extractXml(item, "link");
        const description = extractXml(item, "description");
        const snippet = `${title}\n${link}\n${description}`;

        const lead = await leadFromSnippet({
          idPrefix: "rss",
          sourceType: /CPA|tax|account/i.test(snippet) ? "cpa" : "rss",
          source: "Google News RSS",
          sourceUrl: link,
          snippet,
          defaultTitle: fallbackTitle(snippet),
          defaultType: /CPA|tax|account/i.test(snippet) ? "cpa" : "investor",
          baseScore: /CPA|tax|account/i.test(snippet) ? 62 : 60
        });

        if (lead) out.push(lead);
        if (GROQ_API_KEY && groqBudget.remaining <= 0) break;
      }
    } catch (error) {
      console.warn("RSS error:", error.message);
    }
  }

  return dedupeLeads(out);
}

async function fetchNpiSeeds(limit = MAX_NPI) {
  const taxonomies = ["Orthopaedic Surgery", "Anesthesiology", "Surgery", "Internal Medicine", "Family Medicine", "General Dentistry"];
  const states = ["TX", "OK", "CO", "AZ", "FL", "CA", "TN", "GA", "NC"];
  const out = [];

  for (const taxonomy of taxonomies) {
    for (const state of states) {
      if (out.length >= limit) break;

      const url = new URL("https://npiregistry.cms.hhs.gov/api/");
      url.searchParams.set("version", "2.1");
      url.searchParams.set("taxonomy_description", taxonomy);
      url.searchParams.set("state", state);
      url.searchParams.set("limit", "20");

      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const json = await response.json();

        for (const row of json.results || []) {
          const basic = row.basic || {};
          const name = clean(`${basic.first_name || basic.authorized_official_first_name || ""} ${basic.last_name || basic.authorized_official_last_name || ""}`);
          if (!fallbackIsPersonName(name)) continue;

          const address = (row.addresses || []).find(a => a.address_purpose === "LOCATION") || (row.addresses || [])[0] || {};
          const phone = clean(address.telephone_number || "");
          const location = clean([address.city, address.state].filter(Boolean).join(", "));
          const company = clean(basic.organization_name || address.organization_name || "");

          const lead = {
            id: `npi_${row.number}`,
            name,
            title: `${taxonomy} · ${basic.credential || "Provider"}`,
            company,
            location,
            sourceType: "npi",
            source: "NPI Registry",
            sourceUrl: `https://npiregistry.cms.hhs.gov/provider-view/${row.number}`,
            signal: `NPI verified provider: ${name}`,
            summary: `${name} is listed in the federal NPI Registry as ${taxonomy}.`,
            fitReason: "High-income medical provider profile; possible accredited fit must be confirmed.",
            accreditedLikelyReason: "Professional role supports screening only. Accredited status must be confirmed by the prospect.",
            contactMethods: phone ? [{ type: "phone", value: phone, source: "NPI Registry" }] : [],
            evidenceTrail: [{ source: "NPI Registry", url: `https://npiregistry.cms.hhs.gov/provider-view/${row.number}`, whatItProves: "Named healthcare provider and public registry listing." }],
            score: 44,
            grade: "D",
            type: "investor",
            isPerson: true,
            isCPA: false,
            foundAt: now()
          };

          out.push(lead);
          if (out.length >= limit) break;
        }
      } catch (error) {
        console.warn("NPI error:", error.message);
      }

      await sleep(80);
    }
  }

  return dedupeLeads(out);
}

function scoreLead(lead) {
  let score = Number(lead.score || 50);
  const evidenceCount = (lead.evidenceTrail || []).length;

  if (hasContact(lead, "email")) score += 20;
  if (hasContact(lead, "linkedin")) score += 16;
  if (hasContact(lead, "phone")) score += 3;
  if (hasContact(lead, "email") && hasContact(lead, "phone")) score += 8;
  if (hasContact(lead, "email") && hasContact(lead, "linkedin")) score += 10;
  if (evidenceCount >= 2) score += 6;
  if (lead.isCPA) score += 5;
  if (lead.sourceType === "npi" && !hasContact(lead, "email") && !hasContact(lead, "linkedin")) score -= 20;

  score = Math.max(0, Math.min(100, Math.round(score)));
  lead.score = score;
  lead.grade = gradeFromScore(score);
  lead.qualityTier = score >= 88 ? "A Lead" : score >= 72 ? "Strong Lead" : score >= 58 ? "Qualified Route" : "Low Confidence";
  return lead;
}

/**
 * Routing uses Groq-determined isPerson, isCPA, score where available.
 */
function routeLead(lead) {
  const isPerson = lead.isPerson === true || fallbackIsPersonName(lead.name);
  const isCPA = lead.isCPA === true || /cpa|tax|account/i.test([lead.title, lead.company, lead.signal, lead.summary, lead.sourceType].join(" "));
  const hasEmail = hasContact(lead, "email");
  const hasLinkedIn = hasContact(lead, "linkedin");

  const ready = Boolean(isPerson && hasEmail && lead.score >= 58);
  const linkedinVerify = Boolean(isPerson && !ready && hasLinkedIn);
  const cpaVerify = Boolean(isPerson && !ready && !linkedinVerify && isCPA && ((lead.evidenceTrail || []).length || lead.sourceUrl));

  lead.isPerson = isPerson;
  lead.isCPA = isCPA;
  lead.associateReady = ready;
  lead.linkedinVerify = linkedinVerify;
  lead.cpaVerify = cpaVerify;
  lead.skipped = Boolean(!ready && !linkedinVerify && !cpaVerify);
  lead.bucket = ready ? "ready" : linkedinVerify ? "linkedin-verify" : cpaVerify ? "cpa-verify" : "skipped";
  lead.status = ready ? "Ready to Work" : linkedinVerify ? "LinkedIn Verify" : cpaVerify ? "CPA Verify" : "Skipped / No Warm Route";
  lead.queue = lead.status;
  lead.workflowDay = ready ? 1 : 0;
  lead.priorityRank = hasEmail ? 1 : hasLinkedIn ? 2 : isCPA ? 3 : 9;
  lead.type = isCPA ? "cpa" : "investor";
  lead.sourceConfidence = [
    (lead.sourceType || "").toUpperCase(),
    hasEmail ? "EMAIL" : "",
    hasLinkedIn ? "LINKEDIN URL" : "",
    hasContact(lead, "phone") ? "PHONE" : "",
    (lead.evidenceTrail || []).length ? `${(lead.evidenceTrail || []).length} EVIDENCE` : ""
  ].filter(Boolean).join(" + ");

  if (ready) lead.bestFirstAction = "Day 1: send evidence-based email first. Phone follow-up only after reviewing the evidence trail.";
  else if (linkedinVerify) lead.bestFirstAction = "Open LinkedIn manually, verify profile, paste bio, then generate compliant sequence.";
  else if (cpaVerify) lead.bestFirstAction = "Review CPA/referral route and manually promote if useful.";
  else lead.bestFirstAction = "Skipped: no email, no LinkedIn URL, no CPA/referral path.";

  return lead;
}


async function writeFallbackOutput(error) {
  const output = {
    generatedAt: now(),
    engine: "Basin OS V3.2 fallback output",
    fatalError: clean(error && (error.stack || error.message || error)),
    compliance: {
      linkedin: "No LinkedIn page scraping. Stores possible LinkedIn profile URLs from Brave public search results only.",
      outreach: "No auto-send. Manual review required before every outreach.",
      qualification: "Accredited status is never assumed."
    },
    routingRules: {
      ready: "Named person + email + score >= 58.",
      linkedinVerify: "Named person + LinkedIn URL.",
      cpaVerify: "CPA/tax/referral candidate.",
      skipped: "No email, no LinkedIn URL, no CPA/referral path."
    },
    stats: {
      totalFound: 0,
      activeVisible: 0,
      readyToWork: 0,
      linkedinVerify: 0,
      cpaVerify: 0,
      skipped: 0,
      npiCollected: 0,
      rssCollected: 0,
      linkedinDiscoveryCollected: 0,
      cpaCollected: 0,
      emailFound: 0,
      linkedinCandidatesFound: 0,
      phoneFound: 0,
      publicSearches: 0,
      groqCalls: 0,
      braveConfigured: Boolean(BRAVE_API_KEY),
      groqConfigured: Boolean(GROQ_API_KEY),
      errors: 1
    },
    leads: [],
    linkedinVerifyCandidates: [],
    cpaVerifyCandidates: [],
    researchCandidates: [],
    skippedCandidates: [],
    allCandidates: [],
    errors: [{ source: "fatal", reason: clean(error && (error.message || error)) }]
  };

  // Do not overwrite the last good radar-leads.json with empty output if a fatal error happens.
  // Keep prior usable data visible on the website and write the failure to diagnostics.
  const existing = await readJson("data/radar-leads.json", null);
  if (!existing || !Array.isArray(existing.allCandidates)) {
    await writeJson("data/radar-leads.json", output);
    await writeJson("radar-leads.json", output);
  }
  await writeJson("data/radar-rejected.json", { generatedAt: now(), skipped: 0, errors: output.errors });
  await writeJson("radar-rejected.json", { generatedAt: now(), skipped: 0, errors: output.errors });
  await writeJson("data/radar-run-log.json", { generatedAt: now(), fatalError: output.fatalError, stats: output.stats });

  console.error("Basin Radar wrote fallback JSON after fatal error:");
  console.error(output.fatalError);
}

async function main() {
  console.log("Basin Radar starting");
  console.log(JSON.stringify({
    node: process.version,
    braveConfigured: Boolean(BRAVE_API_KEY),
    groqConfigured: Boolean(GROQ_API_KEY),
    groqModel: GROQ_MODEL,
    maxNpi: MAX_NPI,
    maxRss: MAX_RSS,
    maxLinkedinDiscovery: MAX_LINKEDIN_DISCOVERY,
    maxCpaDiscovery: MAX_CPA_DISCOVERY,
    maxPublicSearches: MAX_PUBLIC_SEARCHES,
    maxGroqCalls: MAX_GROQ_CALLS
  }, null, 2));

  const state = await readJson(STATE_PATH, { seen: {}, suppressed: {} });
  const errors = [];
  const braveBudget = { remaining: MAX_PUBLIC_SEARCHES, used: 0 };
  const groqBudget = { remaining: MAX_GROQ_CALLS, used: 0 };

  let linkedin = [];
  let cpa = [];
  let rss = [];
  let npi = [];

  try { linkedin = await fetchLinkedInDiscovery(MAX_LINKEDIN_DISCOVERY, groqBudget); }
  catch (error) { errors.push({ source: "linkedin", reason: error.message }); }

  try { cpa = await fetchCpaDiscovery(MAX_CPA_DISCOVERY, groqBudget); }
  catch (error) { errors.push({ source: "cpa", reason: error.message }); }

  try { rss = await fetchRssSeeds(MAX_RSS, groqBudget); }
  catch (error) { errors.push({ source: "rss", reason: error.message }); }

  try { npi = await fetchNpiSeeds(MAX_NPI); }
  catch (error) { errors.push({ source: "npi", reason: error.message }); }

  let all = dedupeLeads([...linkedin, ...cpa, ...rss, ...npi])
    .filter(lead => !state.suppressed?.[leadKey(lead)]);

  const enriched = [];
  let npiEnriched = 0;

  all.sort((a, b) => {
    const rank = lead => lead.sourceType === "linkedin" ? 1 : lead.sourceType === "cpa" ? 2 : lead.sourceType === "rss" ? 3 : 4;
    return rank(a) - rank(b) || Number(b.score || 0) - Number(a.score || 0);
  });

  for (const lead of all) {
    const needsEnrichment = !hasContact(lead, "email") || !hasContact(lead, "linkedin");
    if (needsEnrichment && braveBudget.remaining > 0) {
      if (lead.sourceType === "npi") {
        if (npiEnriched < 35) {
          await enrichLead(lead, braveBudget, groqBudget, "light");
          npiEnriched += 1;
        }
      } else {
        await enrichLead(lead, braveBudget, groqBudget, "standard");
      }
    }
    enriched.push(lead);
  }

  all = dedupeLeads(enriched)
    .map(scoreLead)
    .map(routeLead)
    .filter(lead => lead.isPerson)
    .sort((a, b) => (a.priorityRank || 9) - (b.priorityRank || 9) || (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name));

  const ready = all.filter(lead => lead.associateReady);
  const linkedinVerify = all.filter(lead => lead.linkedinVerify);
  const cpaVerify = all.filter(lead => lead.cpaVerify);
  const skipped = all.filter(lead => lead.skipped);
  const active = [...ready, ...linkedinVerify, ...cpaVerify];

  const output = {
    generatedAt: now(),
    engine: "Basin OS V3.2 Groq Parsed Radar Runner",
    compliance: {
      linkedin: "No LinkedIn page scraping. Stores possible LinkedIn profile URLs from Brave public search results only.",
      outreach: "No auto-send. Manual review required before every email, LinkedIn touch, SMS, or call.",
      qualification: "Accredited status is never assumed."
    },
    routingRules: {
      ready: "Named person + email + score >= 58.",
      linkedinVerify: "Named person + LinkedIn URL. User opens manually and verifies.",
      cpaVerify: "CPA/tax/referral candidate.",
      skipped: "No email, no LinkedIn URL, no CPA/referral path."
    },
    stats: {
      totalFound: all.length,
      activeVisible: active.length,
      readyToWork: ready.length,
      linkedinVerify: linkedinVerify.length,
      cpaVerify: cpaVerify.length,
      skipped: skipped.length,
      npiCollected: npi.length,
      rssCollected: rss.length,
      linkedinDiscoveryCollected: linkedin.length,
      cpaCollected: cpa.length,
      emailFound: active.filter(l => hasContact(l, "email")).length,
      linkedinCandidatesFound: active.filter(l => hasContact(l, "linkedin")).length,
      phoneFound: active.filter(l => hasContact(l, "phone")).length,
      publicSearches: braveBudget.used,
      groqCalls: groqBudget.used,
      braveConfigured: Boolean(BRAVE_API_KEY),
      groqConfigured: Boolean(GROQ_API_KEY),
      errors: errors.length
    },
    leads: ready,
    linkedinVerifyCandidates: linkedinVerify,
    cpaVerifyCandidates: cpaVerify,
    researchCandidates: [],
    skippedCandidates: skipped,
    allCandidates: active,
    errors
  };

  for (const lead of all) {
    state.seen[leadKey(lead)] = { name: lead.name, lastSeen: now(), status: lead.status, score: lead.score };
  }

  // Preserve existing JSON output locations used by the frontend.
  await writeJson("data/radar-leads.json", output);
  await writeJson("radar-leads.json", output);
  await writeJson("data/radar-research-candidates.json", { generatedAt: now(), candidates: [] });
  await writeJson("radar-research-candidates.json", { generatedAt: now(), candidates: [] });
  await writeJson("data/radar-rejected.json", { generatedAt: now(), skipped: skipped.length, errors });
  await writeJson("radar-rejected.json", { generatedAt: now(), skipped: skipped.length, errors });
  await writeJson("data/radar-run-log.json", {
    generatedAt: now(),
    stats: output.stats,
    samples: {
      ready: ready.slice(0, 10).map(l => ({ name: l.name, score: l.score, contacts: l.contactMethods.map(c => c.type), status: l.status })),
      linkedinVerify: linkedinVerify.slice(0, 10).map(l => ({ name: l.name, score: l.score, contacts: l.contactMethods.map(c => c.type), status: l.status })),
      cpaVerify: cpaVerify.slice(0, 10).map(l => ({ name: l.name, score: l.score, contacts: l.contactMethods.map(c => c.type), status: l.status }))
    }
  });
  await writeJson(STATE_PATH, state);

  console.log(JSON.stringify(output.stats, null, 2));
}

main().catch(async error => {
  try {
    await writeFallbackOutput(error);
    // Do not fail the whole workflow after fallback JSON is written.
    // The UI will show the fatal error in radar-run-log/radar-leads.json.
    process.exit(0);
  } catch (fallbackError) {
    console.error("Fallback writer also failed:", fallbackError);
    console.error("Original error:", error);
    process.exit(1);
  }
});
