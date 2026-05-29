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
  if (tab === 'leaderboard') loadLeaderboard();
  if (tab === 'admin') loadInvites();
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
