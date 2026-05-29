// Unit tests for the scoring engine, using the worked examples from the rules screenshots.
const test = require('node:test');
const assert = require('node:assert');
const { scoreMatchPrediction, outcome } = require('../lib/scoring');

test('outcome mapping', () => {
  assert.equal(outcome(2, 1), '1');
  assert.equal(outcome(1, 1), 'X');
  assert.equal(outcome(0, 2), '2');
});

// Screenshot "Poängexempel": Tips 2-1 against various results.
test('Tips 2-1 vs 2-1 = 7 (Perfekt tips)', () => {
  assert.equal(scoreMatchPrediction({ home: 2, away: 1 }, { home: 2, away: 1 }).total, 7);
});

test('Tips 2-1 vs 3-1 = 5 (utfall + borta)', () => {
  const s = scoreMatchPrediction({ home: 2, away: 1 }, { home: 3, away: 1 });
  assert.deepEqual([s.outcome, s.home, s.away, s.total], [3, 0, 2, 5]);
});

test('Tips 2-1 vs 1-1 = 2 (bara borta)', () => {
  const s = scoreMatchPrediction({ home: 2, away: 1 }, { home: 1, away: 1 });
  assert.deepEqual([s.outcome, s.home, s.away, s.total], [0, 0, 2, 2]);
});

test('Tips 2-1 vs 0-2 = 0', () => {
  assert.equal(scoreMatchPrediction({ home: 2, away: 1 }, { home: 0, away: 2 }).total, 0);
});

test('draw exact = 7', () => {
  assert.equal(scoreMatchPrediction({ home: 1, away: 1 }, { home: 1, away: 1 }).total, 7);
});
