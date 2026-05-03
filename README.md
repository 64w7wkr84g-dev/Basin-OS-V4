# Basin OS Clean Rebuild v1.0

This is a full clean rebuild. It removes the patch stack, old duplicate pages, iframe-style double system, and blinking render loops.

## Upload everything in this ZIP

Recommended GitHub Pages structure:

```text
index.html
package.json
basin-radar-runner.js
.github/workflows/radar.yml
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
```

Delete old files that are no longer needed:

```text
start.html
salesnav-npi-companion.html
lead-factory-importer.html
cleanup-bad-leads.html
index-snippet-add-before-body.html
any README_V7*.md / README_V8*.md patch files
old js/basin-v*.js hotfix files
old js/lead-factory-v6.js
old css files not named css/styles.css
```

## Required GitHub Secret

```text
BRAVE_API_KEY
```

Optional:

```text
GROQ_API_KEY
```

## After upload

1. Go to GitHub → Actions → Basin Radar Daily → Run workflow.
2. Wait for green.
3. Open GitHub Pages:
   `https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=clean-rebuild-v1`
4. Click **Load Shared GitHub Radar**.

## Important behavior

- The website does not scrape LinkedIn.
- The runner may find LinkedIn profile URLs through Brave public search.
- You manually open/verify LinkedIn profiles.
- A lead is not associate-ready unless it has a real person and a usable contact route or enough verified evidence.
- NPI-only records stay in Research until enriched.
- No auto-sending.
- Manual review is required before outreach.
