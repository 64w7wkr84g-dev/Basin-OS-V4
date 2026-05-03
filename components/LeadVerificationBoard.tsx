"use client";

import * as React from "react";
import { ExternalLink, FileSearch, ShieldCheck, Trash2 } from "lucide-react";
import type { Lead } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { gradeColor, statusColor, leadDisplayStatus, getLeadContacts } from "@/lib/utils";
import { LeadVerificationModal } from "@/components/LeadVerificationModal";

type Column = {
  id: string;
  title: string;
  description: string;
  filter: (lead: Lead) => boolean;
};

const columns: Column[] = [
  {
    id: "ready",
    title: "Ready",
    description: "Email route exists. Day 1 can begin after manual review.",
    filter: (lead) => Boolean(lead.associateReady || lead.bucket === "ready")
  },
  {
    id: "linkedin",
    title: "LinkedIn Verify",
    description: "Open profile, paste bio, generate compliant sequence.",
    filter: (lead) => Boolean(lead.linkedinVerify || lead.bucket === "linkedinVerify")
  },
  {
    id: "cpa",
    title: "CPA Verify",
    description: "Tax/referral route. Review before outreach.",
    filter: (lead) => Boolean(lead.cpaVerify || lead.isCPA)
  },
  {
    id: "skipped",
    title: "Skipped / Hidden",
    description: "No workable route. Keep out of associate workflow.",
    filter: (lead) => Boolean(lead.skipped || lead.bucket === "skipped")
  }
];

export function LeadVerificationBoard({ leads }: { leads: Lead[] }) {
  const [items, setItems] = React.useState<Lead[]>(leads);
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);

  function updateLead(updated: Lead) {
    setItems((current) => current.map((lead) => (lead.id === updated.id ? updated : lead)));
    setSelectedLead(updated);
  }

  function setLeadStatus(lead: Lead, status: "verified" | "rejected" | "npi") {
    const updated: Lead = { ...lead };

    if (status === "verified") {
      updated.associateReady = true;
      updated.linkedinVerify = false;
      updated.cpaVerify = false;
      updated.skipped = false;
      updated.bucket = "ready";
      updated.status = "Ready to Work";
      updated.workflowDay = updated.workflowDay || 1;
    }

    if (status === "rejected") {
      updated.associateReady = false;
      updated.linkedinVerify = false;
      updated.cpaVerify = false;
      updated.skipped = true;
      updated.bucket = "skipped";
      updated.status = "Rejected";
    }

    if (status === "npi") {
      updated.status = "NPI Data Requested";
      updated.fitReason = `${updated.fitReason || ""}\n\nOperator requested additional NPI/source validation.`;
    }

    updateLead(updated);
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-4">
        {columns.map((column) => {
          const columnLeads = items.filter(column.filter).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          return (
            <Card key={column.id} className="min-h-[680px]">
              <CardHeader>
                <div>
                  <CardTitle>{column.title}</CardTitle>
                  <CardDescription>{column.description}</CardDescription>
                </div>
                <Badge className="border-basin-border text-basin-muted">{columnLeads.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {columnLeads.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-basin-muted">
                    No leads in this lane.
                  </div>
                ) : (
                  columnLeads.map((lead) => (
                    <article
                      key={lead.id}
                      className="rounded-2xl border border-white/10 bg-[#0c141d] p-4 transition hover:border-basin-gold/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-black text-basin-text">{lead.name || "Unnamed Lead"}</h3>
                          <p className="mt-1 text-xs text-basin-muted">
                            {lead.title || "Unknown title"} {lead.company ? `· ${lead.company}` : ""}
                          </p>
                        </div>
                        <Badge className={gradeColor(lead.grade)}>{lead.grade}</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge className={statusColor(lead)}>{leadDisplayStatus(lead)}</Badge>
                        {lead.isCPA ? <Badge className="border-amber-400/40 bg-amber-500/15 text-amber-300">CPA</Badge> : null}
                        <Badge className="border-basin-border text-basin-muted">Score {lead.score}</Badge>
                      </div>

                      <p className="mt-3 line-clamp-5 text-xs leading-5 text-basin-muted">
                        <span className="font-bold text-basin-text">fitReason: </span>
                        {lead.fitReason}
                      </p>

                      <div className="mt-3 space-y-1 font-mono text-[11px] text-basin-muted">
                        {getLeadContacts(lead).slice(0, 3).map((contact, idx) => (
                          <div key={`${lead.id}-${contact.type}-${idx}`} className="truncate">
                            {contact.type}: {contact.value}
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button variant="primary" onClick={() => setSelectedLead(lead)}>
                          <ShieldCheck className="h-4 w-4" />
                          Verify
                        </Button>
                        <Button variant="secondary" onClick={() => setLeadStatus(lead, "npi")}>
                          <FileSearch className="h-4 w-4" />
                          NPI
                        </Button>
                        {lead.sourceUrl ? (
                          <Button
                            variant="secondary"
                            onClick={() => window.open(lead.sourceUrl, "_blank", "noopener")}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Source
                          </Button>
                        ) : null}
                        <Button variant="danger" onClick={() => setLeadStatus(lead, "rejected")}>
                          <Trash2 className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <LeadVerificationModal lead={selectedLead} onClose={() => setSelectedLead(null)} onUpdated={updateLead} />
    </>
  );
}
