import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    app: "Basin OS V4.1",
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    braveConfigured: Boolean(process.env.BRAVE_API_KEY),
    timestamp: new Date().toISOString()
  });
}
