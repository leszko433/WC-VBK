// Server-side client for api-football v3 (v3.football.api-sports.io).
// The API key lives only here (from env) and is never exposed to the browser.
//
// When USE_MOCK_DATA=true (default in dev) we read from seed/*.json instead of
// calling the network. The live API host may be blocked in some environments;
// flip USE_MOCK_DATA=false on a host where the allowlist permits the API.

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://v3.football.api-sports.io';
const SEED_DIR = path.join(__dirname, '..', 'seed');

const USE_MOCK = String(process.env.USE_MOCK_DATA || 'true').toLowerCase() === 'true';
const LEAGUE_ID = process.env.WC_LEAGUE_ID || '1';
const SEASON = process.env.WC_SEASON || '2026';

// Tiny in-memory cache to respect rate limits (live mode only).
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function readSeed(name) {
  const file = path.join(SEED_DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function apiGet(endpoint, params = {}, seedName) {
  if (USE_MOCK) return readSeed(seedName);

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not set (and USE_MOCK_DATA is false).');

  const url = new URL(`${BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const cacheKey = url.toString();

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.data;

  const res = await fetch(url, { headers: { 'x-apisports-key': key } });
  if (!res.ok) throw new Error(`api-football ${endpoint} failed: HTTP ${res.status}`);
  const data = await res.json();
  // api-football returns HTTP 200 even for errors (invalid key, plan limits,
  // bad params) — the problem is reported in `errors`.
  const errs = data && data.errors;
  const hasErrs = Array.isArray(errs) ? errs.length > 0 : errs && typeof errs === 'object' && Object.keys(errs).length > 0;
  if (hasErrs) throw new Error(`api-football ${endpoint} error: ${JSON.stringify(errs)}`);
  cache.set(cacheKey, { t: Date.now(), data });
  return data;
}

// /status returns account, subscription plan and request usage. No seed (live only).
const getStatus = () => apiGet('status', {}, 'status');

const getStandings = () =>
  apiGet('standings', { league: LEAGUE_ID, season: SEASON }, 'standings');

const getFixtures = () =>
  apiGet('fixtures', { league: LEAGUE_ID, season: SEASON }, 'fixtures');

const getTopScorers = () =>
  apiGet('players/topscorers', { league: LEAGUE_ID, season: SEASON }, 'topscorers');

const getTopAssists = () =>
  apiGet('players/topassists', { league: LEAGUE_ID, season: SEASON }, 'topassists');

module.exports = {
  USE_MOCK,
  LEAGUE_ID,
  SEASON,
  getStatus,
  getStandings,
  getFixtures,
  getTopScorers,
  getTopAssists,
};
