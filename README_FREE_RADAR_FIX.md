# Basin OS V4 Free Radar Fix

Upload these files to the root of Basin-OS-V4, replacing the existing files.

This replaces the Brave-only runner with a free-feed runner. It does not require BRAVE_API_KEY or Tavily.

After upload:

1. Go to Actions.
2. Open Basin Radar Daily.
3. Click Run workflow.
4. Wait for green.
5. Confirm `radar-leads.json` and `data/radar-leads.json` changed from `[]` / starter data into an object with a `leads` array.
6. Open the app with `?v=free-radar-fix`.
7. Click Lead Radar → Reload Shared GitHub Radar.
