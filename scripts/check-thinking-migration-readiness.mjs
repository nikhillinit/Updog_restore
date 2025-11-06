#!/usr/bin/env node
/**
 * Extended Thinking Migration Readiness Checker
 *
 * Validates that all agents referenced in migration guide actually exist.
 * Prevents documentation drift and helps developers plan migrations.
 *
 * Usage: node scripts/check-thinking-migration-readiness.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// ============================================================================
// Configuration
// ============================================================================

const PACKAGES_DIR = join(ROOT, 'packages');
const MIGRATION_GUIDE = join(ROOT, 'packages', 'agent-core', 'THINKING_MIGRATION_GUIDE.md');

// Expected real agents from migration guide
const EXPECTED_AGENTS = [
  { name: 'Test Repair Agent', path: 'test-repair-agent' },
  { name: 'Bundle Optimization Agent', path: 'bundle-optimization-agent' },
  { name: 'Codex Review Agent', path: 'codex-review-agent' },
  { name: 'Dependency Analysis Agent', path: 'dependency-analysis-agent' },
  { name: 'Route Optimization Agent', path: 'route-optimization-agent' },
  { name: 'Zencoder Agent', path: 'zencoder-integration' }
];

// Example agents (should NOT exist as packages)
const EXAMPLE_AGENTS = [
  { name: 'DB Migration Agent', path: 'db-migration-agent' },
  { name: 'Chaos Engineer Agent', path: 'chaos-engineer-agent' },
  { name: 'Code Reviewer Agent', path: 'code-reviewer-agent' }
];

// ============================================================================
// Helpers
// ============================================================================

function getAllPackages() {
  return readdirSync(PACKAGES_DIR)
    .filter(name => {
      const fullPath = join(PACKAGES_DIR, name);
      return statSync(fullPath).isDirectory();
    })
    .sort();
}

function checkAgentExists(agentPath) {
  const fullPath = join(PACKAGES_DIR, agentPath);
  try {
    return statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

function findAgentMainFile(agentPath) {
  const agentDir = join(PACKAGES_DIR, agentPath, 'src');
  try {
    const files = readdirSync(agentDir);
    const agentFile = files.find(f =>
      f.endsWith('Agent.ts') && !f.endsWith('.test.ts')
    );
    return agentFile ? join(agentDir, agentFile) : null;
  } catch {
    return null;
  }
}

function checkForThinkingMixin(agentPath) {
  const mainFile = findAgentMainFile(agentPath);
  if (!mainFile) return { hasFile: false, hasThinking: false };

  try {
    const content = readFileSync(mainFile, 'utf8');
    const hasThinking =
      content.includes('withThinking') ||
      content.includes('applyThinkingMixin') ||
      content.includes('ThinkingMixin');

    return { hasFile: true, hasThinking, mainFile };
  } catch {
    return { hasFile: false, hasThinking: false };
  }
}

// ============================================================================
// Main Checks
// ============================================================================

function runChecks() {
  console.log('\n🔍 Extended Thinking Migration Readiness Check\n');
  console.log('='.repeat(70));

  let allPassed = true;

  // Check 1: Verify all expected agents exist
  console.log('\n✅ Real Agents (Should Exist):\n');

  const missingAgents = [];
  const foundAgents = [];

  for (const agent of EXPECTED_AGENTS) {
    const exists = checkAgentExists(agent.path);
    if (exists) {
      const thinkingStatus = checkForThinkingMixin(agent.path);
      const status = thinkingStatus.hasThinking ? '🧠 migrated' : '⏳ ready';
      console.log(`  ✓ ${agent.name.padEnd(35)} (packages/${agent.path}) ${status}`);
      foundAgents.push({ ...agent, ...thinkingStatus });
    } else {
      console.log(`  ✗ ${agent.name.padEnd(35)} MISSING: packages/${agent.path}`);
      missingAgents.push(agent);
      allPassed = false;
    }
  }

  // Check 2: Verify example agents DO NOT exist
  console.log('\n📘 Example Agents (Should NOT Exist):\n');

  const incorrectlyCreated = [];

  for (const agent of EXAMPLE_AGENTS) {
    const exists = checkAgentExists(agent.path);
    if (!exists) {
      console.log(`  ✓ ${agent.name.padEnd(35)} (hypothetical example only)`);
    } else {
      console.log(`  ✗ ${agent.name.padEnd(35)} EXISTS but should be example only!`);
      incorrectlyCreated.push(agent);
      allPassed = false;
    }
  }

  // Check 3: Find agents not in migration guide
  console.log('\n🔎 Other Packages:\n');

  const allPackages = getAllPackages();
  const documentedPaths = [
    ...EXPECTED_AGENTS.map(a => a.path),
    ...EXAMPLE_AGENTS.map(a => a.path)
  ];

  const agentPackages = allPackages.filter(pkg =>
    pkg.includes('agent') || pkg.includes('integration')
  );

  const undocumentedAgents = agentPackages.filter(pkg => !documentedPaths.includes(pkg));

  if (undocumentedAgents.length > 0) {
    console.log('  Agents not mentioned in migration guide:');
    undocumentedAgents.forEach(pkg => {
      const thinkingStatus = checkForThinkingMixin(pkg);
      const status = thinkingStatus.hasThinking ? '🧠' : '  ';
      console.log(`  ${status} ${pkg}`);
    });
  } else {
    console.log('  All agent packages are documented.');
  }

  // Migration Progress Summary
  console.log('\n📊 Migration Progress:\n');

  const migratedCount = foundAgents.filter(a => a.hasThinking).length;
  const totalCount = foundAgents.length;
  const percentage = totalCount > 0 ? Math.round((migratedCount / totalCount) * 100) : 0;

  console.log(`  Migrated:  ${migratedCount}/${totalCount} (${percentage}%)`);
  console.log(`  Remaining: ${totalCount - migratedCount}`);

  if (migratedCount > 0) {
    console.log('\n  Already using extended thinking:');
    foundAgents.filter(a => a.hasThinking).forEach(agent => {
      console.log(`    🧠 ${agent.name}`);
    });
  }

  if (totalCount - migratedCount > 0) {
    console.log('\n  Ready for migration:');
    foundAgents.filter(a => !a.hasThinking).forEach(agent => {
      console.log(`    ⏳ ${agent.name} (packages/${agent.path})`);
    });
  }

  // Final Results
  console.log('\n' + '='.repeat(70));

  if (allPassed) {
    console.log('✅ All checks passed! Migration guide is accurate.\n');
    return 0;
  } else {
    console.log('❌ Some checks failed:\n');

    if (missingAgents.length > 0) {
      console.log('  Missing agents (update migration guide or create package):');
      missingAgents.forEach(agent => {
        console.log(`    - ${agent.name} (expected at packages/${agent.path})`);
      });
    }

    if (incorrectlyCreated.length > 0) {
      console.log('\n  Example agents incorrectly created as packages:');
      incorrectlyCreated.forEach(agent => {
        console.log(`    - ${agent.name} (should be example only, not a package)`);
      });
    }

    console.log('\n  Fix these issues before proceeding with migration.\n');
    return 1;
  }
}

// ============================================================================
// Entry Point
// ============================================================================

try {
  const exitCode = runChecks();
  process.exit(exitCode);
} catch (error) {
  console.error('\n❌ Error running checks:', error.message);
  process.exit(1);
}
