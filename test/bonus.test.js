// Integration test for tournament bonuses + custom bonus questions.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `vmtips-bonus-${process.pid}.db`);
for (const ext of ['', '-wal', '-shm']) try { fs.unlinkSync(tmp + ext); } catch (_) {}
process.env.DB_PATH = tmp;

const db = require('../db');
const bonus = require('../lib/bonus');

function reset() {
  db.pragma('foreign_keys = OFF');
  db.exec(`DELETE FROM tournament_picks; DELETE FROM bonus_answers; DELETE FROM bonus_questions;
           DELETE FROM bracket_slots; DELETE FROM matches; DELETE FROM players;
           DELETE FROM teams; DELETE FROM users; DELETE FROM leagues;`);
  db.pragma('foreign_keys = ON');
  db.prepare('INSERT INTO users (id,email,password_hash,display_name) VALUES (1,?,?,?),(2,?,?,?)').run('a', 'h', 'A', 'b', 'h', 'B');
  db.prepare('INSERT INTO leagues (id,name,admin_user_id,join_code) VALUES (1,?,1,?)').run('L', 'C');
  db.prepare('INSERT INTO teams (id,name) VALUES (1,?),(2,?)').run('Brasilien', 'Portugal');
  db.prepare('INSERT INTO players (id,name,goals,assists) VALUES (1,?,5,1),(2,?,2,4)').run('Star1', 'Star2');
}

test('tournament bonuses score champion/scorer/assist/total goals', () => {
  reset();
  // Final played: team 1 champion. One group match 3-1 (4) + final 2-0 (2) = 6 goals.
  db.prepare("INSERT INTO matches (id,home_team_id,away_team_id,home_goals,away_goals,status) VALUES (1,1,2,3,1,'finished')").run();
  db.prepare("INSERT INTO bracket_slots (id,round,pos,home_team_id,away_team_id,home_goals,away_goals,winner_team_id,status) VALUES (1,'final',1,1,2,2,0,1,'finished')").run();
  db.prepare('INSERT INTO tournament_picks (user_id,league_id,champion_team_id,top_scorer_id,top_assist_id,total_goals) VALUES (1,1,1,1,2,6)').run();
  bonus.recomputeTournament(1);
  const t = db.prepare('SELECT * FROM tournament_picks WHERE user_id=1 AND league_id=1').get();
  assert.equal(t.pts_champion, 30);
  assert.equal(t.pts_scorer, 25);  // player 1 has most goals
  assert.equal(t.pts_assist, 25);  // player 2 has most assists
  assert.equal(t.pts_goals, 20);   // guessed 6 == actual 6
});

test('wrong total goals / champion score zero', () => {
  reset();
  db.prepare("INSERT INTO matches (id,home_team_id,away_team_id,home_goals,away_goals,status) VALUES (1,1,2,3,1,'finished')").run();
  db.prepare("INSERT INTO bracket_slots (id,round,pos,home_team_id,away_team_id,home_goals,away_goals,winner_team_id,status) VALUES (1,'final',1,1,2,2,0,1,'finished')").run();
  db.prepare('INSERT INTO tournament_picks (user_id,league_id,champion_team_id,top_scorer_id,top_assist_id,total_goals) VALUES (1,1,2,2,1,99)').run();
  bonus.recomputeTournament(1);
  const t = db.prepare('SELECT * FROM tournament_picks WHERE user_id=1 AND league_id=1').get();
  assert.deepEqual([t.pts_champion, t.pts_scorer, t.pts_assist, t.pts_goals], [0, 0, 0, 0]);
});

test('custom question awards points to matching answers (case-insensitive)', () => {
  reset();
  const qid = db.prepare('INSERT INTO bonus_questions (league_id,text,points,created_by) VALUES (1,?,15,1)').run('Vem vinner?').lastInsertRowid;
  db.prepare('INSERT INTO bonus_answers (question_id,user_id,answer) VALUES (?,1,?),(?,2,?)').run(qid, 'brasilien', qid, 'Portugal');
  db.prepare('UPDATE bonus_questions SET correct_answer=? WHERE id=?').run('Brasilien', qid);
  const n = bonus.recomputeQuestion(qid);
  assert.equal(n, 2);
  const a1 = db.prepare('SELECT points FROM bonus_answers WHERE question_id=? AND user_id=1').get(qid);
  const a2 = db.prepare('SELECT points FROM bonus_answers WHERE question_id=? AND user_id=2').get(qid);
  assert.equal(a1.points, 15); // 'brasilien' matches 'Brasilien'
  assert.equal(a2.points, 0);
});
