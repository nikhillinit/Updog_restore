/**
 * Git Safety Automation
 *
 * Implements:
 * - Pre-push large file scanning
 * - Post-rewrite/rebase audit
 * - Force-push blocking
 */

import { execFileSync, execSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ARTIFACTS_DIR = path.join(REPO_ROOT, '.claude/artifacts/git-audits');
const METRICS_FILE = path.join(REPO_ROOT, '.claude/artifacts/metrics.jsonl');
const ALLOWLIST_FILE = path.join(REPO_ROOT, '.claude/large-file-allowlist.json');

// Size thresholds
const WARN_SIZE_MB = 5;
const BLOCK_SIZE_MB = 10;
const NEW_FILE_BLOCK_SIZE_MB = 1;

const ARCHIVE_GUARD_PATTERNS = [
  { label: 'archive/**', regex: /^archive\// },
  { label: 'docs/archive/**', regex: /^docs\/archive\// },
  { label: '.backup/**', regex: /^\.backup\// },
  { label: '**/_archive/**', regex: /(^|\/)_archive\// },
  { label: '**/backup/**', regex: /(^|\/)backup\// },
  { label: '**/backups/**', regex: /(^|\/)backups\// }
];

const REQUIRED_GENERATED_ATTRS = [
  { file: 'archive/probe.md', attrs: ['linguist-generated', 'export-ignore'] },
  { file: 'docs/archive/probe.md', attrs: ['linguist-generated', 'export-ignore'] },
  { file: 'docs/_generated/probe.json', attrs: ['linguist-generated', 'export-ignore'] },
  { file: '.backup/probe.txt', attrs: ['linguist-generated', 'export-ignore'] },
  { file: 'nested/_archive/probe.md', attrs: ['linguist-generated', 'export-ignore'] },
  { file: 'nested/backup/probe.md', attrs: ['linguist-generated', 'export-ignore'] },
  { file: 'nested/backups/probe.md', attrs: ['linguist-generated', 'export-ignore'] },
  { file: '.claude/skills/INDEX.md', attrs: ['linguist-generated'] },
  { file: '.claude/skills/_index.json', attrs: ['linguist-generated'] }
];

/**
 * Get timestamp for artifact filenames
 */
function getTimestamp() {
  return new Date().toISOString().replace(/[:-]/g, '').replace('T', '-').split('.')[0];
}

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function getGitState() {
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown';
  const headSha = runGit(['rev-parse', 'HEAD']) || '0'.repeat(40);
  const upstream = runGit(['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
  const statusPorcelain = runGit(['status', '--porcelain']) || '';
  const statusHash = createHash('sha256').update(statusPorcelain).digest('hex');
  const lastCommitSha = runGit(['rev-parse', 'HEAD']) || '0'.repeat(40);
  const lastCommitSubject = runGit(['log', '-1', '--format=%s']) || '';
  const worktreePath = runGit(['rev-parse', '--show-toplevel']);
  const commonDir = runGit(['rev-parse', '--git-common-dir']);
  const isWorktree = commonDir && !commonDir.endsWith('.git');

  return {
    branch,
    headSha,
    upstream,
    dirty: statusPorcelain.length > 0,
    gitStatusPorcelain: statusPorcelain,
    gitStatusHash: statusHash,
    lastCommit: {
      sha: lastCommitSha,
      subject: lastCommitSubject
    },
    repoRoot: REPO_ROOT,
    worktreePath: isWorktree ? worktreePath : null
  };
}

function emitTelemetry(event, mode, success, details = {}) {
  try {
    const gitState = getGitState();
    const telemetryEvent = {
      event,
      ts: new Date().toISOString(),
      repoRoot: gitState.repoRoot,
      worktreePath: gitState.worktreePath,
      branch: gitState.branch,
      headSha: gitState.headSha,
      mode,
      success,
      details
    };

    fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
    fs.appendFileSync(METRICS_FILE, `${JSON.stringify(telemetryEvent)}\n`);
    return true;
  } catch {
    return false;
  }
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

function normalizeGitPath(filepath) {
  return filepath.replace(/\\/g, '/');
}

function gitDiffFiles(commitRange = null, diffFilter = 'ACMR') {
  const args = commitRange
    ? ['diff', '--name-only', `--diff-filter=${diffFilter}`, commitRange]
    : ['diff', '--cached', '--name-only', `--diff-filter=${diffFilter}`];

  try {
    const output = execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim();
    return output ? output.split('\n').map(normalizeGitPath).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function checkGitAttributes(filepath, attrs) {
  try {
    const output = execFileSync('git', ['check-attr', ...attrs, '--', filepath], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim();

    const result = new Map();
    for (const line of output.split('\n').filter(Boolean)) {
      const parts = line.split(': ');
      if (parts.length >= 3) {
        result.set(parts[1], parts.slice(2).join(': '));
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

function isAttributeSet(value) {
  return value === 'set' || value === 'true';
}

function isLfsTracked(filepath) {
  const attrs = checkGitAttributes(filepath, ['filter']);
  return attrs.get('filter') === 'lfs';
}

function matchesArchiveGuard(filepath) {
  const normalized = normalizeGitPath(filepath);
  return ARCHIVE_GUARD_PATTERNS.find(({ regex }) => regex.test(normalized));
}

function verifyGeneratedAttributes() {
  const missing = [];

  for (const probe of REQUIRED_GENERATED_ATTRS) {
    const attrs = checkGitAttributes(probe.file, probe.attrs);
    for (const attr of probe.attrs) {
      if (!isAttributeSet(attrs.get(attr))) {
        missing.push({ file: probe.file, attr, actual: attrs.get(attr) || 'unspecified' });
      }
    }
  }

  const phoenixAttrs = checkGitAttributes('.claude/PHOENIX-AGENTS-REGISTRY.md', [
    'linguist-generated',
    'export-ignore'
  ]);
  for (const attr of ['linguist-generated', 'export-ignore']) {
    const value = phoenixAttrs.get(attr);
    if (value && value !== 'unspecified') {
      missing.push({
        file: '.claude/PHOENIX-AGENTS-REGISTRY.md',
        attr,
        actual: value,
        reason: 'protected Phoenix guidance must not be marked generated'
      });
    }
  }

  return missing;
}

export function archiveGuardCheck(commitRange = null) {
  console.log('Running archive and large-file guard...');

  const allowlist = loadAllowlist();
  const changedFiles = gitDiffFiles(commitRange, 'ACMR');
  const addedFiles = gitDiffFiles(commitRange, 'A');
  const archiveBlocks = [];
  const largeFileBlocks = [];
  const attributeBlocks = verifyGeneratedAttributes();

  for (const file of changedFiles) {
    const match = matchesArchiveGuard(file);
    if (match) {
      archiveBlocks.push({ file, pattern: match.label });
    }
  }

  for (const file of addedFiles) {
    const fullPath = path.join(REPO_ROOT, file);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
    if (isAllowed(file, allowlist) || isLfsTracked(file)) continue;

    const sizeMB = fs.statSync(fullPath).size / (1024 * 1024);
    if (sizeMB >= NEW_FILE_BLOCK_SIZE_MB) {
      largeFileBlocks.push({ file, sizeMB: sizeMB.toFixed(2) });
    }
  }

  for (const block of archiveBlocks) {
    emitTelemetry('archive_path_blocked', 'full', false, {
      file: block.file,
      pattern: block.pattern
    });
  }
  for (const block of largeFileBlocks) {
    emitTelemetry('large_file_blocked', 'full', false, {
      file: block.file,
      sizeMB: block.sizeMB,
      thresholdMB: NEW_FILE_BLOCK_SIZE_MB
    });
  }

  if (archiveBlocks.length > 0) {
    console.log('\nBLOCKED: Archive-like paths are not allowed in tracked changes:');
    for (const block of archiveBlocks) {
      console.log(`  - ${block.file} matched ${block.pattern}`);
    }
    console.log('Use git history for archival context; see CLAUDE.md#archive-gate.');
  }

  if (largeFileBlocks.length > 0) {
    console.log(`\nBLOCKED: Newly added files exceed ${NEW_FILE_BLOCK_SIZE_MB}MB:`);
    for (const block of largeFileBlocks) {
      console.log(`  - ${block.file} (${block.sizeMB}MB)`);
    }
    console.log('Use Git LFS or .claude/large-file-allowlist.json for intentional exceptions.');
  }

  if (attributeBlocks.length > 0) {
    console.log('\nBLOCKED: Generated/archive gitattributes coverage is incomplete:');
    for (const block of attributeBlocks) {
      const reason = block.reason ? ` (${block.reason})` : '';
      console.log(`  - ${block.file}: ${block.attr} is ${block.actual}${reason}`);
    }
  }

  const passed =
    archiveBlocks.length === 0 && largeFileBlocks.length === 0 && attributeBlocks.length === 0;

  if (passed) {
    console.log('[PASS] Archive and large-file guard passed');
  }

  return {
    passed,
    archiveBlocks,
    largeFileBlocks,
    attributeBlocks
  };
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
} else if (command === 'archive-guard') {
  const commitRange = process.argv[3] || null;
  const result = archiveGuardCheck(commitRange);

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
  archiveGuardCheck,
  scanLargeFiles,
  isRiskyGitCommand,
  isForcePushAcknowledged,
  generatePostRewriteAudit,
  prePushCheck,
  guardForcePush
};
