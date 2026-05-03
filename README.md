# Basin OS V3.1 — Groq Terminal Rebuild

Upload all files in this package. The workflow file must live at:

.github/workflows/radar.yml

Required GitHub secrets:
- BRAVE_API_KEY
- GROQ_API_KEY

Frontend browser Groq drafting:
- Paste Groq key in API Command Center.
- It is saved only to localStorage key basin_os_clean_store_v1.
- It is not hardcoded in app.js.

Open:
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v3-groq-terminal


## V3.1 Action Hotfix

- Workflow now runs Node 24.
- Adds FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true.
- Runner prints startup diagnostics.
- Runner writes valid fallback JSON instead of killing the entire workflow if a source/API throws.
