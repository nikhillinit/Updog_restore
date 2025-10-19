#!/usr/bin/env node
/**
 * Analyze Prompt Improver Hook Logs
 *
 * Extracts insights from ~/.claude/logs/prompt-improvements.jsonl to identify:
 * - Most common vague prompts (documentation gaps)
 * - Bypass vs wrapped ratios
 * - Trends over time
 *
 * Usage:
 *   node scripts/analyze-prompt-patterns.js
 *   node scripts/analyze-prompt-patterns.js --days 7
 *   node scripts/analyze-prompt-patterns.js --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Parse command line arguments
const args = process.argv.slice(2);
const daysFilter = args.includes('--days')
  ? parseInt(args[args.indexOf('--days') + 1], 10)
  : null;
const jsonOutput = args.includes('--json');

// Log file location
const LOG_FILE = path.join(os.homedir(), '.claude', 'logs', 'prompt-improvements.jsonl');

// Check if log file exists
if (!fs.existsSync(LOG_FILE)) {
  console.error(`Error: Log file not found at ${LOG_FILE}`);
  console.error('\nThe Prompt Improver Hook may not have run yet.');
  console.error('Try using Claude Code first, then run this script again.');
  process.exit(1);
}

// Read and parse JSONL file
const lines = fs.readFileSync(LOG_FILE, 'utf-8')
  .split('\n')
  .filter(line => line.trim());

const entries = lines.map(line => {
  try {
    return JSON.parse(line);
  } catch (e) {
    console.warn(`Warning: Failed to parse line: ${line.substring(0, 50)}...`);
    return null;
  }
}).filter(Boolean);

// Filter by date if specified
let filteredEntries = entries;
if (daysFilter) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysFilter);

  filteredEntries = entries.filter(entry => {
    return new Date(entry.timestamp) >= cutoffDate;
  });
}

// Calculate statistics
const stats = {
  total: filteredEntries.length,
  wrapped: filteredEntries.filter(e => e.wrapped).length,
  bypassed: filteredEntries.filter(e => e.bypassed || !e.wrapped).length,
  avgPromptLength: Math.round(
    filteredEntries.reduce((sum, e) => sum + (e.prompt_length || 0), 0) / filteredEntries.length
  ),
};

stats.wrappedPercent = ((stats.wrapped / stats.total) * 100).toFixed(1);
stats.bypassedPercent = ((stats.bypassed / stats.total) * 100).toFixed(1);

// Find most common wrapped prompts (potential documentation gaps)
const wrappedPrompts = filteredEntries
  .filter(e => e.wrapped)
  .map(e => e.prompt_preview);

const promptCounts = {};
wrappedPrompts.forEach(prompt => {
  const normalized = prompt.toLowerCase().trim();
  promptCounts[normalized] = (promptCounts[normalized] || 0) + 1;
});

const topVaguePrompts = Object.entries(promptCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([prompt, count]) => ({ prompt, count }));

// Time-based analysis
const byDay = {};
filteredEntries.forEach(entry => {
  const date = new Date(entry.timestamp).toISOString().split('T')[0];
  byDay[date] = byDay[date] || { total: 0, wrapped: 0, bypassed: 0 };
  byDay[date].total++;
  if (entry.wrapped) byDay[date].wrapped++;
  else byDay[date].bypassed++;
});

const dailyStats = Object.entries(byDay)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([date, counts]) => ({
    date,
    ...counts,
    wrappedPercent: ((counts.wrapped / counts.total) * 100).toFixed(1)
  }));

// Output results
if (jsonOutput) {
  console.log(JSON.stringify({
    stats,
    topVaguePrompts,
    dailyStats
  }, null, 2));
} else {
  console.log('='.repeat(80));
  console.log('Prompt Improver Hook - Analytics Report');
  console.log('='.repeat(80));

  if (daysFilter) {
    console.log(`\nTime Range: Last ${daysFilter} days`);
  } else {
    console.log(`\nTime Range: All time`);
  }

  console.log('\n📊 Overall Statistics');
  console.log('-'.repeat(80));
  console.log(`Total prompts:        ${stats.total}`);
  console.log(`Wrapped (evaluated):  ${stats.wrapped} (${stats.wrappedPercent}%)`);
  console.log(`Bypassed:             ${stats.bypassed} (${stats.bypassedPercent}%)`);
  console.log(`Avg prompt length:    ${stats.avgPromptLength} characters`);

  if (topVaguePrompts.length > 0) {
    console.log('\n🔍 Most Common Vague Prompts (Documentation Gaps)');
    console.log('-'.repeat(80));
    topVaguePrompts.forEach((item, idx) => {
      console.log(`${idx + 1}. [${item.count}x] "${item.prompt}"`);
    });

    console.log('\n💡 Recommendation:');
    console.log('Consider adding these patterns to CLAUDE.md or creating dedicated cheatsheets.');
  }

  if (dailyStats.length > 0 && !jsonOutput) {
    console.log('\n📅 Daily Breakdown');
    console.log('-'.repeat(80));
    console.log('Date       | Total | Wrapped | Bypassed | Wrapped %');
    console.log('-'.repeat(80));
    dailyStats.forEach(day => {
      console.log(
        `${day.date} | ${String(day.total).padStart(5)} | ` +
        `${String(day.wrapped).padStart(7)} | ` +
        `${String(day.bypassed).padStart(8)} | ` +
        `${String(day.wrappedPercent).padStart(8)}%`
      );
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Log file: ${LOG_FILE}`);
  console.log(`Total entries analyzed: ${entries.length}`);
  console.log('='.repeat(80));
}
