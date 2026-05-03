# Basin OS V6.3 — Automated Lead Factory + Manual LinkedIn Verification CRM

Upload/replace every file in this package:

```text
index.html
js/lead-factory-v6.js
basin-radar-runner.js
.github/workflows/radar.yml
lead-factory-importer.html
README_V63_LEAD_FACTORY_AUTOMATION.md
data/.gitkeep
```

## What V6.3 does

### 1. Auto-populates Associate Ready leads

A record becomes associate-ready when it has:

```text
real person
real role/title/specialty
source evidence
at least one usable contact route
```

Contact route may be:

```text
Email
Confirmed LinkedIn URL
Candidate LinkedIn URL pending manual confirmation
Phone
NPI profile + practice phone
```

Phone-only NPI leads become:

```text
Call First / Verify
```

not hidden in a manual bucket.

### 2. LinkedIn Candidate URL finder

The GitHub runner can use optional public search keys:

```text
BRAVE_API_KEY
TAVILY_API_KEY
```

If a key exists, it looks for possible `linkedin.com/in/...` profile URLs in public search results.

It does **not**:
- open LinkedIn
- read LinkedIn pages
- scrape Sales Navigator
- auto-message
- auto-view profiles

It only stores:

```text
LinkedIn Candidate URL
Needs Manual Confirmation
```

### 3. Manual LinkedIn verification

Each lead has a LinkedIn Verification section:

```text
Open Manually
Confirm Match
Wrong Person
Replace URL
Paste Profile Snapshot
Parse Snapshot + Update CRM
```

After confirmation, the lead gets:

```text
LinkedIn Profile: Verified
Manual LinkedIn Confirmation evidence
LinkedIn First routing
```

### 4. Profile Snapshot Parser

You manually copy/paste visible LinkedIn/SalesNav text.

Basin parses it into:

```text
title
company/practice
location
profile summary
fit reason
accredited-likely reason
opener
Lead IQ notes
evidence trail
```

### 5. CRM lead card

Every full card includes:

```text
Name
Title / role / specialty
Company / practice
Practice location
Why they fit
Accredited-likely reason
All contact methods
Evidence trail
Workflow gating
Notes
Director handoff copy
```

### 6. AI order

The runner uses:

```text
GitHub Actions first
GitHub Models / Meta Llama first
Groq optional fallback if GROQ_API_KEY exists
Rules-only fallback if AI is unavailable
```

The browser does not burn Groq calls on refresh.

## After upload

Run:

```text
GitHub Actions → Basin Radar Daily → Run workflow
```

Then open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v63-lead-factory
```

Click:

```text
Lead Factory
```

If needed, force load browser data here:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/lead-factory-importer.html
```
