# Basin OS V4.1 Clean Rebuild

This is a clean rebuild starter, not a monolithic extraction.

## What changed from the previous V4 upload

- Names are always visible in tables and cards.
- Leads Workflow has a proper visible A/B/C sorted table.
- Lead Radar and Leads Workflow share the same `Store.data.leads`.
- Shared radar attempts to load from:
  - `data/radar-leads.json`
  - `radar-leads.json`
  - old production repo `Basin-Os/data/radar-leads.json`
  - old production repo `Basin-Os/radar-leads.json`
- The UI is actually refreshed: tighter tables, toolbar filters, cleaner panels, and better contrast.
- Old Basin OS browser data can be imported from localStorage key `basin_os_integrated`.
- V4 stores new data under `basin_os_v4` so it does not overwrite the production OS.

## Upload to Basin-OS-V4 repo root

Upload these paths to the root of `Basin-OS-V4`:

- `index.html`
- `css/styles.css`
- `js/config.js`
- `js/store.js`
- `js/scoring.js`
- `js/radar.js`
- `js/ui.js`
- `js/app.js`
- `README.md`

## Test URL

https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=4.1-clean

## Important

This is the first true clean rebuild pass. It does not yet recreate every script from the production OS, but it fixes the unacceptable issues from the extraction build:
- invisible/dim names
- blank Leads Workflow
- same cluttered UI
- no usable data view
