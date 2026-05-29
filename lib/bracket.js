// Knockout bracket ("slutspelsträd") logic: build slots from fixtures, and the
// two parallel scoring tracks from the rules screenshots.
//
// Track 1 — Match result (per slot): same engine as the group stage
//   (correct 1X2 +3, exact home +2, exact away +2, perfect = 7). Awarded for the
//   actual match played in a slot regardless of which teams reach it.
// Track 2 — Team advancement (bonus): points for each team you correctly place in
//   the right round. Picking a slot's winner correctly = that team reaches the
//   NEXT round, worth that round's per-team value:
//     reach R16 6, reach QF 9, reach SF 12, reach Final 15.
//   Reaching the round of 32 (3 p/team) is the qualification tier (see below).
// Champion (final winner) is the separate 30 p tournament bonus, not scored here.
//
// Totals: qualification 32×3=96, advancement 16×6+8×9+4×12+2×15=246  →  342.

const db = require('../db');
const { scoreMatchPrediction } = require('./scoring');

const ROUNDS = ['r32', 'r16', 'qf', 'sf', 'final'];
const ROUND_LABEL = { r32: '16-delsfinal', r16: 'Åttondelsfinal', qf: 'Kvartsfinal', sf: 'Semifinal', final: 'Final' };
// Points for reaching a round (per team).
const REACH_POINTS = { r32: 3, r16: 6, qf: 9, sf: 12, final: 15 };
// Advancement points for picking a slot winner = points for the round they enter.
const ADVANCE_POINTS = { r32: 6, r16: 9, qf: 12, sf: 15, final: 0 };
const QUALIFY_POINTS = REACH_POINTS.r32; // 3

// Map api-football knockout round names to our codes.
function roundCode(roundName = '') {
  const r = roundName.toLowerCase();
  if (r.includes('round of 32') || r.includes('16-del')) return 'r32';
  if (r.includes('round of 16') || r.includes('åttondel') || r.includes('attondel')) return 'r16';
  if (r.includes('quarter') || r.includes('kvart')) return 'qf';
  if (r.includes('semi')) return 'sf';
  if (r.includes('final') && !r.includes('semi') && !r.includes('3rd') && !r.includes('third')) return 'final';
  return null;
}

const teamIdByApi = db.prepare('SELECT id FROM teams WHERE api_team_id = ?');
const upsertSlot = db.prepare(`
  INSERT INTO bracket_slots (round, pos, label, api_fixture_id, home_team_id, away_team_id, home_goals, away_goals, winner_team_id, status)
  VALUES (@round, @pos, @label, @api_fixture_id, @home_team_id, @away_team_id, @home_goals, @away_goals, @winner_team_id, @status)
  ON CONFLICT(round, pos) DO UPDATE SET
    api_fixture_id = excluded.api_fixture_id,
    home_team_id   = excluded.home_team_id,
    away_team_id   = excluded.away_team_id,
    home_goals     = excluded.home_goals,
    away_goals     = excluded.away_goals,
    winner_team_id = excluded.winner_team_id,
    status         = excluded.status
`);

// Build/refresh bracket slots from api-football fixtures (knockout rounds only).
function importBracket(fixturesData) {
  const byRound = {};
  for (const fx of fixturesData?.response || []) {
    const code = roundCode(fx.league?.round || '');
    if (!code) continue;
    (byRound[code] = byRound[code] || []).push(fx);
  }
  const tx = db.transaction(() => {
    for (const code of ROUNDS) {
      const list = (byRound[code] || []).sort((a, b) => a.fixture.id - b.fixture.id);
      list.forEach((fx, i) => {
        const home = teamIdByApi.get(fx.teams.home.id);
        const away = teamIdByApi.get(fx.teams.away.id);
        const hg = fx.goals?.home ?? null;
        const ag = fx.goals?.away ?? null;
        const finished = ['FT', 'AET', 'PEN'].includes(fx.fixture.status?.short) && hg != null && ag != null;
        let winner = null;
        if (finished && home && away) winner = hg >= ag ? home.id : away.id; // PEN winner assumed home in mock
        upsertSlot.run({
          round: code,
          pos: i + 1,
          label: `${ROUND_LABEL[code]} ${i + 1}`,
          api_fixture_id: fx.fixture.id,
          home_team_id: home ? home.id : null,
          away_team_id: away ? away.id : null,
          home_goals: hg,
          away_goals: ag,
          winner_team_id: winner,
          status: finished ? 'finished' : 'scheduled',
        });
      });
    }
  });
  tx();
  return db.prepare('SELECT COUNT(*) c FROM bracket_slots').get().c;
}

const slotById = db.prepare('SELECT * FROM bracket_slots WHERE id = ?');
const bpredsForSlot = db.prepare('SELECT * FROM bracket_predictions WHERE slot_id = ?');
const updateBpred = db.prepare('UPDATE bracket_predictions SET points_result = ?, points_advance = ? WHERE id = ?');

// Recompute both tracks for every prediction on one slot.
function recomputeSlot(slotId) {
  const s = slotById.get(slotId);
  if (!s || s.home_goals == null || s.away_goals == null) return 0;
  const actual = { home: s.home_goals, away: s.away_goals };
  const advance = ADVANCE_POINTS[s.round] || 0;
  const rows = bpredsForSlot.all(slotId);
  const tx = db.transaction(() => {
    for (const p of rows) {
      let result = 0;
      if (p.pred_home != null && p.pred_away != null) {
        result = scoreMatchPrediction({ home: p.pred_home, away: p.pred_away }, actual).total;
      }
      const adv = p.pred_winner_team_id && p.pred_winner_team_id === s.winner_team_id ? advance : 0;
      updateBpred.run(result, adv, p.id);
    }
  });
  tx();
  return rows.length;
}

function recomputeAllBracket() {
  const finished = db
    .prepare("SELECT id FROM bracket_slots WHERE home_goals IS NOT NULL AND away_goals IS NOT NULL")
    .all();
  let n = 0;
  for (const { id } of finished) n += recomputeSlot(id);
  return n;
}

// Qualification tier: 3 p for each team a user picked that actually reaches R32.
const qualPicksForLeague = db.prepare('SELECT * FROM qualifier_picks WHERE league_id = ?');
const setQualPoints = db.prepare('UPDATE qualifier_picks SET points = ? WHERE id = ?');
function actualR32TeamIds() {
  const ids = new Set();
  for (const s of db.prepare("SELECT home_team_id, away_team_id FROM bracket_slots WHERE round = 'r32'").all()) {
    if (s.home_team_id) ids.add(s.home_team_id);
    if (s.away_team_id) ids.add(s.away_team_id);
  }
  return ids;
}
function recomputeQualification(leagueId) {
  const actual = actualR32TeamIds();
  if (!actual.size) return 0;
  const rows = leagueId
    ? qualPicksForLeague.all(leagueId)
    : db.prepare('SELECT * FROM qualifier_picks').all();
  const tx = db.transaction(() => {
    for (const r of rows) setQualPoints.run(actual.has(r.team_id) ? QUALIFY_POINTS : 0, r.id);
  });
  tx();
  return rows.length;
}

// Lock bracket predictions for slots that have started.
function lockStartedBracket() {
  return db
    .prepare(
      `UPDATE bracket_predictions SET locked = 1
       WHERE locked = 0 AND slot_id IN (SELECT id FROM bracket_slots WHERE status = 'finished')`
    )
    .run().changes;
}

module.exports = {
  ROUNDS, ROUND_LABEL, REACH_POINTS, ADVANCE_POINTS, QUALIFY_POINTS,
  roundCode, importBracket, recomputeSlot, recomputeAllBracket,
  recomputeQualification, lockStartedBracket, actualR32TeamIds,
};
