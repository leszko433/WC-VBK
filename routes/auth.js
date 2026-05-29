// Authentication: invite-only registration, login, logout, current user.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { currentUser, requireAuth } = require('../lib/auth');

const router = express.Router();

const findInvite = db.prepare('SELECT * FROM invites WHERE code = ? AND used_by IS NULL');
const markInviteUsed = db.prepare('UPDATE invites SET used_by = ? WHERE id = ?');
const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const insertUser = db.prepare(
  'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
);
const addMember = db.prepare(
  'INSERT OR IGNORE INTO league_members (league_id, user_id, role) VALUES (?, ?, ?)'
);

// POST /api/auth/register  { code, email, password, displayName }
router.post('/register', (req, res) => {
  const { code, email, password, displayName } = req.body || {};
  if (!code || !email || !password || !displayName) {
    return res.status(400).json({ error: 'code, email, password och displayName krävs' });
  }
  const invite = findInvite.get(code.trim());
  if (!invite) return res.status(400).json({ error: 'Ogiltig eller redan använd inbjudningskod' });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Inbjudningskoden har gått ut' });
  }
  const cleanEmail = email.trim().toLowerCase();
  if (invite.email && invite.email.toLowerCase() !== cleanEmail) {
    return res.status(400).json({ error: 'Inbjudan är knuten till en annan e-postadress' });
  }
  if (findUserByEmail.get(cleanEmail)) {
    return res.status(409).json({ error: 'E-postadressen är redan registrerad' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Lösenordet måste vara minst 6 tecken' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const tx = db.transaction(() => {
    const info = insertUser.run(cleanEmail, hash, displayName.trim());
    const userId = info.lastInsertRowid;
    markInviteUsed.run(userId, invite.id);
    if (invite.league_id) addMember.run(invite.league_id, userId, 'member');
    return userId;
  });
  const userId = tx();
  req.session.userId = userId;
  res.json({ id: userId, email: cleanEmail, display_name: displayName.trim() });
});

// POST /api/auth/login  { email, password }
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'E-post och lösenord krävs' });
  const user = findUserByEmail.get(String(email).trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Fel e-post eller lösenord' });
  }
  req.session.userId = user.id;
  res.json({ id: user.id, email: user.email, display_name: user.display_name, is_site_admin: !!user.is_site_admin });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json(user);
});

module.exports = router;
