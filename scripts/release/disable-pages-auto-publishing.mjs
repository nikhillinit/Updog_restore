#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const ACTION_ID = 'github-pages-publishing-containment-2026-10-27';
const REPOSITORY = 'nikhillinit/Updog_restore';
const REPOSITORY_ID = 1023548405;
const API_REPOSITORY = `https://api.github.com/repos/${REPOSITORY}`;
const SITE_URL = 'https://nikhillinit.github.io/Updog_restore/';
const SCRIPT_PATH = 'scripts/release/disable-pages-auto-publishing.mjs';
const OWN_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(OWN_FILE), '../..');
const ACTION_TIMEOUT_MS = 300_000;
const REQUEST_TIMEOUT_MS = 30_000;
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const execFileAsync = promisify(execFile);

class ContainmentError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ContainmentError';
    this.code = code;
  }
}

function refuse(code) {
  throw new ContainmentError(code);
}

function remaining(deadlineAt, now) {
  const current = now();
  if (!Number.isFinite(current) || !Number.isFinite(deadlineAt) || current >= deadlineAt) {
    refuse('ACTION_DEADLINE_EXHAUSTED');
  }
  return Math.min(REQUEST_TIMEOUT_MS, Math.ceil(deadlineAt - current));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function snapshotState({ repository, pages }, source) {
  if (
    repository?.id !== REPOSITORY_ID ||
    repository.full_name !== REPOSITORY ||
    repository.name !== 'Updog_restore' ||
    repository.owner?.login !== 'nikhillinit' ||
    repository.url !== API_REPOSITORY ||
    !Number.isSafeInteger(repository.owner.id)
  )
    refuse('REPOSITORY_IDENTITY_MISMATCH');
  if (
    !pages ||
    typeof pages !== 'object' ||
    Array.isArray(pages) ||
    pages.url !== `${API_REPOSITORY}/pages` ||
    pages.html_url !== SITE_URL ||
    pages.public !== true ||
    pages.source?.branch !== 'main' ||
    pages.source?.path !== '/' ||
    !['legacy', 'workflow'].includes(pages.build_type)
  )
    refuse('PAGES_CONFIGURATION_MISMATCH');
  const identity = {
    id: repository.id,
    nodeId: repository.node_id ?? null,
    fullName: repository.full_name,
    ownerId: repository.owner.id,
    owner: repository.owner.login,
  };
  const preserved = Object.fromEntries(
    Object.entries(pages).filter(([key]) => key !== 'build_type' && key !== 'status')
  );
  return {
    repository: REPOSITORY,
    repositoryId: REPOSITORY_ID,
    buildType: pages.build_type,
    settings: {
      siteUrl: SITE_URL,
      sourceBranch: 'main',
      sourcePath: '/',
      public: true,
      httpsEnforced: pages.https_enforced === true,
      customDomainConfigured: pages.cname != null,
    },
    repositoryIdentitySha256: digest(identity),
    pagesSha256: digest(pages),
    preservedPagesSha256: digest(preserved),
    planSha256: digest({
      actionId: ACTION_ID,
      reviewedSha: source.headSha,
      mainSha: source.liveMainSha,
      helperSha256: source.helperSha256,
      repository: identity,
      pages,
    }),
  };
}

function sourceReasons(source, reviewedSha, mainSha) {
  const reasons = [];
  if (!SHA.test(reviewedSha ?? '') || source.headSha !== reviewedSha)
    reasons.push('REVIEWED_SOURCE_MISMATCH');
  if (!SHA.test(mainSha ?? '') || source.liveMainSha !== mainSha)
    reasons.push('MAIN_SOURCE_MISMATCH');
  if (source.trackedDirty !== false) reasons.push('TRACKED_CHANGES_PRESENT');
  if (source.trustedOrigin !== true) reasons.push('ORIGIN_IDENTITY_MISMATCH');
  if (source.mainIsAncestor !== true) reasons.push('MAIN_NOT_REVIEWED_ANCESTOR');
  if (source.helperCommitted !== true || !SHA256.test(source.helperSha256 ?? ''))
    reasons.push('HELPER_NOT_COMMITTED_EXACTLY');
  if (source.prMatches !== true) reasons.push('PR1665_IDENTITY_NOT_VERIFIED');
  if (source.ciGatePassed !== true) reasons.push('CURRENT_HEAD_CI_GATE_NOT_SUCCESSFUL');
  return reasons;
}

function validateExecutionOptions(options) {
  if (!options.execute) return;
  if (options.bootstrapOwnerException !== true)
    refuse('BOOTSTRAP_OWNER_EXCEPTION_NOT_ACKNOWLEDGED');
  if (options.acceptConcurrentPagesChangeRisk !== true)
    refuse('CONCURRENT_PAGES_CHANGE_RISK_NOT_ACKNOWLEDGED');
  if (!SHA.test(options.expectedReviewedSha ?? '')) refuse('EXPECTED_REVIEWED_SHA_INVALID');
  if (!SHA.test(options.expectedMainSha ?? '')) refuse('EXPECTED_MAIN_SHA_INVALID');
}

async function safeCall(fn, argument, code) {
  try {
    return await fn(argument);
  } catch (error) {
    if (error instanceof ContainmentError) throw error;
    refuse(code);
  }
}

/** IO injection is test-only; the CLI has no target, request, or ledger overrides. */
export async function executeContainment(options, io) {
  validateExecutionOptions(options);
  const { now = Date.now, readSource, readState, setWorkflow, ledger } = io;
  const deadlineAt = io.deadlineAt ?? now() + ACTION_TIMEOUT_MS;
  remaining(deadlineAt, now);
  const sourceArguments = {
    deadlineAt,
    requireAdmission: options.execute === true,
    expectedReviewedSha: options.expectedReviewedSha,
    expectedMainSha: options.expectedMainSha,
  };
  const source = await safeCall(readSource, sourceArguments, 'SOURCE_READ_FAILED');
  const reviewedSha = options.expectedReviewedSha ?? source.headSha;
  const mainSha = options.expectedMainSha ?? source.liveMainSha;
  const reasons = sourceReasons(source, reviewedSha, mainSha);
  if (options.execute && reasons.length) refuse(reasons[0]);
  remaining(deadlineAt, now);
  const before = snapshotState(
    await safeCall(readState, { deadlineAt }, 'GITHUB_STATE_READ_FAILED'),
    source
  );
  const common = {
    actionId: ACTION_ID,
    reviewedSha,
    mainSha,
    acknowledged: false,
    observedWorkflow: before.buildType === 'workflow',
  };
  if (!options.execute) {
    return {
      ...common,
      outcome: 'DRY_RUN',
      executionEligible: false,
      ownerExceptionRequired: true,
      policyAdmissionProven: false,
      sourceReasons: reasons,
      plan: before,
    };
  }
  if (before.buildType === 'workflow')
    return { ...common, outcome: 'ALREADY_WORKFLOW', observationOnly: true };
  if (
    !SHA256.test(options.expectedPlanSha256 ?? '') ||
    options.expectedPlanSha256 !== before.planSha256
  ) {
    refuse('REVIEWED_PLAN_MISMATCH');
  }
  const session = await safeCall(
    (binding) => ledger.acquire(binding),
    {
      actionId: ACTION_ID,
      reviewedSha,
      mainSha,
      helperSha256: source.helperSha256,
      plan: before,
      bootstrapOwnerExceptionAcknowledged: true,
      concurrentPagesChangeRiskAcknowledged: true,
      policyAdmissionProven: false,
      startedAt: new Date(now()).toISOString(),
      deadlineAt: new Date(deadlineAt).toISOString(),
    },
    'LEDGER_RESERVATION_FAILED'
  );
  let result;
  try {
    remaining(deadlineAt, now);
    const currentSource = await safeCall(readSource, sourceArguments, 'SOURCE_READ_FAILED');
    const currentReasons = sourceReasons(currentSource, reviewedSha, mainSha);
    if (currentReasons.length) refuse(currentReasons[0]);
    remaining(deadlineAt, now);
    const current = snapshotState(
      await safeCall(readState, { deadlineAt }, 'GITHUB_STATE_READ_FAILED'),
      currentSource
    );
    if (current.planSha256 !== before.planSha256) refuse('PLAN_CHANGED_BEFORE_WRITE');
    remaining(deadlineAt, now);
    await safeCall(
      (record) => session.attempted(record),
      {
        actionId: ACTION_ID,
        phase: 'PUT_ATTEMPTED',
        planSha256: before.planSha256,
        attemptedAt: new Date(now()).toISOString(),
      },
      'ATTEMPT_RECORD_FAILED'
    );
    remaining(deadlineAt, now);
    let acknowledged = false;
    try {
      await setWorkflow({ deadlineAt });
      acknowledged = true;
    } catch {
      // Persisted attempt is consumed even when the acknowledgement is lost.
    }
    result = {
      ...common,
      outcome: 'UNRESOLVED',
      acknowledged,
      observedWorkflow: false,
      unrelatedUnchanged: null,
    };
    try {
      remaining(deadlineAt, now);
      const after = snapshotState(
        await safeCall(readState, { deadlineAt }, 'GITHUB_STATE_READ_FAILED'),
        currentSource
      );
      result.observedWorkflow = after.buildType === 'workflow';
      result.unrelatedUnchanged =
        after.repositoryIdentitySha256 === before.repositoryIdentitySha256 &&
        after.preservedPagesSha256 === before.preservedPagesSha256;
      result.postRead = after;
      if (result.observedWorkflow && result.unrelatedUnchanged) {
        result.outcome = acknowledged ? 'WORKFLOW_MODE_VERIFIED' : 'WORKFLOW_MODE_OBSERVED';
      }
    } catch {
      // At most one readback phase within the original deadline; never retry PUT.
    }
  } catch (error) {
    const code = error instanceof ContainmentError ? error.code : 'ACTION_FAILED';
    await safeCall(
      (record) => session.finish(record),
      { ...common, outcome: 'BLOCKED', code },
      'RESULT_RECORD_FAILED'
    );
    refuse(code);
  }
  await safeCall((record) => session.finish(record), result, 'RESULT_RECORD_FAILED');
  return result;
}

async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function createFileLedger(directory) {
  async function writePhase(filename, record) {
    let handle;
    try {
      handle = await open(path.join(directory, filename), 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await syncDirectory(directory);
    } catch {
      refuse('LEDGER_PHASE_WRITE_FAILED');
    } finally {
      await handle?.close();
    }
  }
  return {
    async acquire(binding) {
      try {
        await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
        await mkdir(directory, { mode: 0o700 });
      } catch (error) {
        refuse(error?.code === 'EEXIST' ? 'ACTION_ALREADY_RESERVED' : 'LEDGER_RESERVATION_FAILED');
      }
      try {
        await syncDirectory(path.dirname(directory));
      } catch {
        refuse('LEDGER_SYNC_FAILED');
      }
      await writePhase('000-intent.json', binding);
      return {
        attempted: (record) => writePhase('001-put-attempted.json', record),
        finish: (record) => writePhase('002-result.json', record),
      };
    },
  };
}

function validateToken(token) {
  if (
    typeof token !== 'string' ||
    !token.trim() ||
    token !== token.trim() ||
    /[\r\n]/.test(token)
  ) {
    refuse('GITHUB_AUTH_UNAVAILABLE');
  }
  return token;
}

export async function readExistingToken({
  environment = process.env,
  execFileImpl = execFileAsync,
  deadlineAt,
  now = Date.now,
} = {}) {
  if (environment.GH_TOKEN !== undefined) return validateToken(environment.GH_TOKEN);
  if (environment.GITHUB_TOKEN !== undefined) return validateToken(environment.GITHUB_TOKEN);
  try {
    const { stdout } = await execFileImpl('gh', ['auth', 'token', '--hostname', 'github.com'], {
      encoding: 'utf8',
      timeout: remaining(deadlineAt, now),
      maxBuffer: 64 * 1024,
    });
    return validateToken(stdout.trim());
  } catch {
    refuse('GITHUB_AUTH_UNAVAILABLE');
  }
}

export function createGitHubTransport({ token, fetchImpl = globalThis.fetch, now = Date.now }) {
  validateToken(token);
  async function request(method, suffix, deadlineAt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining(deadlineAt, now));
    try {
      const response = await fetchImpl(`${API_REPOSITORY}${suffix}`, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Updog-Pages-Containment',
          ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(method === 'PUT' ? { body: JSON.stringify({ build_type: 'workflow' }) } : {}),
        signal: controller.signal,
      });
      if (!response?.ok) refuse('GITHUB_REQUEST_FAILED');
      const body = method === 'GET' ? await response.json() : undefined;
      if (controller.signal.aborted) refuse('GITHUB_REQUEST_FAILED');
      remaining(deadlineAt, now);
      return body;
    } catch {
      refuse('GITHUB_REQUEST_FAILED');
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return {
    async readState({ deadlineAt }) {
      const repository = await request('GET', '', deadlineAt);
      const pages = await request('GET', '/pages', deadlineAt);
      return { repository, pages };
    },
    setWorkflow: ({ deadlineAt }) => request('PUT', '/pages', deadlineAt),
  };
}

export function validateGitHubAdmission(pull, checks, reviewedSha, mainSha) {
  const sameRepository = (value) => value?.id === REPOSITORY_ID && value.full_name === REPOSITORY;
  const prMatches =
    pull?.number === 1665 &&
    pull.state === 'open' &&
    pull.draft === false &&
    pull.head?.sha === reviewedSha &&
    pull.base?.sha === mainSha &&
    pull.base?.ref === 'main' &&
    sameRepository(pull.head?.repo) &&
    sameRepository(pull.base?.repo);
  const complete =
    Number.isSafeInteger(checks?.total_count) &&
    checks.total_count >= 0 &&
    checks.total_count <= 100 &&
    Array.isArray(checks.check_runs) &&
    checks.check_runs.length === checks.total_count;
  const gates = complete
    ? checks.check_runs.filter((check) => check?.name === 'CI Gate Status')
    : [];
  const ciGatePassed =
    gates.length === 1 &&
    gates[0].app?.id === 15368 &&
    gates[0].head_sha === reviewedSha &&
    gates[0].status === 'completed' &&
    gates[0].conclusion === 'success';
  return { prMatches, ciGatePassed };
}

export function createSourceReader({
  execFileImpl = execFileAsync,
  readFileImpl = readFile,
  now = Date.now,
} = {}) {
  return async ({ deadlineAt, requireAdmission, expectedReviewedSha, expectedMainSha }) => {
    const command = async (executable, args) => {
      try {
        const { stdout } = await execFileImpl(executable, args, {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: remaining(deadlineAt, now),
          maxBuffer: 4 * 1024 * 1024,
        });
        remaining(deadlineAt, now);
        return stdout;
      } catch {
        refuse('SOURCE_READ_FAILED');
      }
    };
    const git = (...args) => command('git', args);
    const origin = (await git('remote', 'get-url', 'origin')).trim();
    const trustedOrigin =
      /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)nikhillinit\/Updog_restore(?:\.git)?$/.test(
        origin
      );
    if (!trustedOrigin) refuse('ORIGIN_IDENTITY_MISMATCH');
    await git('fetch', '--no-tags', 'origin', 'main');
    const live = (await git('ls-remote', 'origin', 'refs/heads/main')).trim();
    const match = /^([a-f0-9]{40})\s+refs\/heads\/main$/.exec(live);
    if (!match) refuse('LIVE_MAIN_INVALID');
    const liveMainSha = match[1];
    if ((await git('rev-parse', 'refs/remotes/origin/main')).trim() !== liveMainSha)
      refuse('MAIN_CHANGED_DURING_FETCH');
    const headSha = (await git('rev-parse', 'HEAD')).trim();
    if (!SHA.test(headSha)) refuse('REVIEWED_SOURCE_MISMATCH');
    const trackedDirty = (await git('status', '--porcelain', '--untracked-files=no')).trim() !== '';
    let mainIsAncestor = false;
    try {
      await git('merge-base', '--is-ancestor', liveMainSha, headSha);
      mainIsAncestor = true;
    } catch {
      /* fail closed */
    }
    const helper = await safeCall(
      () => readFileImpl(OWN_FILE, 'utf8'),
      undefined,
      'HELPER_READ_FAILED'
    );
    let helperCommitted = false;
    try {
      helperCommitted = (await git('show', `${headSha}:${SCRIPT_PATH}`)) === helper;
    } catch {
      /* dry-run may precede commit */
    }
    let admission = { prMatches: false, ciGatePassed: false };
    if (requireAdmission) {
      if (headSha !== expectedReviewedSha || liveMainSha !== expectedMainSha)
        refuse('SOURCE_SHA_MISMATCH');
      const githubJson = async (resource) => {
        const text = await command('gh', [
          'api',
          '--method',
          'GET',
          '--hostname',
          'github.com',
          resource,
        ]);
        try {
          return JSON.parse(text);
        } catch {
          refuse('GITHUB_ADMISSION_RESPONSE_INVALID');
        }
      };
      const pull = await githubJson(`repos/${REPOSITORY}/pulls/1665`);
      const checks = await githubJson(
        `repos/${REPOSITORY}/commits/${headSha}/check-runs?filter=latest&per_page=100`
      );
      admission = validateGitHubAdmission(pull, checks, expectedReviewedSha, expectedMainSha);
    }
    return {
      headSha,
      liveMainSha,
      trackedDirty,
      trustedOrigin,
      mainIsAncestor,
      helperCommitted,
      helperSha256: createHash('sha256').update(helper).digest('hex'),
      ...admission,
    };
  };
}

export function parseArguments(args) {
  const options = { execute: false };
  const seen = new Set();
  const booleanFlags = new Map([
    ['--bootstrap-owner-exception', 'bootstrapOwnerException'],
    ['--accept-concurrent-pages-change-risk', 'acceptConcurrentPagesChangeRisk'],
  ]);
  const valueFlags = new Map([
    ['--expected-reviewed-sha', 'expectedReviewedSha'],
    ['--expected-main-sha', 'expectedMainSha'],
    ['--expected-plan-sha256', 'expectedPlanSha256'],
  ]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) refuse('DUPLICATE_ARGUMENT');
    seen.add(flag);
    if (flag === '--execute' || flag === '--dry-run') {
      if (seen.has('--execute') && seen.has('--dry-run')) refuse('CONFLICTING_MODE');
      options.execute = flag === '--execute';
    } else if (booleanFlags.has(flag)) options[booleanFlags.get(flag)] = true;
    else if (valueFlags.has(flag)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) refuse('ARGUMENT_VALUE_REQUIRED');
      options[valueFlags.get(flag)] = value;
    } else refuse('UNKNOWN_ARGUMENT');
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  validateExecutionOptions(options);
  const deadlineAt = Date.now() + ACTION_TIMEOUT_MS;
  const token = await readExistingToken({ deadlineAt });
  const result = await executeContainment(options, {
    deadlineAt,
    readSource: createSourceReader(),
    ...createGitHubTransport({ token }),
    ledger: createFileLedger(path.join(os.userInfo().homedir, '.codex/task-artifacts', ACTION_ID)),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.outcome === 'UNRESOLVED') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(
      `Pages containment refused: ${error instanceof ContainmentError ? error.code : 'ACTION_FAILED'}\n`
    );
    process.exitCode = 1;
  });
}
