import { Activity, Gauge, ShieldCheck, TrendingUp } from "lucide-react";
import { getAllActiveLeads, getRadarData } from "@/lib/data";
import { formatNumber, gradeColor, statusColor, leadDisplayStatus } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/KpiCard";
import { LeadVerificationBoard } from "@/components/LeadVerificationBoard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const radar = await getRadarData();
  const leads = await getAllActiveLeads();

  const gradeALeads = leads.filter((lead) => lead.grade === "A").length;
  const conversionRate = leads.length ? Math.round((gradeALeads / leads.length) * 100) : 0;
  const systemHealth = radar.stats.groqConfigured && radar.stats.braveConfigured ? "Online" : "Needs Keys";

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Leads Parsed" value={formatNumber(radar.stats.totalFound)} hint="Groq-classified records" />
        <KpiCard label="Pipeline Velocity" value={formatNumber(radar.stats.activeVisible)} hint="Active visible leads" />
        <KpiCard label="Grade A Rate" value={`${conversionRate}%`} hint={`${gradeALeads} Grade A leads`} />
        <KpiCard label="System Health" value={systemHealth} hint={`Groq ${radar.stats.groqConfigured ? "ON" : "OFF"} · Brave ${radar.stats.braveConfigured ? "ON" : "OFF"}`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,60fr)_minmax(360px,40fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-basin-gold" />
                Algorithmic Lead Verification
              </CardTitle>
              <CardDescription>
                Human audit board. Every card surfaces Groq grade, fitReason, CPA flag, and source trail.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <LeadVerificationBoard leads={leads} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-basin-green" />
                  Live Radar Feed
                </CardTitle>
                <CardDescription>GitHub Actions runner output and API utilization.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs">
              {[
                ["Generated", radar.generatedAt ?? "Not loaded"],
                ["Engine", radar.engine],
                ["Ready", radar.stats.readyToWork],
                ["LinkedIn Verify", radar.stats.linkedinVerify],
                ["CPA Verify", radar.stats.cpaVerify],
                ["Skipped", radar.stats.skipped],
                ["Public Searches", radar.stats.publicSearches],
                ["Groq Calls", radar.stats.groqCalls],
                ["Groq Failures", radar.stats.groqFailures ?? 0]
              ].map(([key, value]) => (
                <div key={String(key)} className="rounded-xl border border-white/10 bg-[#0c141d] p-3">
                  <div className="text-basin-muted">{key}</div>
                  <div className="mt-1 break-words font-bold text-basin-text">{String(value)}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-basin-gold" />
                  Compliance Guardrails
                </CardTitle>
                <CardDescription>Embedded into every workflow and generated script.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-basin-muted">
              <p>No guaranteed returns.</p>
              <p>No tax advice.</p>
              <p>No assumed accredited status.</p>
              <p>Manual review before outreach.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-basin-gold" />
              Recent Parsed Entries
            </CardTitle>
            <CardDescription>Most recent active leads from radar-leads.json.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="font-mono text-[11px] uppercase tracking-[0.16em] text-basin-muted">
              <tr>
                <th className="px-3">Name</th>
                <th className="px-3">Company</th>
                <th className="px-3">Title</th>
                <th className="px-3">Grade</th>
                <th className="px-3">Status</th>
                <th className="px-3">CPA</th>
                <th className="px-3">fitReason</th>
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 18).map((lead) => (
                <tr key={lead.id}>
                  <td className="rounded-l-xl border-y border-l border-white/10 bg-[#0d151f] px-3 py-3 font-bold">{lead.name}</td>
                  <td className="border-y border-white/10 bg-[#0d151f] px-3 py-3 text-basin-muted">{lead.company}</td>
                  <td className="border-y border-white/10 bg-[#0d151f] px-3 py-3 text-basin-muted">{lead.title}</td>
                  <td className="border-y border-white/10 bg-[#0d151f] px-3 py-3"><Badge className={gradeColor(lead.grade)}>{lead.grade}</Badge></td>
                  <td className="border-y border-white/10 bg-[#0d151f] px-3 py-3"><Badge className={statusColor(lead)}>{leadDisplayStatus(lead)}</Badge></td>
                  <td className="border-y border-white/10 bg-[#0d151f] px-3 py-3">{lead.isCPA ? <Badge className="border-indigo-400/40 bg-indigo-500/15 text-indigo-300">CPA</Badge> : "—"}</td>
                  <td className="rounded-r-xl border-y border-r border-white/10 bg-[#0d151f] px-3 py-3 text-xs text-basin-muted">{lead.fitReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
