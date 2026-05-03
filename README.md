# Basin OS V4 — Complete Fresh Build

This is a full Next.js V4 rebuild, not another static HTML patch.

## What changed

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn-style local UI primitives
- Secure `/api/groq` server route
- No browser/localStorage Groq key requirement
- GitHub Actions radar runner preserved
- Radar data written to `public/data/radar-leads.json`
- Lead verification Kanban
- Human-in-the-loop LinkedIn verification
- Groq-generated Day 1 email and Day 3 call script
- Compliance guardrails visible throughout

## Required environment variables

For the deployed Next.js app:

```bash
GROQ_API_KEY=your_key
BRAVE_API_KEY=your_key
GROQ_MODEL=llama-3.3-70b-versatile
```

For GitHub Actions secrets:

```text
BRAVE_API_KEY
GROQ_API_KEY
```

## Important deployment note

GitHub Pages cannot run Next.js API routes. Deploy the V4 app to Vercel, Netlify with Next runtime, or another Node-capable host. GitHub can still host the repository and run the radar workflow.

## Local test

```bash
npm install
npm run typecheck
npm run build
npm run radar
```

## Workflow path

```text
.github/workflows/radar.yml
```
