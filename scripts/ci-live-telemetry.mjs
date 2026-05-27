#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_LIMIT = 50;
const MS_PER_MINUTE = 60_000;
const ORPHAN_STALE_DAYS = 90;

function parseArgs(argv) {
  const options = {
    limit: DEFAULT_LIMIT,
    jsonPath: null,
    markdownPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--limit') {
      options.limit = Number.parseInt(argv[index + 1] ?? '', 10);
      index += 1;
    } else if (arg === '--json') {
      options.jsonPath = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--markdown') {
      options.markdownPath = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error('--limit must be a positive integer');
  }

  return options;
}

function printUsage() {
  console.log(`Usage: npm run ci:telemetry -- [options]

Options:
  --limit <n>       Maximum workflow runs to inspect per workflow. Default: ${DEFAULT_LIMIT}
  --json <path>     Write JSON report to path.
  --markdown <path> Write Markdown report to path.
`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function tryRun(command, args, options = {}) {
  try {
    return run(command, args, options);
  } catch {
    return null;
  }
}

function ghJson(args, fallback) {
  const output = tryRun('gh', args);
  if (!output) return fallback;
  return JSON.parse(output);
}

function gitPathExistsAtHead(filePath) {
  if (!isRepositoryWorkflowPath(filePath)) {
    return false;
  }

  return tryRun('git', ['cat-file', '-e', `HEAD:${filePath}`]) !== null;
}

function isRepositoryWorkflowPath(filePath) {
  return Boolean(filePath && filePath.startsWith('.github/workflows/'));
}

function requiredChecks() {
  const response = tryRun('gh', [
    'api',
    'repos/:owner/:repo/branches/main/protection/required_status_checks',
  ]);

  if (!response) {
    return {
      enabled: false,
      contexts: [],
      checks: [],
    };
  }

  const parsed = JSON.parse(response);
  const contexts = Array.isArray(parsed.contexts) ? parsed.contexts : [];
  const checks = Array.isArray(parsed.checks) ? parsed.checks : [];

  return {
    enabled: true,
    contexts,
    checks,
  };
}

function requiredStatusForWorkflow(workflow, required) {
  if (!required.enabled) return 'not-enabled';

  const checkNames = new Set([
    ...required.contexts,
    ...required.checks.map((check) => check.context).filter(Boolean),
  ]);

  return checkNames.has(workflow.name) ? 'required' : 'not-visible';
}

function parseDurationMs(runRecord) {
  const start = Date.parse(runRecord.startedAt || runRecord.createdAt || '');
  const end = Date.parse(runRecord.updatedAt || '');

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return end - start;
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return null;
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

function billedMinutesForRun(runId) {
  if (!runId) return null;

  const timing = ghJson(['api', `repos/:owner/:repo/actions/runs/${runId}/timing`], null);
  if (!timing) return null;

  if (typeof timing.run_duration_ms === 'number') {
    return roundMinutes(timing.run_duration_ms / MS_PER_MINUTE);
  }

  if (!timing.billable || typeof timing.billable !== 'object') {
    return null;
  }

  const totalMs = Object.values(timing.billable).reduce((sum, value) => {
    if (!value || typeof value !== 'object') return sum;
    return sum + (typeof value.total_ms === 'number' ? value.total_ms : 0);
  }, 0);

  return totalMs > 0 ? roundMinutes(totalMs / MS_PER_MINUTE) : null;
}

function roundMinutes(value) {
  return Math.round(value * 100) / 100;
}

function workflowTriggerKind(workflowPath, pathExistsAtHead) {
  if (!pathExistsAtHead) return 'absent';

  const content = readFileSync(workflowPath, 'utf8');
  const hasSchedule = /^\s*schedule\s*:/m.test(content);
  const hasDispatch = /^\s*workflow_dispatch\s*:/m.test(content);
  const hasPullRequest = /^\s*pull_request(?:_target)?\s*:/m.test(content);
  const hasPush = /^\s*push\s*:/m.test(content);
  const hasWorkflowRun = /^\s*workflow_run\s*:/m.test(content);

  if ((hasSchedule || hasDispatch) && !hasPullRequest && !hasPush && !hasWorkflowRun) {
    return 'manual/scheduled-only';
  }

  return 'event-backed';
}

function classifyWorkflow({ workflow, pathExistsAtHead, runs }) {
  if (!isRepositoryWorkflowPath(workflow.path)) {
    return workflow.state === 'active' ? 'live' : 'yaml-backed inactive';
  }

  if (!pathExistsAtHead) return 'registry-orphan';
  if (workflow.state !== 'active') return 'yaml-backed inactive';

  const triggerKind = workflowTriggerKind(workflow.path, pathExistsAtHead);
  if (triggerKind === 'manual/scheduled-only') return 'manual/scheduled-only';

  const lastRun = runs[0];
  if (!lastRun && triggerKind === 'event-backed') return 'yaml-backed inactive';

  return 'live';
}

function daysSince(isoDate) {
  const time = Date.parse(isoDate || '');
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
}

function inspectWorkflow(workflow, limit, required) {
  const pathExistsAtHead = gitPathExistsAtHead(workflow.path);
  const runs = ghJson(
    [
      'run',
      'list',
      '--workflow',
      String(workflow.id),
      '--limit',
      String(limit),
      '--json',
      'databaseId,event,headBranch,conclusion,status,createdAt,startedAt,updatedAt',
    ],
    []
  );

  const durations = runs
    .map(parseDurationMs)
    .filter((value) => typeof value === 'number')
    .sort((a, b) => a - b);
  const lastRun = runs[0] ?? null;
  const lastRunBilledMinutes = lastRun ? billedMinutesForRun(lastRun.databaseId) : null;
  const requiredStatus = requiredStatusForWorkflow(workflow, required);
  const classification = classifyWorkflow({ workflow, pathExistsAtHead, runs });
  const staleOrphanCandidate =
    classification === 'registry-orphan' &&
    isRepositoryWorkflowPath(workflow.path) &&
    requiredStatus !== 'required' &&
    daysSince(lastRun?.createdAt) !== null &&
    daysSince(lastRun?.createdAt) > ORPHAN_STALE_DAYS;

  return {
    id: workflow.id,
    name: workflow.name,
    path: workflow.path,
    state: workflow.state,
    pathExistsAtHead,
    requiredCheckStatus: requiredStatus,
    classification,
    staleOrphanCandidate,
    lastRun: lastRun
      ? {
          id: lastRun.databaseId,
          event: lastRun.event,
          branch: lastRun.headBranch,
          status: lastRun.status,
          conclusion: lastRun.conclusion,
          createdAt: lastRun.createdAt,
          startedAt: lastRun.startedAt,
          updatedAt: lastRun.updatedAt,
          durationMinutes: roundMinutes((parseDurationMs(lastRun) ?? 0) / MS_PER_MINUTE),
          billedMinutes: lastRunBilledMinutes,
        }
      : null,
    durationMinutes: {
      p50: durations.length ? roundMinutes(percentile(durations, 50) / MS_PER_MINUTE) : null,
      p95: durations.length ? roundMinutes(percentile(durations, 95) / MS_PER_MINUTE) : null,
      sampleSize: durations.length,
    },
  };
}

function markdownReport(report) {
  const rows = report.workflows.map((workflow) => {
    const last = workflow.lastRun;
    return [
      workflow.id,
      workflow.name,
      workflow.path,
      workflow.state,
      workflow.pathExistsAtHead ? 'yes' : 'no',
      workflow.classification,
      workflow.requiredCheckStatus,
      last ? `${last.event} / ${last.branch ?? ''} / ${last.conclusion ?? last.status ?? ''}` : 'none',
      formatNullable(workflow.durationMinutes.p50),
      formatNullable(workflow.durationMinutes.p95),
      formatNullable(last?.billedMinutes),
    ];
  });

  const lines = [
    '# CI Live Telemetry',
    '',
    `Generated: ${report.generatedAt}`,
    `Run sample limit per workflow: ${report.limit}`,
    `Required status checks: ${report.requiredChecks.enabled ? 'enabled' : 'not enabled'}`,
    '',
    '| ID | Name | Path | State | Path at HEAD | Classification | Required | Last run | p50 min | p95 min | Billed min |',
    '| ---: | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |',
  ];

  for (const row of rows) {
    lines.push(`| ${row.map(escapeMarkdownCell).join(' | ')} |`);
  }

  lines.push(
    '',
    '## Registry Cleanup Candidates',
    '',
    'Only disable registry-orphan workflows after confirming the YAML path is absent at HEAD, the last run is older than 90 days, and required checks do not reference the workflow.',
    ''
  );

  const cleanupCandidates = report.workflows.filter((workflow) => workflow.staleOrphanCandidate);
  if (cleanupCandidates.length === 0) {
    lines.push('None.');
  } else {
    for (const workflow of cleanupCandidates) {
      lines.push(`- ${workflow.id} ${workflow.name} (${workflow.path})`);
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function formatNullable(value) {
  return value === null || value === undefined ? '' : String(value);
}

function escapeMarkdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function writeOutput(filePath, content) {
  if (!filePath) return;
  const absolute = path.resolve(filePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const workflows = ghJson(['workflow', 'list', '--all', '--json', 'id,name,state,path'], []);
  const required = requiredChecks();
  const report = {
    generatedAt: new Date().toISOString(),
    limit: options.limit,
    requiredChecks: required,
    workflows: workflows.map((workflow) => inspectWorkflow(workflow, options.limit, required)),
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = markdownReport(report);

  writeOutput(options.jsonPath, json);
  writeOutput(options.markdownPath, markdown);

  if (!options.jsonPath && !options.markdownPath) {
    process.stdout.write(markdown);
  } else {
    if (options.jsonPath) console.log(`Wrote ${options.jsonPath}`);
    if (options.markdownPath) console.log(`Wrote ${options.markdownPath}`);
  }

  if (!existsSync('.context')) {
    console.warn('Note: .context/ does not exist yet; create it for local telemetry reports.');
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
