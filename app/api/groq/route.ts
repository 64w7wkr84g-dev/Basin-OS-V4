import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractJsonObject, groqDraftSchema } from "@/lib/groq";

export const runtime = "nodejs";

const requestSchema = z.object({
  mode: z.enum(["draftSequence", "analyzeLead"]).default("draftSequence"),
  linkedinBio: z.string().min(20).max(8000),
  evidenceTrail: z.string().max(8000).default(""),
  lead: z.object({
    id: z.string(),
    name: z.string().nullable(),
    company: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    signal: z.string().optional(),
    summary: z.string().optional(),
    fitReason: z.string().optional(),
    score: z.number().optional(),
    grade: z.string().optional(),
    isCPA: z.boolean().optional()
  })
});

const bucket = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 18;

function getClientKey(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const entry = bucket.get(key);
  if (!entry || entry.resetAt < now) {
    bucket.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    return NextResponse.json({ error: "Server GROQ_API_KEY is not configured." }, { status: 500 });
  }

  const clientKey = getClientKey(request);
  if (!checkRateLimit(clientKey)) {
    return NextResponse.json({ error: "Rate limit exceeded. Wait one minute and try again." }, { status: 429 });
  }

  let payload: z.infer<typeof requestSchema>;

  try {
    payload = requestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request payload.", detail: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  const systemPrompt =
    `You are a compliance-strict Oil & Gas investment SDR. Using the pasted LinkedIn bio and this public signal, draft a Day 1 outreach email offering our Beginner's Guide to NOWI (do NOT guarantee returns or give tax advice), and a Day 3 soft phone script. Output as strict JSON: { "email": "...", "call": "..." }.`;

  const userPrompt = `
Lead:
Name: ${payload.lead.name ?? "Unknown"}
Title: ${payload.lead.title ?? "Unknown"}
Company: ${payload.lead.company ?? "Unknown"}
Signal: ${payload.lead.signal ?? payload.lead.summary ?? ""}
AI fitReason: ${payload.lead.fitReason ?? ""}
Score/Grade: ${payload.lead.score ?? "N/A"} / ${payload.lead.grade ?? "N/A"}
CPA Flag: ${payload.lead.isCPA ? "true" : "false"}

Evidence Trail:
${payload.evidenceTrail}

Pasted LinkedIn Bio:
${payload.linkedinBio}
`.trim();

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!groqResponse.ok) {
      const text = await groqResponse.text();
      return NextResponse.json({ error: "Groq API request failed.", detail: text }, { status: 502 });
    }

    const json = await groqResponse.json();
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = groqDraftSchema.parse(extractJsonObject(content));

    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to generate outreach draft.", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
