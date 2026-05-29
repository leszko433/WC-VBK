// Tournament bonuses + custom bonus questions scoring.
const db = require('../db');

const POINTS = Object.freeze({ champion: 30, scorer: 25, assist: 25, goals: 20 });

// ----- Actual outcomes (computed from imported data) -----
function actualChampion() {
  const f = db.prepare("SELECT winner_team_id FROM bracket_slots WHERE round = 'final' AND status = 'finished'").get();
  return f ? f.winner_team_id : null;
}
function actualTopScorer() {
  const p = db.prepare('SELECT id FROM players WHERE goals > 0 ORDER BY goals DESC, assists DESC, id LIMIT 1').get();
  return p ? p.id : null;
}
function actualTopAssist() {
  const p = db.prepare('SELECT id FROM players WHERE assists > 0 ORDER BY assists DESC, goals DESC, id LIMIT 1').get();
  return p ? p.id : null;
}
function actualTotalGoals() {
  const m = db.prepare('SELECT COALESCE(SUM(home_goals + away_goals),0) g FROM matches WHERE home_goals IS NOT NULL').get().g;
  const b = db.prepare('SELECT COALESCE(SUM(home_goals + away_goals),0) g FROM bracket_slots WHERE home_goals IS NOT NULL').get().g;
  return m + b;
}
function actuals() {
  return {
    champion_team_id: actualChampion(),
    top_scorer_id: actualTopScorer(),
    top_assist_id: actualTopAssist(),
    total_goals: actualTotalGoals(),
    finished: !!actualChampion(),
  };
}

const setTournamentPts = db.prepare(
  'UPDATE tournament_picks SET pts_champion=?, pts_scorer=?, pts_assist=?, pts_goals=? WHERE user_id=? AND league_id=?'
);

// Recompute tournament-bonus points for one league (or all). Each pick scores only
// once its actual outcome is known (e.g. champion needs the final played).
function recomputeTournament(leagueId) {
  const a = actuals();
  const rows = leagueId
    ? db.prepare('SELECT * FROM tournament_picks WHERE league_id = ?').all(leagueId)
    : db.prepare('SELECT * FROM tournament_picks').all();
  const tx = db.transaction(() => {
    for (const r of rows) {
      const champ = a.champion_team_id && r.champion_team_id === a.champion_team_id ? POINTS.champion : 0;
      const scorer = a.top_scorer_id && r.top_scorer_id === a.top_scorer_id ? POINTS.scorer : 0;
      const assist = a.top_assist_id && r.top_assist_id === a.top_assist_id ? POINTS.assist : 0;
      // Total goals scores only when the tournament is complete (final played).
      const goals = a.finished && r.total_goals != null && r.total_goals === a.total_goals ? POINTS.goals : 0;
      setTournamentPts.run(champ, scorer, assist, goals, r.user_id, r.league_id);
    }
  });
  tx();
  return rows.length;
}

// ----- Custom bonus questions -----
const setAnswerPts = db.prepare('UPDATE bonus_answers SET points = ? WHERE id = ?');
const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

// Score all answers for a resolved question (correct answer matches, case-insensitive).
function recomputeQuestion(questionId) {
  const q = db.prepare('SELECT * FROM bonus_questions WHERE id = ?').get(questionId);
  if (!q || q.correct_answer == null) return 0;
  const correct = norm(q.correct_answer);
  const answers = db.prepare('SELECT * FROM bonus_answers WHERE question_id = ?').all(questionId);
  const tx = db.transaction(() => {
    for (const a of answers) setAnswerPts.run(norm(a.answer) === correct ? q.points : 0, a.id);
  });
  tx();
  return answers.length;
}

function recomputeAllQuestions() {
  const qs = db.prepare('SELECT id FROM bonus_questions WHERE correct_answer IS NOT NULL').all();
  let n = 0;
  for (const { id } of qs) n += recomputeQuestion(id);
  return n;
}

module.exports = {
  POINTS, actuals, actualChampion, actualTopScorer, actualTopAssist, actualTotalGoals,
  recomputeTournament, recomputeQuestion, recomputeAllQuestions,
};
