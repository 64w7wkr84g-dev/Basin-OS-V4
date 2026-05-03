# Basin OS V4.1 — Full Migration Build

This is the complete V4.1 migration build for the secure Next.js version of Basin OS.

## Included modules

- Dashboard
- Lead Radar
- Leads Workflow
- LinkedIn Builder / Verify
- RSS Signal Monitor
- Investor Profiler
- CPA Profiler
- 7-Channel Sequence Builder
- Call Coach
- Call Notes attached to lead cards
- Director Handoff Sheets
- Follow-Up Calendar
- Analytics
- Master Playbook with Method A, Method B, cadence, rebuttals
- API Command Center
- Settings / Backup
- Secure server-side Groq proxy
- GitHub Actions radar runner

## Important

GitHub Pages cannot run this. Deploy to Vercel or another Next.js host.

## Required Vercel environment variables

GROQ_API_KEY
BRAVE_API_KEY
GROQ_MODEL=llama-3.3-70b-versatile

## Required GitHub Actions secrets

BRAVE_API_KEY
GROQ_API_KEY

## Install locally

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## Populate leads

In GitHub:

Actions -> Basin Radar Daily -> Run workflow

The workflow writes:

public/data/radar-leads.json
radar-leads.json

Then redeploy/refresh Vercel.

## Fresh install on Vercel

1. Delete old Vercel project or disconnect it if needed.
2. Upload this complete repo to GitHub.
3. Import the repo into Vercel.
4. Add environment variables.
5. Deploy.
6. Test `/api/health`.
7. Run GitHub Action.
8. Refresh the CRM.
