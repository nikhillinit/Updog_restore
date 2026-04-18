/**
 * Git Safety Automation
 *
 * Implements:
 * - Pre-push large file scanning
 * - Post-rewrite/rebase audit
 * - Force-push blocking
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { emitTelemetry, getGitState } from './control-plane.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ARTIFACTS_DIR = path.join(REPO_ROOT, '.claude/artifacts/git-audits');
const ALLOWLIST_FILE = path.join(REPO_ROOT, '.claude/large-file-allowlist.json');

// Size thresholds
const WARN_SIZE_MB = 5;
const BLOCK_SIZE_MB = 10;

/**
 * Get timestamp for artifact filenames
 */
function getTimestamp() {
  return new Date().toISOString().replace(/[:-]/g, '').replace('T', '-').split('.')[0];
}

/**
 * Load large file allowlist
 */
function loadAllowlist() {
  try {
    if (fs.existsSync(ALLOWLIST_FILE)) {
      return JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'));
    }
  } catch {
    // ignore
  }
  return { files: [], patterns: [] };
}

/**
 * Check if file is in allowlist
 */
function isAllowed(filepath, allowlist) {
  if (allowlist.files.includes(filepath)) return true;
  for (const pattern of allowlist.patterns) {
    if (new RegExp(pattern).test(filepath)) return true;
  }
  return false;
}

/**
 * Scan for large files in commit range or staged changes
 */
export function scanLargeFiles(commitRange = null) {
  const allowlist = loadAllowlist();
  const warnings = [];
  const blocks = [];

  // If no commit range, scan staged files
  let filesToCheck;
  if (commitRange) {
    try {
      const output = execSync(`git diff --name-only ${commitRange}`, {
        cwd: REPO_ROOT,
        encoding: 'utf8'
      }).trim();
      filesToCheck = output ? output.split('\n') : [];
    } catch {
      filesToCheck = [];
    }
  } else {
    try {
      const output = execSync('git diff --name-only --cached', {
        cwd: REPO_ROOT,
        encoding: 'utf8'
      }).trim();
      filesToCheck = output ? output.split('\n') : [];
    } catch {
      filesToCheck = [];
    }
  }

  for (const file of filesToCheck) {
    const fullPath = path.join(REPO_ROOT, file);

    // Skip if file doesn't exist (deleted)
    if (!fs.existsSync(fullPath)) continue;

    // Skip if allowed
    if (isAllowed(file, allowlist)) continue;

    try {
      const stats = fs.statSync(fullPath);
      const sizeMB = stats.size / (1024 * 1024);

      if (sizeMB >= BLOCK_SIZE_MB) {
        blocks.push({ file, sizeMB: sizeMB.toFixed(2) });
      } else if (sizeMB >= WARN_SIZE_MB) {
        warnings.push({ file, sizeMB: sizeMB.toFixed(2) });
      }
    } catch {
      // Skip files we can't stat
    }
  }

  // Emit telemetry
  for (const b of blocks) {
    emitTelemetry('large_file_blocked', 'full', false, { file: b.file, sizeMB: b.sizeMB });
  }
  for (const w of warnings) {
    emitTelemetry('large_file_warned', 'full', true, { file: w.file, sizeMB: w.sizeMB });
  }

  return { warnings, blocks, passed: blocks.length === 0 };
}

/**
 * Check if command is a risky git operation
 */
export function isRiskyGitCommand(command) {
  const riskyPatterns = [
    /git\s+push\s+.*--force/i,
    /git\s+push\s+.*-f(?:\s|$)/i,
    /git\s+push\s+.*--force-with-lease/i,
    /git\s+reset\s+--hard/i,
    /git\s+rebase(?!\s+--abort)/i,
    /git\s+cherry-pick/i,
    /git\s+filter-branch/i,
    /git\s+filter-repo/i
  ];

  for (const pattern of riskyPatterns) {
    if (pattern.test(command)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if force push is acknowledged
 */
export function isForcePushAcknowledged() {
  return process.env.CLAUDE_ACK_GIT_RISK === '1';
}

/**
 * Generate post-rewrite audit artifact
 */
export function generatePostRewriteAudit(oldHead, newHead) {
  const gitState = getGitState();
  const timestamp = getTimestamp();

  // Get files that disappeared
  let deletedFiles = [];
  let changedFiles = [];
  let conflictFiles = [];
  let forcePushRequired = false;

  try {
    // Files deleted in rewrite
    const deleted = execSync(`git diff --name-only --diff-filter=D ${oldHead}..${newHead}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim();
    deletedFiles = deleted ? deleted.split('\n') : [];

    // All changed files
    const changed = execSync(`git diff --name-only ${oldHead}..${newHead}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim();
    changedFiles = changed ? changed.split('\n') : [];

    // Check if force push is required
    const upstream = gitState.upstream;
    if (upstream) {
      try {
        execSync(`git merge-base --is-ancestor ${newHead} ${upstream}`, {
          cwd: REPO_ROOT,
          stdio: 'pipe'
        });
        // If this succeeds, no force push needed
      } catch {
        // If this fails, we've diverged
        forcePushRequired = true;
      }
    }
  } catch (err) {
    console.error('Error generating audit:', err.message);
  }

  // Check for remote-only files that were dropped
  let remoteOnlyDropped = [];
  if (gitState.upstream) {
    try {
      const remoteOnly = execSync(`git diff --name-only ${newHead}..${gitState.upstream}`, {
        cwd: REPO_ROOT,
        encoding: 'utf8'
      }).trim();
      const remoteOnlyFiles = remoteOnly ? remoteOnly.split('\n') : [];

      // Files that exist on remote but not locally after rewrite
      for (const f of remoteOnlyFiles) {
        const localPath = path.join(REPO_ROOT, f);
        if (!fs.existsSync(localPath)) {
          remoteOnlyDropped.push(f);
        }
      }
    } catch {
      // ignore
    }
  }

  // Scan for newly introduced large files
  const largeFileResult = scanLargeFiles(`${oldHead}..${newHead}`);

  const audit = {
    timestamp: new Date().toISOString(),
    oldHead,
    newHead,
    branch: gitState.branch,
    upstream: gitState.upstream,
    deletedFiles,
    changedFiles,
    remoteOnlyDropped,
    forcePushRequired,
    largeFiles: {
      warnings: largeFileResult.warnings,
      blocks: largeFileResult.blocks
    },
    blocked: remoteOnlyDropped.length > 0 || !largeFileResult.passed || (forcePushRequired && !isForcePushAcknowledged())
  };

  // Generate markdown
  const markdown = `# Post-Rewrite Audit

Generated: ${audit.timestamp}
Branch: ${audit.branch}
Old HEAD: ${oldHead}
New HEAD: ${newHead}
Upstream: ${audit.upstream || 'none'}

## Status
${audit.blocked ? 'BLOCKED - Issues found' : 'PASS'}

## Force Push Required
${audit.forcePushRequired ? 'YES' : 'NO'}

## Remote-Only Files Dropped
${audit.remoteOnlyDropped.length ? audit.remoteOnlyDropped.map(f => `- ${f}`).join('\n') : '_None_'}

## Files Deleted in Rewrite
${audit.deletedFiles.length ? audit.deletedFiles.map(f => `- ${f}`).join('\n') : '_None_'}

## Files Changed
${audit.changedFiles.length} files changed

## Large Files
### Blocked (>10MB)
${audit.largeFiles.blocks.length ? audit.largeFiles.blocks.map(f => `- ${f.file} (${f.sizeMB}MB)`).join('\n') : '_None_'}

### Warnings (5-10MB)
${audit.largeFiles.warnings.length ? audit.largeFiles.warnings.map(f => `- ${f.file} (${f.sizeMB}MB)`).join('\n') : '_None_'}
`;

  // Write artifacts
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const baseName = `${timestamp}--post-rewrite`;
  fs.writeFileSync(path.join(ARTIFACTS_DIR, `${baseName}.json`), JSON.stringify(audit, null, 2));
  fs.writeFileSync(path.join(ARTIFACTS_DIR, `${baseName}.md`), markdown);

  emitTelemetry('git_audit_generated', 'full', !audit.blocked, {
    type: 'post_rewrite',
    blocked: audit.blocked,
    forcePushRequired: audit.forcePushRequired,
    remoteOnlyDropped: audit.remoteOnlyDropped.length
  });

  return audit;
}

/**
 * Pre-push hook logic
 */
export function prePushCheck(remoteRef, localRef) {
  console.log('Running git safety pre-push checks...');

  // Skip if hooks disabled
  if (process.env.CLAUDE_HOOKS_DISABLE === '1') {
    emitTelemetry('hooks_disabled', 'full', true, { hook: 'pre-push-safety' });
    console.log('Git safety hooks disabled via CLAUDE_HOOKS_DISABLE=1');
    return { passed: true, skipped: true };
  }

  // Get commit range
  let commitRange;
  if (remoteRef && localRef) {
    commitRange = `${remoteRef}..${localRef}`;
  } else {
    // Fall back to comparing with origin/main
    try {
      execSync('git fetch origin main 2>/dev/null', { cwd: REPO_ROOT, stdio: 'pipe' });
      commitRange = 'origin/main..HEAD';
    } catch {
      commitRange = null;
    }
  }

  const result = scanLargeFiles(commitRange);

  if (result.warnings.length > 0) {
    console.log('\nWARNING: Large files detected (5-10MB):');
    for (const w of result.warnings) {
      console.log(`  - ${w.file} (${w.sizeMB}MB)`);
    }
  }

  if (result.blocks.length > 0) {
    console.log('\nBLOCKED: Files exceed 10MB limit:');
    for (const b of result.blocks) {
      console.log(`  - ${b.file} (${b.sizeMB}MB)`);
    }
    console.log('\nTo allow specific files, add them to .claude/large-file-allowlist.json');
    return { passed: false, blocks: result.blocks };
  }

  return { passed: true, warnings: result.warnings };
}

/**
 * Force push guard
 */
export function guardForcePush(command) {
  if (!isRiskyGitCommand(command)) {
    return { allowed: true };
  }

  if (isForcePushAcknowledged()) {
    emitTelemetry('bypass_logged', 'full', true, { command, reason: 'CLAUDE_ACK_GIT_RISK=1' });
    return { allowed: true, bypassed: true };
  }

  // Check for force push to protected branches
  if (/git\s+push\s+.*--force.*\s+(main|master)/i.test(command)) {
    emitTelemetry('force_push_blocked', 'full', false, { command, reason: 'protected_branch' });
    return {
      allowed: false,
      reason: 'Force push to main/master is blocked. Use CLAUDE_ACK_GIT_RISK=1 to override.'
    };
  }

  emitTelemetry('force_push_blocked', 'full', false, { command, reason: 'no_acknowledgment' });
  return {
    allowed: false,
    reason: 'Risky git operation detected. Set CLAUDE_ACK_GIT_RISK=1 to acknowledge and proceed.'
  };
}

// CLI interface
const command = process.argv[2];

if (command === 'pre-push') {
  const remoteRef = process.argv[3];
  const localRef = process.argv[4];
  const result = prePushCheck(remoteRef, localRef);

  if (!result.passed) {
    process.exit(1);
  }
} else if (command === 'post-rewrite') {
  const oldHead = process.argv[3] || 'HEAD@{1}';
  const newHead = process.argv[4] || 'HEAD';
  const audit = generatePostRewriteAudit(oldHead, newHead);

  if (audit.blocked) {
    console.log('\nPost-rewrite audit BLOCKED. See .claude/artifacts/git-audits/ for details.');
    console.log('To proceed, resolve the issues or set CLAUDE_ACK_GIT_RISK=1');
    process.exit(1);
  }
} else if (command === 'guard') {
  const gitCommand = process.argv.slice(3).join(' ');
  const result = guardForcePush(gitCommand);

  if (!result.allowed) {
    console.error(result.reason);
    process.exit(1);
  }
}

export default {
  scanLargeFiles,
  isRiskyGitCommand,
  isForcePushAcknowledged,
  generatePostRewriteAudit,
  prePushCheck,
  guardForcePush
};
