// Integration test for the bracket scoring tracks against an isolated temp DB.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Point the DB at a fresh temp file before requiring db/bracket.
const tmp = path.join(os.tmpdir(), `vmtips-bracket-${process.pid}.db`);
for (const ext of ['', '-wal', '-shm']) try { fs.unlinkSync(tmp + ext); } catch (_) {}
process.env.DB_PATH = tmp;

const db = require('../db');
const bracket = require('../lib/bracket');

function seed() {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('DELETE FROM bracket_predictions; DELETE FROM bracket_slots; DELETE FROM qualifier_picks; DELETE FROM teams; DELETE FROM users; DELETE FROM leagues;');
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare('INSERT INTO teams (id, name, grp) VALUES (1,?,?),(2,?,?)').run('A', 'X', 'B', 'X');
  db.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (1,?,?,?)').run('u@x', 'h', 'U');
  db.prepare('INSERT INTO leagues (id, name, admin_user_id, join_code) VALUES (1,?,1,?)').run('L', 'C');
  // A quarter-final slot, team 1 vs team 2.
  db.prepare(`INSERT INTO bracket_slots (id, round, pos, home_team_id, away_team_id) VALUES (1,'qf',1,1,2)`).run();
}

test('advance + result points for a correct knockout pick', () => {
  seed();
  // User predicts 2-1 and that team 1 advances.
  db.prepare(`INSERT INTO bracket_predictions (user_id, league_id, slot_id, pred_home, pred_away, pred_winner_team_id)
              VALUES (1,1,1,2,1,1)`).run();
  // Actual result 2-1, team 1 wins.
  db.prepare(`UPDATE bracket_slots SET home_goals=2, away_goals=1, winner_team_id=1, status='finished' WHERE id=1`).run();
  bracket.recomputeSlot(1);
  const p = db.prepare('SELECT * FROM bracket_predictions WHERE user_id=1 AND league_id=1 AND slot_id=1').get();
  assert.equal(p.points_result, 7, 'perfect scoreline = 7');
  assert.equal(p.points_advance, bracket.ADVANCE_POINTS.qf, 'correct advance = 12 (reach SF)');
  assert.equal(bracket.ADVANCE_POINTS.qf, 12);
});

test('partial scoreline + correct winner: result partial, advance awarded', () => {
  seed();
  db.prepare(`INSERT INTO bracket_predictions (user_id, league_id, slot_id, pred_home, pred_away, pred_winner_team_id)
              VALUES (1,1,1,1,1,2)`).run(); // predicts 1-1, team 2 advances
  db.prepare(`UPDATE bracket_slots SET home_goals=1, away_goals=2, winner_team_id=2, status='finished' WHERE id=1`).run();
  bracket.recomputeSlot(1);
  const p = db.prepare('SELECT * FROM bracket_predictions WHERE user_id=1 AND league_id=1 AND slot_id=1').get();
  // pred 1-1 vs actual 1-2: outcome wrong, home exact (1==1) +2, away wrong => 2
  assert.equal(p.points_result, 2);
  // predicted winner team 2 == actual winner team 2 => advance awarded
  assert.equal(p.points_advance, 12);
});

test('qualification awards 3p per correct R32 team', () => {
  seed();
  db.prepare(`UPDATE bracket_slots SET round='r32' WHERE id=1`).run(); // slot now seeds R32 with teams 1 & 2
  db.prepare('INSERT INTO qualifier_picks (user_id, league_id, team_id) VALUES (1,1,1),(1,1,2)').run();
  const n = bracket.recomputeQualification(1);
  assert.equal(n, 2);
  const pts = db.prepare('SELECT COALESCE(SUM(points),0) s FROM qualifier_picks WHERE league_id=1').get().s;
  assert.equal(pts, 2 * bracket.QUALIFY_POINTS); // 6
  assert.equal(bracket.QUALIFY_POINTS, 3);
});

test('round points sum to 342 (qualification + advancement)', () => {
  const qual = 32 * bracket.QUALIFY_POINTS; // 96
  const adv = 16 * bracket.ADVANCE_POINTS.r32 + 8 * bracket.ADVANCE_POINTS.r16 +
              4 * bracket.ADVANCE_POINTS.qf + 2 * bracket.ADVANCE_POINTS.sf;
  assert.equal(qual + adv, 342);
});
