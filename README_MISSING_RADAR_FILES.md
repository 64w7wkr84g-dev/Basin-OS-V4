# Basin OS V4 Missing Radar Files

Upload the contents of this ZIP to the root of `Basin-OS-V4`.

## Files included

```text
basin-radar-runner.js
package.json
radar-leads.json
radar-rejected.json
radar-sources.json
data/radar-leads.json
data/radar-rejected.json
data/radar-run-log.json
.github/workflows/radar.yml
```

## Important

The included `radar-leads.json` files are valid starter files with zero leads. They stop 404/load failures.

To generate real leads:

1. Add repo secret if using the current runner:
   - `BRAVE_API_KEY`
   - Optional: `GROQ_API_KEY`

2. Go to:
   `Basin-OS-V4 → Actions → Basin Radar Daily → Run workflow`

3. After the Action runs, it should overwrite:
   - `radar-leads.json`
   - `data/radar-leads.json`

4. Then open:
   `https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=radar-files-loaded`

5. Click:
   `Lead Radar → Reload Shared GitHub Radar`

## If you want to use only free feeds

The current runner file available in this package is the Brave/Groq-capable runner from the previous Basin OS work. If you want the newer all-free RSS/GDELT runner, that is a separate update to `basin-radar-runner.js` and `radar.yml`.
