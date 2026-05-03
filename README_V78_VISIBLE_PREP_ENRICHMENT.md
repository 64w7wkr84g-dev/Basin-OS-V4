# Basin OS V7.8 — Visible Prep / Contact-Needed Candidates

Your live radar data shows:

```text
ready leads: 0
research/contact-needed candidates: 80
public searches: 500
NPI seeds: 80
```

The site looked empty because the Lead Radar and Lead Workflow pages were still only rendering associate-ready leads. V7.8 makes prep/contact-needed candidates visible and usable.

## Upload/replace all files

```text
index.html
js/lead-factory-v6.js
js/basin-v78-hotfix.js
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
README_V78_VISIBLE_PREP_ENRICHMENT.md
data/.gitkeep
```

## Fixes

```text
1. Lead Radar now renders prep/contact-needed candidates in Found Leads & Signals.
2. Leads Workflow now adds a Prep / Contact-Needed Candidates section when Day 1 is empty.
3. Each prep card shows name, title, location, contact methods, evidence, reason, and next action.
4. Open Full Lead Card works from prep candidates.
5. Move to Ready lets you manually promote a candidate once a usable contact route is confirmed.
6. API panel remains connected.
```

## After upload

Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v78-visible-prep
```

Then click:

```text
Load Shared GitHub Radar
```
