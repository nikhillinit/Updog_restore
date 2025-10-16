#!/usr/bin/env node
/**
 * Track AI Agent Session Outcomes
 *
 * Usage:
 *   node scripts/track-agent-session.mjs start "Fix TS4111 errors" Claude
 *   ... (AI agent works) ...
 *   node scripts/track-agent-session.mjs end success "Fixed 10 errors, baseline updated"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');

const FEEDBACK_FILE = path.join(REPO_ROOT, '.agents-feedback.md');
const METRICS_FILE = path.join(REPO_ROOT, '.agents-metrics.md');
const SESSION_FILE = path.join(REPO_ROOT, '.agent-session.json');

const command = process.argv[2];

function getCurrentDate() {
  return new Date().toISOString().split('T')[0];
}

function startSession(task, tool) {
  const session = {
    startTime: Date.now(),
    task,
    tool,
    date: getCurrentDate()
  };

  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
  console.log(`📝 Session started: ${task} (${tool})`);
  console.log(`   Run: node scripts/track-agent-session.mjs end <success|partial|failure> "<notes>"`);
}

function endSession(outcome, notes) {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error('❌ No active session found. Run "start" first.');
    process.exit(1);
  }

  const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  const duration = Math.round((Date.now() - session.startTime) / 1000 / 60); // minutes

  // Append to feedback log
  const feedbackEntry = `
### ${session.date} - ${session.tool}
**Task**: ${session.task}
**Outcome**: ${outcome}
**Duration**: ${duration} minutes
**Notes**: ${notes}
**AGENTS.md Update**: [TODO if needed]

---
`;

  fs.appendFileSync(FEEDBACK_FILE, feedbackEntry);

  // Update metrics (simplified - just log the session)
  console.log(`✅ Session logged:`);
  console.log(`   Task: ${session.task}`);
  console.log(`   Outcome: ${outcome}`);
  console.log(`   Duration: ${duration} minutes`);
  console.log(`   `);
  console.log(`   Review: ${FEEDBACK_FILE}`);

  // Clean up session file
  fs.unlinkSync(SESSION_FILE);
}

function showUsage() {
  console.log(`
AI Agent Session Tracker

Usage:
  Start:  node scripts/track-agent-session.mjs start "<task>" <tool>
  End:    node scripts/track-agent-session.mjs end <success|partial|failure> "<notes>"

Examples:
  node scripts/track-agent-session.mjs start "Fix TS4111 errors" Claude
  node scripts/track-agent-session.mjs end success "Fixed 10 errors, updated baseline"

  node scripts/track-agent-session.mjs start "Refactor validation" Copilot
  node scripts/track-agent-session.mjs end partial "Some errors remain, need manual review"
  `);
}

// Main logic
switch (command) {
  case 'start':
    const task = process.argv[3];
    const tool = process.argv[4] || 'Unknown';
    if (!task) {
      showUsage();
      process.exit(1);
    }
    startSession(task, tool);
    break;

  case 'end':
    const outcome = process.argv[3];
    const notes = process.argv[4] || 'No notes provided';
    if (!outcome || !['success', 'partial', 'failure'].includes(outcome)) {
      showUsage();
      process.exit(1);
    }
    endSession(outcome, notes);
    break;

  default:
    showUsage();
    process.exit(1);
}
