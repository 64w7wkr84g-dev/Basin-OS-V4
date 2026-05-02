# Basin OS V4.2 Last Stable Before Redesign

This package restores the last stable build before the V5 redesign/iframe/shell work broke the app.

## Upload these files to the root of `Basin-OS-V4`

Upload everything in this ZIP.

## Important: delete or ignore broken V5 files

After upload, delete these from the repo if they exist:

```text
app-core.html
css/mission-control.css
js/mission-control.js
README_V5_MISSION_CONTROL_SHELL.md
README_CORE_ROUTING_REAL_FIX.md
README_HARD_ROUTING_FIX.md
README_REMOVE_DOUBLE_SHELL.md
README_SINGLE_APP_FINAL_FIX.md
```

Those files came from the failed redesign shell attempts and should not be used.

## Files restored

```text
index.html
salesnav-npi-companion.html
start.html
basin-radar-runner.js
package.json
radar-leads.json
radar-rejected.json
radar-sources.json
data/radar-leads.json
data/radar-rejected.json
data/radar-run-log.json
.github/workflows/radar.yml
css/README.md
js/README.md
```

## Test URL

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v42-restore
```

## After upload

1. Open the test URL.
2. Confirm the original stable Basin OS loads.
3. Go to API Command Center and reconnect/save Groq if needed.
4. Go to Actions → Basin Radar Daily → Run workflow.
5. After it finishes, click Lead Radar → Reload Shared GitHub Radar.

## Source index

Restored index source: `index.html`  
Index SHA256: `b522f07c3e411e6126dacc7e4410732c9489638a6ac021955205189c519cc20f`
