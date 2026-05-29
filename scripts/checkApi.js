// Validates the live api-football connection WITHOUT touching the database.
// Run this on a host where v3.football.api-sports.io is reachable:
//   API_FOOTBALL_KEY=xxxx WC_LEAGUE_ID=1 WC_SEASON=2026 node scripts/checkApi.js
//
// It checks the key/plan via /status, then probes the four endpoints the app uses
// and reports counts, the group count, and the knockout round names found (so you
// can confirm they match the app's bracket mapping).
require('dotenv').config();
process.env.USE_MOCK_DATA = 'false'; // force live regardless of .env

const api = require('../lib/apiFootball');

// Mirror of lib/bracket.roundCode (kept inline so this script needs no DB).
function roundCode(name = '') {
  const r = name.toLowerCase();
  if (r.includes('round of 32') || r.includes('16-del')) return 'r32';
  if (r.includes('round of 16') || r.includes('åttondel') || r.includes('attondel')) return 'r16';
  if (r.includes('quarter') || r.includes('kvart')) return 'qf';
  if (r.includes('semi')) return 'sf';
  if (r.includes('final') && !r.includes('semi') && !r.includes('3rd') && !r.includes('third')) return 'final';
  return null;
}

async function main() {
  console.log(`\nUsing league=${api.LEAGUE_ID} season=${api.SEASON}\n`);

  // 1) Key / plan / usage
  try {
    const s = (await api.getStatus()).response || {};
    console.log('✓ /status OK');
    if (s.account) console.log(`  account: ${s.account.firstname || ''} ${s.account.lastname || ''} <${s.account.email || ''}>`);
    if (s.subscription) console.log(`  plan: ${s.subscription.plan} (active=${s.subscription.active}, ends ${s.subscription.end})`);
    if (s.requests) console.log(`  requests today: ${s.requests.current}/${s.requests.limit_day}`);
  } catch (e) {
    console.error('✗ /status FAILED:', e.message);
    console.error('  → check API_FOOTBALL_KEY and that the host can reach v3.football.api-sports.io');
    process.exit(1);
  }

  // 2) Standings (groups)
  try {
    const groups = (await api.getStandings()).response?.[0]?.league?.standings || [];
    console.log(`✓ standings: ${groups.length} group(s), ${groups.reduce((n, g) => n + g.length, 0)} teams`);
    if (!groups.length) console.log('  ! no standings yet (groups may not be drawn for this season)');
  } catch (e) { console.error('✗ standings FAILED:', e.message); }

  // 3) Fixtures + round-name mapping
  try {
    const fx = (await api.getFixtures()).response || [];
    const rounds = [...new Set(fx.map((f) => f.league?.round).filter(Boolean))];
    const knockout = rounds.filter((r) => roundCode(r));
    const unmapped = rounds.filter((r) => !roundCode(r) && !/group/i.test(r));
    console.log(`✓ fixtures: ${fx.length} match(es), ${rounds.length} distinct round name(s)`);
    console.log(`  knockout rounds mapped: ${knockout.map((r) => `${r}→${roundCode(r)}`).join(', ') || '(none yet)'}`);
    if (unmapped.length) console.log(`  ! unmapped non-group rounds (would be ignored): ${unmapped.join(', ')}`);
  } catch (e) { console.error('✗ fixtures FAILED:', e.message); }

  // 4) Players
  try {
    const ts = (await api.getTopScorers()).response || [];
    const ta = (await api.getTopAssists()).response || [];
    console.log(`✓ players: ${ts.length} top scorers, ${ta.length} top assists`);
  } catch (e) { console.error('✗ players FAILED:', e.message); }

  console.log('\nDone. If everything is ✓, set USE_MOCK_DATA=false and run: node scripts/sync.js\n');
}

main().catch((e) => { console.error('Unexpected error:', e); process.exit(1); });
