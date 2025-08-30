#!/usr/bin/env node
/**
 * Smart build runner: builds only what has changed
 * Leverages git diff to determine which parts of the codebase need rebuilding
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const base = process.env.BASE_REF || 'origin/main';
const maxFiles = 200; // Skip smart logic if too many changes

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
  log(`⚡ ${description}`, 'cyan');
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    log(`❌ Failed: ${description}`, 'red');
    return false;
  }
}

try {
  // Get changed files
  const changed = execSync(`git diff --name-only ${base}`)
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);

  if (changed.length === 0) {
    log('🔍 No changes detected, skipping build', 'yellow');
    process.exit(0);
  }

  if (changed.length > maxFiles) {
    log(`🚨 Large changeset (${changed.length} files), running full build`, 'yellow');
    runCommand('npm run build', 'Running full build');
    process.exit(0);
  }

  // Categorize changes
  const categories = {
    client: changed.filter(f => f.startsWith('client/')),
    server: changed.filter(f => f.startsWith('server/')),
    shared: changed.filter(f => f.startsWith('shared/')),
    workers: changed.filter(f => f.startsWith('workers/')),
    config: changed.filter(f => 
      f.match(/\.(json|yml|yaml|js|ts)$/) && 
      f.match(/(package|vite|tsconfig|drizzle|tailwind)/)
    ),
    docs: changed.filter(f => f.match(/\.(md|txt)$/))
  };

  log(`🧠 Smart build selection for ${changed.length} changed files:`, 'bright');
  
  const builds = [];
  const typeCheckPaths = [];

  // Determine what needs building
  if (categories.shared.length > 0) {
    log(`  📦 Shared changes detected (${categories.shared.length} files) → Full build required`, 'yellow');
    runCommand('npm run build', 'Running full build due to shared changes');
    process.exit(0);
  }

  if (categories.config.length > 0) {
    log(`  ⚙️  Config changes detected (${categories.config.length} files) → Full build required`, 'yellow');
    runCommand('npm run build', 'Running full build due to config changes');
    process.exit(0);
  }

  // Client changes -> build web
  if (categories.client.length > 0) {
    log(`  🎨 Client changes (${categories.client.length} files) → Building web`, 'blue');
    builds.push({
      command: 'npm run build:web',
      description: 'Building client (web)'
    });
    typeCheckPaths.push('client');
  }

  // Server changes -> type check only (no build needed for Vercel)
  if (categories.server.length > 0) {
    log(`  📡 Server changes (${categories.server.length} files) → Type checking`, 'green');
    typeCheckPaths.push('server');
  }

  // Workers changes -> type check
  if (categories.workers.length > 0) {
    log(`  ⚙️  Worker changes (${categories.workers.length} files) → Type checking`, 'green');
    typeCheckPaths.push('workers');
  }

  // Docs only -> skip build
  if (categories.docs.length === changed.length) {
    log('📚 Only documentation changed, skipping build', 'yellow');
    process.exit(0);
  }

  // Run parallel type checking if needed
  if (typeCheckPaths.length > 0) {
    log('\n🔍 Running type checks...', 'cyan');
    const typeCheckCommands = typeCheckPaths.map(path => 
      `npm run check:${path}`
    ).join(' && ');
    
    if (!runCommand(typeCheckCommands, 'Type checking')) {
      process.exit(1);
    }
  }

  // Run builds sequentially (or in parallel if multiple)
  if (builds.length > 0) {
    log('\n🏗️  Running builds...', 'cyan');
    
    if (builds.length === 1) {
      // Single build
      if (!runCommand(builds[0].command, builds[0].description)) {
        process.exit(1);
      }
    } else {
      // Multiple builds - run in parallel
      const parallelCommand = `concurrently -n "${builds.map((_, i) => `BUILD${i+1}`).join(',')}" ${builds.map(b => `"${b.command}"`).join(' ')}`;
      if (!runCommand(parallelCommand, 'Running parallel builds')) {
        process.exit(1);
      }
    }
  }

  // Quick validation
  log('\n✅ Smart build completed successfully!', 'green');
  
  // Show build size if web was built
  if (categories.client.length > 0 && existsSync('dist/public')) {
    try {
      const sizeOutput = execSync('npm run bundle:report 2>/dev/null || true').toString();
      if (sizeOutput) {
        log('\n📊 Bundle size report:', 'cyan');
        console.log(sizeOutput);
      }
    } catch {
      // Ignore size report errors
    }
  }

} catch (error) {
  log('❌ Smart build failed', 'red');
  console.error(error.message);
  process.exit(1);
}