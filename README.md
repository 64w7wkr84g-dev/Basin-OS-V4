# Basin OS V4.2 Feature-Parity Rebuild Baseline

This package is the correct V4 direction: **feature parity first**, redesign second.

It uses the latest feature-rich production index as the source of truth, including:

- Dashboard
- Master Playbook
- Lead Radar
- Leads Workflow
- Investor Pipeline
- CPA Pipeline
- LinkedIn Builder
- RSS Signal Monitor
- Investor Profiler
- CPA Profiler
- CPA Finder
- Call Coach
- Call Notes
- Call Analytics
- Follow-Up Dashboard
- Appointment Calendar
- Director Handoffs
- 7-Channel Sequence Builder
- CPA Activation Sequence
- Referral Logger
- InMail Queue button support
- Morning Brief
- API Command Center
- Settings
- Export / Import Backup
- GitHub shared radar loading
- SalesNav + NPI embedded page

## Why CSS/JS are not fully split yet

The last modular extraction stripped or weakened functionality. V4.2 intentionally keeps the production runtime inside `index.html` so every working feature stays present.

The `css/` and `js/` folders are included as migration placeholders. After this baseline is confirmed working, the next step is moving one module at a time without deleting features.

## Upload to Basin-OS-V4 repo root

Upload the contents of this folder to the root of `Basin-OS-V4`.

Required files:

- `index.html`
- `salesnav-npi-companion.html`
- `start.html`
- `data/.gitkeep`
- `css/README.md`
- `js/README.md`
- `README.md`

## Test URL

https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=4.2-feature-parity

## Source hashes

Base index SHA256:

`06fe2c1d2a701cc2768f7e6ee0d284071ff5f74ae8d85ace7b6f4e024e4ec882`

Generated index SHA256:

`6f71a5491ebbfa084d4bc1cf1e5aaa2889621ddc3de496f55e54b84d14f5ba2a`

## Validation

Node syntax check on embedded scripts:

[(0, 0, ''), (1, 0, ''), (2, 0, '')]
