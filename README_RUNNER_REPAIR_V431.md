# Basin OS V4.3.1 Runner Repair

This package fixes the reason Basin Radar was finishing in ~28 seconds with zero active leads.

The previous runner was showing:
- braveFailures > 0
- groqFailures > 0
- NPI-only skipped records
- zero active candidates

This repair:
- Stops burning Groq calls on NPI-only records.
- Adds deterministic fallback parsing for RSS/Brave results when Groq fails.
- Uses simpler Brave queries that are less likely to fail.
- Adds firstBraveError, firstGroqError, firstRssError, and firstNpiError to radar JSON stats.
- Keeps NPI-only phone records skipped unless enriched.
- Routes LinkedIn URL results to LinkedIn Verify.
- Routes email + phone + evidence to Ready for Associate.
- Keeps the Day 1-10 lead workflow/dispositions from V4.3 Complete.

Upload/replace:
- basin-radar-runner.js
- .github/workflows/radar.yml
- radar.yml
- package.json

Full ZIP is provided so you can upload everything if needed.
