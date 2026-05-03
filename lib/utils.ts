import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Lead, LeadGrade } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function gradeColor(grade: LeadGrade | string | undefined) {
  if (grade === "A") return "bg-emerald-500/15 text-emerald-300 border-emerald-400/40";
  if (grade === "B") return "bg-blue-500/15 text-blue-300 border-blue-400/40";
  if (grade === "C") return "bg-amber-500/15 text-amber-300 border-amber-400/40";
  return "bg-rose-500/15 text-rose-300 border-rose-400/40";
}

export function statusColor(lead: Lead) {
  if (lead.associateReady || lead.bucket === "ready") return "bg-emerald-500/15 text-emerald-300 border-emerald-400/40";
  if (lead.linkedinVerify || lead.bucket === "linkedinVerify") return "bg-indigo-500/15 text-indigo-300 border-indigo-400/40";
  if (lead.cpaVerify || lead.isCPA) return "bg-amber-500/15 text-amber-300 border-amber-400/40";
  return "bg-rose-500/15 text-rose-300 border-rose-400/40";
}

export function leadDisplayStatus(lead: Lead) {
  if (lead.associateReady || lead.bucket === "ready") return "Ready";
  if (lead.linkedinVerify || lead.bucket === "linkedinVerify") return "LinkedIn Verify";
  if (lead.cpaVerify || lead.isCPA) return "CPA Verify";
  return "Skipped";
}

export function getLeadContacts(lead: Lead) {
  return lead.contactMethods ?? [];
}

export function getLeadEvidence(lead: Lead) {
  return lead.evidenceTrail ?? [];
}

export function hasEmail(lead: Lead) {
  return getLeadContacts(lead).some((c) => c.type === "email" || c.value.includes("@"));
}

export function hasLinkedIn(lead: Lead) {
  return getLeadContacts(lead).some((c) => /linkedin/i.test(`${c.type} ${c.value}`));
}

export function formatNumber(value: number | undefined | null) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}
