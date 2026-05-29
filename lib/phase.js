// Tournament phase helpers (shared lock rules).
const db = require('../db');

// The tournament has started once any match has kicked off. Pre-tournament picks
// (scorers, tournament bonuses) lock at this point.
function tournamentStarted() {
  return (
    db
      .prepare("SELECT COUNT(*) c FROM matches WHERE kickoff IS NOT NULL AND kickoff <= datetime('now')")
      .get().c > 0
  );
}

// The group stage is over once every group match has a result. This opens the
// second tipping window for the knockout bracket.
function groupStageOver() {
  const r = db
    .prepare("SELECT COUNT(*) total, SUM(CASE WHEN status='finished' THEN 1 ELSE 0 END) done FROM matches")
    .get();
  return r.total > 0 && r.total === r.done;
}

module.exports = { tournamentStarted, groupStageOver };
