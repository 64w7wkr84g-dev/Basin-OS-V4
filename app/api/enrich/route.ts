import { NextResponse } from "next/server";

const BRAVE_API_KEY = process.env.BRAVE_API_KEY || "";

function clean(value: unknown) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function extractEmail(text: string) {
  const match = clean(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!match) return "";
  const email = match[0].replace(/[),.;]+$/, "");
  return /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(email) ? "" : email;
}

function extractPhone(text: string) {
  const match = clean(text).match(/(?:\+1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  return match ? match[0] : "";
}

function extractLinkedInUrl(text: string) {
  const value = clean(text);
  const full = value.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9%_.\-]+\/?/i);
  if (full) return full[0];
  const partial = value.match(/(?:www\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9%_.\-]+\/?/i);
  return partial ? `https://${partial[0].replace(/^https?:\/\//i, "")}` : "";
}

function extractDomain(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host || /google|linkedin|facebook|twitter|x\.com|instagram|youtube|bloomberg|reuters|yahoo|bing|news/i.test(host)) return "";
    return host;
  } catch { return ""; }
}

function addContact(lead: any, type: string, value: string, source: string) {
  const v = clean(value);
  if (!v) return;
  lead.contactMethods ||= [];
  if (!lead.contactMethods.some((c: any) => c.type === type && c.value === v)) lead.contactMethods.push({ type, value: v, source });
}

function addEvidence(lead: any, source: string, url: string, whatItProves: string) {
  lead.evidenceTrail ||= [];
  const u = clean(url);
  const proof = clean(whatItProves);
  if (!u && !proof) return;
  if (!lead.evidenceTrail.some((e: any) => `${e.source}|${e.url}|${e.whatItProves}` === `${source}|${u}|${proof}`)) {
    lead.evidenceTrail.push({ source, url: u, whatItProves: proof, capturedAt: new Date().toISOString() });
  }
}

function hasVerifiedEmail(lead: any) {
  return (lead.contactMethods || []).some((c: any) => c.type === "email" && /@/.test(c.value || ""));
}
function hasPhone(lead: any) {
  return (lead.contactMethods || []).some((c: any) => c.type === "phone" || /\d{3}.*\d{3}.*\d{4}/.test(c.value || ""));
}
function hasDirectLinkedIn(lead: any) {
  return (lead.contactMethods || []).some((c: any) => c.type === "linkedin" && /linkedin\.com\/(in|pub)\//i.test(c.value || ""));
}
function hasLinkedInSearch(lead: any) {
  return (lead.contactMethods || []).some((c: any) => c.type === "linkedin_search" || /linkedin\.com\/search\/results\/people/i.test(c.value || ""));
}
function buildLinkedInSearchUrl(lead: any) {
  const parts = [lead.name, lead.company, lead.title, lead.location].map(clean).filter(Boolean);
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(parts.join(" "))}`;
}
function addLinkedInSearchRoute(lead: any) {
  if (hasDirectLinkedIn(lead) || hasLinkedInSearch(lead)) return;
  const url = buildLinkedInSearchUrl(lead);
  addContact(lead, "linkedin_search", url, "Generated LinkedIn people-search route");
  addEvidence(lead, "LinkedIn Search Route", url, "Manual profile verification route generated from known lead identity.");
  lead.linkedinSearchUrl = url;
  lead.hasLinkedInSearchRoute = true;
}
function addPossibleEmails(lead: any, domain: string) {
  if (!domain || !lead.name || hasVerifiedEmail(lead)) return;
  const parts = clean(lead.name).toLowerCase().replace(/[^a-z\s-]/g, "").split(/\s+/).filter(Boolean);
  if (parts.length < 2) return;
  const first = parts[0], last = parts[parts.length - 1];
  const guesses = [`${first}.${last}@${domain}`, `${first}@${domain}`, `${first[0]}${last}@${domain}`];
  lead.possibleEmails ||= [];
  for (const guess of guesses) {
    if (!lead.possibleEmails.includes(guess)) lead.possibleEmails.push(guess);
    addContact(lead, "possible_email", guess, "Possible email pattern, not verified");
  }
}
async function braveSearch(query: string, count = 8) {
  if (!BRAVE_API_KEY) return [];
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("country", "US");
  url.searchParams.set("search_lang", "en");
  const response = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": BRAVE_API_KEY }, cache: "no-store" });
  if (!response.ok) throw new Error(`Brave ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const json = await response.json();
  return json.web?.results || [];
}
async function fetchPageText(url: string) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 BasinOS/4.3.5", Accept: "text/html, text/plain;q=0.9,*/*;q=0.8" }, cache: "no-store" });
    clearTimeout(timer);
    if (!response.ok) return "";
    const type = response.headers.get("content-type") || "";
    if (!/text|html|json/i.test(type)) return "";
    return clean((await response.text()).slice(0, 85000));
  } catch { return ""; }
}
async function enrichWebsite(lead: any, domain: string) {
  if (!domain) return;
  addContact(lead, "company_website", `https://${domain}`, "Public website");
  addPossibleEmails(lead, domain);
  const paths = ["/", "/contact", "/about", "/team", "/our-team", "/providers", "/physicians", "/attorneys", "/leadership", "/people"];
  let checked = 0;
  for (const p of paths) {
    if (checked >= 4 || (hasVerifiedEmail(lead) && hasPhone(lead))) break;
    checked++;
    const url = `https://${domain}${p}`;
    const text = await fetchPageText(url);
    if (!text) continue;
    const email = extractEmail(text);
    const phone = extractPhone(text);
    if (email) addContact(lead, "email", email, `Public website ${p}`);
    if (phone) addContact(lead, "phone", phone, `Public website ${p}`);
    if (email || phone) addEvidence(lead, `Website ${p}`, url, "Public contact route found on company/practice site.");
  }
}
function gradeFromScore(score: number) {
  if (score >= 88) return "A";
  if (score >= 72) return "B";
  if (score >= 58) return "C";
  return "D";
}
function routeLead(lead: any) {
  const score = Math.max(0, Math.min(100, Number(lead.score || 50)));
  const email = hasVerifiedEmail(lead);
  const phone = hasPhone(lead);
  const directLinkedIn = hasDirectLinkedIn(lead) || lead.linkedinVerified === true;
  const searchOnly = hasLinkedInSearch(lead) && !directLinkedIn;
  const evidenceCount = (lead.evidenceTrail || []).length;
  const isPerson = Boolean(lead.name && String(lead.name).includes(" "));
  const ready = Boolean(isPerson && evidenceCount >= 1 && score >= 58 && (email || directLinkedIn));
  const channel = ready && lead.isCPA && email ? "CPA Referral" : ready && email && phone ? "Phone + Email" : ready && email ? "Email First" : ready && directLinkedIn ? "LinkedIn First" : "";
  lead.score = score;
  lead.grade = gradeFromScore(score);
  lead.readyForAssociate = ready;
  lead.associateReady = ready;
  lead.readyChannel = channel;
  lead.linkedinVerify = Boolean(!ready && (directLinkedIn || searchOnly));
  lead.cpaVerify = Boolean(!ready && !lead.linkedinVerify && lead.isCPA);
  lead.needsResearch = Boolean(!ready && !lead.linkedinVerify && !lead.cpaVerify);
  lead.skipped = false;
  lead.bucket = ready ? "readyForAssociate" : lead.linkedinVerify ? "linkedinVerify" : lead.cpaVerify ? "cpaVerify" : "research";
  lead.status = ready ? `Ready for Associate — ${channel}` : lead.linkedinVerify ? (directLinkedIn ? "LinkedIn Verify — Profile Found" : "LinkedIn Verify — Search Route") : lead.cpaVerify ? "CPA Verify" : "Research / Enrich";
  lead.workflowDay = ready ? (lead.workflowDay || 1) : 0;
  lead.tags = Array.from(new Set([...(lead.tags || []), ready ? "Ready for Associate" : "", channel ? `Ready — ${channel}` : "", lead.linkedinVerify ? "LinkedIn Verify" : "", directLinkedIn ? "LinkedIn Profile Found" : "", searchOnly ? "LinkedIn Search Route" : "", email ? "Email" : "", phone ? "Phone" : "", `${lead.grade} Grade`].filter(Boolean)));
  lead.bestFirstAction = ready ? `Ready for Associate: start with ${channel}. Review evidence and do not auto-send.` : lead.linkedinVerify ? "LinkedIn Verify: open route, confirm correct profile, paste bio/contact context, then promote to Ready for Associate." : "Research / Enrich: add verified email or direct LinkedIn profile to promote.";
  return lead;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const lead = body.lead || {};
    if (!lead.name) return NextResponse.json({ error: "Lead name is required." }, { status: 400 });
    const queries = [
      `"${lead.name}" "${lead.company || lead.title || ""}" email`,
      `"${lead.name}" "${lead.company || lead.title || ""}" phone`,
      `"${lead.name}" "${lead.company || lead.title || ""}" LinkedIn`,
      `"${lead.name}" "${lead.title || ""}" "${lead.location || ""}" LinkedIn`,
      `"${lead.name}" "${lead.company || ""}" contact`,
      `"${lead.name}" "${lead.company || ""}" bio`,
      `"${lead.name}" "${lead.company || ""}" practice`
    ].filter((q, i, arr) => q.replace(/\s+/g, " ").trim().length > 8 && arr.indexOf(q) === i);
    const domains = new Set<string>();
    const errors: string[] = [];
    for (const query of queries.slice(0, 7)) {
      try {
        const results = await braveSearch(query, 8);
        for (const result of results) {
          const text = `${result.title || ""} ${result.url || ""} ${result.description || ""}`;
          const email = extractEmail(text);
          const phone = extractPhone(text);
          const linkedin = extractLinkedInUrl(text);
          const domain = extractDomain(result.url || "");
          if (email) addContact(lead, "email", email, "One-click Brave enrichment");
          if (phone) addContact(lead, "phone", phone, "One-click Brave enrichment");
          if (linkedin) addContact(lead, "linkedin", linkedin, "One-click Brave enrichment");
          if (domain) {
            domains.add(domain);
            addContact(lead, "company_website", `https://${domain}`, "One-click Brave enrichment");
            addPossibleEmails(lead, domain);
          }
          addEvidence(lead, result.title || "Brave enrichment", linkedin || result.url || "", result.description || `Result for ${query}`);
        }
      } catch (error: any) {
        errors.push(error?.message || String(error));
      }
    }
    for (const domain of Array.from(domains).slice(0, 2)) await enrichWebsite(lead, domain);
    if (!hasDirectLinkedIn(lead) && !hasLinkedInSearch(lead)) addLinkedInSearchRoute(lead);
    const enriched = routeLead(lead);
    return NextResponse.json({ lead: enriched, errors });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Enrichment failed." }, { status: 500 });
  }
}
