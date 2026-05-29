// Saving match predictions. Predictions lock at kickoff.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const { scoreMatchPrediction } = require('../lib/scoring');

const router = express.Router();
router.use(requireAuth);

const membership = db.prepare(
  'SELECT role FROM league_members WHERE league_id = ? AND user_id = ?'
);
const getMatch = db.prepare('SELECT * FROM matches WHERE id = ?');
const existing = db.prepare(
  'SELECT * FROM predictions WHERE user_id = ? AND league_id = ? AND match_id = ?'
);
const upsertPred = db.prepare(`
  INSERT INTO predictions (user_id, league_id, match_id, pred_home, pred_away, points, locked, updated_at)
  VALUES (@user_id, @league_id, @match_id, @pred_home, @pred_away, @points, @locked, datetime('now'))
  ON CONFLICT(user_id, league_id, match_id) DO UPDATE SET
    pred_home = excluded.pred_home,
    pred_away = excluded.pred_away,
    points    = excluded.points,
    updated_at = datetime('now')
`);

function hasStarted(match) {
  return match.kickoff && new Date(match.kickoff) <= new Date();
}

// POST /api/leagues/:id/predictions  { predictions: [{matchId, home, away}, ...] }
router.post('/leagues/:id/predictions', (req, res) => {
  const leagueId = Number(req.params.id);
  if (!membership.get(leagueId, req.user.id)) {
    return res.status(403).json({ error: 'Du är inte med i den här ligan' });
  }
  const list = Array.isArray(req.body?.predictions) ? req.body.predictions : [];
  const saved = [];
  const skipped = [];

  const tx = db.transaction(() => {
    for (const item of list) {
      const match = getMatch.get(Number(item.matchId));
      if (!match) {
        skipped.push({ matchId: item.matchId, reason: 'okänd match' });
        continue;
      }
      const prev = existing.get(req.user.id, leagueId, match.id);
      if ((prev && prev.locked) || hasStarted(match)) {
        skipped.push({ matchId: match.id, reason: 'matchen har startat' });
        continue;
      }
      const home = Number(item.home);
      const away = Number(item.away);
      if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
        skipped.push({ matchId: match.id, reason: 'ogiltigt resultat' });
        continue;
      }
      // Score immediately if the match is already finished (e.g. late join).
      let points = 0;
      if (match.home_goals != null && match.away_goals != null) {
        points = scoreMatchPrediction(
          { home, away },
          { home: match.home_goals, away: match.away_goals }
        ).total;
      }
      upsertPred.run({
        user_id: req.user.id,
        league_id: leagueId,
        match_id: match.id,
        pred_home: home,
        pred_away: away,
        points,
        locked: 0,
      });
      saved.push(match.id);
    }
  });
  tx();
  res.json({ saved, skipped });
});

module.exports = router;
