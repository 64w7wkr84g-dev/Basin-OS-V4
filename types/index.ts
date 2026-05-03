export type LeadGrade = "A" | "B" | "C" | "D";
export type LeadBucket = "ready" | "linkedinVerify" | "cpaVerify" | "skipped" | "research";
export type ContactType = "email" | "phone" | "linkedin" | "website" | "other";

export interface ContactMethod {
  type: ContactType | string;
  value: string;
  source?: string;
}

export interface EvidenceItem {
  source: string;
  url?: string;
  whatItProves?: string;
  capturedAt?: string;
}

export interface Lead {
  id: string;
  name: string | null;
  company: string | null;
  title: string | null;
  isPerson: boolean;
  isCPA: boolean;
  score: number;
  grade: LeadGrade;
  fitReason: string;
  source?: string;
  sourceType?: string;
  sourceUrl?: string;
  signal?: string;
  summary?: string;
  location?: string;
  type?: "investor" | "cpa";
  contactMethods?: ContactMethod[];
  evidenceTrail?: EvidenceItem[];
  accreditedLikelyReason?: string;
  associateReady?: boolean;
  linkedinVerify?: boolean;
  cpaVerify?: boolean;
  skipped?: boolean;
  bucket?: LeadBucket | string;
  status?: string;
  workflowDay?: number;
  bestFirstAction?: string;
  generatedEmail?: string;
  generatedCall?: string;
  linkedinBio?: string;
  notes?: LeadNote[];
  foundAt?: string;
}

export interface LeadNote {
  id: string;
  leadId: string;
  leadName: string;
  note: string;
  disposition?: string;
  at: string;
}

export interface RadarStats {
  totalFound: number;
  activeVisible: number;
  readyToWork: number;
  linkedinVerify: number;
  cpaVerify: number;
  skipped: number;
  npiCollected: number;
  rssCollected: number;
  linkedinDiscoveryCollected: number;
  cpaCollected: number;
  emailFound: number;
  linkedinCandidatesFound: number;
  phoneFound: number;
  publicSearches: number;
  groqCalls: number;
  groqFailures?: number;
  braveFailures?: number;
  braveConfigured: boolean;
  groqConfigured: boolean;
  errors: number;
}

export interface RadarFile {
  generatedAt: string | null;
  engine: string;
  compliance?: Record<string, string>;
  routingRules?: Record<string, string>;
  stats: RadarStats;
  leads: Lead[];
  linkedinVerifyCandidates: Lead[];
  cpaVerifyCandidates: Lead[];
  researchCandidates: Lead[];
  skippedCandidates: Lead[];
  allCandidates: Lead[];
  errors: Array<{ source: string; reason: string; name?: string }>;
}

export interface GroqDraftResponse {
  email: string;
  call: string;
}

export interface GroqProxyRequest {
  lead: Lead;
  linkedinBio: string;
  evidenceTrail: string;
  mode: "draftSequence" | "analyzeLead";
}
