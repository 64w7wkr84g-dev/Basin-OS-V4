# Basin OS V4.3 Complete — Closed-Circuit CRM

This is the complete upload package. It includes the V4.3 source routing/grade fix plus the full closed-circuit workflow.

## What this version does

### Lead discovery sources

- RSS / Google News / public free feeds
- NPI / MPI physician registry seed records
- CPA / tax advisor public searches
- LinkedIn profile URL discovery through Brave/public search
- Brave enrichment on every candidate

### Enrichment flow

Candidate found → normalize → Brave enrichment → check email → check phone → check LinkedIn URL → evidence trail → score/grade → route.

### Buckets

- Ready for Associate = real person + email + phone + evidence/enrichment + score >= 58
- LinkedIn Verify = LinkedIn URL exists but manual verification/contact enrichment is needed
- LinkedIn Verified = manually verified LinkedIn lead that has moved to Ready for Associate
- CPA Verify = CPA/referral candidate needing manual review
- CPA = CPA/referral route tag
- Research / Enrich = incomplete, not associate-ready
- Skipped = no usable route

### Source tags

Every lead can have multiple tags:

- Ready for Associate
- LinkedIn Verify
- LinkedIn Verified
- CPA
- CPA Verify
- RSS/Public
- NPI/MPI
- Email
- Phone
- A Grade
- B Grade
- C Grade
- Research / Enrich

No D/E/F work tabs.

### Day 1-10 workflow

Only Ready for Associate leads enter the Day 1-10 workflow.

Every lead card includes:

- Current cadence day
- Required daily checklist
- Disposition dropdown
- Note field
- Next follow-up date
- Advance to next day button
- Director handoff button
- LinkedIn manual verify and Groq draft flow
- Call history and attached notes

## Delete old files from GitHub before upload

Delete these if present:

components/AppShell.tsx
components/LeadVerificationBoard.tsx
components/LeadVerificationModal.tsx
components/KpiCard.tsx
components/ThemeToggle.tsx

Delete old duplicate HTML pages if present:

start.html
salesnav-npi-companion.html
cleanup-bad-leads.html
lead-factory-importer.html
index-snippet-add-before-body.html

You should upload this package as a clean Next.js app.

## Keep/upload these

app/
components/
components/ui/
lib/
types/
public/data/
.github/workflows/radar.yml
basin-radar-runner.js
package.json
tailwind.config.ts
tsconfig.json
next.config.mjs
postcss.config.mjs
README.md
.env.example

## Vercel env vars

GROQ_API_KEY
BRAVE_API_KEY
GROQ_MODEL=llama-3.3-70b-versatile

## GitHub Action secrets

BRAVE_API_KEY
GROQ_API_KEY

## Install

1. Delete the old files listed above from GitHub.
2. Upload every file from this ZIP.
3. Commit to main.
4. Vercel should redeploy.
5. Confirm /api/health shows groqConfigured and braveConfigured true.
6. Run GitHub → Actions → Basin Radar Daily → Run workflow.
7. Confirm public/data/radar-leads.json has a current generatedAt.
8. Refresh Vercel and click Load Radar.
