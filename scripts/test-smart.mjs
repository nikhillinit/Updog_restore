#!/usr/bin/env node
/**
 * Smart test runner: runs only tests related to changed files
 * No ML - just smart file-based logic
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const base = process.env.BASE_REF || 'origin/main';
const maxFiles = 200; // Skip heavy checks if too many changes
const listOnly = process.argv.includes('--list-only');

try {
  const changed = execSync(`git diff --name-only ${base}`)
    .toString().trim().split('\n').filter(Boolean);

  if (changed.length === 0) {
    if (listOnly) {
      console.log('smoke');
      process.exit(0);
    }
    console.log('[INFO] No changes detected, running smoke tests only');
    execSync('npm run test:smoke', { stdio: 'inherit' });
    process.exit(0);
  }

  if (changed.length > maxFiles) {
    if (listOnly) {
      console.log('all');
      process.exit(0);
    }
    console.log(`[WARN] Large changeset (${changed.length} files), running full test suite`);
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

  // In list-only mode, output affected test categories
  if (listOnly) {
    const affected = [];
    if (categories.server.length > 0) affected.push('server');
    if (categories.client.length > 0) affected.push('client');
    if (categories.shared.length > 0) affected.push('all');
    if (categories.config.length > 0) affected.push('config');
    console.log(affected.length > 0 ? affected.join(',') : 'smoke');
    process.exit(0);
  }

  console.log(`[SMART] Test selection for ${changed.length} changed files:`);

  const commands = [];

  // Always run smoke tests
  commands.push('npm run test:smoke');

  // Server changes -> API tests
  if (categories.server.length > 0) {
    console.log(`  [SERVER] ${categories.server.length} changes -> API tests`);
    commands.push('npm run test -- server/ --run');
  }

  // Client changes -> relevant client tests
  if (categories.client.length > 0) {
    console.log(`  [CLIENT] ${categories.client.length} changes -> Client tests`);
    commands.push('npm run test -- client/ --run');
  }

  // Shared changes -> everything (since shared affects both)
  if (categories.shared.length > 0) {
    console.log(`  [SHARED] ${categories.shared.length} changes -> Full test suite`);
    commands.push('npm run test');
    execSync('npm run test', { stdio: 'inherit' });
    process.exit(0);
  }

  // Config changes -> type check + build
  if (categories.config.length > 0) {
    console.log(`  [CONFIG] ${categories.config.length} changes -> Build validation`);
    commands.push('npm run check');
    commands.push('npm run build');
  }

  // Docs only -> skip tests
  if (categories.docs.length === changed.length) {
    if (listOnly) {
      console.log('docs');
      process.exit(0);
    }
    console.log(`  [DOCS] Documentation only -> Skipping tests`);
    process.exit(0);
  }

  // Execute selected commands
  for (const cmd of [...new Set(commands)]) {
    console.log(`\n-> Running: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
  }

  console.log('\n[PASS] Smart tests completed');

} catch (error) {
  console.error('[FAIL] Smart test runner failed:', error.message);
  console.log('[FALLBACK] Falling back to smoke tests');
  execSync('npm run test:smoke', { stdio: 'inherit' });
  process.exit(1);
}