# Basin OS V6.7 — Ready to Work Cadence Fix

This build connects the source filters, lead workflow, lead cards, and the official Basin Day 1–10 cadence.

## Main fixes

### 1. Ready to Work is now the true associate queue

The system no longer uses confusing buckets like:

```text
Call First / Verify
Phone Verify
Phone / Call Verify
```

Phone is a **best contact route**, not a bucket.

A lead is Ready to Work when it has:

```text
real person
role/title/specialty
evidence trail
preliminary grade
reliable contact route
best Day 1 action
```

Best contact routes inside Ready to Work:

```text
Email
LinkedIn
Phone
```

### 2. Prep queues stay separate

Records that are not ready stay in prep queues:

```text
LinkedIn Verify
Contact Route Needed
Research Needed
Suppressed
```

### 3. Official Basin cadence added

Ready-to-work leads now use the official cadence:

```text
Day 1 — Evidence-Based Email / LinkedIn Touch
Day 2 — Research-Based Intro Call / Signal Reminder
Day 3 — LinkedIn Touch / Engagement Follow-Up
Day 4 — Credibility Angle
Day 5 — Value Follow-Up / Overview Send
Day 6 — Final Research-Based Call
Day 7 — Light Touch / Objection-Aware Follow-Up
Day 8 — Nurture Decision / Future Timing Check
Day 9 — Final Review / Director-Call Push
Day 10 — Longer-Term Permission Call
```

Your exact Day 2, Day 4, Day 6, and Day 10 call scripts are included. Day 1 is now email/LinkedIn-first by default, with phone only after proper evidence review or on high-confidence signals.

### 4. Source filters remain connected

Tabs:

```text
Ready to Work
Ready: Email
Ready: LinkedIn
Ready: Phone
A Grade
LinkedIn Verify
Contact Route Needed
Research Needed
NPI / Physicians
RSS / Public News
Manual
Suppressed
All Records
```

### 5. System integration

V6.7 syncs the same lead state across:

```text
radarLeads
leadFactory.leads
leadFactory.research
leads
leadWorkflow
dashboard counters
Lead Radar
Leads Workflow
Full CRM Card
Director handoff copy
```

## Upload/replace all files

```text
index.html
js/lead-factory-v6.js
basin-radar-runner.js
.github/workflows/radar.yml
lead-factory-importer.html
README_V67_READY_TO_WORK_CADENCE.md
data/.gitkeep
```

## After upload

Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v67-ready-work
```

Then go to:

```text
Leads Workflow
```

Default tab should be:

```text
Ready to Work
```
