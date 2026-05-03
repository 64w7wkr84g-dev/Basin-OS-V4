# Basin OS V6 — Lead Factory CRM Upgrade

This package updates Basin OS from "raw lead collector" to a CRM-style lead qualification workflow.

## Safe/compliant behavior

This does **not** scrape LinkedIn or Sales Navigator.

It supports:
- public APIs/sources such as NPI and Google RSS
- manual profile links
- manual Sales Navigator / LinkedIn profile URLs
- manual CSV imports
- manually entered or corrected phone/email/LinkedIn
- clickable links so the associate opens the profile/source themselves

It does **not**:
- auto-view LinkedIn profiles
- auto-message
- bypass login/paywalls
- scrape LinkedIn pages
- claim accreditation is proven by public data

## Upload / replace

```text
basin-radar-runner.js
.github/workflows/radar.yml
lead-factory-importer.html
js/lead-factory-v6.js
README_V6_LEAD_FACTORY_CRM.md
```

Then add this line before `</body>` in `index.html`:

```html
<script src="js/lead-factory-v6.js?v=6"></script>
```

## How to use

1. Upload files.
2. Run GitHub Actions → Basin Radar Daily.
3. Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/lead-factory-importer.html
```

4. Click:

```text
Load Lead Factory from GitHub Radar JSON
```

5. Return to Basin OS and click the floating **Lead Factory** button.

## What associates get

Every full lead card shows:

- name
- title / role / specialty
- company / practice
- practice location
- why they fit
- accredited-likely reason
- evidence trail
- clickable contact methods
- editable phone/email/LinkedIn/company/source links
- notes
- disposition
- Day 1 through Day 10 workflow gating

## Contact/action routing

- Email exists → Email First / Day 1
- Direct LinkedIn exists → LinkedIn First / Day 1 manual action
- RSS/article verified phone → Call First / Day 1
- NPI phone only → Phone Verify first
- No contact → Research Needed

## Why this is better

NPI is no longer treated as a fully qualified investor lead by itself. It becomes a phone-verify candidate until email/direct LinkedIn or stronger evidence is added.

RSS signals are no longer thrown away. They become Research candidates until contact evidence is added.
