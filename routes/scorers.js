// Personal goal scorers: list the player pool with my picks, and save up to 3 picks.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const scorers = require('../lib/scorers');

const router = express.Router();
router.use(requireAuth);

const membership = db.prepare(
  'SELECT role FROM league_members WHERE league_id = ? AND user_id = ?'
);
function ensureMember(req, res) {
  const leagueId = Number(req.params.id);
  if (!membership.get(leagueId, req.user.id)) {
    res.status(403).json({ error: 'Du är inte med i den här ligan' });
    return null;
  }
  return leagueId;
}

// Scorer picks lock once the tournament has started (any match kicked off).
function tournamentStarted() {
  return db
    .prepare("SELECT COUNT(*) c FROM matches WHERE kickoff IS NOT NULL AND kickoff <= datetime('now')")
    .get().c > 0;
}

// GET /api/leagues/:id/scorers — player pool + my picks + point rules
router.get('/leagues/:id/scorers', (req, res) => {
  const leagueId = ensureMember(req, res);
  if (leagueId == null) return;
  const players = db
    .prepare('SELECT id, name, team_name, goals, assists FROM players ORDER BY (goals*3+assists) DESC, name')
    .all();
  const myPicks = db
    .prepare('SELECT slot, player_id, points FROM scorer_picks WHERE league_id = ? AND user_id = ? ORDER BY slot')
    .all(leagueId, req.user.id);
  res.json({
    goalPoints: scorers.GOAL_POINTS,
    assistPoints: scorers.ASSIST_POINTS,
    locked: tournamentStarted(),
    players,
    myPicks,
  });
});

const delPicks = db.prepare('DELETE FROM scorer_picks WHERE league_id = ? AND user_id = ?');
const insPick = db.prepare(
  'INSERT INTO scorer_picks (user_id, league_id, player_id, slot, points) VALUES (?, ?, ?, ?, 0)'
);
const playerExists = db.prepare('SELECT 1 FROM players WHERE id = ?');

// POST /api/leagues/:id/scorers  { playerIds: [id1, id2, id3] } — replace my picks
router.post('/leagues/:id/scorers', (req, res) => {
  const leagueId = ensureMember(req, res);
  if (leagueId == null) return;
  if (tournamentStarted()) {
    return res.status(403).json({ error: 'Målgörarna är låsta (turneringen har börjat)' });
  }
  let ids = Array.isArray(req.body?.playerIds) ? req.body.playerIds.map(Number).filter(Number.isInteger) : [];
  ids = [...new Set(ids)].slice(0, 3); // distinct, max 3
  if (ids.some((id) => !playerExists.get(id))) {
    return res.status(400).json({ error: 'Okänd spelare' });
  }
  const tx = db.transaction(() => {
    delPicks.run(leagueId, req.user.id);
    ids.forEach((id, i) => insPick.run(req.user.id, leagueId, id, i + 1));
  });
  tx();
  // Score immediately against current goals/assists.
  scorers.recomputeScorers(leagueId);
  res.json({ saved: ids.length });
});

module.exports = router;
