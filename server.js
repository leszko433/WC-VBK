// VM-tips 2026 — Express server. Serves the frontend and JSON API.
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');

require('./db'); // ensures schema is applied on boot

// Resolve the secret used to sign session cookies. A weak/known secret lets an
// attacker forge sessions, so: require a strong SESSION_SECRET in production, and
// in development auto-generate a stable local one (never committed) so there is
// no hardcoded fallback in the repo.
function resolveSessionSecret() {
  const WEAK = new Set(['', 'change-me-to-a-long-random-string', 'dev-insecure-secret-change-me']);
  const fromEnv = (process.env.SESSION_SECRET || '').trim();
  if (fromEnv.length >= 16 && !WEAK.has(fromEnv)) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    console.error(
      '\nSESSION_SECRET måste sättas (minst 16 tecken, ej exempelvärdet) i produktion.\n' +
      'Generera en: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n'
    );
    process.exit(1);
  }
  // Dev: persist a generated secret locally so logins survive restarts.
  const file = path.join(__dirname, '.session-secret');
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    console.warn('⚠ Ingen SESSION_SECRET satt – genererade en lokal (.session-secret). Sätt en egen i produktion.');
    return secret;
  } catch (_) {
    return crypto.randomBytes(32).toString('hex'); // last resort (ephemeral)
  }
}

const app = express();
app.use(express.json());
app.use(
  cookieSession({
    name: 'vmtips',
    secret: resolveSessionSecret(),
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  })
);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/leagues', require('./routes/leagues'));
app.use('/api', require('./routes/predictions'));
app.use('/api', require('./routes/bracket'));
app.use('/api', require('./routes/scorers'));
app.use('/api', require('./routes/bonus'));
app.use('/api/admin', require('./routes/admin'));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    const mode = String(process.env.USE_MOCK_DATA || 'true') === 'true' ? 'MOCK' : 'LIVE';
    console.log(`VM-tips 2026 running on http://localhost:${PORT}  (data: ${mode})`);
  });
}

module.exports = app;
