// Leagues: create, join, list, detail, fixtures + my predictions, leaderboard.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();
router.use(requireAuth);

const insertLeague = db.prepare(
  'INSERT INTO leagues (name, admin_user_id, join_code, mode) VALUES (?, ?, ?, ?)'
);
const addMember = db.prepare(
  'INSERT OR IGNORE INTO league_members (league_id, user_id, role) VALUES (?, ?, ?)'
);
const myLeagues = db.prepare(`
  SELECT l.id, l.name, l.join_code, l.mode, lm.role,
         (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS members
  FROM leagues l JOIN league_members lm ON lm.league_id = l.id
  WHERE lm.user_id = ? ORDER BY l.created_at DESC
`);
const leagueByCode = db.prepare('SELECT * FROM leagues WHERE join_code = ?');
const membership = db.prepare(
  'SELECT role FROM league_members WHERE league_id = ? AND user_id = ?'
);
const leagueById = db.prepare('SELECT * FROM leagues WHERE id = ?');

function code(n = 6) {
  return crypto.randomBytes(8).toString('hex').slice(0, n).toUpperCase();
}

// GET /api/leagues  — leagues I belong to
router.get('/', (req, res) => {
  res.json(myLeagues.all(req.user.id));
});

// POST /api/leagues  { name, mode }
router.post('/', (req, res) => {
  const { name, mode } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Namn krävs' });
  const joinCode = code();
  const tx = db.transaction(() => {
    const info = insertLeague.run(
      name.trim(),
      req.user.id,
      joinCode,
      mode === 'single' ? 'single' : 'two_window'
    );
    addMember.run(info.lastInsertRowid, req.user.id, 'admin');
    return info.lastInsertRowid;
  });
  const id = tx();
  res.json({ id, join_code: joinCode });
});

// POST /api/leagues/join  { code }
router.post('/join', (req, res) => {
  const { code: joinCode } = req.body || {};
  if (!joinCode) return res.status(400).json({ error: 'Kod krävs' });
  const league = leagueByCode.get(String(joinCode).trim().toUpperCase());
  if (!league) return res.status(404).json({ error: 'Ingen liga med den koden' });
  addMember.run(league.id, req.user.id, 'member');
  res.json({ id: league.id, name: league.name });
});

// GET /api/leagues/:id — detail + members + my role
router.get('/:id', (req, res) => {
  const league = leagueById.get(Number(req.params.id));
  if (!league) return res.status(404).json({ error: 'Liga hittades inte' });
  const mine = membership.get(league.id, req.user.id);
  if (!mine) return res.status(403).json({ error: 'Du är inte med i den här ligan' });
  const members = db
    .prepare(
      `SELECT u.display_name, lm.role FROM league_members lm
       JOIN users u ON u.id = lm.user_id WHERE lm.league_id = ?
       ORDER BY lm.role DESC, u.display_name`
    )
    .all(league.id);
  res.json({ ...league, my_role: mine.role, members });
});

// GET /api/leagues/:id/fixtures — matches with my predictions for this league
router.get('/:id/fixtures', (req, res) => {
  const leagueId = Number(req.params.id);
  if (!membership.get(leagueId, req.user.id)) {
    return res.status(403).json({ error: 'Du är inte med i den här ligan' });
  }
  const rows = db
    .prepare(
      `SELECT m.id, m.slot, m.kickoff, m.status, m.home_goals, m.away_goals,
              ht.name AS home_name, ht.flag AS home_flag, ht.grp AS grp,
              at.name AS away_name, at.flag AS away_flag,
              p.pred_home, p.pred_away, p.points, p.locked
       FROM matches m
       JOIN teams ht ON ht.id = m.home_team_id
       JOIN teams at ON at.id = m.away_team_id
       LEFT JOIN predictions p
         ON p.match_id = m.id AND p.league_id = ? AND p.user_id = ?
       ORDER BY m.kickoff`
    )
    .all(leagueId, req.user.id);
  res.json(rows);
});

// GET /api/leagues/:id/leaderboard
router.get('/:id/leaderboard', (req, res) => {
  const leagueId = Number(req.params.id);
  if (!membership.get(leagueId, req.user.id)) {
    return res.status(403).json({ error: 'Du är inte med i den här ligan' });
  }
  // Total = match tips + bracket (result + advancement) + qualification, summed
  // per user via independent subqueries to avoid join fan-out.
  const rows = db
    .prepare(
      `SELECT u.id, u.display_name,
         (SELECT COUNT(*)            FROM predictions p WHERE p.user_id = u.id AND p.league_id = lm.league_id) AS predictions,
         (SELECT COALESCE(SUM(p.points),0) FROM predictions p WHERE p.user_id = u.id AND p.league_id = lm.league_id) AS match_points,
         (SELECT COALESCE(SUM(b.points_result + b.points_advance),0) FROM bracket_predictions b WHERE b.user_id = u.id AND b.league_id = lm.league_id) AS bracket_points,
         (SELECT COALESCE(SUM(q.points),0) FROM qualifier_picks q WHERE q.user_id = u.id AND q.league_id = lm.league_id) AS qual_points
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       WHERE lm.league_id = ?`
    )
    .all(leagueId)
    .map((r) => ({ ...r, points: r.match_points + r.bracket_points + r.qual_points }))
    .sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name));
  res.json(rows);
});

module.exports = router;
