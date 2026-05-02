# Basin OS v4 Staging Rebuild

This is a staging package. Do not replace the live root `index.html` with this until tested.

## What this build does safely

- Moves the current inline CSS into `css/styles.css`.
- Moves the current inline JavaScript into `js/app.js`.
- Adds placeholder module files for the planned split:
  - `js/config.js`
  - `js/store.js`
  - `js/api.js`
  - `js/radar.js`
  - `js/ui.js`
- Preserves existing runtime logic in `app.js` first to avoid breaking the OS during the first modularization pass.
- Includes reference copies of the existing start page and SalesNav/NPI companion page.

## Upload path

Upload the whole `v4` folder to the repo root.

Test at:

`https://64w7wkr84g-dev.github.io/Basin-Os/v4/index.html?v=staging`

## Current source hashes

Source `index(112).html` SHA256:

`f8282b98b9329717c2ec39d88292aa5e124f93c1d5aa91adc14292420ff8ed09`

Generated `v4/index.html` SHA256:

`77136f53758f6666b754a60904f201e9566a3700010d269780e3b49e5e749479`

## Important

This is Phase 1 modular extraction, not the full refactor yet.

The next phase should split `js/app.js` into the module files only after this staging version loads and all buttons pass regression testing.

## Promotion plan

1. Upload `/v4`.
2. Test every main page and button from `/v4/index.html`.
3. Only after it passes, proceed with Phase 2 module extraction.
4. Only after Phase 2 passes, integrate SalesNav/NPI into the unified sidebar.
5. Only after Phase 3 passes, add IndexedDB/localForage storage migration.
