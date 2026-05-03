# Basin OS V7.6 — Sidebar + API + Data Repair

V7.5 broke the sidebar because the hard-repair script was inserted inside a JavaScript string instead of before the real closing body tag. That caused the main inline script to stop parsing, so `goPage()` never loaded and sidebar buttons stopped working.

V7.6 fixes that by rebuilding from the last syntax-valid index and inserting the repair script safely before the final `</body>` only.

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
README_V76_SIDEBAR_API_DATA_REPAIR.md
data/.gitkeep
```

## Fixes

```text
1. Restores sidebar navigation / goPage().
2. Keeps the API Command Center live-status panel.
3. Keeps Groq Save / Connect.
4. Keeps Brave runner status.
5. Keeps non-empty valid radar JSON starter files.
6. Keeps the repaired runner and workflow that validate JSON before commit.
7. Keeps RSS-first and NPI enrichment logic.
```

## After upload

Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v76-sidebar-api-data
```

Then run:

```text
Actions → Basin Radar Daily → Run workflow
```

After green, refresh and click:

```text
Reload Shared GitHub Radar
```
