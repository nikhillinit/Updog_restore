import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = 'triage-output';
mkdirSync(OUT, { recursive: true });

function run(cmd, file) {
  try {
    const out = execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
    writeFileSync(join(OUT, file), out);
    console.log(`→ ${file}`);
  } catch (e) {
    const txt = (e.stdout || e.stderr || String(e));
    writeFileSync(join(OUT, file), txt);
    console.log(`× ${file}`);
  }
}

// Enhanced version with timing
function timedRun(cmd, file) {
  const start = Date.now();
  try {
    const out = execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
    const duration = Date.now() - start;
    writeFileSync(join(OUT, file), `Duration: ${duration}ms\n\n${out}`);
    console.log(`→ ${file} (${duration}ms)`);
  } catch (e) {
    const duration = Date.now() - start;
    const txt = (e.stdout || e.stderr || String(e));
    writeFileSync(join(OUT, file), `Duration: ${duration}ms (failed)\n\n${txt}`);
    console.log(`× ${file} (${duration}ms)`);
  }
}

// Safe wrapper for operations that might fail
function safeRun(fn, file, fallback = 'Operation failed') {
  try {
    const result = fn();
    writeFileSync(join(OUT, file), result);
    console.log(`→ ${file}`);
  } catch (e) {
    writeFileSync(join(OUT, file), `${fallback}\n\nError: ${e.message}\n\nStack: ${e.stack}`);
    console.log(`× ${file} (gracefully handled)`);
  }
}

console.log('Starting triage collection...\n');

// 1) versions/commit
run('git rev-parse --abbrev-ref HEAD && git rev-parse HEAD', 'commit.txt');
run('node -v && npm -v', 'env.txt');

// 2) typecheck & build with timing
timedRun('npm run check', 'typecheck.txt');
timedRun('npm run build --silent', 'build-local.txt');

// 3) asset listing (pure Node recursive)
function listAssets(dir, file) {
  const root = resolve(dir);
  const out = [];
  function walk(d, prefix = '') {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const p = join(d, ent.name);
      const rel = p.replace(root, '').replace(/^[/\\]/, '');
      if (ent.isDirectory()) walk(p, rel);
      else out.push(rel);
    }
  }
  walk(root);
  writeFileSync(join(OUT, file), out.sort().join('\n'));
  console.log(`→ ${file}`);
}

// Only list assets if dist directory exists
safeRun(() => {
  listAssets('dist/public/assets', 'assets.txt');
  return 'Assets listed successfully';
}, 'assets.txt', 'dist/public/assets directory not found (build may have failed)');

// 4) heuristic scan for object-return selectors without equality
function scanSelectors(outFile) {
  const files = [];
  function collect(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory() && ent.name !== 'node_modules') collect(p);
      else if (/\.(tsx|ts)$/.test(ent.name)) files.push(p);
    }
  }
  collect('client/src');

  const matches = [];
  const reCall = /useFundStore\s*\(\s*([^\)]*)\)/g; // crude but useful
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    let m;
    while ((m = reCall.exec(txt))) {
      const callText = m[0];
      const hasEquality = /,\s*shallow\)/.test(callText) || /,\s*Object\.is\)/.test(callText);
      const objectSelector = /\(\s*s\s*=>\s*{\s*return\s*{/.test(callText) || /\(\s*s\s*=>\s*{[^}]*}\s*\)/.test(callText);
      const inlineObject = /\(\s*s\s*=>\s*{\s*[^)]*{[^}]*}[^)]*\}\s*\)/.test(callText) || /\(\s*s\s*=>\s*\(\s*{[^}]*}\s*\)\s*\)/.test(callText);

      if ((objectSelector || inlineObject) && !hasEquality) {
        const line = txt.slice(0, m.index).split(/\r?\n/).length;
        matches.push(`${f}:${line}: ${callText.slice(0, 100)}…`);
      }
    }
  }
  writeFileSync(join(OUT, outFile), matches.join('\n') || 'OK: no suspicious selectors found');
  console.log(`→ ${outFile}`);
}
scanSelectors('selector-scan.txt');

// 5) Package versions for debugging
safeRun(() => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const deps = {
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {}
  };
  return JSON.stringify(deps, null, 2);
}, 'package-versions.txt', 'Could not read package.json');

console.log('\n✓ Triage collection complete!');
console.log('→ Results saved to:', resolve(OUT));
console.log('\nNext steps:');
console.log('1. Start dev with debug: VITE_WIZARD_DEBUG=1 npm run dev');
console.log('2. Reproduce Step 2 → 3 issue');
console.log('3. Export browser data:');
console.log('   - Network tab → Save all as HAR → triage-output/network.har');
console.log('   - Console (filter by WIZARD) → Copy → triage-output/wizard-trace-console.txt');
console.log('   - React Profiler → Export → triage-output/react-profiler.json');
console.log('\nOptional: Run automated Playwright collection with npm run triage:auto');