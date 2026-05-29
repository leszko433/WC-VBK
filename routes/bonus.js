// Tournament bonuses (champion/top scorer/top assists/total goals) and custom
// bonus questions — member-facing read/answer endpoints.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const bonus = require('../lib/bonus');
const { tournamentStarted } = require('../lib/phase');

const router = express.Router();
router.use(requireAuth);

const membership = db.prepare('SELECT role FROM league_members WHERE league_id = ? AND user_id = ?');
function ensureMember(req, res) {
  const leagueId = Number(req.params.id);
  if (!membership.get(leagueId, req.user.id)) {
    res.status(403).json({ error: 'Du är inte med i den här ligan' });
    return null;
  }
  return leagueId;
}

// GET /api/leagues/:id/tournament — my picks + options + current/actual outcomes
router.get('/leagues/:id/tournament', (req, res) => {
  const leagueId = ensureMember(req, res);
  if (leagueId == null) return;
  const myPicks = db.prepare('SELECT * FROM tournament_picks WHERE league_id = ? AND user_id = ?').get(leagueId, req.user.id) || {};
  res.json({
    points: bonus.POINTS,
    locked: tournamentStarted(),
    myPicks,
    actuals: bonus.actuals(),
    teams: db.prepare('SELECT id, name, flag FROM teams ORDER BY name').all(),
    players: db.prepare('SELECT id, name, team_name, goals, assists FROM players ORDER BY name').all(),
  });
});

const upsertTournament = db.prepare(`
  INSERT INTO tournament_picks (user_id, league_id, champion_team_id, top_scorer_id, top_assist_id, total_goals, updated_at)
  VALUES (@user_id, @league_id, @champion_team_id, @top_scorer_id, @top_assist_id, @total_goals, datetime('now'))
  ON CONFLICT(user_id, league_id) DO UPDATE SET
    champion_team_id = excluded.champion_team_id,
    top_scorer_id    = excluded.top_scorer_id,
    top_assist_id    = excluded.top_assist_id,
    total_goals      = excluded.total_goals,
    updated_at       = datetime('now')
`);
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

// POST /api/leagues/:id/tournament  { championTeamId, topScorerId, topAssistId, totalGoals }
router.post('/leagues/:id/tournament', (req, res) => {
  const leagueId = ensureMember(req, res);
  if (leagueId == null) return;
  if (tournamentStarted()) return res.status(403).json({ error: 'Bonusarna är låsta (turneringen har börjat)' });
  const b = req.body || {};
  upsertTournament.run({
    user_id: req.user.id, league_id: leagueId,
    champion_team_id: numOrNull(b.championTeamId),
    top_scorer_id: numOrNull(b.topScorerId),
    top_assist_id: numOrNull(b.topAssistId),
    total_goals: numOrNull(b.totalGoals),
  });
  bonus.recomputeTournament(leagueId);
  res.json({ ok: true });
});

// GET /api/leagues/:id/questions — questions with my answer + resolution
router.get('/leagues/:id/questions', (req, res) => {
  const leagueId = ensureMember(req, res);
  if (leagueId == null) return;
  const rows = db.prepare(
    `SELECT q.id, q.text, q.options, q.points, q.correct_answer,
            a.answer AS my_answer, a.points AS my_points
     FROM bonus_questions q
     LEFT JOIN bonus_answers a ON a.question_id = q.id AND a.user_id = ?
     WHERE q.league_id = ? ORDER BY q.created_at`
  ).all(req.user.id, leagueId);
  res.json(rows.map((r) => ({ ...r, options: r.options ? JSON.parse(r.options) : null, resolved: r.correct_answer != null })));
});

const getQuestion = db.prepare('SELECT * FROM bonus_questions WHERE id = ?');
const upsertAnswer = db.prepare(`
  INSERT INTO bonus_answers (question_id, user_id, answer, points)
  VALUES (?, ?, ?, 0)
  ON CONFLICT(question_id, user_id) DO UPDATE SET answer = excluded.answer
`);

// POST /api/leagues/:id/questions/:qid/answer  { answer }
router.post('/leagues/:id/questions/:qid/answer', (req, res) => {
  const leagueId = ensureMember(req, res);
  if (leagueId == null) return;
  const q = getQuestion.get(Number(req.params.qid));
  if (!q || q.league_id !== leagueId) return res.status(404).json({ error: 'Frågan hittades inte' });
  if (q.correct_answer != null) return res.status(403).json({ error: 'Frågan är redan avgjord' });
  const answer = (req.body?.answer || '').toString().trim();
  if (!answer) return res.status(400).json({ error: 'Svar krävs' });
  upsertAnswer.run(q.id, req.user.id, answer);
  res.json({ ok: true });
});

module.exports = router;
