// SQLite connection + schema bootstrap using Node's BUILT-IN SQLite (node:sqlite).
// No native module to compile — works out of the box on Node 22.5+ (incl. Node 26).
const path = require('path');
const fs = require('fs');

// Hide the harmless "SQLite is an experimental feature" warning (installed before
// the first require of node:sqlite so it's actually suppressed).
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  const msg = typeof warning === 'string' ? warning : (warning && warning.message) || '';
  if (msg.includes('SQLite is an experimental')) return;
  return emitWarning.call(process, warning, ...args);
};

// On Node 22/23 node:sqlite needs the --experimental-sqlite flag. If it's missing,
// transparently re-launch the same process with the flag so users never have to
// think about it. On Node 24+ it's available without a flag and this is a no-op.
function ensureSqlite() {
  try {
    require('node:sqlite');
    return;
  } catch (_) {
    const [maj, min] = process.versions.node.split('.').map(Number);
    const supported = maj > 22 || (maj === 22 && min >= 5);
    if (!supported) {
      console.error(
        `\nVM-tips kräver Node 22.5 eller senare (helst senaste versionen). ` +
        `Du kör Node ${process.version}.\nUppdatera Node: https://nodejs.org\n`
      );
      process.exit(1);
    }
    if (process.env.__VMTIPS_RELAUNCHED) {
      console.error('Kunde inte ladda node:sqlite. Uppdatera Node till senaste versionen.');
      process.exit(1);
    }
    const { spawnSync } = require('child_process');
    const res = spawnSync(process.execPath, ['--experimental-sqlite', ...process.argv.slice(1)], {
      stdio: 'inherit',
      env: { ...process.env, __VMTIPS_RELAUNCHED: '1' },
    });
    process.exit(res.status == null ? 1 : res.status);
  }
}
ensureSqlite();

const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'vmtips.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// better-sqlite3 compatibility: db.transaction(fn) -> a function that runs fn
// inside a transaction (committing on success, rolling back on throw). Nestable
// via savepoints, matching how the codebase composes transactions.
let txDepth = 0;
db.transaction = (fn) => (...args) => {
  const entering = txDepth === 0 ? 'BEGIN' : `SAVEPOINT sp${txDepth}`;
  db.exec(entering);
  txDepth++;
  try {
    const result = fn(...args);
    txDepth--;
    db.exec(txDepth === 0 ? 'COMMIT' : `RELEASE sp${txDepth}`);
    return result;
  } catch (err) {
    txDepth--;
    db.exec(txDepth === 0 ? 'ROLLBACK' : `ROLLBACK TO sp${txDepth}`);
    throw err;
  }
};

// Apply schema (all statements are IF NOT EXISTS, so this is safe to run every boot).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
