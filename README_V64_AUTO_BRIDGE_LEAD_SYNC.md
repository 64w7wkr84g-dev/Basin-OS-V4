# Basin OS V6.4 — Auto Bridge Lead Sync Fix

This build fixes the issue shown in your screenshots:

- Radar has records.
- Nurture drafts show records.
- Dashboard and Leads Workflow still show 0.

The root problem was that the app had multiple buckets:
- `radarLeads`
- `leadFactory.leads`
- `leadWorkflow`
- dashboard counters
- local browser radar queues

The prior builds populated some buckets but not all of the legacy buckets the existing UI reads.

## What V6.4 changes

V6.4 automatically bridges records into the working Lead bucket.

On page load, and after running/reloading radar, it now syncs:

```text
GitHub radar JSON
+ local browser radar results
+ Lead Factory leads
+ draft/action-plan records
→ radarLeads
→ leadFactory.leads
→ leads
→ leadWorkflow
→ dashboard counters
```

## Lead bucket logic

Everything workable goes into Leads Workflow with a preliminary grade:

```text
Email found                  → Email First
Verified LinkedIn URL        → LinkedIn First
Candidate LinkedIn URL       → LinkedIn Verify
Phone / NPI phone found      → Call First / Verify
No usable route              → Research Needed
```

LinkedIn candidate records are not suppressed. They appear as leads with a preliminary grade and the first action:

```text
LinkedIn Verify
```

After you manually confirm the LinkedIn URL and paste the profile snapshot, the CRM card updates and reroutes the lead.

## Upload/replace all files

```text
index.html
js/lead-factory-v6.js
basin-radar-runner.js
.github/workflows/radar.yml
lead-factory-importer.html
README_V64_AUTO_BRIDGE_LEAD_SYNC.md
data/.gitkeep
```

## After upload

Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v64-auto-bridge
```

Then either:

1. Wait 3 to 7 seconds for auto-bridge to run, or
2. Click Lead Radar → Run Local Browser Radar, or
3. Click Reload Shared GitHub Radar.

You should no longer have to click Lead Factory just to make Leads Workflow populate.

## Important

Your current GitHub `radar-leads.json` file may be blank from the previous workflow run. V6.4 can still bridge local browser radar results into Leads Workflow, but you should run:

```text
Actions → Basin Radar Daily → Run workflow
```

to regenerate the shared JSON.
