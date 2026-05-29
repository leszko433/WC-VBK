// Imports api-football standings + fixtures into the local DB.
// Parses the real api-football v3 response shape, so it works identically for
// seed/mock data and live data.
const db = require('../db');
const api = require('./apiFootball');

const upsertTeam = db.prepare(`
  INSERT INTO teams (api_team_id, name, grp, flag)
  VALUES (@api_team_id, @name, @grp, @flag)
  ON CONFLICT(api_team_id) DO UPDATE SET
    name = excluded.name,
    grp  = COALESCE(excluded.grp, teams.grp),
    flag = COALESCE(excluded.flag, teams.flag)
`);

const teamIdByApi = db.prepare('SELECT id FROM teams WHERE api_team_id = ?');

const upsertMatch = db.prepare(`
  INSERT INTO matches (api_fixture_id, round, slot, home_team_id, away_team_id, kickoff, home_goals, away_goals, status)
  VALUES (@api_fixture_id, @round, @slot, @home_team_id, @away_team_id, @kickoff, @home_goals, @away_goals, @status)
  ON CONFLICT(api_fixture_id) DO UPDATE SET
    home_goals = excluded.home_goals,
    away_goals = excluded.away_goals,
    status     = excluded.status,
    kickoff    = excluded.kickoff
`);

function importStandings(data) {
  const groups = data?.response?.[0]?.league?.standings || [];
  const tx = db.transaction(() => {
    for (const group of groups) {
      for (const row of group) {
        upsertTeam.run({
          api_team_id: row.team.id,
          name: row.team.name,
          grp: (row.group || '').replace(/^Group\s+/i, '') || null,
          flag: row.flag || null,
        });
      }
    }
  });
  tx();
}

function importFixtures(data) {
  const fixtures = data?.response || [];
  const tx = db.transaction(() => {
    for (const fx of fixtures) {
      // Make sure both teams exist (fixtures may arrive before standings).
      for (const side of ['home', 'away']) {
        const t = fx.teams[side];
        upsertTeam.run({ api_team_id: t.id, name: t.name, grp: null, flag: null });
      }
      const home = teamIdByApi.get(fx.teams.home.id);
      const away = teamIdByApi.get(fx.teams.away.id);
      const finished = ['FT', 'AET', 'PEN'].includes(fx.fixture.status?.short);
      upsertMatch.run({
        api_fixture_id: fx.fixture.id,
        round: 'group',
        slot: fx.league?.round || null,
        home_team_id: home.id,
        away_team_id: away.id,
        kickoff: fx.fixture.date || null,
        home_goals: fx.goals?.home ?? null,
        away_goals: fx.goals?.away ?? null,
        status: finished ? 'finished' : 'scheduled',
      });
    }
  });
  tx();
}

// Fetch (mock or live) and load everything. Returns counts.
async function syncAll() {
  const standings = await api.getStandings();
  importStandings(standings);
  const fixtures = await api.getFixtures();
  importFixtures(fixtures);
  return {
    teams: db.prepare('SELECT COUNT(*) c FROM teams').get().c,
    matches: db.prepare('SELECT COUNT(*) c FROM matches').get().c,
  };
}

module.exports = { syncAll, importStandings, importFixtures };
