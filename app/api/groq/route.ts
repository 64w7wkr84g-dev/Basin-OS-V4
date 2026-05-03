import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractJsonObject, groqAnalyzeSchema, groqDraftSchema } from "@/lib/groq";

export const runtime = "nodejs";

const requestSchema = z.object({
  mode: z.enum(["draftSequence", "analyzeLead", "morningBrief", "directorHandoff"]).default("draftSequence"),
  linkedinBio: z.string().max(9000).optional().default(""),
  evidenceTrail: z.string().max(9000).optional().default(""),
  lead: z.any().optional(),
  context: z.string().max(12000).optional().default("")
});

const bucket = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 24;

function getClientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const entry = bucket.get(key);
  if (!entry || entry.resetAt < now) {
    bucket.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

async function callGroq(systemPrompt: string, userPrompt: string, maxTokens = 900) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Server GROQ_API_KEY is not configured.");
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) throw new Error(`Groq API failed: ${await response.text()}`);
  const json = await response.json();
  return json.choices?.[0]?.message?.content ?? "";
}

export async function POST(request: NextRequest) {
  try {
    if (!checkRateLimit(getClientKey(request))) {
      return NextResponse.json({ error: "Rate limit exceeded. Wait one minute and try again." }, { status: 429 });
    }

    const payload = requestSchema.parse(await request.json());

    if (payload.mode === "draftSequence") {
      if (!payload.linkedinBio || payload.linkedinBio.length < 20) {
        return NextResponse.json({ error: "Paste LinkedIn bio/about text before drafting." }, { status: 400 });
      }

      const systemPrompt = `You are a compliance-strict Oil & Gas investment SDR. Using the pasted LinkedIn bio and this public signal, draft a Day 1 outreach email offering our Beginner's Guide to NOWI (do NOT guarantee returns or give tax advice), and a Day 3 soft phone script. Output as strict JSON: { "email": "...", "call": "..." }.`;
      const userPrompt = `Lead JSON:\n${JSON.stringify(payload.lead || {}, null, 2)}\n\nEvidence Trail:\n${payload.evidenceTrail}\n\nLinkedIn Bio:\n${payload.linkedinBio}`;
      const content = await callGroq(systemPrompt, userPrompt, 1000);
      return NextResponse.json(groqDraftSchema.parse(extractJsonObject(content)));
    }

    if (payload.mode === "analyzeLead" || payload.mode === "directorHandoff") {
      const systemPrompt = `You are a compliance-strict Basin Ventures sales analyst. Return strict JSON only: { "summary": "...", "recommendedRoute": "...", "likelyObjection": "...", "directorBrief": "..." }. Do not guarantee returns, do not provide tax advice, and do not assume accredited status.`;
      const userPrompt = `Lead JSON:\n${JSON.stringify(payload.lead || {}, null, 2)}\n\nContext:\n${payload.context}\n\nEvidence:\n${payload.evidenceTrail}`;
      const content = await callGroq(systemPrompt, userPrompt, 900);
      return NextResponse.json(groqAnalyzeSchema.parse(extractJsonObject(content)));
    }

    if (payload.mode === "morningBrief") {
      const systemPrompt = `You are a compliance-strict sales operations assistant. Return plain text only. Give a concise morning brief with highest leverage actions, top verified leads, overdue follow-ups, and compliance reminders.`;
      const content = await callGroq(systemPrompt, payload.context, 900);
      return NextResponse.json({ brief: content });
    }

    return NextResponse.json({ error: "Unsupported mode." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown Groq proxy error." },
      { status: 500 }
    );
  }
}
