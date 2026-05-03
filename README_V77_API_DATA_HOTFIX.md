# Basin OS V7.7 — API + Data Visibility Hotfix

The live JSON currently has `leads: []` and `researchCandidates: 80`, so the old importer showed no visible leads because it only imported `raw.leads`.

V7.7 fixes that and inserts the API panel directly into the API Command Center HTML.

## Upload/replace all files

```text
index.html
js/lead-factory-v6.js
js/basin-v77-hotfix.js
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
README_V77_API_DATA_HOTFIX.md
data/.gitkeep
```

## After upload

Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v77-api-data-hotfix
```

Then click:

```text
Load Shared GitHub Radar
```

Expected with the current JSON:

```text
Ready: 0
Prep / Contact Needed: 80
Brave Searches: 500
NPI Seeds: 80
```
