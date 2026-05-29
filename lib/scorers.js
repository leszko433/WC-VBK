// Personal goal scorers ("3 målgörare"): import the player pool from api-football
// top scorers/assists, and score each user's picks. Goal = 3 p, assist = 1 p.
const db = require('../db');

const GOAL_POINTS = 3;
const ASSIST_POINTS = 1;

const teamIdByApi = db.prepare('SELECT id FROM teams WHERE api_team_id = ?');
const upsertPlayer = db.prepare(`
  INSERT INTO players (api_player_id, name, team_id, team_name, goals, assists)
  VALUES (@api_player_id, @name, @team_id, @team_name, @goals, @assists)
  ON CONFLICT(api_player_id) DO UPDATE SET
    name      = excluded.name,
    team_id   = COALESCE(excluded.team_id, players.team_id),
    team_name = COALESCE(excluded.team_name, players.team_name),
    goals     = MAX(excluded.goals, players.goals),
    assists   = MAX(excluded.assists, players.assists)
`);

// Merge top scorers + top assists into the players table. A player may appear in
// both; goals/assists are taken as the max seen (both endpoints report the same
// season totals, so this is robust to either source).
function importPlayers(topscorers, topassists) {
  const rows = [...(topscorers?.response || []), ...(topassists?.response || [])];
  const tx = db.transaction(() => {
    for (const r of rows) {
      const st = (r.statistics && r.statistics[0]) || {};
      const apiTeam = st.team || {};
      const localTeam = apiTeam.id ? teamIdByApi.get(apiTeam.id) : null;
      upsertPlayer.run({
        api_player_id: r.player.id,
        name: r.player.name,
        team_id: localTeam ? localTeam.id : null,
        team_name: apiTeam.name || null,
        goals: st.goals?.total ?? 0,
        assists: st.goals?.assists ?? 0,
      });
    }
  });
  tx();
  return db.prepare('SELECT COUNT(*) c FROM players').get().c;
}

const playerById = db.prepare('SELECT goals, assists FROM players WHERE id = ?');
const setPickPoints = db.prepare('UPDATE scorer_picks SET points = ? WHERE id = ?');

function scorePlayer(p) {
  return p.goals * GOAL_POINTS + p.assists * ASSIST_POINTS;
}

// Recompute scorer-pick points (for one league, or all).
function recomputeScorers(leagueId) {
  const picks = leagueId
    ? db.prepare('SELECT * FROM scorer_picks WHERE league_id = ?').all(leagueId)
    : db.prepare('SELECT * FROM scorer_picks').all();
  const tx = db.transaction(() => {
    for (const pick of picks) {
      const pl = playerById.get(pick.player_id);
      setPickPoints.run(pl ? scorePlayer(pl) : 0, pick.id);
    }
  });
  tx();
  return picks.length;
}

module.exports = { GOAL_POINTS, ASSIST_POINTS, importPlayers, recomputeScorers, scorePlayer };
