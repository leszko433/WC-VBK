// Admin actions: generate invites, sync fixtures, enter/fetch results.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireSiteAdmin, requireLeagueAdmin } = require('../lib/auth');
const { syncAll } = require('../lib/importData');
const { recomputeMatch, recomputeAll, lockStartedMatches } = require('../lib/recompute');

const router = express.Router();
router.use(requireAuth);

const insertInvite = db.prepare(
  'INSERT INTO invites (code, email, league_id, created_by, expires_at) VALUES (?, ?, ?, ?, ?)'
);

function inviteCode() {
  return crypto.randomBytes(12).toString('base64url').slice(0, 10);
}

// POST /api/admin/leagues/:id/invites  { email?, expiresAt? } — league admin
router.post('/leagues/:id/invites', requireLeagueAdmin, (req, res) => {
  const { email, expiresAt } = req.body || {};
  const code = inviteCode();
  insertInvite.run(code, email ? email.trim().toLowerCase() : null, req.league.id, req.user.id, expiresAt || null);
  res.json({ code, league_id: req.league.id });
});

// GET /api/admin/leagues/:id/invites — list invites for a league (admin)
router.get('/leagues/:id/invites', requireLeagueAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT i.code, i.email, i.expires_at, i.used_by, u.display_name AS used_by_name
       FROM invites i LEFT JOIN users u ON u.id = i.used_by
       WHERE i.league_id = ? ORDER BY i.created_at DESC`
    )
    .all(req.league.id);
  res.json(rows);
});

// POST /api/admin/sync — pull standings + fixtures (mock or live). Site admin.
router.post('/sync', requireSiteAdmin, async (req, res) => {
  try {
    const counts = await syncAll();
    const rescored = recomputeAll();
    const locked = lockStartedMatches();
    res.json({ ...counts, rescored, locked });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// POST /api/admin/matches/:matchId/result  { home, away }  — site admin
router.post('/matches/:matchId/result', requireSiteAdmin, (req, res) => {
  const matchId = Number(req.params.matchId);
  const home = Number(req.body?.home);
  const away = Number(req.body?.away);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return res.status(400).json({ error: 'Ogiltigt resultat' });
  }
  const m = db.prepare('SELECT id FROM matches WHERE id = ?').get(matchId);
  if (!m) return res.status(404).json({ error: 'Match hittades inte' });
  db.prepare(
    "UPDATE matches SET home_goals = ?, away_goals = ?, status = 'finished' WHERE id = ?"
  ).run(home, away, matchId);
  const updated = recomputeMatch(matchId);
  res.json({ matchId, home, away, predictions_rescored: updated });
});

module.exports = router;
