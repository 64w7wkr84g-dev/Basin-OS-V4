# Basin OS V4.3.2 Live Data Load Fix

This fixes the exact issue where the CRM displays the build-time starter JSON even after GitHub Actions updates public/data/radar-leads.json.

Frontend change:
- Load Radar now pulls live GitHub raw JSON first:
  https://raw.githubusercontent.com/64w7wkr84g-dev/Basin-OS-V4/main/public/data/radar-leads.json
- It only falls back to /data/radar-leads.json if GitHub raw fails.

Minimum upload:
- components/BasinOSApp.tsx
- package.json

Keep these from V4.3.1:
- basin-radar-runner.js
- .github/workflows/radar.yml

Current live runner diagnostics showed:
- Brave key error: SUBSCRIPTION_TOKEN_INVALID
- Groq token error: daily token limit reached

So after this frontend fix, the CRM will load the live JSON, but Brave still needs a valid GitHub Actions BRAVE_API_KEY.
