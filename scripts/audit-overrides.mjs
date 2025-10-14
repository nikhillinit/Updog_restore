#!/usr/bin/env node
/**
 * Audit package.json overrides to ensure all are documented and current
 */

import { readFileSync, existsSync } from 'node:fs';

const JUSTIFICATIONS_FILE = 'docs/dependency-justifications.md';
const MAX_AGE_DAYS = 90;

export function auditOverrides() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const overrides = pkg.overrides || {};

  // Check if justifications file exists
  if (!existsSync(JUSTIFICATIONS_FILE)) {
    console.error(`❌ Missing ${JUSTIFICATIONS_FILE}`);
    console.error('Create this file to document all package overrides.');
    process.exit(1);
  }

  const justifications = readFileSync(JUSTIFICATIONS_FILE, 'utf8');
  const violations = [];
  const warnings = [];

  for (const [dep, version] of Object.entries(overrides)) {
    // Skip comment entries
    if (dep.startsWith('//')) continue;

    // Check if justified
    if (!justifications.includes(`\`${dep}\``)) {
      violations.push(`Override for "${dep}" lacks justification in ${JUSTIFICATIONS_FILE}`);
      continue;
    }

    // Check age (warn if > 90 days)
    const regex = new RegExp(`${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^]*?Added: (\\d{4}-\\d{2}-\\d{2})`, 'i');
    const match = justifications.match(regex);

    if (match) {
      const added = new Date(match[1]);
      const ageMs = Date.now() - added.getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

      if (ageDays > MAX_AGE_DAYS) {
        warnings.push(`Override for "${dep}" is ${ageDays} days old (added ${match[1]}) - consider reviewing`);
      }
    } else {
      warnings.push(`Override for "${dep}" missing "Added: YYYY-MM-DD" date in justification`);
    }
  }

  // Report results
  if (violations.length > 0) {
    console.error('❌ Override violations:\n');
    violations.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('⚠ Override warnings:\n');
    warnings.forEach(w => console.warn(`  - ${w}`));
  }

  const count = Object.keys(overrides).filter(k => !k.startsWith('//')).length;
  console.log(`✅ All ${count} package override(s) justified and documented`);
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  auditOverrides();
}
