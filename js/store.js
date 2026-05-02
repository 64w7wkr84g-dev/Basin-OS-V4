/* Basin OS v4 store.js
   Phase 2 target:
   - Replace direct localStorage calls with a StoreAdapter.
   - Add IndexedDB/localForage migration while preserving localStorage fallback.
   Do not activate until app.js functions are migrated and tested.
*/
window.BasinStorePlan = {
  storageKey: "basin_os_integrated",
  target: "IndexedDB via localForage",
  fallback: "localStorage",
  migration: "read localStorage once, write IndexedDB, keep backup export/import"
};
