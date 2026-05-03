# Basin OS V6.9 — Brave Enabled Complete Package

This is the full re-upload package.

## Upload/replace all files

```text
index.html
js/lead-factory-v6.js
basin-radar-runner.js
.github/workflows/radar.yml
lead-factory-importer.html
README_V69_BRAVE_ENABLED_COMPLETE.md
data/.gitkeep
```

## Important GitHub Secret

You said you now have the Brave API key. Add it here:

```text
GitHub repo → Settings → Secrets and variables → Actions → New repository secret
```

Secret name:

```text
BRAVE_API_KEY
```

Secret value:

```text
paste your Brave API key
```

Do not paste the Brave key into the browser UI or into the code.

## What V6.9 does

### 1. Uses Brave Search in the GitHub runner

The runner uses:

```text
BRAVE_API_KEY
```

to enrich NPI/RSS candidates with public web search results.

It looks for:

```text
candidate LinkedIn URLs
practice websites
company websites
public bio pages
public email if available
public phone if available
second-source evidence URLs
```

### 2. Keeps LinkedIn safe

The system does not:

```text
open LinkedIn
read LinkedIn pages
scrape Sales Navigator
auto-view profiles
auto-message
```

It only stores a candidate LinkedIn URL when found in public search results.

Manual workflow:

```text
LinkedIn Candidate URL
→ user opens manually
→ user confirms/rejects
→ user pastes profile snapshot if wanted
→ CRM card updates
```

### 3. Prevents NPI flooding

NPI is now an identity seed, not the whole lead.

Ready-to-work caps:

```text
MAX_READY_TOTAL = 175
MAX_READY_NPI_PHONE_ONLY = 50
ENRICH_NPI_LIMIT = 120
NPI_BACKLOG_LIMIT = 500
```

Extra NPI-only records go to:

```text
NPI Candidate Backlog / Research
```

They are not deleted.

### 4. Adds source confidence labels

Lead cards show labels such as:

```text
High — Email + cross-referenced evidence
High — LinkedIn verified + cross-referenced evidence
Medium — Reliable phone + second source
Phone Route Only — single-source evidence
Needs Manual LinkedIn Confirmation
Contact route needed — cross-referenced but no route
Single Source — needs enrichment
```

### 5. Uses the official Basin cadence

Ready-to-work leads follow:

```text
Day 1 — Evidence-Based Email / LinkedIn Touch
Day 2 — Research-Based Intro Call / Signal Reminder
Day 3 — LinkedIn Touch / Engagement Follow-Up
Day 4 — Credibility Angle
Day 5 — Value Follow-Up / Overview Send
Day 6 — Final Research-Based Call
Day 7 — Light Touch / Objection-Aware Follow-Up
Day 8 — Nurture Decision / Future Timing Check
Day 9 — Final Review / Director-Call Push
Day 10 — Longer-Term Permission Call
```

## After upload

Run:

```text
Actions → Basin Radar Daily → Run workflow
```

After it finishes green, open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v69-brave
```

Then click:

```text
Reload Shared GitHub Radar
```

## Expected result after Brave is active

You should see:

```text
more LinkedIn Verify candidates
more public website/bio evidence
more cross-referenced leads
fewer NPI-only leads flooding Ready to Work
better Source Confidence labels
```
