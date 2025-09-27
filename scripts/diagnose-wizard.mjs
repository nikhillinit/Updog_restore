import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

function run(cmd, label) {
  try {
    console.log('\n=== ' + label + ' ===');
    console.log(execSync(cmd, { stdio: 'pipe', encoding: 'utf8' }));
  } catch (e) {
    console.log((e.stdout || e.stderr || String(e)));
  }
}

console.log('=== Checking for Step 3 component files ===');
function find(patterns) {
  const results = [];
  function walk(dir) {
    try {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory() && ent.name !== 'node_modules') walk(p);
        else if (patterns.some(rx => rx.test(ent.name))) results.push(p);
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }
  walk('client/src/pages');
  return results;
}
console.log(find([/Portfolio/i, /Step.*3/i, /Investment.*Strategy/i]).join('\n') || '(none)');

console.log('\n=== Step component imports in fund-setup.tsx ===');
try {
  const fundSetup = execSync('grep -n "import.*Step" client/src/pages/fund-setup.tsx', { encoding: 'utf8' });
  console.log(fundSetup);
} catch (e) {
  console.log('Could not check fund-setup.tsx imports');
}

run('git diff --name-only HEAD~5 -- "**/useFundStore*" || echo "No recent store changes"', 'Recent store changes');

console.log('\n=== TypeScript error counts ===');
try {
  const clientCheck = execSync('npm run check:client --silent 2>&1', { encoding: 'utf8' });
  console.log('Client TS: ✓ Clean');
} catch (e) {
  const errors = (e.stdout || e.stderr || '').split('\n').filter(line => line.includes('error TS')).length;
  console.log(`Client TS: ${errors} errors`);
}

try {
  const serverCheck = execSync('npm run check:server --silent 2>&1', { encoding: 'utf8' });
  console.log('Server TS: ✓ Clean');
} catch (e) {
  const errors = (e.stdout || e.stderr || '').split('\n').filter(line => line.includes('error TS')).length;
  console.log(`Server TS: ${errors} errors (may not affect Step 2→3)`);
}

console.log('\n=== Build status ===');
try {
  execSync('npm run build --silent', { stdio: 'pipe' });
  console.log('Build: ✓ Success');
} catch (e) {
  console.log('Build: ✗ Failed');
  const output = (e.stdout || e.stderr || '').split('\n').slice(-10).join('\n');
  console.log('Last 10 lines:', output);
}