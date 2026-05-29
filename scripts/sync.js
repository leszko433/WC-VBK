// CLI: load standings + fixtures (mock or live) and rescore. Run: node scripts/sync.js
require('dotenv').config();
const { syncAll } = require('../lib/importData');
const { recomputeAll, lockStartedMatches } = require('../lib/recompute');

(async () => {
  const counts = await syncAll();
  const rescored = recomputeAll();
  const locked = lockStartedMatches();
  console.log('Synced:', counts, '| rescored predictions:', rescored, '| locked:', locked);
})().catch((e) => {
  console.error('Sync failed:', e.message);
  process.exit(1);
});
