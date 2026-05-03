# Delete these from GitHub before uploading Basin OS V4.3 Complete

## Must delete old React/Next shell files

components/AppShell.tsx
components/LeadVerificationBoard.tsx
components/LeadVerificationModal.tsx
components/KpiCard.tsx
components/ThemeToggle.tsx

## Delete old static/patch files if present

start.html
salesnav-npi-companion.html
cleanup-bad-leads.html
lead-factory-importer.html
index-snippet-add-before-body.html

## Delete old duplicate radar files only if they are not in this package

Old root-level extras from the static GitHub Pages build should not remain unless this package includes them.

## Upload everything from this ZIP

The correct CRM shell is:

components/BasinOSApp.tsx

The correct workflow path is:

.github/workflows/radar.yml

The correct source data path is:

public/data/radar-leads.json
