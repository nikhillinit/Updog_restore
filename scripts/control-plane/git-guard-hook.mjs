#!/usr/bin/env node
/**
 * Git Guard Hook - PreToolUse for Bash
 *
 * Intercepts risky git commands and blocks force pushes without acknowledgment.
 * Reads the command from TOOL_INPUT environment variable.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const METRICS_FILE = path.join(REPO_ROOT, '.claude/artifacts/metrics.jsonl');

// Check kill switch
if (process.env.CLAUDE_HOOKS_DISABLE === '1') {
  emitTelemetry('hooks_disabled', { hook: 'git-guard' });
  process.exit(0);
}

const toolInput = process.env.TOOL_INPUT || '';

// Risky git patterns
const FORCE_PUSH_PATTERN = /git\s+push\s+.*--force|git\s+push\s+.*-f(?:\s|$)|git\s+push\s+.*--force-with-lease/i;
const RESET_HARD_PATTERN = /git\s+reset\s+--hard/i;
const PROTECTED_BRANCH_FORCE = /git\s+push\s+.*--force.*\s+(main|master)(?:\s|$)/i;

function emitTelemetry(event, details = {}) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim() || 'unknown';

    const headSha = execSync('git rev-parse HEAD 2>/dev/null', {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim() || '';

    const entry = {
      event,
      ts: new Date().toISOString(),
      repoRoot: REPO_ROOT,
      worktreePath: null,
      branch,
      headSha,
      mode: 'full',
      success: event !== 'force_push_blocked',
      details
    };

    fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
    fs.appendFileSync(METRICS_FILE, JSON.stringify(entry) + '\n');
  } catch {
    // Telemetry should not block execution
  }
}

// Check if command is a force push
if (FORCE_PUSH_PATTERN.test(toolInput)) {
  // Check for protected branch
  if (PROTECTED_BRANCH_FORCE.test(toolInput)) {
    console.error('BLOCKED: Force push to main/master is not allowed.');
    console.error('This is a protected branch. Use a PR workflow instead.');
    emitTelemetry('force_push_blocked', { command: toolInput.slice(0, 200), reason: 'protected_branch' });
    process.exit(2);
  }

  // Check for acknowledgment
  if (process.env.CLAUDE_ACK_GIT_RISK !== '1') {
    console.error('BLOCKED: Force push requires explicit acknowledgment.');
    console.error('Set CLAUDE_ACK_GIT_RISK=1 to proceed.');
    console.error('Consider using /checkpoint before this operation.');
    emitTelemetry('force_push_blocked', { command: toolInput.slice(0, 200), reason: 'no_acknowledgment' });
    process.exit(2);
  }

  // Acknowledged - log bypass
  emitTelemetry('bypass_logged', { command: toolInput.slice(0, 200), reason: 'CLAUDE_ACK_GIT_RISK=1' });
}

// Check for reset --hard
if (RESET_HARD_PATTERN.test(toolInput)) {
  if (process.env.CLAUDE_ACK_GIT_RISK !== '1') {
    console.error('WARNING: git reset --hard detected.');
    console.error('This will discard uncommitted changes.');
    console.error('Set CLAUDE_ACK_GIT_RISK=1 to suppress this warning.');
    // Warning only, don't block
  }
}

// Allow command to proceed
process.exit(0);
