# Basin OS V6.5 — Lead Source Tabs for Leads Workflow

This build keeps the V6.4 auto-bridge fix and adds lead-source filtering directly inside **Leads Workflow**.

## What changed

Above Day 1, under the usable/active/filtered stats, the Leads Workflow now shows source/route tabs:

```text
All Sources
A Grade
Email First
LinkedIn Verified
LinkedIn Verify
NPI / Physicians
Phone / Call
RSS / Public News
Manual
Research
```

## Why this matters

You wanted a fast way to know which LinkedIn leads need immediate manual confirmation. The new **LinkedIn Verify** tab is that queue.

A LinkedIn candidate lead now stays in the Leads bucket with a preliminary grade. It does not disappear. It shows:

```text
Source: LinkedIn Verify
Preliminary grade
Score
Visible contact methods
Best next action
Verify LinkedIn button
Full CRM Card button
```

After you manually confirm the URL and paste the profile snapshot, the lead updates into the CRM and reroutes.

## Sorting

The default source priority is:

```text
Email First
LinkedIn Verified
LinkedIn Verify
NPI / Physicians
Phone / Call
RSS / Public News
Manual
Research
```

Inside each tab, leads are sorted highest score to lowest score.

## Upload/replace all files

```text
index.html
js/lead-factory-v6.js
basin-radar-runner.js
.github/workflows/radar.yml
lead-factory-importer.html
README_V65_SOURCE_TABS_LEADS_WORKFLOW.md
data/.gitkeep
```

## After upload

Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v65-source-tabs
```

Then go to:

```text
Leads Workflow
```

You should see the filter tabs above Day 1.
