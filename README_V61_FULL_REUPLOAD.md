# Basin OS V6.1 Full Reupload Package

Upload/replace ALL of these files exactly:

```text
index.html
js/lead-factory-v6.js
basin-radar-runner.js
.github/workflows/radar.yml
lead-factory-importer.html
README_V61_FULL_REUPLOAD.md
```

## What is fixed

The previous Lead Factory button loaded, but it did not import the GitHub radar JSON into browser storage. Your repo data already had:

```text
associateReady: 0
phoneVerify: 250
research: 60
```

The UI showed zero because the browser store was empty.

This V6.1 package fixes that by making `js/lead-factory-v6.js` auto-import:

```text
radar-leads.json
radar-phone-only-candidates.json
radar-research-candidates.json
```

and fall back to the embedded arrays inside `radar-leads.json` if the sidecar files do not load.

## Upload order

1. Upload `js/lead-factory-v6.js` into the existing `js` folder.
2. Upload `index.html` to the root.
3. Upload `basin-radar-runner.js` to the root.
4. Upload `lead-factory-importer.html` to the root.
5. Upload `.github/workflows/radar.yml` into `.github/workflows/`.

## After upload

Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=leadfactory61full
```

Then click the floating:

```text
Lead Factory
```

Expected current result:

```text
Associate Ready: 0
Phone Verify: about 250
Research: about 60
```

That is correct for the current data. Day 1 is empty because no warm-route email/direct LinkedIn leads were found yet. Phone Verify and Research are where the work is.

## To refresh data

Run:

```text
GitHub Actions → Basin Radar Daily → Run workflow
```

Then refresh the GitHub Pages URL above and click Lead Factory again.
