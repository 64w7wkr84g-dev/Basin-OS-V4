# Basin OS V2.0 — Complete Visual + Functional Rebuild

This is the full clean replacement package. It is designed for deleting the old broken repo files and uploading one complete, cohesive system.

## What this rebuild includes

```text
1. One clean index.html
2. One app renderer: js/app.js
3. One visual system: css/styles.css
4. One GitHub Actions workflow: .github/workflows/radar.yml
5. One radar runner: basin-radar-runner.js
6. Valid starter JSON files
7. Lead Radar, Workflow, LinkedIn Verify, Investor Pipeline, CPA Pipeline, Call Notes, Follow-Up Calendar, Director Handoffs, Analytics, API Center, and Settings
8. Integrated call notes inside every full lead card
9. Printable director handoff sheet from every full lead card
10. Contact methods displayed directly on every lead card
11. Source filters across Ready, Research, LinkedIn, Email, Phone, RSS/Public, NPI, A Grade, Investor, and CPA
12. Automated runner enrichment through Brave public search
13. LinkedIn URL discovery without LinkedIn scraping
14. Ready/Research routing based on name, evidence, contact route, and score
```

## Delete old files first

Delete old files that are not part of this package:

```text
start.html
salesnav-npi-companion.html
lead-factory-importer.html
cleanup-bad-leads.html
index-snippet-add-before-body.html
README_V*.md patch files
old js/basin-v*.js hotfix files
old js/lead-factory-v6.js
old duplicate CSS files
```

You can also delete everything and then upload this ZIP, as long as you preserve the folder structure.

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

## Critical folder path

The workflow must be exactly here:

```text
.github/workflows/radar.yml
```

If it is not there, GitHub Actions will not show **Basin Radar Daily**.

## Required secret

```text
BRAVE_API_KEY
```

Optional:

```text
GROQ_API_KEY
```

## After upload

1. Open GitHub → Actions.
2. Select **Basin Radar Daily**.
3. Click **Run workflow**.
4. Wait for green.
5. Open:
   `https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v2-command`
6. Click **Load Shared GitHub Radar**.

## Compliance

The runner does not scrape LinkedIn pages. It only stores possible LinkedIn profile URLs returned by Brave public search. You manually open and verify profiles. No auto-send exists.
