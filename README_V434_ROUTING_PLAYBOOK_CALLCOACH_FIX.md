# Basin OS V4.3.4 — Routing + Playbook + Call Coach Fix

This package fixes the two problems found in the live site:

1. The uploaded runner was still V4.3.1, not the LinkedIn Verify fallback version.
2. Master Playbook still showed Option/Method A and was missing the full Method B library.
3. Call Coach was too thin and missing several live-call rebuttals/pivots.

## Minimum files to upload

Upload/replace these:

- basin-radar-runner.js
- .github/workflows/radar.yml
- radar.yml
- components/BasinOSApp.tsx
- package.json

## Lead routing fix

Named public/RSS/CPA/NPI candidates now route like this:

Candidate found
→ direct LinkedIn URL found: LinkedIn Verify
→ no direct LinkedIn URL: generate LinkedIn people-search route
→ LinkedIn Verify
→ manual verification required
→ then Ready for Associate only after email/phone/context are confirmed

NPI/MPI is still seed-only. It does not become Ready for Associate automatically.

## Master Playbook fix

Option A / Method A is removed from the rendered playbook.

Master Playbook now includes Method B scripts for:

- Aged 90+ day older inbound/reactivation leads
- New incoming/fresh inquiry leads
- Basin OS generated/public signal leads
- CPA / tax advisor referral leads

Each has:

- Email 1
- Email 2
- LinkedIn 1
- LinkedIn 2
- Phone script
- Voicemail
- SMS/Text

## Call Coach fix

Call Coach now includes live-call tools and expanded rebuttals, including:

- Opening discipline
- Compliance guardrails
- 30-second control path
- Bridge to director call
- Do-not-chase path
- CPA safety path
- Risk safety path
- Aged lead reframe
- Basin OS public signal reframe
- CPA referral reframe
- Not interested
- Send me info
- Talk to my CPA
- Risk
- Minimum
- Too busy
- Where did you get my info
- Tax shelter
- Guaranteed returns
- Already have advisor
- Bad oil and gas experience
- Call next quarter
- Remove me
- Not accredited
