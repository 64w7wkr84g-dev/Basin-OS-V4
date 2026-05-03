"use client";

import * as React from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { Lead, GroqDraftResponse } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { getLeadEvidence } from "@/lib/utils";

export function LeadVerificationModal({
  lead,
  onClose,
  onUpdated
}: {
  lead: Lead | null;
  onClose: () => void;
  onUpdated: (lead: Lead) => void;
}) {
  const [bio, setBio] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [call, setCall] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    setBio(lead?.linkedinBio ?? "");
    setEmail(lead?.generatedEmail ?? "");
    setCall(lead?.generatedCall ?? "");
    setError("");
  }, [lead]);

  if (!lead) return null;

  const evidenceTrail = getLeadEvidence(lead)
    .map((e) => `${e.source}: ${e.whatItProves ?? ""} ${e.url ?? ""}`)
    .join("\n");

  async function verifyAndDraft() {
    if (!lead) return;
    setError("");

    if (bio.trim().length < 20) {
      setError("Paste the LinkedIn bio/about text before drafting.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/groq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "draftSequence",
          lead,
          linkedinBio: bio,
          evidenceTrail
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Groq proxy failed with ${response.status}`);
      }

      const data = (await response.json()) as GroqDraftResponse;
      setEmail(data.email);
      setCall(data.call);

      const updated: Lead = {
        ...lead,
        linkedinBio: bio,
        generatedEmail: data.email,
        generatedCall: data.call,
        associateReady: true,
        linkedinVerify: false,
        cpaVerify: false,
        skipped: false,
        bucket: "ready",
        status: "Ready to Work",
        workflowDay: lead.workflowDay || 1,
        bestFirstAction: "LinkedIn manually verified. Review generated sequence, then begin Day 1."
      };

      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown Groq drafting error.");
    } finally {
      setLoading(false);
    }
  }

  const navUrl =
    lead.contactMethods?.find((c) => /linkedin/i.test(`${c.type} ${c.value}`))?.value ||
    lead.sourceUrl ||
    "#";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-xl">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-3xl border border-basin-gold/30 bg-gradient-to-br from-basin-panel/95 to-[#05090d]/95 shadow-[0_34px_110px_rgba(0,0,0,.70)] backdrop-blur-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#0b1017]/85 p-5 backdrop-blur-xl">
          <div>
            <div className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-basin-gold">
              Human-in-the-loop Verification
            </div>
            <h2 id="modalLeadName" className="mt-1 text-2xl font-black">{lead.name}</h2>
            <p id="modalLeadTitle" className="mt-1 text-sm text-basin-muted">{lead.title}</p>
            <p id="modalLeadCompany" className="text-sm text-basin-muted">{lead.company}</p>
          </div>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>

        <div id="modalBody" className="grid gap-4 p-5 xl:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-basin-panel/80 p-4">
            <h3 className="font-black">Evidence Trail</h3>
            <div id="modalEvidenceTrail" className="mt-3 space-y-2">
              {getLeadEvidence(lead).length ? (
                getLeadEvidence(lead).map((e, idx) => (
                  <div key={idx} className="rounded-xl border border-basin-border bg-[#0b121a] p-3 text-xs text-basin-muted">
                    <div className="font-bold text-basin-text">{e.source}</div>
                    {e.url ? <a className="break-all text-basin-blue" href={e.url} target="_blank">{e.url}</a> : null}
                    <div>{e.whatItProves}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-basin-muted">No evidence trail.</div>
              )}
            </div>
            <a id="btnOpenNav" target="_blank" className="mt-4 inline-flex rounded-xl border border-basin-gold bg-gradient-to-b from-[#f3bc51] to-basin-gold px-3 py-2 text-sm font-black text-black" href={navUrl}>
              Open Sales Navigator
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </section>

          <section className="rounded-2xl border border-white/10 bg-basin-panel/80 p-4">
            <h3 className="font-black">Manual LinkedIn Verification</h3>
            <p className="mt-1 text-xs text-basin-muted">Open the profile yourself, verify identity, then paste the bio/about section.</p>
            <Textarea id="inputLinkedinBio" className="mt-3" placeholder="Paste LinkedIn Bio Here" value={bio} onChange={(e) => setBio(e.target.value)} />
            <Button id="btnVerifyDraft" variant="teal" className="mt-3" onClick={verifyAndDraft} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Verify & Draft Sequence
            </Button>
            {error ? <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div> : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-basin-panel/80 p-4">
            <h3 className="font-black">Drafted Day 1 Email</h3>
            <Textarea id="outputEmail" className="mt-3 font-mono" readOnly placeholder="Drafted Day 1 Email will appear here..." value={email} />
          </section>

          <section className="rounded-2xl border border-white/10 bg-basin-panel/80 p-4">
            <h3 className="font-black">Drafted Call Script</h3>
            <Textarea id="outputCallNotes" className="mt-3 font-mono" readOnly placeholder="Drafted Call Script will appear here..." value={call} />
          </section>
        </div>
      </div>
    </div>
  );
}
