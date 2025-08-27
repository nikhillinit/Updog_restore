#!/usr/bin/env node

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * Flag diff gate to prevent unauthorized flag changes
 * Detects changes to sensitive flag properties and requires approval
 */

const SENSITIVE_PROPERTIES = ['exposeToClient', 'risk', 'expiresAt', 'enabled'];
const FLAGS_DIR = 'server/flags';

// Get changed files from git
function getChangedFiles() {
  try {
    // Try to get files changed in PR
    const output = execSync('git diff --name-only origin/main...HEAD', { encoding: 'utf8' });
    return output.split('\n').filter(Boolean);
  } catch {
    // Fallback to staged files
    const output = execSync('git diff --name-only --cached', { encoding: 'utf8' });
    return output.split('\n').filter(Boolean);
  }
}

// Parse YAML file (simple parser for flags)
function parseYaml(content) {
  const result = {};
  let currentKey = null;
  
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    
    const indent = line.length - line.trimStart().length;
    
    if (indent === 0 && trimmed.endsWith(':')) {
      currentKey = trimmed.slice(0, -1);
      result[currentKey] = {};
    } else if (currentKey && trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      result[currentKey][key.trim()] = value.replace(/^["']|["']$/g, '');
    }
  });
  
  return result;
}

// Check if PR has approval label
async function hasApproval() {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
    return true; // Not in PR context
  }
  
  try {
    const pr = process.env.GITHUB_REF?.match(/pull\/(\d+)/)?.[1];
    if (!pr) return false;
    
    const output = execSync(`gh pr view ${pr} --json labels`, { encoding: 'utf8' });
    const data = JSON.parse(output);
    return data.labels?.some(label => 
      label.name === 'approved:flags-change' || 
      label.name === 'emergency'
    );
  } catch {
    return false;
  }
}

async function main() {
  console.log('🔍 Feature Flag Diff Gate');
  console.log('=========================\n');
  
  const changedFiles = getChangedFiles();
  const flagFiles = changedFiles.filter(f => f.startsWith(FLAGS_DIR) && f.endsWith('.yml'));
  
  if (flagFiles.length === 0) {
    console.log('✅ No flag files changed');
    process.exit(0);
  }
  
  console.log(`Found ${flagFiles.length} changed flag files:\n`);
  
  const violations = [];
  
  for (const file of flagFiles) {
    console.log(`Checking ${file}...`);
    
    try {
      // Get current version
      const currentContent = await readFile(file, 'utf8');
      const currentFlags = parseYaml(currentContent);
      
      // Get previous version
      let previousContent;
      try {
        previousContent = execSync(`git show origin/main:${file}`, { encoding: 'utf8' });
      } catch {
        console.log(`  → New file (no previous version)`);
        continue;
      }
      
      const previousFlags = parseYaml(previousContent);
      
      // Compare flags
      for (const flagName of Object.keys(currentFlags)) {
        const current = currentFlags[flagName];
        const previous = previousFlags[flagName] || {};
        
        for (const prop of SENSITIVE_PROPERTIES) {
          if (current[prop] !== previous[prop]) {
            const violation = {
              file,
              flag: flagName,
              property: prop,
              old: previous[prop] || '(not set)',
              new: current[prop] || '(not set)',
            };
            
            violations.push(violation);
            
            console.log(`  ⚠️  ${flagName}.${prop} changed:`);
            console.log(`      From: ${violation.old}`);
            console.log(`      To:   ${violation.new}`);
          }
        }
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${file}: ${error.message}`);
    }
  }
  
  if (violations.length === 0) {
    console.log('\n✅ No sensitive flag changes detected');
    process.exit(0);
  }
  
  console.log('\n⚠️  Sensitive flag changes detected!');
  console.log('=====================================\n');
  
  // Check for approval
  const approved = await hasApproval();
  
  if (approved) {
    console.log('✅ PR has approval label - changes allowed');
    process.exit(0);
  }
  
  console.log('❌ Sensitive flag changes require approval\n');
  console.log('Required actions:');
  console.log('1. Review the changes above');
  console.log('2. If approved, add label: approved:flags-change');
  console.log('3. Re-run CI checks\n');
  
  console.log('Changed properties requiring approval:');
  violations.forEach(v => {
    console.log(`  - ${v.file}: ${v.flag}.${v.property}`);
  });
  
  // Generate summary for CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = `
## ⚠️ Feature Flag Changes Require Approval

The following sensitive flag properties were changed:

| File | Flag | Property | Old Value | New Value |
|------|------|----------|-----------|-----------|
${violations.map(v => 
  `| ${v.file} | ${v.flag} | ${v.property} | ${v.old} | ${v.new} |`
).join('\n')}

**Action Required**: Add label \`approved:flags-change\` to this PR after review.
`;
    
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  
  process.exit(1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});