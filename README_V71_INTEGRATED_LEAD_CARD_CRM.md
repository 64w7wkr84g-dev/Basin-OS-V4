# Basin OS V7.1 — Integrated Lead Card CRM

This build includes the V7.0 count/API status fix and adds the CRM integration layer you requested.

## Upload/replace all files

```text
index.html
js/lead-factory-v6.js
basin-radar-runner.js
.github/workflows/radar.yml
lead-factory-importer.html
README_V71_INTEGRATED_LEAD_CARD_CRM.md
data/.gitkeep
```

## What V7.1 adds

### 1. Lead card becomes the operating hub

Every lead card can now show an attached CRM hub with:

```text
current cadence day
next follow-up
handoff status
call note form
disposition
outcome/objection
next follow-up date/time
attached note history
director handoff buttons
```

### 2. Call notes attach directly to the lead

You can add notes from the opened lead card.

Saved notes include:

```text
lead ID
lead name
cadence day
disposition
outcome / objection
next follow-up
note text
timestamp
```

The separate Call Notes page remains, but now acts as a searchable note library.

### 3. Notes update the lead status

Disposition controls what happens:

```text
No Answer / Left Voicemail
→ advances to next cadence day and creates follow-up

Sent Email / LinkedIn Touch
→ advances to next cadence day and creates follow-up

Callback
→ moves lead to callback and creates follow-up

Interested / Director Handoff Needed
→ marks handoff needed and moves lead to director-ready

Needs Research
→ moves lead back to research

Not Interested / Remove
→ moves lead to not interested / suppressed
```

### 4. Follow-up dashboard integration

When a note is saved with a follow-up date/time, it creates a follow-up item.

The Follow-Up Dashboard now shows follow-ups generated from lead cards.

### 5. Director handoff from lead card

Inside the lead CRM hub:

```text
Copy Director Handoff
Print Director Handoff
Save Handoff
```

The handoff pulls:

```text
name
title / role / specialty
company / practice
location
grade / score
best contact route
next action
fit reason
accredited-likely reason
source confidence
evidence trail
contact methods
recent notes
compliance reminders
```

### 6. Director Handoffs page integration

Saved handoffs appear in the Director Handoffs section.

### 7. Brave efficiency settings retained

The runner keeps Brave enrichment and balancing:

```text
BRAVE_API_KEY from GitHub Secrets
PUBLIC_SEARCH_MAX
ENRICH_NPI_LIMIT
MAX_READY_TOTAL
MAX_READY_NPI_PHONE_ONLY
NPI_BACKLOG_LIMIT
```

## Brave / API reminder

Brave runs inside GitHub Actions. The browser cannot read GitHub Secrets.

Make sure this secret exists:

```text
BRAVE_API_KEY
```

Then run:

```text
Actions → Basin Radar Daily → Run workflow
```

After it finishes green, open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v71-crm
```

Then click:

```text
Reload Shared GitHub Radar
```

## Expected workflow

```text
Lead Radar finds/enriches lead
↓
Lead appears in Ready to Work or prep queue
↓
Associate opens CRM Hub from the lead card
↓
Associate logs call/touch note
↓
System updates cadence, next follow-up, and disposition
↓
If interested, director handoff is copied/printed/saved from the same lead card
```
