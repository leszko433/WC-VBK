// VM-tips 2026 — Express server. Serves the frontend and JSON API.
require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

require('./db'); // ensures schema is applied on boot

const app = express();
app.use(express.json());
app.use(
  cookieSession({
    name: 'vmtips',
    secret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  })
);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/leagues', require('./routes/leagues'));
app.use('/api', require('./routes/predictions'));
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
