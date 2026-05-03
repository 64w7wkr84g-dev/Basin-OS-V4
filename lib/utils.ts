import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Lead, LeadGrade } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function gradeFromScore(score: number): LeadGrade {
  if (score >= 88) return "A";
  if (score >= 72) return "B";
  if (score >= 58) return "C";
  return "D";
}

export function gradeColor(grade?: LeadGrade | string) {
  if (grade === "A") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-300";
  if (grade === "B") return "border-blue-400/40 bg-blue-500/15 text-blue-300";
  if (grade === "C") return "border-amber-400/40 bg-amber-500/15 text-amber-300";
  return "border-rose-400/40 bg-rose-500/15 text-rose-300";
}

export function statusColor(lead: Lead) {
  if (lead.associateReady || lead.bucket === "ready") {
    return "border-emerald-400/40 bg-emerald-500/15 text-emerald-300";
  }

  if (lead.linkedinVerify || lead.bucket === "linkedinVerify") {
    return "border-indigo-400/40 bg-indigo-500/15 text-indigo-300";
  }

  if (lead.cpaVerify || lead.isCPA || lead.bucket === "cpaVerify") {
    return "border-amber-400/40 bg-amber-500/15 text-amber-300";
  }

  if (lead.bucket === "research") {
    return "border-sky-400/40 bg-sky-500/15 text-sky-300";
  }

  return "border-rose-400/40 bg-rose-500/15 text-rose-300";
}

export function leadStatus(lead: Lead) {
  if (lead.associateReady || lead.bucket === "ready") return "Ready";
  if (lead.linkedinVerify || lead.bucket === "linkedinVerify") return "LinkedIn Verify";
  if (lead.cpaVerify || lead.isCPA || lead.bucket === "cpaVerify") return "CPA Verify";
  if (lead.bucket === "research") return "Research";
  return "Skipped";
}

// Backward-compatible alias for older leftover component files.
export function leadDisplayStatus(lead: Lead) {
  return leadStatus(lead);
}

export function contacts(lead: Lead) {
  return lead.contactMethods ?? [];
}

// Backward-compatible alias for older leftover component files.
export function getLeadContacts(lead: Lead) {
  return contacts(lead);
}

export function evidence(lead: Lead) {
  return lead.evidenceTrail ?? [];
}

// Backward-compatible alias.
export function getLeadEvidence(lead: Lead) {
  return evidence(lead);
}

export function hasEmail(lead: Lead) {
  return contacts(lead).some((c) => c.type === "email" || c.value.includes("@"));
}

export function hasLinkedIn(lead: Lead) {
  return contacts(lead).some((c) => /linkedin/i.test(`${c.type} ${c.value}`));
}

export function hasPhone(lead: Lead) {
  return contacts(lead).some((c) => c.type === "phone" || /\d{3}.*\d{3}.*\d{4}/.test(c.value));
}

export function fmt(value?: number | null) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

export function formatNumber(value?: number | null) {
  return fmt(value);
}

export function prioritySort(a: Lead, b: Lead) {
  const gradeRank = (grade?: string) =>
    ({ A: 1, B: 2, C: 3, D: 4 }[grade || ""] || 5);

  const routeRank = (lead: Lead) => {
    if (lead.associateReady || lead.bucket === "ready") return 1;
    if (lead.linkedinVerify || lead.bucket === "linkedinVerify") return 2;
    if (lead.cpaVerify || lead.isCPA || lead.bucket === "cpaVerify") return 3;
    if (lead.bucket === "research") return 6;
    return 9;
  };

  return (
    routeRank(a) - routeRank(b) ||
    gradeRank(a.grade) - gradeRank(b.grade) ||
    (b.score ?? 0) - (a.score ?? 0) ||
    String(a.name).localeCompare(String(b.name))
  );
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

export function copyText(text: string) {
  return navigator.clipboard.writeText(text);
}
