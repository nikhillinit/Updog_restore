#!/usr/bin/env node

/**
 * Check Guardian window - requires 3 of last 5 runs to be successful
 * Respects GUARDIAN_MUTE_UNTIL environment variable for TTL muting
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REQUIRED_SUCCESS = 3;
const WINDOW_SIZE = 5;

async function checkGuardianWindow() {
  // Check if muted
  const muteUntil = process.env.GUARDIAN_MUTE_UNTIL;
  if (muteUntil) {
    const now = new Date();
    const muteDate = new Date(muteUntil);
    
    if (muteDate > now) {
      const remainingMinutes = Math.round((muteDate - now) / 1000 / 60);
      console.log(`🔇 Guardian muted until ${muteUntil} (${remainingMinutes} minutes remaining)`);
      console.log('✅ Window check skipped (muted)');
      process.exit(0);
    } else {
      console.log('⏰ Guardian mute expired, proceeding with check');
    }
  }
  
  try {
    // Try using GitHub CLI first
    console.log(`🔍 Checking last ${WINDOW_SIZE} Guardian runs...`);
    
    const runsJson = execSync(
      `gh run list --workflow guardian.yml --limit ${WINDOW_SIZE} --json conclusion,status,createdAt,name`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    
    const runs = JSON.parse(runsJson);
    
    if (runs.length === 0) {
      console.log('⚠️ No Guardian runs found');
      console.log('This might be expected for a new repository');
      process.exit(0);
    }
    
    // Count successes
    const successes = runs.filter(r => r.conclusion === 'success').length;
    const failures = runs.filter(r => r.conclusion === 'failure').length;
    const pending = runs.filter(r => r.status === 'in_progress' || r.status === 'queued').length;
    
    console.log('');
    console.log('📊 Guardian Window Status');
    console.log('========================');
    console.log(`Window size: ${runs.length}/${WINDOW_SIZE}`);
    console.log(`✅ Successful: ${successes}`);
    console.log(`❌ Failed: ${failures}`);
    if (pending > 0) {
      console.log(`⏳ In Progress: ${pending}`);
    }
    console.log(`Required: ${REQUIRED_SUCCESS}/${WINDOW_SIZE}`);
    console.log('');
    
    // Show recent runs
    console.log('Recent runs:');
    runs.slice(0, 5).forEach((run, i) => {
      const icon = run.conclusion === 'success' ? '✅' : 
                   run.conclusion === 'failure' ? '❌' : '⏳';
      const date = new Date(run.createdAt).toLocaleString();
      console.log(`  ${i + 1}. ${icon} ${run.conclusion || run.status} - ${date}`);
    });
    
    console.log('');
    
    // Check if we meet the threshold
    if (successes >= REQUIRED_SUCCESS) {
      console.log(`✅ Guardian window PASSED (${successes}/${WINDOW_SIZE} successful)`);
      process.exit(0);
    } else {
      console.log(`❌ Guardian window FAILED (only ${successes}/${WINDOW_SIZE} successful, need ${REQUIRED_SUCCESS})`);
      
      // Provide helpful context
      if (failures > 2) {
        console.log('');
        console.log('💡 Tip: Multiple failures detected. Check:');
        console.log('  - Is the application healthy?');
        console.log('  - Are health endpoints responding correctly?');
        console.log('  - Check recent Guardian workflow logs for details');
      }
      
      process.exit(1);
    }
  } catch (error) {
    // Fallback if gh CLI is not available
    console.log('⚠️ Could not check Guardian window using GitHub CLI');
    console.log('Error:', error.message);
    
    // Try alternative method using GitHub API directly
    try {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        console.log('❌ GITHUB_TOKEN not set, cannot check Guardian window');
        console.log('In CI, this should be automatically available');
        console.log('Locally, set GITHUB_TOKEN or use gh auth login');
        process.exit(1);
      }
      
      // Parse repo from git remote
      const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
      const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      
      if (!match) {
        console.log('❌ Could not parse GitHub repository from remote URL');
        process.exit(1);
      }
      
      const [, owner, repo] = match;
      console.log(`Repository: ${owner}/${repo}`);
      
      // Use curl as fallback
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/guardian.yml/runs?per_page=${WINDOW_SIZE}`;
      const apiResponse = execSync(
        `curl -s -H "Authorization: token ${token}" "${apiUrl}"`,
        { encoding: 'utf8' }
      );
      
      const data = JSON.parse(apiResponse);
      const runs = data.workflow_runs || [];
      
      const successes = runs.filter(r => r.conclusion === 'success').length;
      
      if (successes >= REQUIRED_SUCCESS) {
        console.log(`✅ Guardian window PASSED (${successes}/${runs.length} successful)`);
        process.exit(0);
      } else {
        console.log(`❌ Guardian window FAILED (only ${successes}/${runs.length} successful)`);
        process.exit(1);
      }
    } catch (apiError) {
      console.log('❌ Failed to check Guardian window via API');
      console.log('Error:', apiError.message);
      
      // In CI, fail closed (require the check)
      // Locally, we can be more lenient
      if (process.env.CI) {
        process.exit(1);
      } else {
        console.log('⚠️ Running locally, assuming Guardian window is OK');
        process.exit(0);
      }
    }
  }
}

// Run the check
checkGuardianWindow().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});