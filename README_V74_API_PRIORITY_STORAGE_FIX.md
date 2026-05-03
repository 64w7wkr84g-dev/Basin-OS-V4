# Basin OS V7.4 — API Priority Storage Fix

This is the hard fix for the issues still visible after V7.3.

## Upload/replace all files

```text
index.html
js/lead-factory-v6.js
basin-radar-runner.js
.github/workflows/radar.yml
lead-factory-importer.html
README_V74_API_PRIORITY_STORAGE_FIX.md
data/.gitkeep
```

## Fixes

### 1. API Command Center now shows the correct panel

Old Groq-only blocks are hidden and replaced with:

```text
GROQ BROWSER
BRAVE GITHUB RUNNER
AI CALLS
```

Buttons:

```text
Save / Connect Groq
Optional: Save Brave Test Key
Test Optional Brave Browser Key
Explain Brave
```

Important:

```text
Brave production key is BRAVE_API_KEY in GitHub Actions Secrets.
The browser cannot read GitHub Secrets.
Public Searches > 0 proves the runner used Brave/public search.
```

### 2. A-grade / high-priority leads forced to sort higher

The old day renderer was still sorting by old local order. V7.4 forces DOM ordering so A-grade and digitally enriched leads appear first.

### 3. Storage quota guard

The flashing localStorage save failure was likely quota pressure from repeated large radar payloads.

V7.4 trims stored local payloads while keeping the GitHub JSON as the full source of truth.

### 4. More Brave enrichment

Defaults increased:

```text
PUBLIC_SEARCH_MAX = 500
ENRICH_NPI_LIMIT = 500
BRAVE_RESULT_COUNT = 10
RSS_FIRST = true
```

### 5. RSS gets first shot

The runner now collects RSS/public signals before NPI so public search budget does not get consumed entirely by NPI.

## After upload

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v74-api-priority-storage
```

Then run:

```text
Actions → Basin Radar Daily → Run workflow
```

After green:

```text
Reload Shared GitHub Radar
```

## Expected

```text
API page shows new correct panel at the top
Groq can be connected from that panel
Brave runner status shows public searches after Actions run
A-grade/high-priority leads sort first
localStorage save errors should stop
RSS/Public should no longer be starved by NPI
```
