// Auth helpers: load the current user from the session and guard routes.
const db = require('../db');

const getUser = db.prepare('SELECT id, email, display_name, is_site_admin FROM users WHERE id = ?');
const getMembership = db.prepare(
  'SELECT role FROM league_members WHERE league_id = ? AND user_id = ?'
);
const getLeague = db.prepare('SELECT * FROM leagues WHERE id = ?');

function currentUser(req) {
  const id = req.session && req.session.userId;
  return id ? getUser.get(id) : null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  req.user = user;
  next();
}

function requireSiteAdmin(req, res, next) {
  if (!req.user || !req.user.is_site_admin) {
    return res.status(403).json({ error: 'Site admin only' });
  }
  next();
}

// Requires the logged-in user to be admin of :id (league admin or site admin).
function requireLeagueAdmin(req, res, next) {
  const leagueId = Number(req.params.id || req.params.leagueId);
  const league = getLeague.get(leagueId);
  if (!league) return res.status(404).json({ error: 'League not found' });
  const membership = getMembership.get(leagueId, req.user.id);
  const isAdmin =
    req.user.is_site_admin ||
    league.admin_user_id === req.user.id ||
    (membership && membership.role === 'admin');
  if (!isAdmin) return res.status(403).json({ error: 'League admin only' });
  req.league = league;
  next();
}

module.exports = { currentUser, requireAuth, requireSiteAdmin, requireLeagueAdmin };
