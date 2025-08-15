#!/usr/bin/env node
/**
 * Smart test runner: runs only tests related to changed files
 * No ML - just smart file-based logic
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const base = process.env.BASE_REF || 'origin/main';
const maxFiles = 200; // Skip heavy checks if too many changes

try {
  const changed = execSync(`git diff --name-only ${base}`)
    .toString().trim().split('\n').filter(Boolean);

  if (changed.length === 0) {
    console.log('🔍 No changes detected, running smoke tests only');
    execSync('npm run test:smoke', { stdio: 'inherit' });
    process.exit(0);
  }

  if (changed.length > maxFiles) {
    console.log(`🚨 Large changeset (${changed.length} files), running full test suite`);
    execSync('npm run test', { stdio: 'inherit' });
    process.exit(0);
  }

  // Categorize changes
  const categories = {
    client: changed.filter(f => f.startsWith('client/')),
    server: changed.filter(f => f.startsWith('server/')),
    shared: changed.filter(f => f.startsWith('shared/')),
    tests: changed.filter(f => f.includes('test') || f.includes('spec')),
    config: changed.filter(f => f.match(/\.(json|yml|yaml|js|ts)$/) && 
                                 f.match(/(package|vite|playwright|tsconfig)/)),
    docs: changed.filter(f => f.match(/\.(md|txt)$/))
  };

  console.log(`🧠 Smart test selection for ${changed.length} changed files:`);
  
  const commands = [];

  // Always run smoke tests
  commands.push('npm run test:smoke');

  // Server changes -> API tests
  if (categories.server.length > 0) {
    console.log(`  📡 Server changes (${categories.server.length}) → API tests`);
    commands.push('npm run test -- server/ --run');
  }

  // Client changes -> relevant client tests
  if (categories.client.length > 0) {
    console.log(`  🎨 Client changes (${categories.client.length}) → Client tests`);
    commands.push('npm run test -- client/ --run');
  }

  // Shared changes -> everything (since shared affects both)
  if (categories.shared.length > 0) {
    console.log(`  🔗 Shared changes (${categories.shared.length}) → Full test suite`);
    commands.push('npm run test');
    execSync('npm run test', { stdio: 'inherit' });
    process.exit(0);
  }

  // Config changes -> type check + build
  if (categories.config.length > 0) {
    console.log(`  ⚙️ Config changes (${categories.config.length}) → Build validation`);
    commands.push('npm run check');
    commands.push('npm run build');
  }

  // Docs only -> skip tests
  if (categories.docs.length === changed.length) {
    console.log(`  📚 Documentation only → Skipping tests`);
    process.exit(0);
  }

  // Execute selected commands
  for (const cmd of [...new Set(commands)]) {
    console.log(`\n▶️ Running: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
  }

  console.log('\n✅ Smart tests completed');

} catch (error) {
  console.error('❌ Smart test runner failed:', error.message);
  console.log('🔄 Falling back to smoke tests');
  execSync('npm run test:smoke', { stdio: 'inherit' });
  process.exit(1);
}