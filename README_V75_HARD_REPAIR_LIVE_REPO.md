# Basin OS V7.5 — Hard Repair Live Repo

This is the repair package for the live failure where:

```text
radar-leads.json was empty
data/radar-leads.json was empty
API Command Center still showed the old Groq-only block
Lead Radar / Leads Workflow could show zero because JSON was empty
```

## Upload/replace all files

```text
index.html
js/lead-factory-v6.js
basin-radar-runner.js
.github/workflows/radar.yml
radar-leads.json
data/radar-leads.json
radar-research-candidates.json
data/radar-research-candidates.json
radar-rejected.json
data/radar-rejected.json
data/radar-run-log.json
lead-factory-importer.html
README_V75_HARD_REPAIR_LIVE_REPO.md
data/.gitkeep
```

## Critical fixes

### 1. radar-leads.json is never empty

The runner always writes valid JSON to:

```text
radar-leads.json
data/radar-leads.json
radar-research-candidates.json
data/radar-research-candidates.json
data/radar-run-log.json
```

Even if a source fails, the files remain valid JSON and show the error.

### 2. Workflow verifies JSON before committing

The workflow now fails if radar JSON is empty or invalid.

### 3. API Command Center is patched directly in index.html

This no longer depends only on the external JS patch.

It shows:

```text
GROQ BROWSER
BRAVE GITHUB RUNNER
AI CALLS
```

and includes:

```text
Save / Connect Groq
Optional: Save Brave Test Key
Test Optional Brave Browser Key
Explain Brave vs Browser
```

### 4. Brave status is correct

Production Brave runs inside GitHub Actions through:

```text
BRAVE_API_KEY
```

The browser cannot read GitHub Secrets. Brave shows ON when the latest radar JSON reports:

```text
publicSearches > 0
```

### 5. RSS runs before NPI

RSS/public signals are collected first so NPI does not consume the enrichment budget before RSS gets a chance.

### 6. No hard cap

Everything found is retained. The system ranks by quality:

```text
Tier 1 — Email + LinkedIn + Phone + Cross-Referenced
Tier 2 — Digital Route + Phone + Cross-Referenced
Tier 3 — Digital Route + Cross-Referenced
Tier 4 — Phone + Second Source
Tier 5 — NPI/Phone Seed Only
Prep — Needs Contact Route
```

## After upload

Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v75-hard-repair
```

Then run:

```text
Actions → Basin Radar Daily → Run workflow
```

After the run is green, refresh the site and click:

```text
Reload Shared GitHub Radar
```

## Expected

```text
API Command Center shows the new live connection panel
Groq can be saved/connected from the browser
Brave shows ON once publicSearches > 0
radar-leads.json is no longer empty
Lead Radar no longer depends on empty localStorage
NPI is retained but ranked lower unless enriched
RSS/Public should have representation again
```
