"use client";

import * as React from "react";
import {
  Activity, BarChart3, BookOpen, BriefcaseBusiness, CalendarDays, ClipboardList, Database,
  Download, ExternalLink, FileText, Gauge, Mail, MessageSquareText, Phone, Radar,
  RefreshCcw, Search, Settings, ShieldCheck, Target, Trash2, UserRound, UsersRound,
  WandSparkles
} from "lucide-react";
import type { Handoff, Lead, LeadNote, PageKey, RadarFile } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { contacts, copyText, downloadJson, evidence, fmt, gradeColor, hasEmail, hasLinkedIn, hasPhone, leadStatus, prioritySort, statusColor } from "@/lib/utils";

type Store = {
  localLeads: Lead[];
  notes: LeadNote[];
  handoffs: Handoff[];
  suppressed: string[];
  followUps: LeadNote[];
};

const STORE_KEY = "basin_os_v4_1_store";
const RAW_RADAR_URL = "https://raw.githubusercontent.com/64w7wkr84g-dev/Basin-OS-V4/main/public/data/radar-leads.json";
const LOCAL_RADAR_URL = "/data/radar-leads.json";

const pages: Array<{ key: PageKey; label: string; icon: React.ElementType; group: string }> = [
  { key: "dashboard", label: "Dashboard", icon: Gauge, group: "Overview" },
  { key: "lead-radar", label: "Lead Radar", icon: Radar, group: "Find Leads" },
  { key: "leads", label: "Leads Workflow", icon: UsersRound, group: "Find Leads" },
  { key: "linkedin-builder", label: "LinkedIn Builder", icon: BriefcaseBusiness, group: "Find Leads" },
  { key: "rss-monitor", label: "RSS Signal Monitor", icon: Database, group: "Find Leads" },
  { key: "investor-profiler", label: "Investor Profiler", icon: Target, group: "Profile + Score" },
  { key: "cpa-profiler", label: "CPA Profiler", icon: UserRound, group: "Profile + Score" },
  { key: "sequence-builder", label: "7-Channel Sequence", icon: Mail, group: "Execution" },
  { key: "call-coach", label: "Call Coach", icon: Phone, group: "Execution" },
  { key: "call-notes", label: "Call Notes", icon: ClipboardList, group: "Data" },
  { key: "director-handoffs", label: "Director Handoffs", icon: FileText, group: "Data" },
  { key: "follow-up", label: "Follow-Up Calendar", icon: CalendarDays, group: "Data" },
  { key: "analytics", label: "Analytics", icon: BarChart3, group: "Data" },
  { key: "playbook", label: "Master Playbook", icon: BookOpen, group: "Playbook" },
  { key: "api-command-center", label: "API Command Center", icon: Activity, group: "System" },
  { key: "settings", label: "Settings", icon: Settings, group: "System" }
];

const sourceFilters = [
  ["all", "All Active"],
  ["ready", "Ready for Associate"],
  ["linkedinVerify", "LinkedIn Verify"],
  ["linkedinVerified", "LinkedIn Verified"],
  ["cpa", "CPA"],
  ["cpaVerify", "CPA Verify"],
  ["rss", "RSS/Public"],
  ["npi", "NPI/MPI"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["research", "Research / Enrich"],
  ["A", "A Grade"],
  ["B", "B Grade"],
  ["C", "C Grade"]
] as const;

const METHOD_B = {
  title: "Method B — Basin Educational Intro System",
  when: "Use for all outreach. Choose the version by lead route: aged 90+ day reactivation, new inbound, or Basin OS generated lead.",
  email: `Subject: Quick educational intro from Basin Ventures

Hi [Name],

We have not spoken before, so I will keep this short.

I am with Basin Ventures in Southlake. We work with accredited investors who want to understand direct energy ownership and tax-advantaged structures. This is educational only and would need to be reviewed with your CPA or advisor.

Would you be open to a short overview, or should I close the loop?

Best,
James`,
  phone: `Hi [Name], this is James with Basin Ventures in Southlake. We have not spoken before, so I will be brief.

Basin works with accredited investors who want to understand direct energy ownership and the related tax-advantaged structure. I am not calling with a guarantee or asking you to make a decision today.

The only question is whether a short educational director call would be worth your time. Should I send a brief overview, or is this not relevant?`,
  linkedin: `Hi [Name] — I am with Basin Ventures in Southlake. We share educational material for accredited investors around direct energy ownership and tax-advantaged structures. Would a short overview be relevant, or should I close the loop?`
};

// Keep old references alive, but Master Playbook no longer renders Method A.
const METHOD_A = METHOD_B;

const METHOD_B_PLAYBOOK = [
  {
    segment: "Aged 90+ Days / Older Inbound Reactivation",
    when: "Use for older Basin/HubSpot/reactivation leads that are 90+ days old or previously raised a hand but never connected.",
    email1: `Subject: Closing the loop from Basin Ventures

Hi [Name],

I am reaching back out from Basin Ventures in Southlake. You had previously come through our system around direct energy ownership, and I wanted to close the loop the right way.

A lot can change in 90 days. If tax planning, portfolio diversification, or direct oil and gas ownership is no longer relevant, no problem. If it is still worth understanding, the next step would only be a short educational director call.

This is not tax advice, not a recommendation, and there are no guaranteed returns. Your CPA or advisor would need to confirm whether anything fits.

Should I send a short overview, or should I mark this as no longer relevant?

Best,
James`,
    email2: `Subject: Still worth reviewing?

Hi [Name],

Quick follow-up. I do not want to keep chasing you if this is no longer relevant.

Basin Ventures works with accredited investors who want to understand direct, tax-advantaged energy ownership. The director call is strictly educational so you can decide whether it is even worth reviewing with your CPA.

Is this still worth a short look, or should I close the file?

Best,
James`,
    linkedin1: `Hi [Name] — James with Basin Ventures in Southlake. You had previously come through our system around direct energy ownership. I wanted to reconnect and see if a short educational overview is still relevant, or if I should close the loop.`,
    linkedin2: `Hi [Name] — circling back once. If direct energy ownership and tax-advantaged structures are no longer relevant, no problem. If you want the short educational overview, I can point you in the right direction.`,
    phone1: `Hi [Name], this is James with Basin Ventures in Southlake. I know I may be catching you out of the blue.

You had previously come through our system around direct energy ownership, and I wanted to close the loop. A lot can change in 90 days, so I am not assuming anything.

The only reason for the call is to see whether a short educational director call is still worth your time. This is not tax advice, and there are no guaranteed returns.

Should I send a brief overview, or should I mark this as no longer relevant?`,
    voicemail: `Hi [Name], this is James with Basin Ventures in Southlake. I was closing the loop from your prior inquiry around direct energy ownership. I am not calling to force anything. If it is still worth understanding, I can send a short overview or schedule a brief educational director call. My number is [Your Number].`,
    sms: `[Name], James with Basin Ventures. I was closing the loop from your prior inquiry around direct energy ownership. Should I send a short educational overview or mark this no longer relevant?`
  },
  {
    segment: "New Incoming Lead / Fresh Inquiry",
    when: "Use when the lead recently came in, requested info, downloaded a guide, attended an event, or was introduced recently.",
    email1: `Subject: Basin Ventures overview

Hi [Name],

Thanks for taking a look at Basin Ventures.

The cleanest next step is usually a short educational director call. The goal is to explain how direct non-operated working interest ownership works, what the tax structure can look like, and what risks need to be considered.

This is not tax advice and not a guaranteed-return product. If anything moves forward, your CPA or advisor should be part of the review.

Would this week or next week be better for a short director call?

Best,
James`,
    email2: `Subject: Best next step

Hi [Name],

The reason I am suggesting a director call instead of sending a pile of material is that the structure needs context: direct ownership, risk, tax treatment, timing, and whether it is even suitable.

If it is not relevant, no problem. If it is worth understanding, we can keep it to a short educational conversation.

Would you prefer a quick overview by email first, or should I get you directly to a director?

Best,
James`,
    linkedin1: `Hi [Name] — James with Basin Ventures. Since you recently came through our system, I wanted to connect here as well. The next step is usually a short educational overview of direct energy ownership. Worth a quick look?`,
    linkedin2: `Hi [Name] — quick follow-up. I can send a short overview first or help set up a brief director call so you can understand the structure and decide if it is relevant.`,
    phone1: `Hi [Name], this is James with Basin Ventures in Southlake. I am following up because you recently came through our system.

The purpose is simple: Basin works with accredited investors who want to understand direct energy ownership and the possible tax-advantaged structure. This is educational only, not tax advice, and there are no guaranteed returns.

Would a short director call this week or next week make sense?`,
    voicemail: `Hi [Name], James with Basin Ventures in Southlake. I am following up from your recent interest. The next step would only be a short educational director call about direct energy ownership. My number is [Your Number].`,
    sms: `[Name], James with Basin Ventures. Following up from your recent interest. Would a short educational overview be useful, or should I close the loop?`
  },
  {
    segment: "Basin OS Generated / Public Signal Lead",
    when: "Use when Basin OS found the lead through RSS, public news, NPI/MPI, CPA directories, LinkedIn route, business event, award, practice growth, or other public signal.",
    email1: `Subject: Relevant because of [Signal]

Hi [Name],

I came across [Signal] and, based on your background as [Role], thought a short educational intro may be relevant.

Basin Ventures works with accredited investors on direct energy ownership. Some investors review these structures for tax planning and diversification, but nothing should be evaluated without a CPA or advisor.

This is not tax advice, not a recommendation, and there are no guaranteed returns. The only goal would be a short director call so you can understand the structure and decide whether it is worth reviewing.

Would a brief overview be useful, or should I close the loop?

Best,
James`,
    email2: `Subject: Quick follow-up on [Signal]

Hi [Name],

I reached out because [Signal] made your profile look potentially relevant for a direct energy ownership conversation.

I do not want to assume fit. The purpose would only be to understand the structure, risks, tax considerations, and whether it is even worth discussing with your CPA or advisor.

Should I send a short overview, or is this not relevant?

Best,
James`,
    linkedin1: `Hi [Name] — I came across [Signal] and thought your background as [Role] may make a short educational Basin Ventures overview relevant. No pressure and no assumptions of fit. Worth a quick look?`,
    linkedin2: `Hi [Name] — circling back once. The conversation would only be educational: direct energy ownership, risk profile, tax structure, and whether it is worth reviewing with your CPA. Should I send a brief overview?`,
    phone1: `Hi [Name], this is James with Basin Ventures in Southlake. I know this is out of the blue. I came across [Signal], and based on your background as [Role], I thought a short intro may be relevant. Do you have 30 seconds?

Basin works with accredited investors on direct, tax-advantaged oil and gas ownership. I am not calling to force a decision. The only goal is a short director call so you can understand the structure and decide whether it is even worth reviewing.

Would this week or next week be better?`,
    voicemail: `Hi [Name], James with Basin Ventures in Southlake. I came across [Signal] and thought a short educational overview might be relevant given your background. No pressure. My number is [Your Number].`,
    sms: `[Name], James with Basin Ventures. I came across [Signal] and thought a short educational overview might be relevant. Should I send details or close the loop?`
  },
  {
    segment: "CPA / Tax Advisor Referral Route",
    when: "Use for CPAs, tax advisors, accounting firm partners, and professional referral sources. This is not the same as investor outreach.",
    email1: `Subject: Educational resource for clients reviewing direct energy ownership

Hi [Name],

I am with Basin Ventures in Southlake. We work with accredited investors who want to understand direct non-operated working interest ownership, including the risk profile and tax treatment that their CPA or advisor would need to evaluate.

I am reaching out because your background in tax/advisory work may make this useful as an educational reference for the right client situation.

This is not tax advice, and we never want a client moving forward without their advisor involved.

Would it be useful to send a short CPA-facing overview?

Best,
James`,
    email2: `Subject: CPA-facing overview

Hi [Name],

Quick follow-up. I am not asking you to endorse anything.

The goal is simply to provide an educational overview of how Basin structures direct energy ownership opportunities, what questions advisors typically ask, and where risk/tax review belongs.

Would you like the CPA-facing overview, or should I close the loop?

Best,
James`,
    linkedin1: `Hi [Name] — James with Basin Ventures. We work with accredited investors reviewing direct energy ownership. Since you are in the tax/advisory world, I wanted to see if a CPA-facing educational overview would be useful.`,
    linkedin2: `Hi [Name] — quick follow-up. Not asking for endorsement. I can send a short CPA-facing overview explaining structure, risk, and where advisor review fits.`,
    phone1: `Hi [Name], this is James with Basin Ventures in Southlake. I know we have not spoken before.

The reason I reached out is that Basin works with accredited investors reviewing direct energy ownership, and CPAs are often involved before anything moves forward.

I am not asking you to endorse anything. I simply wanted to see whether a CPA-facing educational overview would be useful for the right client situation.

Should I send that over, or is this not relevant?`,
    voicemail: `Hi [Name], James with Basin Ventures. I wanted to see whether a CPA-facing educational overview on direct energy ownership would be useful. This is not a request for endorsement. My number is [Your Number].`,
    sms: `[Name], James with Basin Ventures. Would a CPA-facing overview on direct energy ownership and advisor review be useful, or should I close the loop?`
  }
];

const CADENCE = [
  {
    day: 1,
    title: "Research-Based Intro Call",
    trigger: "Strong public signal, A-score lead, or clear business context.",
    prior: "Review evidence trail, send/queue evidence-based email or LinkedIn touch, and confirm phone source is appropriate.",
    next: "Day 3 LinkedIn touch or Day 4 credibility-angle call.",
    script: METHOD_A.phone
  },
  {
    day: 2,
    title: "Second Attempt — Signal Reminder",
    trigger: "First normal phone attempt after Day 1 email/LinkedIn.",
    prior: "Evidence-based email or LinkedIn touch should normally happen before calling.",
    next: "Advance to next scheduled channel step unless they answer, object, book, or request removal.",
    script: `Hi [Name], James with Basin Ventures. I reached out because of [Signal], and I wanted to try you once more.

The reason I thought it might fit is that high-income professionals and business owners often want to understand tax-advantaged direct energy ownership, especially when income or liquidity events are in play. Your CPA would need to confirm fit.

Should I send a brief overview or just get you directly to a 20-minute director call?`
  },
  {
    day: 4,
    title: "Credibility Angle",
    trigger: "Second call/research follow-up. Shift from signal to credibility and fit.",
    prior: "Evidence-based email or LinkedIn touch should normally happen before calling.",
    next: "Advance to next scheduled channel step unless they answer, object, book, or request removal.",
    script: `Hi [Name], James from Basin Ventures. I know we have not spoken before. Basin has managed over $1.25B since 2014, and we focus on direct energy opportunities for accredited investors.

Given [Signal], I thought it was worth making one clean introduction. If it is irrelevant, no problem. If it is worth understanding, I can schedule a short director call.

Does this deserve 20 minutes, or should I close the loop?`
  },
  {
    day: 6,
    title: "Final Research-Based Call",
    trigger: "Use only as final research-based call or value follow-up before close-loop.",
    prior: "Evidence-based email or LinkedIn touch should normally happen before calling.",
    next: "Advance to next scheduled channel step unless they answer, object, book, or request removal.",
    script: `Hi [Name], last attempt from James at Basin Ventures. I reached out because [Signal] made your profile look potentially relevant for a direct energy conversation.

I do not want to chase you. Should I mark this as not a fit, or would you like one short overview call before I close it out?`
  },
  {
    day: 10,
    title: "Longer-Term Permission Call",
    trigger: "Close-loop or permission-based future nurture.",
    prior: "Evidence-based email or LinkedIn touch should normally happen before calling.",
    next: "Move to future nurture or close out.",
    script: `Hi [Name], James with Basin Ventures. I am closing the loop on my outreach.

If now is not the time, I can leave you alone. If you want to be kept on the list for future fund windows or tax-planning updates, I can do that instead. What is better?`
  }
];

const REBUTTALS = [
  ["Not interested", "Totally fair. I am not asking you to make a decision. Would it be unreasonable to understand the structure first and then decide if it is irrelevant?"],
  ["Send me information", "Absolutely. I can send a short overview. To make sure I send the right version, is this more for tax planning, diversification, or general education?"],
  ["Talk to my CPA", "That is exactly what should happen. The director call is educational, and your CPA would need to confirm fit before anything moves forward."],
  ["Is this risky?", "All investments carry risk, and there are no guaranteed returns. The call is to understand the structure, risk profile, and whether it is even worth reviewing."],
  ["What is the minimum?", "The typical minimum can vary by fund window. The director can explain structure, risk, and suitability. Nothing should move forward unless it makes sense after review."],
  ["I am too busy", "I understand. That is why the first step is short. Would it be easier if I sent a brief overview and then you can decide whether a director call is worth it?"],
  ["Where did you get my information?", "I came across public professional/business information and wanted to make a clean educational introduction. If you prefer not to be contacted, I can mark that immediately."],
  ["Is this a tax shelter?", "No. I would not frame it that way. The correct way to look at it is direct energy ownership with tax treatment that your CPA would need to review. The director can explain the structure and risks."],
  ["Are returns guaranteed?", "No. There are no guaranteed returns. The purpose of the director call is to understand the structure, risks, economics, and whether it is even suitable to review further."],
  ["I do not invest in oil and gas", "That may be the right answer. The only reason to take the call would be to understand how Basin structures direct ownership and then decide if it is irrelevant."],
  ["I already have a financial advisor", "That is good. Your advisor should be involved before anything moves forward. The director call is simply educational so you know whether there is even something to discuss with them."],
  ["I do not want another sales pitch", "Completely fair. I am not trying to force a decision. The ask is only whether a short educational overview is worth your time. If not, I will close the loop."],
  ["How much can I write off?", "That depends on structure, timing, and your tax situation. I cannot give tax advice. The director can explain the general structure, and your CPA would need to confirm anything specific."],
  ["I need guaranteed income", "Then this may not be a fit. Direct energy ownership carries risk and does not guarantee income. If you still want to understand the structure, we can keep it educational."],
  ["I have had a bad oil and gas experience", "That is exactly why the first call should be educational. You can compare structure, risk controls, operator selection, and decide whether Basin is even worth reviewing."],
  ["Call me next quarter", "No problem. I can set a follow-up for next quarter. Before I do, is there anything specific I should send so the next conversation is useful?"],
  ["Remove me", "Understood. I will mark you as do-not-contact. You will not hear from me again on this."],
  ["I am not accredited", "Understood. Then this likely is not appropriate. I can mark the file accordingly."],
  ["How did you know this could fit me?", "I do not know that it fits. I only saw a public professional/business context that made an educational intro potentially relevant. Fit has to be confirmed later, especially with your CPA/advisor."],
  ["Why Basin?", "Basin focuses on direct energy ownership and has a director-led education process. The point of the call is to understand structure, risks, and whether it deserves further review."]
];

const DISPOSITIONS = [
  "New / Not Worked",
  "Attempted - No Answer",
  "Left Voicemail",
  "Email Sent",
  "LinkedIn Message Sent",
  "Connected - Interested",
  "Connected - Not Interested",
  "Requested Info",
  "Follow Up - Tomorrow",
  "Follow Up - This Week",
  "Follow Up - Next Week",
  "Follow Up - In One Month",
  "Follow Up - Next Quarter",
  "Booked Director Call",
  "No Show",
  "Rescheduled",
  "Bad Number",
  "Wrong Person",
  "No Valid Contact Route",
  "Already a Client",
  "Do Not Call",
  "Do Not Email",
  "Do Not Contact",
  "Not Accredited / Not Qualified",
  "Not a Fit",
  "Future Nurture",
  "Closed / Suppressed"
];

const DAY_REQUIREMENTS: Record<number, string[]> = {
  1: ["Review source/evidence trail", "Send or queue Day 1 email/LinkedIn touch", "Log result note", "Select disposition"],
  2: ["Review previous touch", "Complete second attempt or reminder", "Log result note", "Select disposition"],
  3: ["Complete LinkedIn touch when available", "Log result note", "Select disposition"],
  4: ["Complete credibility-angle call/touch", "Log result note", "Select disposition"],
  5: ["Review follow-up status", "Send nurture/value touch if appropriate", "Log result note", "Select disposition"],
  6: ["Complete final research-based call", "Log result note", "Select disposition"],
  7: ["Review response/no-response status", "Set next action", "Log result note", "Select disposition"],
  8: ["Send final value/nurture touch if appropriate", "Log result note", "Select disposition"],
  9: ["Prepare close-loop or future nurture", "Log result note", "Select disposition"],
  10: ["Complete longer-term permission call/touch", "Move to nurture/closed/booked", "Log result note", "Select disposition"]
};


function initialStore(): Store {
  return { localLeads: [], notes: [], handoffs: [], suppressed: [], followUps: [] };
}

function normalizeLead(lead: Lead): Lead {
  const bucket = lead.bucket;
  const ready = Boolean(lead.associateReady || bucket === "ready");
  const linkedin = Boolean(lead.linkedinVerify || bucket === "linkedinVerify");
  const cpa = Boolean(lead.cpaVerify || lead.isCPA || bucket === "cpaVerify");
  return {
    ...lead,
    name: lead.name || "Unnamed Candidate",
    company: lead.company || "",
    title: lead.title || "Professional",
    contactMethods: lead.contactMethods || [],
    evidenceTrail: lead.evidenceTrail || [],
    associateReady: ready,
    linkedinVerify: !ready && linkedin,
    cpaVerify: !ready && !linkedin && cpa,
    skipped: Boolean(!ready && !linkedin && !cpa),
    bucket: ready ? "ready" : linkedin ? "linkedinVerify" : cpa ? "cpaVerify" : lead.bucket || "skipped",
    workflowDay: lead.workflowDay || (ready ? 1 : 0)
  };
}

function createDefaultRadar(): RadarFile {
  return {
    generatedAt: null,
    engine: "Basin OS V4.1 browser fallback",
    compliance: {},
    routingRules: {},
    stats: {
      totalFound: 0, activeVisible: 0, readyToWork: 0, linkedinVerify: 0, cpaVerify: 0, skipped: 0,
      npiCollected: 0, rssCollected: 0, linkedinDiscoveryCollected: 0, cpaCollected: 0,
      emailFound: 0, linkedinCandidatesFound: 0, phoneFound: 0, publicSearches: 0, groqCalls: 0,
      groqFailures: 0, braveFailures: 0, braveConfigured: false, groqConfigured: false, errors: 0
    },
    leads: [], linkedinVerifyCandidates: [], cpaVerifyCandidates: [], researchCandidates: [], skippedCandidates: [], allCandidates: [], errors: []
  };
}

function interpolate(template: string, lead?: Lead) {
  return template
    .replaceAll("[Name]", lead?.name || "there")
    .replaceAll("[Signal]", lead?.signal || lead?.summary || "your professional background")
    .replaceAll("[Role]", lead?.title || "your role")
    .replaceAll("[Signal/Role]", lead?.signal || lead?.title || "your background");
}

function getAllFromRadar(radar: RadarFile) {
  const map = new Map<string, Lead>();
  for (const lead of [
    ...(radar.leads || []),
    ...(radar.linkedinVerifyCandidates || []),
    ...(radar.cpaVerifyCandidates || []),
    ...(radar.researchCandidates || []),
    ...(radar.allCandidates || [])
  ]) {
    if (lead?.id) map.set(lead.id, normalizeLead(lead));
  }
  return Array.from(map.values()).sort(prioritySort);
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent>
        <div className="font-mono text-3xl font-black text-basin-gold2">{value}</div>
        <div className="mt-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-basin-muted">{label}</div>
        {hint ? <div className="mt-1 text-xs text-basin-muted2">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export function BasinOSApp({ radarData, initialPage = "dashboard" }: { radarData: RadarFile; initialPage?: PageKey }) {
  const [page, setPage] = React.useState<PageKey>(initialPage);
  const [radar, setRadar] = React.useState<RadarFile>(radarData || createDefaultRadar());
  const [store, setStore] = React.useState<Store>(initialStore());
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [toast, setToast] = React.useState("");
  const [morningBrief, setMorningBrief] = React.useState("");

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setStore({ ...initialStore(), ...JSON.parse(raw) });
    } catch {}
  }, []);

  React.useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }, [store]);

  const radarLeads = React.useMemo(() => getAllFromRadar(radar), [radar]);
  const leads = React.useMemo(() => {
    const map = new Map<string, Lead>();
    for (const lead of [...radarLeads, ...store.localLeads]) map.set(lead.id, normalizeLead(lead));
    for (const id of store.suppressed) map.delete(id);
    return Array.from(map.values()).sort(prioritySort);
  }, [radarLeads, store.localLeads, store.suppressed]);

  const counts = React.useMemo(() => ({
    total: leads.length,
    ready: leads.filter((l) => l.readyForAssociate || l.associateReady || l.bucket === "readyForAssociate" || l.bucket === "ready").length,
    linkedin: leads.filter((l) => l.linkedinVerify).length,
    cpa: leads.filter((l) => l.cpaVerify || l.isCPA).length,
    research: leads.filter((l) => l.bucket === "research" || l.needsResearch).length,
    skipped: leads.filter((l) => l.skipped).length,
    rss: leads.filter((l) => /rss|news|public/i.test(`${l.sourceType} ${l.source}`)).length,
    npi: leads.filter((l) => /npi/i.test(`${l.sourceType} ${l.source}`)).length,
    email: leads.filter(hasEmail).length,
    phone: leads.filter(hasPhone).length,
    gradeA: leads.filter((l) => l.grade === "A").length
  }), [leads]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function updateLead(updated: Lead) {
    setStore((current) => {
      const local = current.localLeads.filter((l) => l.id !== updated.id);
      return { ...current, localLeads: [...local, normalizeLead(updated)] };
    });
  }

  function suppressLead(lead: Lead) {
    setStore((current) => ({ ...current, suppressed: [...new Set([...current.suppressed, lead.id])] }));
    showToast(`${lead.name} suppressed.`);
  }

  async function reloadRadar() {
    const urls = [
      `${RAW_RADAR_URL}?v=${Date.now()}`,
      `${LOCAL_RADAR_URL}?v=${Date.now()}`
    ];

    let json: any = null;
    let lastError = "";

    for (const url of urls) {
      try {
        const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) {
          lastError = `${url} returned ${response.status}`;
          continue;
        }
        json = await response.json();
        break;
      } catch (error: any) {
        lastError = `${url} failed: ${error?.message || String(error)}`;
      }
    }

    if (!json) {
      showToast(`Radar load failed: ${lastError || "No source loaded"}`);
      return;
    }

    setRadar(json);

    const stats = json.stats || {};
    showToast(
      `Loaded ${stats.activeVisible || 0} active lead(s). Ready ${stats.readyForAssociate || 0} · LinkedIn ${stats.linkedinVerify || 0} · CPA ${stats.cpaVerify || 0} · Research ${stats.research || 0}`
    );

    if (stats.firstBraveError || stats.firstGroqError) {
      console.warn("Basin Radar API diagnostics", {
        firstBraveError: stats.firstBraveError,
        firstGroqError: stats.firstGroqError,
        firstRssError: stats.firstRssError,
        firstNpiError: stats.firstNpiError
      });
    }
  }

  const filteredLeads = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return leads.filter((lead) => {
      if (q) {
        const blob = [lead.name, lead.company, lead.title, lead.signal, lead.summary, contacts(lead).map((c) => c.value).join(" ")].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (filter === "ready") return lead.readyForAssociate || lead.associateReady || lead.bucket === "readyForAssociate" || lead.bucket === "ready";
      if (filter === "linkedinVerify") return lead.linkedinVerify || lead.bucket === "linkedinVerify";
      if (filter === "linkedinVerified") return lead.linkedinVerified || ((lead.readyForAssociate || lead.associateReady) && hasLinkedIn(lead));
      if (filter === "cpa") return lead.isCPA || lead.type === "cpa" || (lead.tags || []).includes("CPA");
      if (filter === "cpaVerify") return lead.cpaVerify || lead.bucket === "cpaVerify";
      if (filter === "rss") return /rss|news|public/i.test(`${lead.sourceType} ${lead.source}`) || (lead.tags || []).includes("RSS/Public");
      if (filter === "npi") return /npi|mpi/i.test(`${lead.sourceType} ${lead.source}`) || (lead.tags || []).includes("NPI/MPI");
      if (filter === "email") return hasEmail(lead);
      if (filter === "phone") return hasPhone(lead);
      if (filter === "research") return lead.bucket === "research" || lead.needsResearch;
      if (filter === "A") return lead.grade === "A";
      if (filter === "B") return lead.grade === "B";
      if (filter === "C") return lead.grade === "C";
      return true;
    }).sort(prioritySort);
  }, [leads, search, filter]);

  const activePage = pages.find((p) => p.key === page) || pages[0];

  return (
    <div className="min-h-screen bg-basin-black text-basin-text">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="border-r border-basin-gold/20 bg-[#070c11]/95 p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-auto">
          <div className="rounded-3xl border border-basin-gold/30 bg-gradient-to-br from-basin-panel to-[#080d13] p-5 shadow-terminal">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-basin-text to-slate-300 text-3xl font-black text-[#711a25]">B</div>
              <div>
                <div className="text-2xl font-black tracking-[0.18em]">BASIN</div>
                <div className="text-[10px] font-black tracking-[0.46em] text-basin-gold">VENTURES</div>
              </div>
            </div>
            <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-basin-muted">Lead Generation + Playbook</div>
          </div>

          <nav className="mt-6 space-y-2">
            {Array.from(new Set(pages.map((p) => p.group))).map((group) => (
              <div key={group}>
                <div className="mt-4 px-2 font-mono text-[11px] uppercase tracking-[0.24em] text-basin-muted2">{group}</div>
                {pages.filter((p) => p.group === group).map((item) => {
                  const Icon = item.icon;
                  const badge =
                    item.key === "dashboard" ? counts.total :
                    item.key === "lead-radar" ? counts.total :
                    item.key === "leads" ? counts.ready :
                    item.key === "linkedin-builder" ? counts.linkedin :
                    item.key === "rss-monitor" ? counts.rss :
                    item.key === "cpa-profiler" ? counts.cpa :
                    item.key === "call-notes" ? store.notes.length :
                    item.key === "director-handoffs" ? store.handoffs.length :
                    item.key === "follow-up" ? store.followUps.length : null;
                  return (
                    <button key={item.key} onClick={() => setPage(item.key)} className={`mt-1 grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-extrabold transition ${page === item.key ? "border-basin-gold/60 bg-basin-gold/15 text-basin-gold2" : "border-transparent text-basin-text hover:border-basin-gold/30 hover:bg-white/[0.045]"}`}>
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                      {badge !== null ? <span className="rounded-full border border-basin-border bg-[#111a24] px-2 py-0.5 font-mono text-[11px] text-basin-muted">{badge}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="mt-8 rounded-2xl border border-rose-400/40 bg-rose-950/20 p-4 text-xs leading-5 text-rose-100">
            <div className="mb-1 font-black uppercase tracking-[0.16em] text-rose-200">Compliance Always</div>
            Educational only. No guaranteed returns. No tax advice. Accredited investors only. Manual review before outreach.
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-[#0c141d] p-3 text-center font-mono text-xs text-basin-muted">Basin OS V4.3.4 Routing + Playbook</div>
        </aside>

        <main className="min-w-0">
          <header className="sticky top-0 z-30 grid gap-4 border-b border-basin-gold/20 bg-basin-black/85 px-6 py-5 backdrop-blur-xl xl:grid-cols-[1fr_minmax(320px,650px)]">
            <div>
              <div className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-basin-gold">Basin Ventures Command Center</div>
              <h1 className="mt-1 text-3xl font-black tracking-tight">{activePage.label}</h1>
              <p className="mt-1 max-w-4xl text-sm text-basin-muted">Complete closed-circuit CRM: RSS/NPI/CPA/LinkedIn discovery → Brave enrichment → LinkedIn Verify or Ready for Associate → Day 1–10 workflow.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads, companies, signals, notes, contact methods..." />
              <Button variant="primary" onClick={reloadRadar}><RefreshCcw className="h-4 w-4" />Load Radar</Button>
              <Button variant="secondary" onClick={() => addManualLead()}><UserRound className="h-4 w-4" />Manual Add</Button>
            </div>
          </header>

          <section className="p-6">
            {page === "dashboard" && renderDashboard()}
            {page === "lead-radar" && renderLeadRadar()}
            {page === "leads" && renderWorkflow()}
            {page === "linkedin-builder" && renderLinkedInBuilder()}
            {page === "rss-monitor" && renderRssMonitor()}
            {page === "investor-profiler" && renderProfiler("investor")}
            {page === "cpa-profiler" && renderProfiler("cpa")}
            {page === "sequence-builder" && renderSequenceBuilder()}
            {page === "call-coach" && renderCallCoach()}
            {page === "call-notes" && renderCallNotes()}
            {page === "director-handoffs" && renderHandoffs()}
            {page === "follow-up" && renderFollowUp()}
            {page === "analytics" && renderAnalytics()}
            {page === "playbook" && renderPlaybook()}
            {page === "api-command-center" && renderApiCommand()}
            {page === "settings" && renderSettings()}
          </section>
        </main>
      </div>

      {selectedLead ? (
        <LeadModal
          lead={selectedLead}
          notes={store.notes.filter((n) => n.leadId === selectedLead.id)}
          onClose={() => setSelectedLead(null)}
          onUpdated={(lead) => { updateLead(lead); setSelectedLead(lead); }}
          onAddNote={(note) => {
            setStore((current) => ({ ...current, notes: [note, ...current.notes] }));
            showToast("Note saved.");
          }}
          onHandoff={(handoff) => {
            setStore((current) => ({ ...current, handoffs: [handoff, ...current.handoffs] }));
            showToast("Handoff saved.");
          }}
        />
      ) : null}

      {toast ? <div className="fixed bottom-5 right-5 z-50 rounded-2xl border border-basin-border bg-basin-panel px-4 py-3 text-sm shadow-terminal">{toast}</div> : null}
    </div>
  );

  function addManualLead() {
    const name = window.prompt("Lead name");
    if (!name) return;
    const email = window.prompt("Email, if available") || "";
    const linkedin = window.prompt("LinkedIn URL, if available") || "";
    const phone = window.prompt("Phone, if available") || "";
    const lead: Lead = normalizeLead({
      id: `manual_${Date.now()}`,
      name,
      title: window.prompt("Title / role") || "Manual Lead",
      company: window.prompt("Company / practice") || "",
      isPerson: true,
      isCPA: false,
      score: email ? 78 : linkedin ? 72 : phone ? 61 : 50,
      grade: email ? "B" : linkedin ? "B" : phone ? "C" : "D",
      fitReason: "Manually entered by operator.",
      source: "Manual Add",
      sourceType: "manual",
      contactMethods: [
        email ? { type: "email", value: email, source: "manual" } : null,
        linkedin ? { type: "linkedin", value: linkedin, source: "manual" } : null,
        phone ? { type: "phone", value: phone, source: "manual" } : null
      ].filter(Boolean) as any,
      evidenceTrail: [{ source: "Manual Add", whatItProves: "Operator entered record." }],
      associateReady: Boolean(email && phone),
      readyForAssociate: Boolean(email && phone),
      linkedinVerify: Boolean(!email && linkedin),
      cpaVerify: false,
      skipped: Boolean(!email && !linkedin),
      bucket: email && phone ? "readyForAssociate" : linkedin ? "linkedinVerify" : "skipped"
    });
    updateLead(lead);
    showToast("Manual lead added.");
  }

  function renderKpis() {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Total Candidates" value={fmt(counts.total)} hint="Visible active + verify lanes" />
        <Kpi label="Ready for Associate" value={fmt(counts.ready)} hint="Workable Day 1 route" />
        <Kpi label="LinkedIn Verify" value={fmt(counts.linkedin)} hint="Manual profile confirm" />
        <Kpi label="Research / Enrich" value={fmt(counts.research)} hint="Not associate-ready" />
        <Kpi label="RSS / LinkedIn / CPA" value={`${fmt(counts.rss)} / ${fmt(counts.linkedin)} / ${fmt(counts.cpa)}`} hint="Source quality mix" />
      </div>
    );
  }

  function renderFilters() {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Lead Source / Route Filters</CardTitle>
            <CardDescription>Filter across every workflow day without losing route status.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {sourceFilters.map(([key, label]) => {
              const count =
                key === "all" ? counts.total :
                key === "ready" ? counts.ready :
                key === "linkedinVerify" ? leads.filter((l) => l.linkedinVerify || l.bucket === "linkedinVerify").length :
                key === "linkedinVerified" ? leads.filter((l) => l.linkedinVerified || ((l.readyForAssociate || l.associateReady) && hasLinkedIn(l))).length :
                key === "cpa" ? counts.cpa :
                key === "cpaVerify" ? leads.filter((l) => l.cpaVerify || l.bucket === "cpaVerify").length :
                key === "rss" ? counts.rss :
                key === "npi" ? counts.npi :
                key === "email" ? counts.email :
                key === "phone" ? counts.phone :
                key === "research" ? counts.research :
                key === "A" ? counts.gradeA :
                key === "B" ? leads.filter((l) => l.grade === "B").length :
                key === "C" ? leads.filter((l) => l.grade === "C").length : 0;
              return <button key={key} onClick={() => setFilter(key)} className={`rounded-full border px-3 py-2 text-sm font-black ${filter === key ? "border-basin-gold bg-basin-gold text-black" : "border-basin-border bg-[#0d151f] text-basin-muted hover:text-basin-text"}`}>{label} {count}</button>;
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderDashboard() {
    return (
      <div className="space-y-5">
        {renderKpis()}
        {renderFilters()}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,60fr)_minmax(360px,40fr)]">
          <Card>
            <CardHeader><div><CardTitle>Top Ready / Verify Queue</CardTitle><CardDescription>Prioritized by route quality, grade, and score.</CardDescription></div></CardHeader>
            <CardContent className="space-y-3">{filteredLeads.slice(0, 12).map(renderLeadCard)}{filteredLeads.length === 0 ? empty("No leads in this view.") : null}</CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Live Radar Feed</CardTitle><CardDescription>GitHub Actions output and source distribution.</CardDescription></div></CardHeader>
            <CardContent className="space-y-2 font-mono text-xs">
              {Object.entries({
                Generated: radar.generatedAt || "Not loaded",
                Engine: radar.engine,
                Ready: radar.stats.readyToWork,
                "LinkedIn Verify": radar.stats.linkedinVerify,
                "CPA Verify": radar.stats.cpaVerify,
                Skipped: radar.stats.skipped,
                "NPI Collected": radar.stats.npiCollected,
                RSS: radar.stats.rssCollected,
                "LinkedIn Discovery": radar.stats.linkedinDiscoveryCollected,
                "Groq Calls": radar.stats.groqCalls,
                "Groq Configured": String(radar.stats.groqConfigured),
                "Brave Configured": String(radar.stats.braveConfigured)
              }).map(([k, v]) => <div key={k} className="rounded-xl border border-white/10 bg-[#0c141d] p-3"><div className="text-basin-muted">{k}</div><div className="break-words font-bold">{String(v)}</div></div>)}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  function renderLeadRadar() {
    return (
      <div className="space-y-5">
        {renderKpis()}
        {renderFilters()}
        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <Card>
            <CardHeader><div><CardTitle>Radar Controls</CardTitle><CardDescription>Runner is server-side through GitHub Actions. Browser reload only refreshes JSON.</CardDescription></div></CardHeader>
            <CardContent className="space-y-3">
              <Button variant="primary" className="w-full" onClick={reloadRadar}><RefreshCcw className="h-4 w-4" />Load Shared GitHub Radar</Button>
              <Button variant="secondary" className="w-full" onClick={() => downloadJson("basin-radar-export.json", radar)}><Download className="h-4 w-4" />Export Radar JSON</Button>
              <div className="rounded-2xl border border-basin-gold/30 bg-basin-gold/10 p-4 text-sm text-basin-muted">No auto-send. No LinkedIn page scraping. Public result URLs only. Manual review before outreach.</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Found Leads & Signals</CardTitle><CardDescription>Visible records sorted by route quality and score.</CardDescription></div></CardHeader>
            <CardContent className="space-y-3">{filteredLeads.map(renderLeadCard)}{filteredLeads.length === 0 ? empty("No radar leads loaded. Run GitHub Actions, then Load Radar.") : null}</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  function renderWorkflow() {
    const ready = filteredLeads.filter((l) => l.readyForAssociate || l.associateReady || l.bucket === "readyForAssociate" || l.bucket === "ready");
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-basin-gold/40 bg-basin-gold/10 p-4 text-sm text-basin-muted">
          <strong className="text-basin-gold2">Required execution:</strong> every ready lead keeps grade, score, contact method, qualification status, evidence trail, notes, follow-up, and handoff history. Day 1 starts with email or LinkedIn when available.
        </div>
        {renderKpis()}
        {renderFilters()}
        {[1,2,3,4,5,6,7,8,9,10].map((day) => {
          const dayLeads = ready.filter((l) => (l.workflowDay || 1) === day);
          return (
            <Card key={day}>
              <CardHeader><div><CardTitle>Day {day}</CardTitle><CardDescription>{dayLeads.length} ready lead(s). Must complete tasks, disposition, and note before advancing.</CardDescription></div></CardHeader>
              <CardContent className="space-y-3">{dayLeads.map(renderLeadCard)}{dayLeads.length === 0 ? empty(`No ready leads in Day ${day}.`) : null}</CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  function renderLinkedInBuilder() {
    const linkedin = filteredLeads.filter((l) => l.linkedinVerify || hasLinkedIn(l));
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader><div><CardTitle>LinkedIn Verify Workflow</CardTitle><CardDescription>Open the profile yourself, verify the person, paste bio, generate compliant sequence, then move to Ready.</CardDescription></div></CardHeader>
          <CardContent className="space-y-3">
            {linkedin.map(renderLeadCard)}
            {linkedin.length === 0 ? empty("No LinkedIn candidates found yet. Run radar after BRAVE_API_KEY and GROQ_API_KEY are configured.") : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderRssMonitor() {
    const rss = leads.filter((l) => /rss|news|public/i.test(`${l.sourceType} ${l.source}`));
    return (
      <Card>
        <CardHeader><div><CardTitle>RSS Signal Monitor</CardTitle><CardDescription>Google News RSS and public news signals routed into verification queues.</CardDescription></div></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi label="RSS/Public" value={rss.length} />
            <Kpi label="Ready From RSS" value={rss.filter((l) => l.associateReady).length} />
            <Kpi label="LinkedIn From RSS" value={rss.filter((l) => hasLinkedIn(l)).length} />
            <Kpi label="Email From RSS" value={rss.filter((l) => hasEmail(l)).length} />
          </div>
          {rss.map(renderLeadCard)}
          {rss.length === 0 ? empty("No RSS/public news signals loaded yet.") : null}
        </CardContent>
      </Card>
    );
  }

  function renderProfiler(kind: "investor" | "cpa") {
    const pool = filteredLeads.filter((l) => kind === "cpa" ? (l.isCPA || l.type === "cpa" || l.cpaVerify) : (!l.isCPA && l.type !== "cpa"));
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader><div><CardTitle>{kind === "cpa" ? "CPA Profiler" : "Investor Profiler"}</CardTitle><CardDescription>Score, evidence, contact route, objections, and handoff readiness.</CardDescription></div></CardHeader>
          <CardContent className="space-y-3">{pool.map(renderLeadCard)}{pool.length === 0 ? empty("No matching records.") : null}</CardContent>
        </Card>
      </div>
    );
  }

  function renderSequenceBuilder() {
    const lead = filteredLeads[0];
    const sequenceScripts = METHOD_B_PLAYBOOK.flatMap((group) => [
      [`${group.segment} — Email 1`, group.email1],
      [`${group.segment} — Email 2`, group.email2],
      [`${group.segment} — LinkedIn 1`, group.linkedin1],
      [`${group.segment} — LinkedIn 2`, group.linkedin2],
      [`${group.segment} — Phone`, group.phone1],
      [`${group.segment} — Voicemail`, group.voicemail],
      [`${group.segment} — SMS`, group.sms]
    ]);

    return (
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>7-Channel Sequence Builder</CardTitle>
              <CardDescription>Method B only. Manual send only. Pick by route: aged 90+, new incoming, Basin OS generated, or CPA referral.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">
            {sequenceScripts.map(([title, body]) => (
              <ScriptBlock key={title} title={title} body={interpolate(String(body), lead)} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Day 1 through Day 10 Phone Cadence</CardTitle>
              <CardDescription>Phone touches only after the proper email/LinkedIn/manual review step.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">
            {CADENCE.map((step) => (
              <ScriptBlock key={step.day} title={`Day ${step.day} — ${step.title}`} body={interpolate(`Trigger:\n${step.trigger}\n\nPrior Touch:\n${step.prior}\n\nNext Step:\n${step.next}\n\nScript:\n${step.script}`, lead)} />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderCallCoach() {
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Call Coach</CardTitle>
              <CardDescription>Live-call help only: openers, control phrases, compliance, objection pivots, and close paths. Full email/LinkedIn scripts are in Master Playbook.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">
            <ScriptBlock title="Opening Discipline" body={`Do not over-explain.\n\n1. State who you are.\n2. Reference the reason for the call.\n3. Ask for 30 seconds.\n4. Keep the goal educational.\n5. Move toward a director call only if there is interest.\n\nBad: I wanted to tell you all about our fund.\nGood: I wanted to see if a short educational overview is worth your time.`} />
            <ScriptBlock title="Compliance Guardrails" body={`Never say or imply:\n- guaranteed return\n- SEC registered\n- tax advice\n- accredited unless confirmed\n- no risk\n- you need this because of your income\n- this will solve your taxes\n\nAlways say:\n- educational only\n- your CPA/advisor should review\n- no guarantee\n- risk exists\n- suitability must be confirmed`} />
            <ScriptBlock title="30-Second Control Path" body={`If they answer, control the first 30 seconds:\n\n"Hi [Name], James with Basin Ventures in Southlake. I know this is out of the blue. I reached out because [Signal/Reason]. I am not calling to force a decision. The only question is whether a short educational overview is worth your time. Do you have 30 seconds?"\n\nThen stop talking.`} />
            <ScriptBlock title="Bridge to Director Call" body={`Use when they show even mild interest:\n\n"The cleanest next step is not for me to overload you. A director can explain the structure, risk profile, and where CPA review fits in about 20 minutes. Then you can decide whether it deserves a second look. Would this week or next week be better?"`} />
            <ScriptBlock title="Do Not Chase Path" body={`Use when they sound guarded:\n\n"Fair. I do not want to chase you. Would it be better if I send a short overview and you decide if a director call is worth it, or should I close the loop?"`} />
            <ScriptBlock title="CPA Safety Path" body={`Use whenever taxes come up:\n\n"Your CPA needs to confirm anything specific. I can explain the general structure and the questions CPAs usually ask, but I cannot give tax advice."`} />
            <ScriptBlock title="Risk Safety Path" body={`Use whenever risk or returns come up:\n\n"There is risk, and there are no guaranteed returns. The reason for the director call is to understand the structure, risks, economics, and whether it is even suitable to review."`} />
            <ScriptBlock title="Aged Lead Reframe" body={`"A lot can change in 90 days, so I am not assuming this is still relevant. I am simply closing the loop. Should I send a short educational overview, or mark this as no longer relevant?"`} />
            <ScriptBlock title="Basin OS Public Signal Reframe" body={`"I do not know that this fits. I only saw a public professional/business context that made an educational intro potentially relevant. Fit would have to be confirmed later."`} />
            <ScriptBlock title="CPA Referral Reframe" body={`"I am not asking you to endorse anything. The question is whether a CPA-facing educational overview would be useful for the right client situation."`} />
            {REBUTTALS.map(([objection, response]) => <ScriptBlock key={objection} title={`Objection: ${objection}`} body={response} />)}
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderCallNotes() {
    return (
      <Card>
        <CardHeader><div><CardTitle>Call Notes</CardTitle><CardDescription>Notes saved from lead cards. These stay attached to each lead.</CardDescription></div></CardHeader>
        <CardContent className="space-y-3">{store.notes.map((note) => <div key={note.id} className="rounded-2xl border border-white/10 bg-[#0c141d] p-4"><div className="font-black">{note.leadName}</div><div className="text-xs text-basin-muted">{new Date(note.at).toLocaleString()} · {note.disposition}</div><p className="mt-2 text-sm text-basin-muted">{note.note}</p></div>)}{store.notes.length === 0 ? empty("No notes yet. Open a lead card and save a note.") : null}</CardContent>
      </Card>
    );
  }

  function renderHandoffs() {
    return (
      <Card>
        <CardHeader><div><CardTitle>Director Handoffs</CardTitle><CardDescription>One-page director prep sheets generated from lead cards.</CardDescription></div></CardHeader>
        <CardContent className="space-y-3">{store.handoffs.map((h) => <ScriptBlock key={h.id} title={`${h.leadName} — ${new Date(h.at).toLocaleString()}`} body={h.body} />)}{store.handoffs.length === 0 ? empty("No handoffs yet. Open a lead card and save a handoff.") : null}</CardContent>
      </Card>
    );
  }

  function renderFollowUp() {
    return (
      <Card>
        <CardHeader><div><CardTitle>Follow-Up Calendar</CardTitle><CardDescription>Follow-ups saved through call notes and lead dispositions.</CardDescription></div></CardHeader>
        <CardContent className="space-y-3">{store.followUps.map((note) => <div key={note.id} className="rounded-2xl border border-white/10 bg-[#0c141d] p-4"><div className="font-black">{note.leadName}</div><div className="text-xs text-basin-muted">Next: {note.nextFollowUp || "Not set"}</div><p className="mt-2 text-sm text-basin-muted">{note.note}</p></div>)}{store.followUps.length === 0 ? empty("No follow-ups scheduled yet.") : null}</CardContent>
      </Card>
    );
  }

  function renderAnalytics() {
    return (
      <div className="space-y-5">
        {renderKpis()}
        <Card>
          <CardHeader><div><CardTitle>Analytics</CardTitle><CardDescription>Lead source quality, route coverage, and API health.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi label="NPI Seeds" value={radar.stats.npiCollected} />
            <Kpi label="RSS Collected" value={radar.stats.rssCollected} />
            <Kpi label="LinkedIn Discovery" value={radar.stats.linkedinDiscoveryCollected} />
            <Kpi label="CPA Collected" value={radar.stats.cpaCollected} />
            <Kpi label="Email Found" value={radar.stats.emailFound} />
            <Kpi label="Phone Found" value={radar.stats.phoneFound} />
            <Kpi label="Groq Failures" value={radar.stats.groqFailures || 0} />
            <Kpi label="Brave Failures" value={radar.stats.braveFailures || 0} />
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderPlaybook() {
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Master Playbook — Method B Only</CardTitle>
              <CardDescription>Option A removed. This is the full Method B library for aged 90+ leads, new incoming leads, Basin OS generated leads, and CPA/referral leads.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {METHOD_B_PLAYBOOK.map((group) => (
              <div key={group.segment} className="rounded-3xl border border-white/10 bg-[#0c141d] p-4">
                <div className="mb-2 text-lg font-black text-basin-text">{group.segment}</div>
                <div className="mb-4 text-sm text-basin-muted">{group.when}</div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <ScriptBlock title="Email 1" body={group.email1} />
                  <ScriptBlock title="Email 2" body={group.email2} />
                  <ScriptBlock title="LinkedIn 1" body={group.linkedin1} />
                  <ScriptBlock title="LinkedIn 2" body={group.linkedin2} />
                  <ScriptBlock title="Phone Script" body={group.phone1} />
                  <ScriptBlock title="Voicemail" body={group.voicemail} />
                  <ScriptBlock title="SMS / Text" body={group.sms} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Day 1 through Day 10 Cadence</CardTitle><CardDescription>Phone cadence tied to required prior touches and compliance.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">{CADENCE.map((step) => <ScriptBlock key={step.day} title={`Day ${step.day} — ${step.title}`} body={`Timing / Trigger:\n${step.trigger}\n\nPrior Touch Required:\n${step.prior}\n\nNext Step:\n${step.next}\n\nScript:\n${step.script}`} />)}</CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Rebuttals</CardTitle><CardDescription>Keep the conversation optional, educational, and compliant. Live-use version also appears in Call Coach.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">{REBUTTALS.map(([o, r]) => <ScriptBlock key={o} title={o} body={r} />)}</CardContent>
        </Card>
      </div>
    );
  }

  function renderApiCommand() {
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader><div><CardTitle>API Command Center</CardTitle><CardDescription>V4 uses server-side keys only. No Groq key is stored in the browser.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Kpi label="Runner Groq" value={radar.stats.groqConfigured ? "ON" : "OFF"} />
            <Kpi label="Runner Brave" value={radar.stats.braveConfigured ? "ON" : "OFF"} />
            <Kpi label="Groq Calls" value={radar.stats.groqCalls} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Morning Brief</CardTitle><CardDescription>Server-side Groq brief from current pipeline.</CardDescription></div></CardHeader>
          <CardContent className="space-y-3">
            <Button variant="teal" onClick={async () => {
              const response = await fetch("/api/groq", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ mode: "morningBrief", context: JSON.stringify({ stats: radar.stats, topLeads: leads.slice(0, 12), notes: store.notes.slice(0, 10) }) }) });
              const data = await response.json();
              setMorningBrief(data.brief || data.error || "No brief generated.");
            }}><WandSparkles className="h-4 w-4" />Build Morning Brief</Button>
            <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-[#0c141d] p-4 font-mono text-xs text-basin-muted">{morningBrief || "No brief yet."}</pre>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader><div><CardTitle>Settings + Backup</CardTitle><CardDescription>Local CRM notes/handoffs are browser-stored unless you connect a real database later.</CardDescription></div></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => downloadJson(`basin-os-v4-1-backup-${new Date().toISOString().slice(0,10)}.json`, { store, radar })}><Download className="h-4 w-4" />Export Backup</Button>
            <Button variant="danger" onClick={() => { if (confirm("Clear local notes, handoffs, and manual leads?")) setStore(initialStore()); }}><Trash2 className="h-4 w-4" />Clear Local CRM</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Deployment Requirement</CardTitle><CardDescription>GitHub Pages cannot run this app.</CardDescription></div></CardHeader>
          <CardContent className="space-y-3 text-sm text-basin-muted">
            <p>Use Vercel or another Next.js-capable host. The secure /api/groq route requires a server runtime.</p>
            <pre className="rounded-2xl border border-white/10 bg-[#0c141d] p-4 font-mono text-xs">{`GROQ_API_KEY=...
BRAVE_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile`}</pre>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderLeadCard(lead: Lead) {
    const linkedinUrl = contacts(lead).find((c) => /linkedin/i.test(`${c.type} ${c.value}`))?.value;
    return (
      <article key={lead.id} className="grid gap-3 rounded-2xl border border-white/10 bg-[#0c141d] p-4 transition hover:border-basin-gold/40 md:grid-cols-[auto_1fr_auto]">
        <div className={`grid h-12 w-12 place-items-center rounded-full border-2 text-xl font-black ${lead.grade === "A" ? "border-emerald-400 text-emerald-300" : lead.grade === "B" ? "border-blue-400 text-blue-300" : lead.grade === "C" ? "border-amber-400 text-amber-300" : "border-rose-400 text-rose-300"}`}>{lead.grade}</div>
        <div>
          <div className="font-black">{lead.name}</div>
          <div className="text-xs text-basin-muted">{lead.title} {lead.company ? `· ${lead.company}` : ""} {lead.location ? `· ${lead.location}` : ""}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge className={statusColor(lead)}>{leadStatus(lead)}</Badge>
            <Badge className={gradeColor(lead.grade)}>Grade {lead.grade}</Badge>
            <Badge className="border-basin-gold/40 bg-basin-gold/10 text-basin-gold2">Score {lead.score}</Badge>
            {hasEmail(lead) ? <Badge className="border-basin-green/40 bg-basin-green/10 text-basin-green">Email</Badge> : null}
            {hasLinkedIn(lead) ? <Badge className="border-basin-blue/40 bg-basin-blue/10 text-basin-blue">LinkedIn</Badge> : null}
            {hasPhone(lead) ? <Badge className="border-basin-teal/40 bg-basin-teal/10 text-basin-teal">Phone</Badge> : null}
            {lead.isCPA ? <Badge className="border-amber-400/40 bg-amber-500/15 text-amber-300">CPA</Badge> : null}
            {(lead.tags || []).filter((tag) => !["Ready for Associate","LinkedIn Verify","CPA Verify","Research / Enrich","Skipped",`${lead.grade} Grade`].includes(tag)).slice(0, 6).map((tag) => <Badge key={tag} className="border-white/15 bg-white/5 text-basin-muted">{tag}</Badge>)}
          </div>
          <p className="mt-3 line-clamp-4 text-xs leading-5 text-basin-muted"><span className="font-bold text-basin-text">fitReason:</span> {lead.fitReason}</p>
          <p className="mt-1 text-xs leading-5 text-basin-muted"><span className="font-bold text-basin-text">Next:</span> {lead.bestFirstAction || "Manual review required."}</p>
        </div>
        <div className="flex flex-col gap-2 md:min-w-40">
          <Button variant="primary" onClick={() => setSelectedLead(lead)}><ShieldCheck className="h-4 w-4" />Open Lead Card</Button>
          {linkedinUrl ? <Button variant="secondary" onClick={() => window.open(linkedinUrl, "_blank", "noopener")}><ExternalLink className="h-4 w-4" />Open LinkedIn</Button> : null}
          <Button variant="danger" onClick={() => suppressLead(lead)}><Trash2 className="h-4 w-4" />Suppress</Button>
        </div>
      </article>
    );
  }
}

function empty(text: string) {
  return <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-basin-muted">{text}</div>;
}

function ScriptBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c141d] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="font-black">{title}</h4>
        <Button variant="ghost" onClick={() => copyText(body)}>Copy</Button>
      </div>
      <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-basin-muted">{body}</pre>
    </div>
  );
}

function PlaybookSection({ title, subtitle, scripts }: { title: string; subtitle: string; scripts: Array<[string, string]> }) {
  return (
    <Card>
      <CardHeader><div><CardTitle>{title}</CardTitle><CardDescription>{subtitle}</CardDescription></div></CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-3">{scripts.map(([name, body]) => <ScriptBlock key={name} title={name} body={body} />)}</CardContent>
    </Card>
  );
}

function LeadModal({
  lead,
  notes,
  onClose,
  onUpdated,
  onAddNote,
  onHandoff
}: {
  lead: Lead;
  notes: LeadNote[];
  onClose: () => void;
  onUpdated: (lead: Lead) => void;
  onAddNote: (note: LeadNote) => void;
  onHandoff: (handoff: Handoff) => void;
}) {
  const [bio, setBio] = React.useState(lead.linkedinBio || "");
  const [email, setEmail] = React.useState(lead.generatedEmail || "");
  const [call, setCall] = React.useState(lead.generatedCall || "");
  const [note, setNote] = React.useState("");
  const [disposition, setDisposition] = React.useState(lead.disposition || "New / Not Worked");
  const [nextFollowUp, setNextFollowUp] = React.useState(lead.nextFollowUp || "");
  const [completedTasks, setCompletedTasks] = React.useState<string[]>(lead.requiredTasks || []);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const linkedinUrl = contacts(lead).find((c) => /linkedin/i.test(`${c.type} ${c.value}`))?.value || lead.sourceUrl || "#";
  const evidenceTrail = evidence(lead).map((e) => `${e.source}: ${e.whatItProves || ""} ${e.url || ""}`).join("\n");

  async function verifyAndDraft() {
    if (bio.trim().length < 20) {
      setError("Paste the LinkedIn bio/about text before drafting.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/groq", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ mode: "draftSequence", lead, linkedinBio: bio, evidenceTrail })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Groq draft failed.");
      setEmail(data.email || "");
      setCall(data.call || "");
      onUpdated({
        ...lead,
        linkedinBio: bio,
        generatedEmail: data.email || "",
        generatedCall: data.call || "",
        associateReady: true,
        readyForAssociate: true,
        linkedinVerify: false,
        linkedinVerified: true,
        cpaVerify: false,
        skipped: false,
        bucket: "readyForAssociate",
        status: "Ready for Associate",
        tags: [...new Set([...(lead.tags || []), "LinkedIn", "LinkedIn Verified", "Ready for Associate"])],
        workflowDay: lead.workflowDay || 1,
        bestFirstAction: "LinkedIn manually verified. Review generated sequence, then begin Day 1."
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }


  function toggleTask(task: string) {
    setCompletedTasks((current) =>
      current.includes(task) ? current.filter((item) => item !== task) : [...current, task]
    );
  }

  function canAdvanceDay() {
    const day = lead.workflowDay || 1;
    const required = DAY_REQUIREMENTS[day] || DAY_REQUIREMENTS[1];
    return required.every((task) => completedTasks.includes(task)) && disposition !== "New / Not Worked" && note.trim().length >= 8;
  }

  function advanceDay() {
    if (!canAdvanceDay()) {
      setError("Complete all required tasks, select a disposition, and add a real note before advancing.");
      return;
    }

    const nextDay = Math.min((lead.workflowDay || 1) + 1, 10);
    const callNote: LeadNote = {
      id: `note_${Date.now()}`,
      leadId: lead.id,
      leadName: String(lead.name || "Lead"),
      note,
      disposition,
      at: new Date().toISOString(),
      nextFollowUp
    };

    onAddNote(callNote);
    onUpdated({
      ...lead,
      workflowDay: nextDay,
      disposition,
      nextFollowUp,
      requiredTasks: [],
      callHistory: [...(lead.callHistory || []), callNote]
    });
    setCompletedTasks([]);
    setNote("");
    setError("");
  }

  function saveNote() {
    if (!note.trim()) return;
    const savedNote: LeadNote = {
      id: `note_${Date.now()}`,
      leadId: lead.id,
      leadName: String(lead.name || "Lead"),
      note,
      disposition,
      at: new Date().toISOString(),
      nextFollowUp
    };
    onAddNote(savedNote);
    onUpdated({
      ...lead,
      disposition,
      nextFollowUp,
      requiredTasks: completedTasks,
      callHistory: [...(lead.callHistory || []), savedNote]
    });
    setNote("");
  }

  function buildHandoff() {
    const body = `DIRECTOR HANDOFF — ${lead.name}

Title / Company:
${lead.title || ""} ${lead.company ? "· " + lead.company : ""}

Score / Grade:
${lead.score} / ${lead.grade}

Route:
${leadStatus(lead)}

Contact Methods:
${contacts(lead).map((c) => `${c.type}: ${c.value} (${c.source || "source unknown"})`).join("\n") || "None"}

Why It Fits:
${lead.fitReason}

Accredited Status:
Do not assume accredited status. Confirm directly.

Evidence Trail:
${evidenceTrail || "None"}

Generated Day 1 Email:
${email || lead.generatedEmail || "Not generated yet."}

Generated Call Script:
${call || lead.generatedCall || "Not generated yet."}

Notes:
${notes.map((n) => `${n.at} — ${n.disposition || ""}: ${n.note}`).join("\n") || "No notes yet."}

Compliance:
Educational only. No guaranteed returns. No tax advice. Prospect should consult CPA/advisor.`;
    onHandoff({ id: `handoff_${Date.now()}`, leadId: lead.id, leadName: String(lead.name || "Lead"), body, at: new Date().toISOString() });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-7xl overflow-auto rounded-3xl border border-basin-gold/30 bg-gradient-to-br from-basin-panel/95 to-[#05090d]/95 shadow-[0_34px_110px_rgba(0,0,0,.70)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0b1017]/90 p-5 backdrop-blur-xl">
          <div>
            <div className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-basin-gold">Full Lead Card</div>
            <h2 id="modalLeadName" className="mt-1 text-2xl font-black">{lead.name}</h2>
            <p id="modalLeadTitle" className="mt-1 text-sm text-basin-muted">{lead.title}</p>
            <p id="modalLeadCompany" className="text-sm text-basin-muted">{lead.company}</p>
            <p className="mt-2 font-mono text-xs text-basin-gold">Status: {lead.status || lead.bucket} · Day {lead.workflowDay || 0} · Disposition: {lead.disposition || "New / Not Worked"}</p>
          </div>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>

        <div id="modalBody" className="grid gap-4 p-5 xl:grid-cols-2">
          <Card>
            <CardHeader><div><CardTitle>Evidence Trail</CardTitle><CardDescription>Public-source evidence. Open profile yourself. No scraping.</CardDescription></div></CardHeader>
            <CardContent className="space-y-3">
              <div id="modalEvidenceTrail" className="space-y-2">
                {evidence(lead).length ? evidence(lead).map((e, i) => (
                  <div key={i} className="rounded-xl border border-basin-border bg-[#0b121a] p-3 text-xs text-basin-muted">
                    <div className="font-bold text-basin-text">{e.source}</div>
                    {e.url ? <a className="break-all text-basin-blue" href={e.url} target="_blank">{e.url}</a> : null}
                    <div>{e.whatItProves}</div>
                  </div>
                )) : empty("No evidence trail.")}
              </div>
              {contacts(lead).some((c) => /linkedin/i.test(`${c.type} ${c.value}`)) ? (
                <a id="btnOpenNav" target="_blank" className="inline-flex rounded-xl border border-basin-gold bg-gradient-to-b from-basin-gold2 to-basin-gold px-3 py-2 text-sm font-black text-black" href={linkedinUrl}>
                  Open LinkedIn / Sales Navigator <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              ) : lead.sourceUrl ? (
                <a target="_blank" className="inline-flex rounded-xl border border-basin-border bg-[#222b3a] px-3 py-2 text-sm font-black text-basin-text" href={lead.sourceUrl}>
                  Open Source Evidence <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Manual LinkedIn Verification</CardTitle><CardDescription>Paste verified profile bio, then generate compliant sequence.</CardDescription></div></CardHeader>
            <CardContent className="space-y-3">
              <Textarea id="inputLinkedinBio" placeholder="Paste LinkedIn Bio Here" value={bio} onChange={(e) => setBio(e.target.value)} />
              <Button id="btnVerifyDraft" variant="teal" onClick={verifyAndDraft} disabled={loading}><WandSparkles className="h-4 w-4" />{loading ? "Drafting..." : "Verify & Draft Sequence"}</Button>
              {error ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Drafted Day 1 Email</CardTitle><CardDescription>Review before use. No auto-send.</CardDescription></div></CardHeader>
            <CardContent><Textarea id="outputEmail" className="font-mono" readOnly placeholder="Drafted Day 1 Email will appear here..." value={email} /></CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Drafted Call Script</CardTitle><CardDescription>Day 3 soft phone script.</CardDescription></div></CardHeader>
            <CardContent><Textarea id="outputCallNotes" className="font-mono" readOnly placeholder="Drafted Call Script will appear here..." value={call} /></CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader><div><CardTitle>Call Notes + Handoff</CardTitle><CardDescription>Notes stay attached to the lead card.</CardDescription></div></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-[260px_1fr_220px]">
                <select className="rounded-xl border border-basin-border bg-[#0d151f] px-3 py-2 text-sm text-basin-text outline-none" value={disposition} onChange={(e) => setDisposition(e.target.value)}>
                  {DISPOSITIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add call note, objection, follow-up, or outcome..." />
                <Input type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0c141d] p-4">
                <div className="mb-3 font-black">Required Tasks — Day {lead.workflowDay || 1}</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {(DAY_REQUIREMENTS[lead.workflowDay || 1] || DAY_REQUIREMENTS[1]).map((task) => (
                    <label key={task} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-basin-muted">
                      <input type="checkbox" checked={completedTasks.includes(task)} onChange={() => toggleTask(task)} />
                      <span>{task}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={saveNote}>Save Note</Button>
                <Button variant="teal" onClick={advanceDay}>Advance to Next Day</Button>
                <Button variant="primary" onClick={buildHandoff}>Handoff Sheet</Button>
              </div>
              <div className="space-y-2">
                {notes.map((n) => <div key={n.id} className="rounded-xl border border-white/10 bg-[#0c141d] p-3"><div className="text-xs text-basin-muted">{new Date(n.at).toLocaleString()} · {n.disposition}</div><div className="text-sm">{n.note}</div></div>)}
                {notes.length === 0 ? empty("No notes yet.") : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
