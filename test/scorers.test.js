// Integration test for personal goal-scorer scoring (goals*3 + assists*1).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `vmtips-scorers-${process.pid}.db`);
for (const ext of ['', '-wal', '-shm']) try { fs.unlinkSync(tmp + ext); } catch (_) {}
process.env.DB_PATH = tmp;

const db = require('../db');
const scorers = require('../lib/scorers');

function reset() {
  db.pragma('foreign_keys = OFF');
  db.exec('DELETE FROM scorer_picks; DELETE FROM players; DELETE FROM users; DELETE FROM leagues;');
  db.pragma('foreign_keys = ON');
  db.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (1,?,?,?)').run('u', 'h', 'U');
  db.prepare('INSERT INTO leagues (id, name, admin_user_id, join_code) VALUES (1,?,1,?)').run('L', 'C');
}

test('importPlayers merges goals/assists by max across both lists', () => {
  reset();
  const topscorers = { response: [{ player: { id: 9, name: 'A' }, statistics: [{ team: { name: 'X' }, goals: { total: 5, assists: 1 } }] }] };
  const topassists = { response: [{ player: { id: 9, name: 'A' }, statistics: [{ team: { name: 'X' }, goals: { total: 5, assists: 4 } }] }] };
  scorers.importPlayers(topscorers, topassists);
  const p = db.prepare('SELECT * FROM players WHERE api_player_id = 9').get();
  assert.equal(p.goals, 5);
  assert.equal(p.assists, 4); // max(1, 4)
});

test('scorePlayer = goals*3 + assists*1', () => {
  assert.equal(scorers.scorePlayer({ goals: 4, assists: 2 }), 14);
  assert.equal(scorers.scorePlayer({ goals: 0, assists: 0 }), 0);
});

test('recomputeScorers sets pick points from the player pool', () => {
  reset();
  db.prepare('INSERT INTO players (id, api_player_id, name, goals, assists) VALUES (1,1,?,3,2),(2,2,?,1,0)').run('P1', 'P2');
  db.prepare('INSERT INTO scorer_picks (user_id, league_id, player_id, slot) VALUES (1,1,1,1),(1,1,2,2)').run();
  const n = scorers.recomputeScorers(1);
  assert.equal(n, 2);
  const total = db.prepare('SELECT COALESCE(SUM(points),0) s FROM scorer_picks WHERE league_id=1').get().s;
  // P1: 3*3+2 = 11 ; P2: 1*3 = 3 ; total 14
  assert.equal(total, 14);
});
