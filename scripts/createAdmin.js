// Bootstrap a site admin from env vars. Idempotent: promotes if already exists.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || 'Admin';

// Refuse to create an admin with a missing/weak/known default password.
if (!password || password.length < 10 || password.toLowerCase() === 'changeme123') {
  console.error(
    '\nSätt ett eget ADMIN_PASSWORD (minst 10 tecken) i .env innan du kör seed-admin.\n' +
    'Exempel i .env:  ADMIN_PASSWORD=ettLangtEgetLosenord\n'
  );
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  db.prepare('UPDATE users SET is_site_admin = 1 WHERE id = ?').run(existing.id);
  console.log(`Promoted existing user to site admin: ${email}`);
} else {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (email, password_hash, display_name, is_site_admin) VALUES (?, ?, ?, 1)'
  ).run(email, hash, name);
  console.log(`Created site admin: ${email}  (password from ADMIN_PASSWORD)`);
}
