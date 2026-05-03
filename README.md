# Basin OS V4.2 — Closed-Loop Full CRM Rebuild

This build corrects the lead-routing philosophy and removes the old V4 shell files.

## Correct lead flow

1. Discovery sources:
   - RSS/Public News
   - NPI seed records
   - CPA/tax-public searches
   - Brave public search
   - LinkedIn profile URLs found through Brave public search only

2. Brave enrichment:
   - email
   - phone
   - LinkedIn URL
   - public evidence trail

3. Routing:
   - Ready = real named person + email + phone + evidence/enrichment + score >= 58
   - LinkedIn Verify = LinkedIn URL exists but manual identity/contact verification is still needed
   - CPA Verify = CPA/referral path that needs review
   - Research / Enrich = partial route, not yet associate-ready
   - Skipped = no usable route

4. LinkedIn handling:
   - No LinkedIn page scraping.
   - The OS may store a public LinkedIn URL found through Brave/public search.
   - You open the URL manually, verify the person, paste the bio/context, and then generate compliant outreach through server-side Groq.

5. Playbook restored:
   - Method A
   - Method B
   - Day 1 through Day 10 cadence
   - Call coach
   - Rebuttals
   - 7-channel sequence builder

## Critical install rule

Delete old V4/V4.1 files before uploading this build. Old leftover files are why the wrong 4-button sidebar and missing playbook kept appearing.

Delete these old files if present:

components/AppShell.tsx
components/LeadVerificationBoard.tsx
components/LeadVerificationModal.tsx
components/KpiCard.tsx
components/ThemeToggle.tsx

The full CRM shell is now:

components/BasinOSApp.tsx

## Required Vercel environment variables

GROQ_API_KEY
BRAVE_API_KEY
GROQ_MODEL=llama-3.3-70b-versatile

## Required GitHub Actions secrets

BRAVE_API_KEY
GROQ_API_KEY

## Workflow path

.github/workflows/radar.yml

## After upload

1. Vercel should auto-deploy.
2. Open /api/health and confirm Groq + Brave true.
3. Run GitHub Action: Basin Radar Daily.
4. Confirm public/data/radar-leads.json has nonzero ready/linkedinVerify/cpaVerify/research.
5. Refresh Vercel and click Load Radar.
