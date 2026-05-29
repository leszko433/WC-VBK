// CLI: load standings + fixtures (mock or live) and rescore. Run: node scripts/sync.js
require('dotenv').config();
const { syncAll } = require('../lib/importData');
const { recomputeAll, lockStartedMatches } = require('../lib/recompute');
const bracket = require('../lib/bracket');

(async () => {
  const counts = await syncAll();
  const rescored = recomputeAll();
  const bracketRescored = bracket.recomputeAllBracket();
  bracket.recomputeQualification();
  const locked = lockStartedMatches() + bracket.lockStartedBracket();
  console.log('Synced:', counts, '| match tips:', rescored, '| bracket tips:', bracketRescored, '| locked:', locked);
})().catch((e) => {
  console.error('Sync failed:', e.message);
  process.exit(1);
});
