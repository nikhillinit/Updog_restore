/**
 * Claude Code Control Plane
 *
 * Implements the Frame -> Verify -> Execute -> Reconcile -> Git Safety -> Checkpoint loop.
 * All artifact writing, telemetry, and validation happens through this module.
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Paths
const ARTIFACTS_DIR = path.join(REPO_ROOT, '.claude/artifacts');
const SCHEMAS_DIR = path.join(REPO_ROOT, '.claude/schemas');
const LOCKS_DIR = path.join(REPO_ROOT, '.claude/locks');
const METRICS_FILE = path.join(ARTIFACTS_DIR, 'metrics.jsonl');

// Load and compile schemas
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

const handoffSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'handoff.schema.json'), 'utf8'));
const telemetrySchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, 'telemetry-event.schema.json'), 'utf8'));

const validateHandoff = ajv.compile(handoffSchema);
const validateTelemetry = ajv.compile(telemetrySchema);

/**
 * Get current git state
 */
export function getGitState() {
  const run = (cmd) => {
    try {
      return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
      return null;
    }
  };

  const branch = run('git rev-parse --abbrev-ref HEAD') || 'unknown';
  const headSha = run('git rev-parse HEAD') || '0'.repeat(40);
  const upstream = run(`git rev-parse --abbrev-ref ${branch}@{upstream} 2>/dev/null`);
  const statusPorcelain = run('git status --porcelain') || '';
  const statusHash = createHash('sha256').update(statusPorcelain).digest('hex');
  const dirty = statusPorcelain.length > 0;

  const lastCommitSha = run('git rev-parse HEAD') || '0'.repeat(40);
  const lastCommitSubject = run('git log -1 --format=%s') || '';

  // Detect worktree
  const worktreePath = run('git rev-parse --show-toplevel');
  const commonDir = run('git rev-parse --git-common-dir');
  const isWorktree = commonDir && !commonDir.endsWith('.git');

  return {
    branch,
    headSha,
    upstream,
    dirty,
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

/**
 * Emit a telemetry event
 */
export function emitTelemetry(event, mode, success, details = {}) {
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

  if (!validateTelemetry(telemetryEvent)) {
    console.error('Invalid telemetry event:', validateTelemetry.errors);
    return false;
  }

  fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
  fs.appendFileSync(METRICS_FILE, JSON.stringify(telemetryEvent) + '\n');
  return true;
}

/**
 * Generate timestamp string for artifact filenames
 */
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:-]/g, '').replace('T', '-').split('.')[0];
}

/**
 * Create handoff/checkpoint artifact
 */
export function createHandoff(options = {}) {
  const {
    type = 'handoff',
    reason = 'manual',
    currentState = '',
    nextTask = '',
    blockers = [],
    filesInFlight = [],
    openQuestions = [],
    notes = [],
    tests = { status: 'not_run' },
    ttlMinutes = 240
  } = options;

  const gitState = getGitState();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const artifact = {
    version: '1.0',
    type,
    reason,
    generatedAt: now.toISOString(),
    repoRoot: gitState.repoRoot,
    worktreePath: gitState.worktreePath,
    branch: gitState.branch,
    headSha: gitState.headSha,
    upstream: gitState.upstream,
    dirty: gitState.dirty,
    gitStatusPorcelain: gitState.gitStatusPorcelain,
    gitStatusHash: gitState.gitStatusHash,
    lastCommit: gitState.lastCommit,
    tests,
    resume: {
      ttlMinutes,
      expiresAt: expiresAt.toISOString(),
      staleIf: ['head_sha_changed', 'branch_changed', 'git_status_hash_changed', 'ttl_expired'],
      onStale: 'rederive_state_from_repo_then_refresh_artifact_before_continuing'
    },
    currentState,
    nextTask,
    blockers,
    filesInFlight,
    openQuestions,
    notes
  };

  if (!validateHandoff(artifact)) {
    console.error('Invalid handoff artifact:', validateHandoff.errors);
    return null;
  }

  // Generate markdown
  const markdown = generateHandoffMarkdown(artifact);

  // Write artifacts
  const timestamp = getTimestamp();

  if (type === 'handoff') {
    // Write to root
    fs.writeFileSync(path.join(REPO_ROOT, 'HANDOFF.json'), JSON.stringify(artifact, null, 2));
    fs.writeFileSync(path.join(REPO_ROOT, 'HANDOFF.md'), markdown);
    emitTelemetry('handoff_written', 'full', true, { reason });
  } else {
    // Write timestamped checkpoint
    const checkpointDir = path.join(ARTIFACTS_DIR, 'checkpoints');
    fs.mkdirSync(checkpointDir, { recursive: true });
    const baseName = `${timestamp}--${reason}`;
    fs.writeFileSync(path.join(checkpointDir, `${baseName}.json`), JSON.stringify(artifact, null, 2));
    fs.writeFileSync(path.join(checkpointDir, `${baseName}.md`), markdown);
    emitTelemetry('checkpoint_written', 'full', true, { reason, path: baseName });
  }

  return artifact;
}

/**
 * Generate markdown from handoff artifact
 */
function generateHandoffMarkdown(artifact) {
  const verificationStatus = artifact.tests.status === 'pass' ? 'PASS' :
                             artifact.tests.status === 'fail' ? 'FAIL' : 'NOT RUN';

  return `# ${artifact.type === 'handoff' ? 'Handoff' : 'Checkpoint'}: ${artifact.reason}

Generated: ${artifact.generatedAt}
Branch: ${artifact.branch}
Commit: ${artifact.lastCommit.sha.slice(0, 8)} - ${artifact.lastCommit.subject}
Dirty: ${artifact.dirty ? 'Yes' : 'No'}

## Current State
${artifact.currentState || '_Not specified_'}

## Last Commit
\`${artifact.lastCommit.sha}\` - ${artifact.lastCommit.subject}

## Verification Status
${verificationStatus}${artifact.tests.summary ? ` - ${artifact.tests.summary}` : ''}

## Next Task
${artifact.nextTask || '_Not specified_'}

## Open Blockers
${artifact.blockers.length ? artifact.blockers.map(b => `- ${b}`).join('\n') : '_None_'}

## Files In Flight
${artifact.filesInFlight.length ? artifact.filesInFlight.map(f => `- ${f}`).join('\n') : '_None_'}

## Resume Notes
- TTL: ${artifact.resume.ttlMinutes} minutes
- Expires: ${artifact.resume.expiresAt}
- Stale conditions: ${artifact.resume.staleIf.join(', ')}

${artifact.notes.length ? `## Additional Notes\n${artifact.notes.map(n => `- ${n}`).join('\n')}` : ''}
`;
}

/**
 * Check if a handoff artifact is stale
 */
export function checkStaleness(artifactPath) {
  if (!fs.existsSync(artifactPath)) {
    return { stale: true, reasons: ['artifact_not_found'] };
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const gitState = getGitState();
  const now = new Date();
  const reasons = [];

  if (new Date(artifact.resume.expiresAt) < now) {
    reasons.push('ttl_expired');
  }

  if (artifact.headSha !== gitState.headSha) {
    reasons.push('head_sha_changed');
  }

  if (artifact.branch !== gitState.branch) {
    reasons.push('branch_changed');
  }

  if (artifact.gitStatusHash !== gitState.gitStatusHash) {
    reasons.push('git_status_hash_changed');
  }

  if (reasons.length > 0) {
    emitTelemetry('staleness_detected', 'full', true, { reasons, artifactPath });
  }

  return { stale: reasons.length > 0, reasons };
}

/**
 * Create frame brief artifact
 */
export function createFrameBrief(options = {}) {
  const {
    objective = '',
    audience = '',
    scope = '',
    assumptions = [],
    riskiestAssumption = '',
    cheapestVerification = '',
    verificationResult = null
  } = options;

  const gitState = getGitState();
  const timestamp = getTimestamp();

  const brief = {
    timestamp: new Date().toISOString(),
    branch: gitState.branch,
    headSha: gitState.headSha,
    objective,
    audience,
    scope,
    assumptions,
    riskiestAssumption,
    cheapestVerification,
    verificationResult
  };

  const markdown = `# Frame Brief

Generated: ${brief.timestamp}
Branch: ${brief.branch}

## Objective
${objective || '_Not specified_'}

## Audience / Scope
${audience || scope || '_Not specified_'}

## Top Assumptions
${assumptions.length ? assumptions.map((a, i) => `${i + 1}. ${a}`).join('\n') : '_None listed_'}

## Riskiest Assumption
${riskiestAssumption || '_Not identified_'}

## Cheapest Verification
${cheapestVerification || '_Not specified_'}

${verificationResult ? `## Verification Result\n${verificationResult}` : ''}
`;

  const briefDir = path.join(ARTIFACTS_DIR, 'frame-briefs');
  fs.mkdirSync(briefDir, { recursive: true });
  fs.writeFileSync(path.join(briefDir, `${timestamp}.md`), markdown);

  emitTelemetry('frame_brief_created', 'full', true, { objective: objective.slice(0, 100) });

  return brief;
}

/**
 * Create reconcile artifact after parallel work
 */
export function createReconcileArtifact(options = {}) {
  const {
    filesChanged = [],
    verifierOutput = '',
    inconsistencies = [],
    partialCleanups = [],
    styleIssues = [],
    passed = true
  } = options;

  const gitState = getGitState();
  const timestamp = getTimestamp();

  const markdown = `# Reconcile Report

Generated: ${new Date().toISOString()}
Branch: ${gitState.branch}
Files Changed: ${filesChanged.length}
Status: ${passed ? 'PASS' : 'ISSUES FOUND'}

## Files Changed
${filesChanged.map(f => `- ${f}`).join('\n') || '_None_'}

## Verifier Output
${verifierOutput || '_No output_'}

## Cross-File Inconsistencies
${inconsistencies.length ? inconsistencies.map(i => `- ${i}`).join('\n') : '_None detected_'}

## Partial Cleanups Detected
${partialCleanups.length ? partialCleanups.map(p => `- ${p}`).join('\n') : '_None detected_'}

## Style Issues
${styleIssues.length ? styleIssues.map(s => `- ${s}`).join('\n') : '_None detected_'}
`;

  const reconcileDir = path.join(ARTIFACTS_DIR, 'reconcile');
  fs.mkdirSync(reconcileDir, { recursive: true });
  fs.writeFileSync(path.join(reconcileDir, `${timestamp}.md`), markdown);

  emitTelemetry('parallel_reconciler_completed', 'full', passed, {
    filesChanged: filesChanged.length,
    issues: inconsistencies.length + partialCleanups.length + styleIssues.length
  });

  return { timestamp, passed };
}

/**
 * Acquire a worktree-aware lock
 */
export function acquireLock(taskName, timeoutMs = 30000) {
  const gitState = getGitState();
  const worktreeHash = createHash('sha256')
    .update(gitState.worktreePath || gitState.repoRoot)
    .digest('hex')
    .slice(0, 12);

  const lockPath = path.join(LOCKS_DIR, `${worktreeHash}.${taskName}.lock`);
  fs.mkdirSync(LOCKS_DIR, { recursive: true });

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Try to create lock directory (atomic operation)
      fs.mkdirSync(lockPath);

      // Write lock info
      fs.writeFileSync(path.join(lockPath, 'info.json'), JSON.stringify({
        pid: process.pid,
        acquired: new Date().toISOString(),
        task: taskName,
        worktree: gitState.worktreePath || gitState.repoRoot
      }));

      return { acquired: true, lockPath };
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Check if lock is stale (older than 10 minutes)
        try {
          const infoPath = path.join(lockPath, 'info.json');
          if (fs.existsSync(infoPath)) {
            const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
            const age = Date.now() - new Date(info.acquired).getTime();
            if (age > 10 * 60 * 1000) {
              // Stale lock, remove it
              fs.rmSync(lockPath, { recursive: true, force: true });
              continue;
            }
          }
        } catch {
          // If we can't read lock info, wait and retry
        }

        // Wait 100ms before retry
        const waitUntil = Date.now() + 100;
        while (Date.now() < waitUntil) { /* spin */ }
      } else {
        throw err;
      }
    }
  }

  emitTelemetry('lock_contention', 'full', false, { task: taskName, timeoutMs });
  return { acquired: false, lockPath };
}

/**
 * Release a lock
 */
export function releaseLock(lockPath) {
  try {
    fs.rmSync(lockPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command with worktree lock
 */
export async function runWithLock(taskName, command) {
  const lock = acquireLock(taskName);
  if (!lock.acquired) {
    return { success: false, error: 'Could not acquire lock', skipped: true };
  }

  try {
    const output = execSync(command, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output };
  } catch (err) {
    return { success: false, error: err.message, output: err.stdout || '' };
  } finally {
    releaseLock(lock.lockPath);
  }
}

// Export for CLI usage
export default {
  getGitState,
  emitTelemetry,
  createHandoff,
  createFrameBrief,
  createReconcileArtifact,
  checkStaleness,
  acquireLock,
  releaseLock,
  runWithLock
};
