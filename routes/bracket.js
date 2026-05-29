// Knockout bracket + qualification: read structure with my picks, save picks.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const { scoreMatchPrediction } = require('../lib/scoring');
const bracket = require('../lib/bracket');

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

// GET /api/leagues/:id/bracket — slots (with my picks) + qualification + point rules
router.get('/leagues/:id/bracket', (req, res) => {
  const leagueId = ensureMember(req, res);
  if (leagueId == null) return;

  const slots = db
    .prepare(
      `SELECT s.id, s.round, s.pos, s.label, s.status,
              s.home_team_id, s.away_team_id, s.winner_team_id,
              s.home_goals, s.away_goals,
              ht.name AS home_name, ht.flag AS home_flag,
              at.name AS away_name, at.flag AS away_flag,
              bp.pred_home, bp.pred_away, bp.pred_winner_team_id,
              bp.points_result, bp.points_advance, bp.locked
       FROM bracket_slots s
       LEFT JOIN teams ht ON ht.id = s.home_team_id
       LEFT JOIN teams at ON at.id = s.away_team_id
       LEFT JOIN bracket_predictions bp
         ON bp.slot_id = s.id AND bp.league_id = ? AND bp.user_id = ?
       ORDER BY CASE s.round WHEN 'r32' THEN 1 WHEN 'r16' THEN 2 WHEN 'qf' THEN 3 WHEN 'sf' THEN 4 ELSE 5 END, s.pos`
    )
    .all(leagueId, req.user.id);

  const teams = db.prepare('SELECT id, name, flag, grp FROM teams ORDER BY grp, name').all();
  const myQuals = db
    .prepare('SELECT team_id, points FROM qualifier_picks WHERE league_id = ? AND user_id = ?')
    .all(leagueId, req.user.id);

  res.json({
    rounds: bracket.ROUNDS,
    roundLabels: bracket.ROUND_LABEL,
    advancePoints: bracket.ADVANCE_POINTS,
    qualifyPoints: bracket.QUALIFY_POINTS,
    slots,
    teams,
    myQualifiers: myQuals.map((q) => q.team_id),
  });
});

const getSlot = db.prepare('SELECT * FROM bracket_slots WHERE id = ?');
const getBpred = db.prepare(
  'SELECT * FROM bracket_predictions WHERE user_id = ? AND league_id = ? AND slot_id = ?'
);
const upsertBpred = db.prepare(`
  INSERT INTO bracket_predictions
    (user_id, league_id, slot_id, pred_home, pred_away, pred_winner_team_id, points_result, points_advance, locked, updated_at)
  VALUES (@user_id, @league_id, @slot_id, @pred_home, @pred_away, @pred_winner_team_id, @points_result, @points_advance, 0, datetime('now'))
  ON CONFLICT(user_id, league_id, slot_id) DO UPDATE SET
    pred_home = excluded.pred_home,
    pred_away = excluded.pred_away,
    pred_winner_team_id = excluded.pred_winner_team_id,
    points_result = excluded.points_result,
    points_advance = excluded.points_advance,
    updated_at = datetime('now')
`);

// POST /api/leagues/:id/bracket  { picks: [{slotId, home?, away?, winnerTeamId?}] }
router.post('/leagues/:id/bracket', (req, res) => {
  const leagueId = ensureMember(req, res);
  if (leagueId == null) return;
  const picks = Array.isArray(req.body?.picks) ? req.body.picks : [];
  const saved = [];
  const skipped = [];

  const tx = db.transaction(() => {
    for (const item of picks) {
      const slot = getSlot.get(Number(item.slotId));
      if (!slot) { skipped.push({ slotId: item.slotId, reason: 'okänd slot' }); continue; }
      const prev = getBpred.get(req.user.id, leagueId, slot.id);
      if ((prev && prev.locked) || slot.status === 'finished') {
        skipped.push({ slotId: slot.id, reason: 'matchen har avgjorts' });
        continue;
      }
      const home = item.home === '' || item.home == null ? null : Number(item.home);
      const away = item.away === '' || item.away == null ? null : Number(item.away);
      if ((home != null && (!Number.isInteger(home) || home < 0)) ||
          (away != null && (!Number.isInteger(away) || away < 0))) {
        skipped.push({ slotId: slot.id, reason: 'ogiltigt resultat' });
        continue;
      }
      let winner = item.winnerTeamId == null ? null : Number(item.winnerTeamId);
      // Winner must be one of the slot's teams (if teams are known).
      if (winner != null && slot.home_team_id && slot.away_team_id &&
          winner !== slot.home_team_id && winner !== slot.away_team_id) {
        winner = null;
      }
      // Score immediately if the slot is already decided (late join).
      let pr = 0, pa = 0;
      if (slot.home_goals != null && slot.away_goals != null) {
        if (home != null && away != null) {
          pr = scoreMatchPrediction({ home, away }, { home: slot.home_goals, away: slot.away_goals }).total;
        }
        if (winner && winner === slot.winner_team_id) pa = bracket.ADVANCE_POINTS[slot.round] || 0;
      }
      upsertBpred.run({
        user_id: req.user.id, league_id: leagueId, slot_id: slot.id,
        pred_home: home, pred_away: away, pred_winner_team_id: winner,
        points_result: pr, points_advance: pa,
      });
      saved.push(slot.id);
    }
  });
  tx();
  res.json({ saved, skipped });
});

const delQuals = db.prepare('DELETE FROM qualifier_picks WHERE league_id = ? AND user_id = ?');
const insQual = db.prepare(
  'INSERT OR IGNORE INTO qualifier_picks (user_id, league_id, team_id, points) VALUES (?, ?, ?, 0)'
);

// POST /api/leagues/:id/qualification  { teamIds: [...] } — replace my picks
router.post('/leagues/:id/qualification', (req, res) => {
  const leagueId = ensureMember(req, res);
  if (leagueId == null) return;
  const ids = Array.isArray(req.body?.teamIds) ? req.body.teamIds.map(Number).filter(Number.isInteger) : [];
  // Once any R32 slot is known/finished, qualification locks.
  const r32Known = db
    .prepare("SELECT COUNT(*) c FROM bracket_slots WHERE round = 'r32' AND status = 'finished'")
    .get().c;
  if (r32Known > 0) return res.status(403).json({ error: 'Kvalificeringen är låst (slutspelet har börjat)' });

  const tx = db.transaction(() => {
    delQuals.run(leagueId, req.user.id);
    for (const id of ids) insQual.run(req.user.id, leagueId, id);
  });
  tx();
  // Score immediately against the known R32 field (3 p per correct team).
  bracket.recomputeQualification(leagueId);
  res.json({ saved: ids.length });
});

module.exports = router;
