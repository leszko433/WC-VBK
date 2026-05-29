// VM-tips 2026 — single-page frontend logic (vanilla JS).
const api = {
  async req(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error((data && data.error) || `Fel ${res.status}`);
    return data;
  },
  get: (u) => api.req('GET', u),
  post: (u, b) => api.req('POST', u, b),
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let state = { user: null, leagueId: null, fixtures: [] };

function show(view) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $('#view-' + view).classList.remove('hidden');
}
function msg(el, text, ok) {
  el.textContent = text || '';
  el.className = 'formmsg ' + (text ? (ok ? 'ok' : 'err') : '');
}

/* ---------- Auth ---------- */
$$('.auth-card .tab').forEach((t) =>
  t.addEventListener('click', () => {
    $$('.auth-card .tab').forEach((x) => x.classList.toggle('active', x === t));
    $('#loginForm').classList.toggle('hidden', t.dataset.tab !== 'login');
    $('#registerForm').classList.toggle('hidden', t.dataset.tab !== 'register');
  })
);

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    state.user = await api.post('/api/auth/login', {
      email: f.email.value, password: f.password.value,
    });
    enterApp();
  } catch (err) { msg($('#loginMsg'), err.message); }
});

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    state.user = await api.post('/api/auth/register', {
      code: f.code.value, displayName: f.displayName.value,
      email: f.email.value, password: f.password.value,
    });
    enterApp();
  } catch (err) { msg($('#registerMsg'), err.message); }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api.post('/api/auth/logout');
  state.user = null;
  $('#nav').classList.add('hidden');
  show('auth');
});

/* ---------- Navigation ---------- */
$$('#nav a[data-view]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const v = a.dataset.view;
    if (v === 'dashboard') loadDashboard();
    else if (v === 'admin') loadSiteAdmin();
  })
);
$('#backBtn').addEventListener('click', loadDashboard);

function enterApp() {
  $('#nav').classList.remove('hidden');
  $('#whoami').textContent = state.user.display_name || state.user.email;
  $('#navAdmin').classList.toggle('hidden', !state.user.is_site_admin);
  loadDashboard();
}

/* ---------- Dashboard ---------- */
async function loadDashboard() {
  show('dashboard');
  const leagues = await api.get('/api/leagues');
  const ul = $('#leagueList');
  ul.innerHTML = '';
  $('#noLeagues').classList.toggle('hidden', leagues.length > 0);
  leagues.forEach((l) => {
    const li = document.createElement('li');
    li.innerHTML = `<span><b>${esc(l.name)}</b> <span class="meta">· ${l.members} medlemmar · kod ${esc(l.join_code)}</span></span>
      <span class="meta">${l.role === 'admin' ? '👑 admin' : ''} →</span>`;
    li.addEventListener('click', () => openLeague(l.id));
    ul.appendChild(li);
  });
}

$('#createLeagueForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api.post('/api/leagues', { name: e.target.name.value });
    msg($('#createLeagueMsg'), `Liga skapad! Delningskod: ${r.join_code}`, true);
    e.target.reset();
    loadDashboard();
  } catch (err) { msg($('#createLeagueMsg'), err.message); }
});

$('#joinLeagueForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.post('/api/leagues/join', { code: e.target.code.value });
    msg($('#joinLeagueMsg'), 'Du gick med i ligan!', true);
    e.target.reset();
    loadDashboard();
  } catch (err) { msg($('#joinLeagueMsg'), err.message); }
});

/* ---------- League view ---------- */
async function openLeague(id) {
  state.leagueId = id;
  const league = await api.get('/api/leagues/' + id);
  $('#leagueName').textContent = league.name;
  $('#leagueAdminTab').classList.toggle('hidden', league.my_role !== 'admin' && !state.user.is_site_admin);
  show('league');
  switchLeagueTab('fixtures');
  loadFixtures();
}

$$('[data-ltab]').forEach((t) =>
  t.addEventListener('click', () => switchLeagueTab(t.dataset.ltab))
);
function switchLeagueTab(tab) {
  $$('[data-ltab]').forEach((x) => x.classList.toggle('active', x.dataset.ltab === tab));
  $$('.ltab').forEach((x) => x.classList.add('hidden'));
  $('#ltab-' + tab).classList.remove('hidden');
  if (tab === 'bracket') loadBracket();
  if (tab === 'scorers') loadScorers();
  if (tab === 'bonus') loadBonus();
  if (tab === 'leaderboard') loadLeaderboard();
  if (tab === 'admin') { loadInvites(); loadAdminQuestions(); }
}

function fmtKick(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function loadFixtures() {
  state.fixtures = await api.get(`/api/leagues/${state.leagueId}/fixtures`);
  const wrap = $('#fixtures');
  wrap.innerHTML = '';
  const groups = {};
  state.fixtures.forEach((m) => {
    const g = (m.grp ? 'Grupp ' + m.grp : (m.slot || 'Matcher'));
    (groups[g] = groups[g] || []).push(m);
  });
  Object.keys(groups).sort().forEach((g) => {
    const h = document.createElement('div');
    h.className = 'group-h';
    h.textContent = g;
    wrap.appendChild(h);
    groups[g].forEach((m) => wrap.appendChild(renderMatch(m)));
  });
}

function renderMatch(m) {
  const el = document.createElement('div');
  const finished = m.home_goals != null && m.away_goals != null;
  const locked = finished || !!m.locked || (m.kickoff && new Date(m.kickoff) <= new Date());
  el.className = 'match' + (locked ? ' locked' : '');
  const ph = m.pred_home != null ? m.pred_home : '';
  const pa = m.pred_away != null ? m.pred_away : '';
  const pts = m.points != null && finished ? `<span class="pts">+${m.points}p</span>` : '';
  const center = finished
    ? `<span class="result">${m.home_goals}–${m.away_goals}</span>`
    : `<span class="vs">vs</span>`;
  el.innerHTML = `
    <div class="team home"><span class="flag">${esc(m.home_flag || '🏳️')}</span> ${esc(m.home_name)}</div>
    <div class="score">
      <input type="number" min="0" data-match="${m.id}" data-side="home" value="${ph}" ${locked ? 'disabled' : ''} />
      ${center}
      <input type="number" min="0" data-match="${m.id}" data-side="away" value="${pa}" ${locked ? 'disabled' : ''} />
      ${pts}
    </div>
    <div class="team away">${esc(m.away_name)} <span class="flag">${esc(m.away_flag || '🏳️')}</span></div>
    <span class="kick">${locked && !finished ? '🔒 låst · ' : ''}${fmtKick(m.kickoff)}</span>`;
  return el;
}

$('#savePredsBtn').addEventListener('click', async () => {
  const map = {};
  $$('#fixtures input[type=number]').forEach((inp) => {
    if (inp.disabled || inp.value === '') return;
    const id = inp.dataset.match;
    map[id] = map[id] || { matchId: Number(id) };
    map[id][inp.dataset.side] = Number(inp.value);
  });
  const predictions = Object.values(map).filter((p) => p.home != null && p.away != null);
  if (!predictions.length) return msg($('#saveMsg'), 'Inga tips att spara', false);
  try {
    const r = await api.post(`/api/leagues/${state.leagueId}/predictions`, { predictions });
    msg($('#saveMsg'), `Sparade ${r.saved.length} tips${r.skipped.length ? ', ' + r.skipped.length + ' hoppade över' : ''}`, true);
    loadFixtures();
  } catch (err) { msg($('#saveMsg'), err.message); }
});

async function loadLeaderboard() {
  const rows = await api.get(`/api/leagues/${state.leagueId}/leaderboard`);
  const tb = $('#boardBody');
  tb.innerHTML = '';
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    const medal = ['🥇', '🥈', '🥉'][i] || (i + 1);
    tr.innerHTML = `<td>${medal}</td><td>${esc(r.display_name)}</td><td>${r.predictions}</td><td>${r.points}</td>`;
    tb.appendChild(tr);
  });
}

/* ---------- Bracket (slutspel) ---------- */
let bracketData = null;
const ROUND_TITLE = { r32: '16-delsfinal', r16: 'Åttondelsfinal', qf: 'Kvartsfinal', sf: 'Semifinal', final: 'Final' };

async function loadBracket() {
  bracketData = await api.get(`/api/leagues/${state.leagueId}/bracket`);
  renderQualification();
  renderBracket();
}

function renderQualification() {
  const wrap = $('#qualGroups');
  wrap.innerHTML = '';
  const picked = new Set(bracketData.myQualifiers);
  const r32Started = bracketData.slots.some((s) => s.round === 'r32' && s.status === 'finished');
  const groups = {};
  bracketData.teams.forEach((t) => { (groups[t.grp || '?'] = groups[t.grp || '?'] || []).push(t); });
  Object.keys(groups).sort().forEach((g) => {
    const div = document.createElement('div');
    div.className = 'qgroup';
    div.innerHTML = `<h4>Grupp ${esc(g)}</h4>`;
    groups[g].forEach((t) => {
      const lab = document.createElement('label');
      lab.className = 'qteam' + (picked.has(t.id) ? ' picked' : '');
      lab.innerHTML = `<input type="checkbox" data-qteam="${t.id}" ${picked.has(t.id) ? 'checked' : ''} ${r32Started ? 'disabled' : ''}/> ${esc(t.flag || '')} ${esc(t.name)}`;
      lab.querySelector('input').addEventListener('change', (e) => {
        lab.classList.toggle('picked', e.target.checked);
        updateQualCount();
      });
      div.appendChild(lab);
    });
    wrap.appendChild(div);
  });
  $('#saveQualBtn').disabled = r32Started;
  updateQualCount();
}
function updateQualCount() {
  const n = $$('#qualGroups input[data-qteam]:checked').length;
  $('#qualCount').textContent = `${n} / 32 lag valda`;
}

$('#saveQualBtn').addEventListener('click', async () => {
  const teamIds = $$('#qualGroups input[data-qteam]:checked').map((i) => Number(i.dataset.qteam));
  try {
    const r = await api.post(`/api/leagues/${state.leagueId}/qualification`, { teamIds });
    msg($('#qualMsg'), `Sparade ${r.saved} lag`, true);
  } catch (err) { msg($('#qualMsg'), err.message); }
});

function renderBracket() {
  const wrap = $('#bracket');
  wrap.innerHTML = '';
  const byRound = {};
  bracketData.slots.forEach((s) => { (byRound[s.round] = byRound[s.round] || []).push(s); });
  bracketData.rounds.forEach((round) => {
    const slots = byRound[round] || [];
    if (!slots.length) return;
    const col = document.createElement('div');
    col.className = 'bcol';
    const adv = bracketData.advancePoints[round] || 0;
    col.innerHTML = `<h4>${ROUND_TITLE[round]} ${adv ? `· +${adv}p/lag` : ''}</h4>`;
    slots.forEach((s) => col.appendChild(renderSlot(s)));
    wrap.appendChild(col);
  });
}

function renderSlot(s) {
  const el = document.createElement('div');
  const finished = s.home_goals != null && s.away_goals != null;
  const locked = finished || !!s.locked;
  el.className = 'bslot' + (locked ? ' locked' : '');
  const sideHtml = (id, name, flag) => {
    if (!id) return `<div class="tbd">— okänt lag —</div>`;
    const sel = s.pred_winner_team_id === id ? ' sel' : '';
    const actual = finished && s.winner_team_id === id ? ' actual-win' : '';
    return `<div class="pick${sel}${actual}" data-slot="${s.id}" data-team="${id}">
      ${esc(flag || '')} ${esc(name)}</div>`;
  };
  const ph = s.pred_home != null ? s.pred_home : '';
  const pa = s.pred_away != null ? s.pred_away : '';
  let res = '';
  if (finished) {
    res = `<div class="res">Facit: ${s.home_goals}–${s.away_goals}` +
      (s.points_result != null ? ` · <b>+${(s.points_result || 0) + (s.points_advance || 0)}p</b>` : '') + `</div>`;
  }
  el.innerHTML =
    sideHtml(s.home_team_id, s.home_name, s.home_flag) +
    sideHtml(s.away_team_id, s.away_name, s.away_flag) +
    `<div class="sline">
       <input type="number" min="0" data-slot="${s.id}" data-side="home" value="${ph}" ${locked ? 'disabled' : ''}/>
       <span class="vs">–</span>
       <input type="number" min="0" data-slot="${s.id}" data-side="away" value="${pa}" ${locked ? 'disabled' : ''}/>
     </div>` + res;
  if (!locked) {
    el.querySelectorAll('.pick').forEach((p) =>
      p.addEventListener('click', () => {
        el.querySelectorAll('.pick').forEach((x) => x.classList.remove('sel'));
        p.classList.add('sel');
      })
    );
  }
  return el;
}

$('#saveBracketBtn').addEventListener('click', async () => {
  const map = {};
  $$('#bracket .bslot input[type=number]').forEach((inp) => {
    if (inp.disabled) return;
    const id = inp.dataset.slot;
    map[id] = map[id] || { slotId: Number(id) };
    if (inp.value !== '') map[id][inp.dataset.side] = Number(inp.value);
  });
  $$('#bracket .pick.sel').forEach((p) => {
    const id = p.dataset.slot;
    map[id] = map[id] || { slotId: Number(id) };
    map[id].winnerTeamId = Number(p.dataset.team);
  });
  const picks = Object.values(map);
  if (!picks.length) return msg($('#bracketMsg'), 'Inga tips att spara', false);
  try {
    const r = await api.post(`/api/leagues/${state.leagueId}/bracket`, { picks });
    msg($('#bracketMsg'), `Sparade ${r.saved.length} slutspelstips${r.skipped.length ? ', ' + r.skipped.length + ' hoppade över' : ''}`, true);
    loadBracket();
  } catch (err) { msg($('#bracketMsg'), err.message); }
});

/* ---------- Personal goal scorers ---------- */
let scorerData = null;
let myScorers = []; // ordered list of player ids (max 3)

async function loadScorers() {
  scorerData = await api.get(`/api/leagues/${state.leagueId}/scorers`);
  myScorers = scorerData.myPicks.map((p) => p.player_id);
  $('#saveScorersBtn').disabled = scorerData.locked;
  $('#scorerSearch').disabled = scorerData.locked;
  renderScorers();
}

function playerById(id) { return scorerData.players.find((p) => p.id === id); }

function renderScorers() {
  // Selected chips
  const chips = $('#myScorers');
  chips.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const id = myScorers[i];
    if (id == null) {
      const e = document.createElement('div');
      e.className = 'scorerslot-empty';
      e.textContent = `Plats ${i + 1} — tom`;
      chips.appendChild(e);
    } else {
      const p = playerById(id);
      const pts = scorerData.myPicks.find((x) => x.player_id === id)?.points;
      const e = document.createElement('div');
      e.className = 'scorerchip';
      e.innerHTML = `<span>${esc(p.name)} <span class="pstat">${esc(p.team_name || '')}${pts != null ? ` · ${pts}p` : ''}</span></span>`;
      if (!scorerData.locked) {
        const rm = document.createElement('span');
        rm.className = 'rm'; rm.textContent = '✕';
        rm.addEventListener('click', () => { myScorers = myScorers.filter((x) => x !== id); renderScorers(); });
        e.appendChild(rm);
      }
      chips.appendChild(e);
    }
  }
  $('#scorerCount').textContent = `${myScorers.length} / 3 valda`;
  renderPlayerPool();
}

function renderPlayerPool() {
  const q = ($('#scorerSearch').value || '').toLowerCase();
  const wrap = $('#playerPool');
  wrap.innerHTML = '';
  scorerData.players
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.team_name || '').toLowerCase().includes(q))
    .forEach((p) => {
      const picked = myScorers.includes(p.id);
      const full = myScorers.length >= 3 && !picked;
      const row = document.createElement('div');
      row.className = 'prow' + (picked ? ' picked' : '') + (full || scorerData.locked ? ' disabled' : '');
      row.innerHTML = `<span>${picked ? '✓ ' : ''}${esc(p.name)} <span class="pstat">${esc(p.team_name || '')}</span></span>
        <span class="pstat"><b>${p.goals}</b> mål · ${p.assists} assist</span>`;
      if (!scorerData.locked) {
        row.addEventListener('click', () => {
          if (picked) myScorers = myScorers.filter((x) => x !== p.id);
          else if (myScorers.length < 3) myScorers.push(p.id);
          renderScorers();
        });
      }
      wrap.appendChild(row);
    });
}

$('#scorerSearch').addEventListener('input', renderPlayerPool);
$('#saveScorersBtn').addEventListener('click', async () => {
  try {
    const r = await api.post(`/api/leagues/${state.leagueId}/scorers`, { playerIds: myScorers });
    msg($('#scorerMsg'), `Sparade ${r.saved} målgörare`, true);
    loadScorers();
  } catch (err) { msg($('#scorerMsg'), err.message); }
});

/* ---------- Bonus: tournament bonuses + custom questions ---------- */
let tournamentData = null;

async function loadBonus() {
  tournamentData = await api.get(`/api/leagues/${state.leagueId}/tournament`);
  renderTournament();
  loadQuestions();
}

function fillSelect(sel, items, valueKey, labelFn, current) {
  sel.innerHTML = '<option value="">— välj —</option>';
  items.forEach((it) => {
    const o = document.createElement('option');
    o.value = it[valueKey];
    o.textContent = labelFn(it);
    if (current != null && Number(current) === it[valueKey]) o.selected = true;
    sel.appendChild(o);
  });
}

function renderTournament() {
  const d = tournamentData, mp = d.myPicks || {};
  fillSelect($('#tpChampion'), d.teams, 'id', (t) => `${t.flag || ''} ${t.name}`, mp.champion_team_id);
  fillSelect($('#tpScorer'), d.players, 'id', (p) => `${p.name} (${p.goals} mål)`, mp.top_scorer_id);
  fillSelect($('#tpAssist'), d.players, 'id', (p) => `${p.name} (${p.assists} assist)`, mp.top_assist_id);
  $('#tpGoals').value = mp.total_goals != null ? mp.total_goals : '';
  ['#tpChampion', '#tpScorer', '#tpAssist', '#tpGoals'].forEach((s) => { $(s).disabled = d.locked; });
  $('#saveTournamentBtn').disabled = d.locked;
  $('#bonusLockMsg').textContent = d.locked
    ? '🔒 Låst – turneringen har börjat.'
    : 'Tippa innan turneringen startar. Mål 30/25/25/20 p.';
  // Facit / current leaders
  const a = d.actuals || {};
  const tName = (id) => (d.teams.find((t) => t.id === id) || {}).name;
  const pName = (id) => (d.players.find((p) => p.id === id) || {}).name;
  const parts = [];
  if (a.top_scorer_id) parts.push(`Skytteliga: <b>${esc(pName(a.top_scorer_id) || '')}</b>`);
  if (a.top_assist_id) parts.push(`Assistliga: <b>${esc(pName(a.top_assist_id) || '')}</b>`);
  if (a.champion_team_id) parts.push(`Mästare: <b>${esc(tName(a.champion_team_id) || '')}</b>`);
  parts.push(`Mål hittills: <b>${a.total_goals || 0}</b>`);
  $('#tournamentFacit').innerHTML = parts.length ? 'Status: ' + parts.join(' · ') : '';
}

$('#saveTournamentBtn').addEventListener('click', async () => {
  try {
    await api.post(`/api/leagues/${state.leagueId}/tournament`, {
      championTeamId: $('#tpChampion').value || null,
      topScorerId: $('#tpScorer').value || null,
      topAssistId: $('#tpAssist').value || null,
      totalGoals: $('#tpGoals').value || null,
    });
    msg($('#tournamentMsg'), 'Sparat!', true);
    loadBonus();
  } catch (err) { msg($('#tournamentMsg'), err.message); }
});

async function loadQuestions() {
  const qs = await api.get(`/api/leagues/${state.leagueId}/questions`);
  const wrap = $('#questionList');
  wrap.innerHTML = '';
  $('#noQuestions').classList.toggle('hidden', qs.length > 0);
  qs.forEach((q) => wrap.appendChild(renderQuestion(q)));
}

function renderQuestion(q) {
  const el = document.createElement('div');
  el.className = 'qcard';
  let answerCtl;
  if (q.resolved) {
    const correct = (q.my_answer || '').trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase();
    answerCtl = `<div class="resolved">Ditt svar: <b>${esc(q.my_answer || '—')}</b> ·
      Rätt: <b>${esc(q.correct_answer)}</b> ·
      <span class="${correct ? 'ok' : 'no'}">${correct ? '+' + q.my_points + ' p' : '0 p'}</span></div>`;
  } else if (q.options) {
    const opts = q.options.map((o) => `<option ${q.my_answer === o ? 'selected' : ''}>${esc(o)}</option>`).join('');
    answerCtl = `<div class="qrow"><select data-q="${q.id}"><option value="">— välj —</option>${opts}</select>
      <button class="btn small" data-answer="${q.id}">Svara</button></div>`;
  } else {
    answerCtl = `<div class="qrow"><input data-q="${q.id}" value="${esc(q.my_answer || '')}" placeholder="Ditt svar" />
      <button class="btn small" data-answer="${q.id}">Svara</button></div>`;
  }
  el.innerHTML = `<div class="qtext">${esc(q.text)} <span class="qpts">${q.points} p</span></div>${answerCtl}`;
  const btn = el.querySelector('[data-answer]');
  if (btn) btn.addEventListener('click', async () => {
    const answer = el.querySelector(`[data-q="${q.id}"]`).value;
    try {
      await api.post(`/api/leagues/${state.leagueId}/questions/${q.id}/answer`, { answer });
      btn.textContent = '✓';
    } catch (err) { alert(err.message); }
  });
  return el;
}

/* ---------- League admin: bonus questions ---------- */
$('#questionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const options = f.options.value.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    await api.post(`/api/admin/leagues/${state.leagueId}/questions`, {
      text: f.text.value, points: Number(f.points.value), options,
    });
    f.reset();
    msg($('#questionFormMsg'), 'Fråga skapad', true);
    loadAdminQuestions();
  } catch (err) { msg($('#questionFormMsg'), err.message); }
});

async function loadAdminQuestions() {
  const qs = await api.get(`/api/leagues/${state.leagueId}/questions`);
  const wrap = $('#adminQuestionList');
  wrap.innerHTML = '';
  qs.forEach((q) => {
    const el = document.createElement('div');
    el.className = 'qcard';
    if (q.resolved) {
      el.innerHTML = `<div class="qtext">${esc(q.text)} <span class="qpts">${q.points} p</span></div>
        <div class="resolved ok">Avgjord — rätt svar: <b>${esc(q.correct_answer)}</b></div>`;
    } else {
      const ctl = q.options
        ? `<select data-resolve="${q.id}"><option value="">— rätt svar —</option>${q.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`
        : `<input data-resolve="${q.id}" placeholder="Rätt svar" />`;
      el.innerHTML = `<div class="qtext">${esc(q.text)} <span class="qpts">${q.points} p</span></div>
        <div class="qrow">${ctl}
          <button class="btn primary small" data-resolvebtn="${q.id}">Avgör & dela ut</button>
          <button class="btn ghost small" data-delq="${q.id}">Ta bort</button></div>`;
    }
    wrap.appendChild(el);
  });
  $$('[data-resolvebtn]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.resolvebtn;
    const correctAnswer = $(`[data-resolve="${id}"]`).value;
    try {
      const r = await api.post(`/api/admin/questions/${id}/resolve`, { correctAnswer });
      b.textContent = `✓ (${r.answers_scored})`;
      loadAdminQuestions();
    } catch (err) { alert(err.message); }
  }));
  $$('[data-delq]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Ta bort frågan?')) return;
    await api.req('DELETE', `/api/admin/questions/${b.dataset.delq}`);
    loadAdminQuestions();
  }));
}

/* ---------- League admin (invites) ---------- */
$('#inviteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.post(`/api/admin/leagues/${state.leagueId}/invites`, { email: e.target.email.value || undefined });
    e.target.reset();
    loadInvites();
  } catch (err) { alert(err.message); }
});

async function loadInvites() {
  const rows = await api.get(`/api/admin/leagues/${state.leagueId}/invites`);
  const ul = $('#inviteList');
  ul.innerHTML = '';
  rows.forEach((r) => {
    const li = document.createElement('li');
    const status = r.used_by
      ? `<span class="pill used">använd av ${esc(r.used_by_name)}</span>`
      : `<span class="pill">ledig</span>`;
    li.innerHTML = `<span><code>${esc(r.code)}</code> ${r.email ? esc(r.email) : ''}</span> ${status}`;
    ul.appendChild(li);
  });
}

/* ---------- Site admin ---------- */
async function loadSiteAdmin() {
  show('admin');
  await renderAdminMatches();
  await renderAdminBracket();
}

async function renderAdminBracket() {
  const wrap = $('#adminBracket');
  wrap.innerHTML = '';
  let slots = [];
  try {
    const leagues = await api.get('/api/leagues');
    if (leagues[0]) slots = (await api.get(`/api/leagues/${leagues[0].id}/bracket`)).slots;
  } catch (_) {}
  slots = slots.filter((s) => s.home_team_id && s.away_team_id);
  if (!slots.length) { wrap.innerHTML = '<p class="muted">Inga slutspelsmatcher ännu. Kör sync först.</p>'; return; }
  slots.forEach((s) => {
    const finished = s.home_goals != null && s.away_goals != null;
    const el = document.createElement('div');
    el.className = 'match';
    el.innerHTML = `
      <div class="team home">${esc(s.label)}: ${esc(s.home_flag || '')} ${esc(s.home_name)}</div>
      <div class="score">
        <input type="number" min="0" id="bh-${s.id}" value="${finished ? s.home_goals : ''}" />
        <span class="vs">–</span>
        <input type="number" min="0" id="ba-${s.id}" value="${finished ? s.away_goals : ''}" />
        <button class="btn small" data-bresult="${s.id}">Spara</button>
      </div>
      <div class="team away">${esc(s.away_name)} ${esc(s.away_flag || '')}</div>`;
    wrap.appendChild(el);
  });
  $$('[data-bresult]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.bresult;
      try {
        const r = await api.post(`/api/admin/bracket/${id}/result`, {
          home: Number($('#bh-' + id).value), away: Number($('#ba-' + id).value),
        });
        btn.textContent = `✓ (${r.predictions_rescored})`;
      } catch (err) { alert(err.message); }
    })
  );
}
$('#syncBtn').addEventListener('click', async () => {
  msg($('#syncMsg'), 'Synkar…', true);
  try {
    const r = await api.post('/api/admin/sync');
    msg($('#syncMsg'), `Klart: ${r.teams} lag, ${r.matches} matcher, ${r.rescored} tips omräknade`, true);
    renderAdminMatches();
  } catch (err) { msg($('#syncMsg'), err.message); }
});

async function renderAdminMatches() {
  // Reuse any league the admin is in to read the fixtures list; fall back gracefully.
  let fixtures = [];
  try {
    const leagues = await api.get('/api/leagues');
    if (leagues[0]) fixtures = await api.get(`/api/leagues/${leagues[0].id}/fixtures`);
  } catch (_) {}
  const wrap = $('#adminMatches');
  wrap.innerHTML = '';
  if (!fixtures.length) { wrap.innerHTML = '<p class="muted">Inga matcher ännu. Kör sync först och gå med i en liga.</p>'; return; }
  fixtures.forEach((m) => {
    const finished = m.home_goals != null && m.away_goals != null;
    const el = document.createElement('div');
    el.className = 'match';
    el.innerHTML = `
      <div class="team home">${esc(m.home_flag || '')} ${esc(m.home_name)}</div>
      <div class="score">
        <input type="number" min="0" id="ah-${m.id}" value="${finished ? m.home_goals : ''}" />
        <span class="vs">–</span>
        <input type="number" min="0" id="aa-${m.id}" value="${finished ? m.away_goals : ''}" />
        <button class="btn small" data-result="${m.id}">Spara</button>
      </div>
      <div class="team away">${esc(m.away_name)} ${esc(m.away_flag || '')}</div>`;
    wrap.appendChild(el);
  });
  $$('[data-result]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.result;
      const home = $('#ah-' + id).value, away = $('#aa-' + id).value;
      try {
        const r = await api.post(`/api/admin/matches/${id}/result`, { home: Number(home), away: Number(away) });
        btn.textContent = `✓ (${r.predictions_rescored})`;
      } catch (err) { alert(err.message); }
    })
  );
}

/* ---------- Boot ---------- */
(async function init() {
  try {
    state.user = await api.get('/api/auth/me');
    enterApp();
  } catch (_) {
    show('auth');
  }
})();
