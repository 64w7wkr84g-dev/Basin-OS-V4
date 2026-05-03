# Basin OS V7.3 — Priority No-Cap Lead Engine

This update corrects the philosophy:

```text
Do not cap what we find.
Do not cap what can become ready.
Prioritize higher-quality leads above weaker NPI-only seeds.
```

## Upload/replace all files

```text
index.html
js/lead-factory-v6.js
basin-radar-runner.js
.github/workflows/radar.yml
lead-factory-importer.html
README_V73_PRIORITY_NO_CAP_LEAD_ENGINE.md
data/.gitkeep
```

## What changed from V7.2

### 1. Removed the practical ready cap

V7.2 had:

```text
MAX_READY_TOTAL
MAX_READY_NPI_PHONE_ONLY
```

That was the wrong philosophy for your use case.

V7.3 keeps everything and sorts by quality instead.

### 2. Priority tiers added

Ready and prep records are ranked as:

```text
Tier 1 — Email + LinkedIn + Phone + Cross-Referenced
Tier 2 — Digital Route + Phone + Cross-Referenced
Tier 3 — Digital Route + Cross-Referenced
Tier 4 — Phone + Second Source
Tier 5 — NPI/Phone Seed Only
Prep — Needs Contact Route
```

### 3. NPI is still used, but not overvalued

NPI remains useful as an identity seed.

Correct NPI path:

```text
NPI seed
→ Brave/public search enrichment
→ look for LinkedIn candidate URL
→ look for email
→ look for practice/company website
→ look for public bio page
→ look for phone
→ assign priority tier
```

### 4. LinkedIn candidates rank higher

If an NPI lead has a candidate LinkedIn URL, it moves into:

```text
LinkedIn Verify
```

and ranks above plain NPI-only phone leads.

### 5. NPI phone-only leads are not deleted

They are kept, but they are lower priority unless enriched.

Default:

```text
NPI_PHONE_ONLY_READY = false
```

That means NPI phone-only goes to Contact Route Needed / prep until it has something better.

## Brave efficiency tweaks

V7.3 increases enrichment:

```text
PUBLIC_SEARCH_MAX = 300
ENRICH_NPI_LIMIT = 300
BRAVE_RESULT_COUNT = 8
```

The goal is to use Brave to rescue NPI seeds into better buckets instead of flooding the workflow with cold-call-only records.

## After upload

1. Confirm GitHub secret:

```text
BRAVE_API_KEY
```

2. Run:

```text
Actions → Basin Radar Daily → Run workflow
```

3. Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v73-priority-no-cap
```

4. Click:

```text
Reload Shared GitHub Radar
```

## Expected result

You should see:

```text
more LinkedIn candidates if Brave finds them
higher-quality leads ranked first
NPI-only records still stored but lower priority
no hard cap on found leads
no hard cap on ready leads
```
