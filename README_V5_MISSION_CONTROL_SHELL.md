# Basin OS V5 Mission Control Shell

This is the safe redesign architecture.

## What changed

- `index.html` is the new Mission Control redesign.
- `app-core.html` is the last working Groq-only Basin OS index preserved intact.
- The redesigned shell reads the same browser localStorage data and displays a high-tech command center.
- When you click Lead Radar, Leads Workflow, Call Coach, API Command, etc., the working core page opens inside the redesigned shell.
- This avoids breaking the monolithic production logic while giving the OS a real new command-center experience.

## Upload to Basin-OS-V4 root

Upload:

- index.html
- app-core.html
- salesnav-npi-companion.html
- css/mission-control.css
- js/mission-control.js

Do not replace the radar runner, workflow, package, or JSON files.

## Test

https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v5-mission-control-shell

## Rollback

If anything goes wrong, replace `index.html` with your last working Groq-only index. The original runtime is also preserved as `app-core.html`.
