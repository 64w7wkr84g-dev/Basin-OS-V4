# Basin OS V2.2 — Closed Circuit Lead Routing

This version changes the lead operating system from "show me everything" to "show me only what can be worked."

## Closed-circuit buckets

```text
Ready
- Named person
- Email found
- Day 1 email-first cadence can start

LinkedIn Verify
- Named person
- LinkedIn URL found
- User opens LinkedIn manually
- User clicks Confirm Verified
- Lead moves to Ready

CPA Verify
- CPA/tax/referral candidate found
- Review for referral route
- Manually promote if useful

Skipped
- No email
- No LinkedIn URL
- No CPA/referral path
- Hidden from active workflow
```

## What this fixes

```text
1. Phone-only NPI records no longer clog the workflow.
2. NPI source volume is still counted, but unworkable records are skipped.
3. LinkedIn Verify becomes a real operational bucket.
4. Each LinkedIn Verify lead has Open LinkedIn and Confirm Verified actions.
5. CPA discovery is added through Brave public search.
6. Ready leads are stricter and should represent actual Day 1 usable leads.
7. C-grade phone-only records should no longer be the top Day 1 work list.
```

## Upload every file in this ZIP

```text
.github/workflows/radar.yml
index.html
package.json
basin-radar-runner.js
css/styles.css
js/app.js
data/radar-leads.json
data/radar-research-candidates.json
data/radar-rejected.json
data/radar-run-log.json
data/radar-state.json
radar-leads.json
radar-research-candidates.json
radar-rejected.json
README.md
```

## Required GitHub secret

```text
BRAVE_API_KEY
```

Optional:

```text
GROQ_API_KEY
```

## Workflow file path

```text
.github/workflows/radar.yml
```

## After upload

1. GitHub → Actions → Basin Radar Daily → Run workflow.
2. Wait for green.
3. Open:
   `https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v2-2-closed-circuit`
4. Click **Load Shared GitHub Radar**.

## If LinkedIn and Email still show zero

That means Brave is not returning those URLs or the Action is not receiving `BRAVE_API_KEY`. Check the Action logs for:

```text
braveConfigured: true
publicSearches: above 0
```
