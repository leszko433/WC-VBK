// Runs `node --test`, adding --experimental-sqlite only on Node versions that
// still need it (22/23). Keeps the test command working on any supported Node.
const { spawnSync } = require('child_process');

let flags = [];
try {
  require('node:sqlite');
} catch (_) {
  flags = ['--experimental-sqlite'];
}

const res = spawnSync(process.execPath, [...flags, '--test'], { stdio: 'inherit' });
process.exit(res.status == null ? 1 : res.status);
