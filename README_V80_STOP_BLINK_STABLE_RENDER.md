# Basin OS V8.0 — Stop Blink / Stable Render

The blinking/glitching was caused by a MutationObserver render loop in the V7.9 hotfix. The script rebuilt DOM panels, the observer saw the DOM change, then rebuilt them again repeatedly.

V8.0 removes the MutationObserver entirely.

## Upload only these files

```text
index.html
js/lead-factory-v6.js
js/basin-v80-hotfix.js
README_V80_STOP_BLINK_STABLE_RENDER.md
```

Optional only if you want to keep the latest runner/workflow:

```text
basin-radar-runner.js
.github/workflows/radar.yml
```

Do NOT replace JSON lead files.

## What changed

```text
1. Removed MutationObserver loop.
2. Added one stable initial render.
3. Added one delayed render only.
4. Re-render only after clicking Load/Reload Shared GitHub Radar or navigation tabs.
5. Keeps raw GitHub fallback loading.
6. Keeps prep/contact-needed candidates visible.
7. Keeps API status panel without repeated rebuilding.
```

## After upload

Open:

```text
https://64w7wkr84g-dev.github.io/Basin-OS-V4/?v=v80-stable
```

Then click:

```text
Load Shared GitHub Radar
```
