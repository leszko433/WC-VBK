// Bridges the pure scoring engine to the DB: recompute prediction points and
// lock predictions whose match has kicked off.
const db = require('../db');
const { scoreMatchPrediction } = require('./scoring');

const getMatch = db.prepare('SELECT * FROM matches WHERE id = ?');
const predsForMatch = db.prepare('SELECT * FROM predictions WHERE match_id = ?');
const updatePoints = db.prepare('UPDATE predictions SET points = ? WHERE id = ?');

/** Recompute points for every prediction on one match. Returns rows updated. */
function recomputeMatch(matchId) {
  const m = getMatch.get(matchId);
  if (!m || m.home_goals == null || m.away_goals == null) return 0;
  const actual = { home: m.home_goals, away: m.away_goals };
  const rows = predsForMatch.all(matchId);
  const tx = db.transaction(() => {
    for (const p of rows) {
      const { total } = scoreMatchPrediction({ home: p.pred_home, away: p.pred_away }, actual);
      updatePoints.run(total, p.id);
    }
  });
  tx();
  return rows.length;
}

/** Recompute all finished matches (e.g. after a sync). */
function recomputeAll() {
  const finished = db
    .prepare("SELECT id FROM matches WHERE home_goals IS NOT NULL AND away_goals IS NOT NULL")
    .all();
  let n = 0;
  for (const { id } of finished) n += recomputeMatch(id);
  return n;
}

/** Lock predictions for matches that have started (kickoff <= now). */
function lockStartedMatches() {
  return db
    .prepare(
      `UPDATE predictions SET locked = 1
       WHERE locked = 0 AND match_id IN (
         SELECT id FROM matches WHERE kickoff IS NOT NULL AND kickoff <= datetime('now')
       )`
    )
    .run().changes;
}

module.exports = { recomputeMatch, recomputeAll, lockStartedMatches };
