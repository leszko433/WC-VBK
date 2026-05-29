// Admin actions: generate invites, sync fixtures, enter/fetch results.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireSiteAdmin, requireLeagueAdmin } = require('../lib/auth');
const { syncAll } = require('../lib/importData');
const { recomputeMatch, recomputeAll, lockStartedMatches } = require('../lib/recompute');
const bracket = require('../lib/bracket');

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
    const bracketRescored = bracket.recomputeAllBracket();
    bracket.recomputeQualification();
    const locked = lockStartedMatches() + bracket.lockStartedBracket();
    res.json({ ...counts, rescored, bracketRescored, locked });
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

// POST /api/admin/bracket/:slotId/result  { home, away }  — site admin
router.post('/bracket/:slotId/result', requireSiteAdmin, (req, res) => {
  const slotId = Number(req.params.slotId);
  const home = Number(req.body?.home);
  const away = Number(req.body?.away);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return res.status(400).json({ error: 'Ogiltigt resultat' });
  }
  const s = db.prepare('SELECT * FROM bracket_slots WHERE id = ?').get(slotId);
  if (!s) return res.status(404).json({ error: 'Slot hittades inte' });
  if (!s.home_team_id || !s.away_team_id) {
    return res.status(400).json({ error: 'Lagen för denna slot är inte kända ännu' });
  }
  const winner = home >= away ? s.home_team_id : s.away_team_id;
  db.prepare(
    "UPDATE bracket_slots SET home_goals = ?, away_goals = ?, winner_team_id = ?, status = 'finished' WHERE id = ?"
  ).run(home, away, winner, slotId);
  const updated = bracket.recomputeSlot(slotId);
  // Reaching R32 affects the qualification tier.
  if (s.round === 'r32') bracket.recomputeQualification();
  res.json({ slotId, home, away, predictions_rescored: updated });
});

module.exports = router;
