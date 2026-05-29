-- VM-tips 2026 schema. Applied on boot (idempotent via IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  is_site_admin INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leagues (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  admin_user_id INTEGER NOT NULL REFERENCES users(id),
  join_code     TEXT UNIQUE NOT NULL,
  -- 'two_window' (default, both phases score) or 'single' (one full pre-tournament tip)
  mode          TEXT NOT NULL DEFAULT 'two_window',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS league_members (
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  user_id   INTEGER NOT NULL REFERENCES users(id),
  role      TEXT NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (league_id, user_id)
);

-- Invitations: registration is only allowed with a valid, unused invite code.
CREATE TABLE IF NOT EXISTS invites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT UNIQUE NOT NULL,
  email      TEXT,                         -- optional: pre-assigned email
  league_id  INTEGER REFERENCES leagues(id), -- optional: auto-join this league
  created_by INTEGER NOT NULL REFERENCES users(id),
  used_by    INTEGER REFERENCES users(id),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  api_team_id INTEGER UNIQUE,
  name        TEXT NOT NULL,
  grp         TEXT,           -- group letter, e.g. 'A'
  flag        TEXT            -- emoji or url
);

CREATE TABLE IF NOT EXISTS matches (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  api_fixture_id INTEGER UNIQUE,
  round          TEXT NOT NULL DEFAULT 'group',  -- 'group' for MVP
  slot           TEXT,                            -- stable label, e.g. 'Group A - 1'
  home_team_id   INTEGER REFERENCES teams(id),
  away_team_id   INTEGER REFERENCES teams(id),
  kickoff        TEXT,                            -- ISO datetime (UTC)
  home_goals     INTEGER,                         -- NULL until played
  away_goals     INTEGER,
  status         TEXT NOT NULL DEFAULT 'scheduled' -- scheduled | finished
);

CREATE TABLE IF NOT EXISTS predictions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  league_id  INTEGER NOT NULL REFERENCES leagues(id),
  match_id   INTEGER NOT NULL REFERENCES matches(id),
  pred_home  INTEGER NOT NULL,
  pred_away  INTEGER NOT NULL,
  points     INTEGER NOT NULL DEFAULT 0,
  locked     INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, league_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_pred_league ON predictions(league_id);
CREATE INDEX IF NOT EXISTS idx_pred_match  ON predictions(match_id);
