import { promises as fs } from "fs";
import path from "path";
import type { Lead, RadarFile, RadarStats } from "@/types";

const fallbackStats: RadarStats = {
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
  groqFailures: 0,
  braveFailures: 0,
  braveConfigured: false,
  groqConfigured: false,
  errors: 0
};

const fallbackRadar: RadarFile = {
  generatedAt: null,
  engine: "Basin OS V4.1 empty fallback",
  compliance: {},
  routingRules: {},
  stats: fallbackStats,
  leads: [],
  linkedinVerifyCandidates: [],
  cpaVerifyCandidates: [],
  researchCandidates: [],
  skippedCandidates: [],
  allCandidates: [],
  errors: []
};

export async function getRadarData(): Promise<RadarFile> {
  const candidates = [
    path.join(process.cwd(), "public", "data", "radar-leads.json"),
    path.join(process.cwd(), "radar-leads.json")
  ];

  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as RadarFile;
      return {
        ...fallbackRadar,
        ...parsed,
        stats: { ...fallbackStats, ...(parsed.stats ?? {}) },
        leads: parsed.leads ?? [],
        linkedinVerifyCandidates: parsed.linkedinVerifyCandidates ?? [],
        cpaVerifyCandidates: parsed.cpaVerifyCandidates ?? [],
        researchCandidates: parsed.researchCandidates ?? [],
        skippedCandidates: parsed.skippedCandidates ?? [],
        allCandidates: parsed.allCandidates ?? []
      };
    } catch {}
  }
  return fallbackRadar;
}

export async function getAllLeads() {
  const radar = await getRadarData();
  const map = new Map<string, Lead>();
  for (const lead of [
    ...(radar.leads ?? []),
    ...(radar.linkedinVerifyCandidates ?? []),
    ...(radar.cpaVerifyCandidates ?? []),
    ...(radar.researchCandidates ?? []),
    ...(radar.allCandidates ?? [])
  ]) {
    if (lead?.id) map.set(lead.id, lead);
  }
  return Array.from(map.values());
}
