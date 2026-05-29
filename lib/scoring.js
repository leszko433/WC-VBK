// Pure scoring functions for VM-tips. No DB/IO here so it stays easy to unit-test.
//
// Match result scoring (from the rules screenshots):
//   - Correct 1X2 outcome (home win / draw / away win): +3
//   - Exact home goals: +2
//   - Exact away goals: +2
//   - All three correct = 7 ("Perfekt tips") — falls out naturally from the sum.

const POINTS = Object.freeze({
  OUTCOME: 3,
  EXACT_HOME: 2,
  EXACT_AWAY: 2,
});

/** Map a (home, away) score to outcome: '1' home win, 'X' draw, '2' away win. */
function outcome(home, away) {
  if (home > away) return '1';
  if (home < away) return '2';
  return 'X';
}

/**
 * Score a single match prediction against the actual result.
 * @param {{home:number, away:number}} pred   predicted score
 * @param {{home:number, away:number}} actual actual score
 * @returns {{outcome:number, home:number, away:number, total:number}}
 */
function scoreMatchPrediction(pred, actual) {
  const result = { outcome: 0, home: 0, away: 0, total: 0 };
  if (!pred || !actual) return result;

  if (outcome(pred.home, pred.away) === outcome(actual.home, actual.away)) {
    result.outcome = POINTS.OUTCOME;
  }
  if (pred.home === actual.home) result.home = POINTS.EXACT_HOME;
  if (pred.away === actual.away) result.away = POINTS.EXACT_AWAY;

  result.total = result.outcome + result.home + result.away;
  return result;
}

module.exports = { POINTS, outcome, scoreMatchPrediction };
