import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>System Settings</CardTitle>
            <CardDescription>V4 removes browser API key storage. All Groq calls use the secure server route.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-basin-muted">
          <div className="rounded-2xl border border-basin-green/40 bg-basin-green/10 p-4 text-basin-text">
            <div className="font-black text-basin-green">Security Upgrade Complete</div>
            <p className="mt-2">
              The old localStorage Groq key workflow is deprecated. The browser calls <code className="font-mono">/api/groq</code>, and the server route uses <code className="font-mono">process.env.GROQ_API_KEY</code>.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0c141d] p-4">
            <div className="font-black text-basin-text">Required Environment Variables</div>
            <pre className="mt-3 whitespace-pre-wrap font-mono text-xs text-basin-muted">{`GROQ_API_KEY=...
BRAVE_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile`}</pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Deployment Reality Check</CardTitle>
            <CardDescription>GitHub Pages cannot run Next.js API routes.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-basin-muted">
          <p>
            Use Vercel, Netlify with Next runtime, or another Node-capable host for the V4 app. GitHub can still store the repository and run the radar workflow.
          </p>
          <p>
            If you deploy only to GitHub Pages, the secure <code className="font-mono">/api/groq</code> route will not execute.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
