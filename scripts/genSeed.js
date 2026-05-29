// Generates a complete, deterministic 48-team World Cup mock into seed/*.json:
// 12 groups (group results) + a full knockout bracket (R32→Final) with results.
// This lets the whole app — group tipping, qualification, and the bracket — run
// and be tested without the live API. Run: node scripts/genSeed.js
const fs = require('fs');
const path = require('path');

const SEED_DIR = path.join(__dirname, '..', 'seed');
const GROUPS = 'ABCDEFGHIJKL'.split(''); // 12 groups of 4

// 48 [name, flag], grouped 4 per group in listed order (first = strongest in group).
const COUNTRIES = [
  ['Brasilien','🇧🇷'],['Marocko','🇲🇦'],['Serbien','🇷🇸'],['Kanada','🇨🇦'],
  ['Frankrike','🇫🇷'],['Senegal','🇸🇳'],['Polen','🇵🇱'],['Costa Rica','🇨🇷'],
  ['Argentina','🇦🇷'],['Japan','🇯🇵'],['Tunisien','🇹🇳'],['Nya Zeeland','🇳🇿'],
  ['Tyskland','🇩🇪'],['Sydkorea','🇰🇷'],['Ghana','🇬🇭'],['Panama','🇵🇦'],
  ['Spanien','🇪🇸'],['Schweiz','🇨🇭'],['Kamerun','🇨🇲'],['Jordanien','🇯🇴'],
  ['Portugal','🇵🇹'],['Uruguay','🇺🇾'],['Egypten','🇪🇬'],['Curaçao','🇨🇼'],
  ['Nederländerna','🇳🇱'],['Mexiko','🇲🇽'],['Iran','🇮🇷'],['Haiti','🇭🇹'],
  ['Belgien','🇧🇪'],['Kroatien','🇭🇷'],['Nigeria','🇳🇬'],['Uzbekistan','🇺🇿'],
  ['Italien','🇮🇹'],['Colombia','🇨🇴'],['Algeriet','🇩🇿'],['Sydafrika','🇿🇦'],
  ['England','🇬🇧'],['Ecuador','🇪🇨'],['Saudiarabien','🇸🇦'],['Jamaica','🇯🇲'],
  ['USA','🇺🇸'],['Australien','🇦🇺'],['Qatar','🇶🇦'],['Kap Verde','🇨🇻'],
  ['Danmark','🇩🇰'],['Peru','🇵🇪'],['Elfenbenskusten','🇨🇮'],['Norge','🇳🇴'],
];

// Build teams. strength: lower = stronger. Group winners strongest, then runners,
// then thirds, then fourths; group index breaks ties.
const teams = []; // {id, name, flag, group, rank, strength}
let teamId = 100;
GROUPS.forEach((g, gi) => {
  for (let r = 0; r < 4; r++) {
    const [name, flag] = COUNTRIES[gi * 4 + r];
    teams.push({ id: teamId++, name, flag, group: g, rank: r + 1, strength: r * 100 + gi });
  }
});
const byGroupRank = (g, rank) => teams.find((t) => t.group === g && t.rank === rank);

// ---- Group fixtures (round-robin); stronger (lower rank number) wins ----
const fixtures = [];
let gfid = 10000;
let day = 11;
GROUPS.forEach((g) => {
  const gt = teams.filter((t) => t.group === g); // index 0..3 strongest..weakest
  const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
  pairs.forEach(([a, b], k) => {
    const home = gt[a], away = gt[b]; // home is the stronger of the pair
    const hg = 2, ag = k % 2; // 2-0 or 2-1, home (stronger) always wins
    fixtures.push(mkFixture(++gfid, `2026-06-${String(day).padStart(2, '0')}T16:00:00+00:00`,
      `Group Stage - ${k < 2 ? 1 : k < 4 ? 2 : 3}`, home, away, hg, ag, 'FT'));
  });
  day = day >= 24 ? 11 : day + 1;
});

// ---- Knockout: universal key seeding ----
const win = (g) => byGroupRank(g, 1);
const run = (g) => byGroupRank(g, 2);
const thd = (g) => byGroupRank(g, 3);
// 12 winner-vs-runner matches + 4 third-vs-third (best 8 thirds = groups A–H).
const r32Pairs = [
  [win('A'), run('B')], [win('C'), run('D')], [win('E'), run('F')], [win('G'), run('H')],
  [win('I'), run('J')], [win('K'), run('L')], [win('B'), run('A')], [win('D'), run('C')],
  [win('F'), run('E')], [win('H'), run('G')], [win('J'), run('I')], [win('L'), run('K')],
  [thd('A'), thd('H')], [thd('B'), thd('G')], [thd('C'), thd('F')], [thd('D'), thd('E')],
];

// Knockout slots are seeded with their teams (so users can fill the bracket and
// qualification post-group-stage) but left unplayed (NS, no result). The "true"
// winner is still computed deterministically to seed the next round's matchups;
// admins enter actual results to score. This mirrors the real phase-2 window.
function playRound(pairs, baseId, roundName, kickoffDay) {
  const winners = [];
  pairs.forEach(([home, away], i) => {
    const homeStronger = home.strength <= away.strength;
    fixtures.push(mkFixture(baseId + i + 1,
      `2026-07-${String(kickoffDay).padStart(2, '0')}T18:00:00+00:00`, roundName, home, away, null, null, 'NS'));
    winners.push(homeStronger ? home : away);
  });
  return winners;
}
function nextPairs(winners) {
  const out = [];
  for (let i = 0; i < winners.length; i += 2) out.push([winners[i], winners[i + 1]]);
  return out;
}

const r32W = playRound(r32Pairs, 32000, 'Round of 32', 3);
const r16W = playRound(nextPairs(r32W), 33000, 'Round of 16', 7);
const qfW = playRound(nextPairs(r16W), 34000, 'Quarter-finals', 11);
const sfW = playRound(nextPairs(qfW), 35000, 'Semi-finals', 14);
playRound(nextPairs(sfW), 36000, 'Final', 19);

function mkFixture(id, date, round, home, away, hg, ag, status) {
  return {
    fixture: { id, date, status: { short: status } },
    league: { round },
    teams: { home: { id: home.id, name: home.name }, away: { id: away.id, name: away.name } },
    goals: { home: hg, away: ag },
  };
}

// ---- Standings (final group tables; rank = listed order) ----
const standings = {
  response: [
    {
      league: {
        id: 1, season: 2026,
        standings: GROUPS.map((g) =>
          teams.filter((t) => t.group === g).map((t) => ({
            rank: t.rank, team: { id: t.id, name: t.name, logo: '' },
            group: `Group ${g}`, flag: t.flag,
          }))
        ),
      },
    },
  ],
};

fs.writeFileSync(path.join(SEED_DIR, 'fixtures.json'), JSON.stringify({ response: fixtures }, null, 2));
fs.writeFileSync(path.join(SEED_DIR, 'standings.json'), JSON.stringify(standings, null, 2));
console.log(`Wrote ${teams.length} teams, ${fixtures.length} fixtures (incl. 31 knockout) to seed/.`);
