# Basin OS V4.3.5 — Enrichment Ladder + Ready for Associate Fix

This update addresses the core issue: too many leads were found but not enriched far enough to become usable for an associate.

## Backend radar runner

Adds an Enrichment Ladder before final routing:

1. Public/RSS/CPA/NPI candidate found
2. Multi-pass Brave enrichment:
   - name + company + email
   - name + company + phone
   - name + company + LinkedIn
   - name + title + location + LinkedIn
   - name + company + contact
   - name + company + bio
   - name + company + practice
   - name + company + site:linkedin.com/in
3. Website/domain extraction
4. Contact-page checks
5. Extracts verified public email/phone where available
6. Adds possible email patterns as possible_email only
7. Adds generated LinkedIn search route if direct LinkedIn profile is not found
8. Re-routes based on usable contact route

## New Ready for Associate rule

Ready for Associate no longer requires email + phone every time.

A lead can become Ready when it has:

- real person name
- evidence/context
- score >= 58
- verified email OR direct LinkedIn profile

Ready channels:

- Ready — Phone + Email
- Ready — Email First
- Ready — LinkedIn First
- Ready — CPA Referral

Generated LinkedIn people-search routes do NOT count as Ready. They stay in LinkedIn Verify.

## One-click enrichment

Adds:

app/api/enrich/route.ts

Lead cards now include:

Run Enrichment Again

This searches public sources for that individual lead and updates the lead card automatically.

## Minimum files to upload

- basin-radar-runner.js
- .github/workflows/radar.yml
- radar.yml
- app/api/enrich/route.ts
- components/BasinOSApp.tsx
- types/index.ts
- lib/utils.ts
- package.json
