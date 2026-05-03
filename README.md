# Basin OS V2.1 — Warm Route Priority Rebuild

This update fixes the problem shown in V2.0:

```text
Ready 136
LinkedIn 0
Email 0
Phone 252
```

That was wrong for the Basin cadence because Day 1 should start with email or LinkedIn whenever possible.

## V2.1 routing philosophy

```text
Ready = named person + email OR LinkedIn URL
Phone-only NPI = Phone Research / Warm Route Needed
LinkedIn URL = LinkedIn Verify or Ready, depending on score
Email = Email First / Ready
RSS/Public = Research unless enriched with warm route
```

## What changed

```text
1. Phone-only NPI no longer becomes true Day 1 Ready.
2. Brave runs harder for LinkedIn URLs and public emails.
3. Brave query budget increased from 450 to 900.
4. LinkedIn discovery budget increased from 80 to 120.
5. NPI phone-only leads remain visible but do not pollute the ready workflow.
6. Ready leads now better match the actual 7-stage cadence.
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

## Critical workflow file path

```text
.github/workflows/radar.yml
```

## Required GitHub secret

```text
BRAVE_API_KEY
```

Optional:

```text
GROQ_API_KEY
```

## After upload

1. GitHub → Actions → Basin Radar Daily → Run workflow.
2. Wait for green.
3. Open:
   `https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v2-1-warm-route`
4. Click **Load Shared GitHub Radar**.

## Expected result

Do not expect every lead to become Ready. That would be fake quality.

Expected healthy result:

```text
Ready = warm-route leads with email or LinkedIn
Research/Phone Queue = NPI phone-only records
LinkedIn Verify = public LinkedIn URLs that need manual confirmation
Email = public emails found by Brave
```

If LinkedIn and Email are still zero after this, the issue is either:
1. Brave is not returning public LinkedIn/profile/email results for the queries.
2. The Brave API key is not actually available to GitHub Actions.
3. The Action is still running an old runner file.
