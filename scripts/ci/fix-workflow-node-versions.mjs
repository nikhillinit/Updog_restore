#!/usr/bin/env node
/**
 * Phase 1: Quick Fix - Update Node 22.16.0 → 20.19.0 in CI workflows
 *
 * Purpose: Unblock PR #175 by fixing EBADENGINE errors
 * Scope: Only the 15 workflows causing CI failures
 * Safety: Windows-compatible, preserves other configurations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflowsDir = path.resolve(__dirname, '../../.github/workflows');

// Exact list of 15 files identified in analysis
const targetFiles = [
  'bmad-weekly.yml',
  'ci-memory.yml',
  'ci-reserves-v11.yml',
  'ci-unified.yml',
  'deploy-staging.yml',
  'guardian.yml',
  'perf-baseline.yml',
  'performance-gates.yml',
  'pr-tests.yml',
  'quarantine-check.yml',
  'security-scan.yml',
  'synthetic.yml',
  'synthetics-e2e.yml',
  'synthetics-smart.yml',
  'validate-runtime-config.yml'
];

console.log('🔧 Phase 1: Fixing Node version in CI workflows\n');
console.log(`📁 Target directory: ${workflowsDir}\n`);

let totalReplacements = 0;
let filesModified = 0;
const errors = [];

targetFiles.forEach(file => {
  const filepath = path.join(workflowsDir, file);

  if (!fs.existsSync(filepath)) {
    errors.push(`File not found: ${file}`);
    console.warn(`⚠️  ${file} - NOT FOUND`);
    return;
  }

  try {
    let content = fs.readFileSync(filepath, 'utf8');
    const originalContent = content;

    // Replace only Node 22.16.0 → 20.19.0
    // Handles variations: '22.16.0', "22.16.0"
    const regex = /node-version:\s*['"]22\.16\.0['"]/g;
    content = content.replace(regex, "node-version: '20.19.0'");

    if (content !== originalContent) {
      fs.writeFileSync(filepath, content, 'utf8');
      const count = (originalContent.match(regex) || []).length;
      console.log(`✅ ${file} - ${count} replacement(s)`);
      totalReplacements += count;
      filesModified++;
    } else {
      console.log(`ℹ️  ${file} - No changes needed`);
    }
  } catch (err) {
    errors.push(`Error processing ${file}: ${err.message}`);
    console.error(`❌ ${file} - ERROR: ${err.message}`);
  }
});

console.log(`\n📊 Summary:`);
console.log(`   Files modified: ${filesModified}/15`);
console.log(`   Total replacements: ${totalReplacements}`);

if (errors.length > 0) {
  console.error(`\n⚠️  Errors encountered:`);
  errors.forEach(err => console.error(`   - ${err}`));
  process.exit(1);
}

console.log(`\n✅ Phase 1 complete!`);
console.log(`\n🔍 Next steps:`);
console.log(`   1. Verify: grep -r "'22.16.0'" .github/workflows/`);
console.log(`   2. Review: git diff .github/workflows/`);
console.log(`   3. Test:   npm ci && npm run doctor:quick`);
console.log(`   4. Commit & push to PR #175`);
