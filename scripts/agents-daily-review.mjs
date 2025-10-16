#!/usr/bin/env node
/**
 * Daily AGENTS.md Review - Lightweight & Smart
 *
 * Only shows insights when there's meaningful activity.
 * Designed for < 10 second execution time.
 *
 * Usage:
 *   node scripts/agents-daily-review.mjs          # Show today's activity
 *   node scripts/agents-daily-review.mjs --week   # Show last 7 days
 *   node scripts/agents-daily-review.mjs --help   # Usage info
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');

const FEEDBACK_FILE = path.join(REPO_ROOT, '.agents-feedback.md');
const METRICS_FILE = path.join(REPO_ROOT, '.agents-metrics.md');
const BASELINE_FILE = path.join(REPO_ROOT, '.tsc-baseline.json');

// Configuration
const COST_THRESHOLD = {
  minSessionsForReview: 1,  // Only review if at least 1 session today
  maxOutputLines: 30,        // Keep output concise
};

function getCurrentDate() {
  return new Date().toISOString().split('T')[0];
}

function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function parseBaselineFile() {
  try {
    const baseline = JSON.parse(readFile(BASELINE_FILE));
    return {
      total: baseline.totalErrors,
      client: baseline.projects.client?.total || 0,
      server: baseline.projects.server?.total || 0,
      shared: baseline.projects.shared?.total || 0,
      timestamp: baseline.timestamp
    };
  } catch (err) {
    return null;
  }
}

function extractSessionsFromFeedback(content, sinceDate) {
  const sessions = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match session header: ### YYYY-MM-DD - Tool
    const match = line.match(/^###\s+(\d{4}-\d{2}-\d{2})\s+-\s+(.+)/);
    if (match) {
      const [, date, tool] = match;

      // Skip if before cutoff date
      if (date < sinceDate) continue;

      // Extract session details
      let task = '';
      let outcome = '';
      let duration = '';
      let notes = '';

      for (let j = i + 1; j < lines.length && !lines[j].startsWith('###'); j++) {
        if (lines[j].startsWith('**Task**:')) task = lines[j].replace('**Task**:', '').trim();
        if (lines[j].startsWith('**Outcome**:')) outcome = lines[j].replace('**Outcome**:', '').trim();
        if (lines[j].startsWith('**Duration**:')) duration = lines[j].replace('**Duration**:', '').trim();
        if (lines[j].startsWith('**Notes**:')) notes = lines[j].replace('**Notes**:', '').trim();
      }

      sessions.push({ date, tool, task, outcome, duration, notes });
    }
  }

  return sessions;
}

function getBaselineHistory(days) {
  try {
    // Get git log for baseline file
    const output = execSync(
      `git log --since="${days} days ago" --pretty=format:"%H|%ai" -- .tsc-baseline.json`,
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );

    if (!output) return [];

    const commits = output.trim().split('\n').map(line => {
      const [hash, date] = line.split('|');
      return { hash, date: date.split(' ')[0] };
    });

    return commits;
  } catch (err) {
    return [];
  }
}

function analyzeSessions(sessions) {
  if (sessions.length === 0) {
    return null; // No activity = no analysis needed
  }

  const successCount = sessions.filter(s => s.outcome === 'success').length;
  const partialCount = sessions.filter(s => s.outcome === 'partial').length;
  const failureCount = sessions.filter(s => s.outcome === 'failure').length;

  const successRate = (successCount / sessions.length * 100).toFixed(0);

  const toolUsage = {};
  sessions.forEach(s => {
    toolUsage[s.tool] = (toolUsage[s.tool] || 0) + 1;
  });

  return {
    total: sessions.length,
    successCount,
    partialCount,
    failureCount,
    successRate,
    toolUsage
  };
}

function showDailyReview(args) {
  const isWeekly = args.includes('--week');
  const period = isWeekly ? 7 : 1;
  const sinceDate = getDaysAgo(period);
  const periodName = isWeekly ? 'Last 7 days' : 'Today';

  console.log('');
  console.log('═'.repeat(70));
  console.log(`  AGENTS.md Daily Review - ${periodName} (${getCurrentDate()})`);
  console.log('═'.repeat(70));
  console.log('');

  // 1. Parse feedback log
  const feedbackContent = readFile(FEEDBACK_FILE);
  const sessions = extractSessionsFromFeedback(feedbackContent, sinceDate);

  // Early exit if no activity
  if (sessions.length < COST_THRESHOLD.minSessionsForReview) {
    console.log(`📊 No AI agent activity ${isWeekly ? 'this week' : 'today'}`);
    console.log('');
    console.log('💡 Tip: Use AI agents to speed up TypeScript error fixing');
    console.log('   Example: Ask Claude to fix TS4111 errors in a file');
    console.log('');
    console.log('   Track sessions with:');
    console.log('   node scripts/track-agent-session.mjs start "<task>" <tool>');
    console.log('');
    return;
  }

  // 2. Analyze sessions
  const analysis = analyzeSessions(sessions);

  console.log(`📊 Activity Summary`);
  console.log('─'.repeat(70));
  console.log(`   Total Sessions: ${analysis.total}`);
  console.log(`   Success Rate:   ${analysis.successRate}% (${analysis.successCount} success, ${analysis.partialCount} partial, ${analysis.failureCount} failed)`);
  console.log('');

  console.log(`🤖 Tool Usage`);
  console.log('─'.repeat(70));
  Object.entries(analysis.toolUsage).forEach(([tool, count]) => {
    console.log(`   ${tool.padEnd(15)} ${count} session${count > 1 ? 's' : ''}`);
  });
  console.log('');

  // 3. Show recent sessions (last 5)
  console.log(`📝 Recent Sessions (Last ${Math.min(5, sessions.length)})`);
  console.log('─'.repeat(70));
  sessions.slice(-5).reverse().forEach((session, idx) => {
    const emoji = session.outcome === 'success' ? '✅' :
                  session.outcome === 'partial' ? '⚠️' : '❌';
    console.log(`   ${emoji} ${session.date} | ${session.tool} | ${session.task}`);
    if (session.outcome !== 'success') {
      console.log(`      Notes: ${session.notes}`);
    }
  });
  console.log('');

  // 4. Baseline progress (if changed recently)
  const baseline = parseBaselineFile();
  if (baseline) {
    const baselineHistory = getBaselineHistory(period);

    if (baselineHistory.length > 0) {
      console.log(`📈 TypeScript Baseline Progress`);
      console.log('─'.repeat(70));
      console.log(`   Current Total: ${baseline.total} errors`);
      console.log(`   Client:  ${baseline.client} errors`);
      console.log(`   Server:  ${baseline.server} errors`);
      console.log(`   Shared:  ${baseline.shared} errors`);
      console.log(`   Updated:   ${baselineHistory.length} time${baselineHistory.length > 1 ? 's' : ''} ${periodName.toLowerCase()}`);
      console.log('');
    }
  }

  // 5. Actionable recommendations
  console.log(`💡 Recommendations`);
  console.log('─'.repeat(70));

  if (analysis.successRate < 80) {
    console.log(`   ⚠️  Success rate below 80% - Review AGENTS.md clarity`);
    console.log(`       Check: ${FEEDBACK_FILE}`);
    console.log(`       Look for: Repeated failure patterns`);
    console.log('');
  }

  if (analysis.partialCount > 0) {
    console.log(`   ⚠️  ${analysis.partialCount} partial session${analysis.partialCount > 1 ? 's' : ''} - May need AGENTS.md updates`);
    console.log(`       Review partial sessions for missing instructions`);
    console.log('');
  }

  if (analysis.successRate >= 90) {
    console.log(`   ✅ Excellent success rate! AGENTS.md working well`);
    console.log('');
  }

  // 6. Next actions
  console.log(`🎯 Next Actions`);
  console.log('─'.repeat(70));
  console.log(`   View details:  cat ${FEEDBACK_FILE}`);
  console.log(`   Track session: node scripts/track-agent-session.mjs start "<task>" <tool>`);
  console.log(`   Weekly review: node scripts/agents-daily-review.mjs --week`);
  console.log('');

  console.log('═'.repeat(70));
  console.log('');
}

function showHelp() {
  console.log(`
AGENTS.md Daily Review - Smart & Lightweight

This script provides a quick daily summary of AI agent activity.
Only shows output when there's meaningful activity (cost-efficient).

Usage:
  node scripts/agents-daily-review.mjs          # Show today's activity
  node scripts/agents-daily-review.mjs --week   # Show last 7 days
  node scripts/agents-daily-review.mjs --help   # Show this help

Features:
  ✅ Fast execution (< 10 seconds)
  ✅ Only shows output when there's activity
  ✅ Actionable recommendations based on success rate
  ✅ Baseline progress tracking
  ✅ Tool usage analytics

Workflow:
  1. Work with AI agents (Claude, Copilot, etc.)
  2. Track sessions: node scripts/track-agent-session.mjs start "<task>" <tool>
  3. End sessions: node scripts/track-agent-session.mjs end <outcome> "<notes>"
  4. Run daily review: node scripts/agents-daily-review.mjs
  5. Update AGENTS.md based on insights

Configuration:
  Minimum sessions for review: ${COST_THRESHOLD.minSessionsForReview}
  Max output lines: ${COST_THRESHOLD.maxOutputLines}

Files:
  Input:  ${FEEDBACK_FILE}
          ${BASELINE_FILE}
  Output: Terminal summary (no files modified)
  `);
}

// Main
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
} else {
  showDailyReview(args);
}
