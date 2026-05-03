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
  ["all", "All"],
  ["ready", "Ready"],
  ["linkedin", "LinkedIn"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["rss", "RSS/Public"],
  ["npi", "NPI"],
  ["cpa", "CPA"],
  ["A", "A Grade"]
] as const;

const METHOD_A = {
  title: "Method A — Warm Evidence-Based Outreach",
  when: "Use when the lead has a source signal, public event, LinkedIn context, email route, or business trigger.",
  email: `Subject: Basin Ventures resource for [Signal/Role]

Hi [Name],

I came across [Signal] and thought your background as [Role] may make this worth a quick educational review.

Basin Ventures works with accredited investors on direct, tax-advantaged oil and gas ownership. This is not a recommendation, tax advice, or a guaranteed-return product. The first step would simply be a short director call so you can understand the structure and decide whether it is relevant.

Would it be worth sending a brief overview, or should I close the loop?

Best,
James`,
  phone: `Hi [Name], this is James with Basin Ventures in Southlake. I know this is out of the blue. I came across [Signal], and based on your background as [Role], I thought a short intro may be relevant. Do you have 30 seconds?

Basin works with accredited investors on direct, tax-advantaged oil and gas ownership. I am not calling to force a decision. The only goal is a short director call so you can understand the structure and decide whether it is even worth reviewing.

Would this week or next week be better?`,
  linkedin: `Hi [Name] — I came across your background around [Signal/Role]. I work with Basin Ventures in Southlake. We share educational information on direct, tax-advantaged energy ownership for accredited investors. No pitch here; I wanted to see if a short overview would be relevant.`
};

const METHOD_B = {
  title: "Method B — Direct Professional Intro",
  when: "Use only when no warm public signal exists, but the lead is manually approved and has a compliant contact route.",
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
  ["What is the minimum?", "The typical minimum can vary by fund window. The director can explain structure, risk, and suitability. Nothing should move forward unless it makes sense after review."]
];

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
    ready: leads.filter((l) => l.associateReady).length,
    linkedin: leads.filter((l) => l.linkedinVerify).length,
    cpa: leads.filter((l) => l.cpaVerify || l.isCPA).length,
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
    const response = await fetch(`/data/radar-leads.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      showToast(`Radar load failed: ${response.status}`);
      return;
    }
    const json = await response.json();
    setRadar(json);
    showToast(`Loaded ${json.stats?.activeVisible || 0} active radar leads.`);
  }

  const filteredLeads = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return leads.filter((lead) => {
      if (q) {
        const blob = [lead.name, lead.company, lead.title, lead.signal, lead.summary, contacts(lead).map((c) => c.value).join(" ")].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (filter === "ready") return lead.associateReady;
      if (filter === "linkedin") return lead.linkedinVerify || hasLinkedIn(lead);
      if (filter === "email") return hasEmail(lead);
      if (filter === "phone") return hasPhone(lead);
      if (filter === "rss") return /rss|news|public/i.test(`${lead.sourceType} ${lead.source}`);
      if (filter === "npi") return /npi/i.test(`${lead.sourceType} ${lead.source}`);
      if (filter === "cpa") return lead.cpaVerify || lead.isCPA || lead.type === "cpa";
      if (filter === "A") return lead.grade === "A";
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
          <div className="mt-4 rounded-2xl border border-white/10 bg-[#0c141d] p-3 text-center font-mono text-xs text-basin-muted">Basin OS V4.1 Full Migration</div>
        </aside>

        <main className="min-w-0">
          <header className="sticky top-0 z-30 grid gap-4 border-b border-basin-gold/20 bg-basin-black/85 px-6 py-5 backdrop-blur-xl xl:grid-cols-[1fr_minmax(320px,650px)]">
            <div>
              <div className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-basin-gold">Basin Ventures Command Center</div>
              <h1 className="mt-1 text-3xl font-black tracking-tight">{activePage.label}</h1>
              <p className="mt-1 max-w-4xl text-sm text-basin-muted">Secure V4 CRM: Radar, LinkedIn verification, playbook, notes, handoffs, follow-ups, API status, and compliant outreach.</p>
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
      associateReady: Boolean(email),
      linkedinVerify: Boolean(!email && linkedin),
      cpaVerify: false,
      skipped: Boolean(!email && !linkedin),
      bucket: email ? "ready" : linkedin ? "linkedinVerify" : "skipped"
    });
    updateLead(lead);
    showToast("Manual lead added.");
  }

  function renderKpis() {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Total Candidates" value={fmt(counts.total)} hint="Active + verify lanes" />
        <Kpi label="Ready" value={fmt(counts.ready)} hint="Can work after review" />
        <Kpi label="LinkedIn Verify" value={fmt(counts.linkedin)} hint="Open and confirm" />
        <Kpi label="Email Route" value={fmt(counts.email)} hint="Best Day 1 path" />
        <Kpi label="Public Searches" value={fmt(radar.stats.publicSearches)} hint="Brave/GitHub runner" />
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
                key === "all" ? counts.total : key === "ready" ? counts.ready : key === "linkedin" ? counts.linkedin :
                key === "email" ? counts.email : key === "phone" ? counts.phone : key === "rss" ? counts.rss :
                key === "npi" ? counts.npi : key === "cpa" ? counts.cpa : key === "A" ? counts.gradeA : 0;
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
    const ready = filteredLeads.filter((l) => l.associateReady);
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
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader><div><CardTitle>7-Channel Sequence Builder</CardTitle><CardDescription>Phone, voicemail, email, LinkedIn, SMS, Loom, nurture. Manual send only.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">
            {["Day 1 Email", "Day 1 LinkedIn", "Day 2 Call", "Day 4 Credibility", "Day 6 Final Call", "Day 10 Permission", "Long-Term Nurture"].map((title, i) => (
              <ScriptBlock key={title} title={title} body={interpolate(i < 2 ? METHOD_A.email : CADENCE[Math.min(i-2, CADENCE.length-1)].script, lead)} />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderCallCoach() {
    const lead = filteredLeads[0];
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader><div><CardTitle>Call Coach</CardTitle><CardDescription>Day cadence, compliance reminders, and objection handling.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">
            {CADENCE.map((step) => <ScriptBlock key={step.day} title={`Day ${step.day} — ${step.title}`} body={interpolate(step.script, lead)} />)}
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
        <PlaybookSection title={METHOD_A.title} subtitle={METHOD_A.when} scripts={[["Email", METHOD_A.email], ["Phone", METHOD_A.phone], ["LinkedIn", METHOD_A.linkedin]]} />
        <PlaybookSection title={METHOD_B.title} subtitle={METHOD_B.when} scripts={[["Email", METHOD_B.email], ["Phone", METHOD_B.phone], ["LinkedIn", METHOD_B.linkedin]]} />
        <Card>
          <CardHeader><div><CardTitle>Day 1 through Day 10 Cadence</CardTitle><CardDescription>Phone cadence tied to required prior touches and compliance.</CardDescription></div></CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">{CADENCE.map((step) => <ScriptBlock key={step.day} title={`Day ${step.day} — ${step.title}`} body={`Timing / Trigger:\\n${step.trigger}\\n\\nPrior Touch Required:\\n${step.prior}\\n\\nNext Step:\\n${step.next}\\n\\nScript:\\n${step.script}`} />)}</CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Rebuttals</CardTitle><CardDescription>Keep the conversation optional, educational, and compliant.</CardDescription></div></CardHeader>
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
        <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-basin-gold text-xl font-black text-basin-gold">{String(lead.name || "?").slice(0,1)}</div>
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
  const [disposition, setDisposition] = React.useState("Reviewed");
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
        linkedinVerify: false,
        cpaVerify: false,
        skipped: false,
        bucket: "ready",
        status: "Ready to Work",
        workflowDay: lead.workflowDay || 1,
        bestFirstAction: "LinkedIn manually verified. Review generated sequence, then begin Day 1."
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  function saveNote() {
    if (!note.trim()) return;
    onAddNote({
      id: `note_${Date.now()}`,
      leadId: lead.id,
      leadName: String(lead.name || "Lead"),
      note,
      disposition,
      at: new Date().toISOString()
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
              <a id="btnOpenNav" target="_blank" className="inline-flex rounded-xl border border-basin-gold bg-gradient-to-b from-basin-gold2 to-basin-gold px-3 py-2 text-sm font-black text-black" href={linkedinUrl}>
                Open Sales Navigator <ExternalLink className="ml-2 h-4 w-4" />
              </a>
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
              <div className="grid gap-3 md:grid-cols-[220px_1fr_auto_auto]">
                <Input value={disposition} onChange={(e) => setDisposition(e.target.value)} placeholder="Disposition" />
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add call note, objection, follow-up, or outcome..." />
                <Button variant="secondary" onClick={saveNote}>Save Note</Button>
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
