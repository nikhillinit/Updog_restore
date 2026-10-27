#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const ACTION_ID = 'vercel-git-disconnect-2026-10-27';
export const PROJECT_ID = 'prj_z0tJGUCgjnmMOv5KG9cEP3ucJ7Xp';
export const TEAM_ID = 'team_BzOixmLqQ9VA2mTvFvzBLRWw';
const SCRIPT_PATH = 'scripts/release/disconnect-vercel-git.mjs';
const POLICY_PATH = 'docs/governance/solo-internal-change-and-production-policy.md';
const POLICY_HEADING = '## One-time Vercel Git-repository disconnect (ADR-112)';
const ACTION_TIMEOUT_MS = 300_000;
const REQUEST_TIMEOUT_MS = 30_000;
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const execFileAsync = promisify(execFile);

class DisconnectError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DisconnectError';
    this.code = code;
  }
}

function refuse(code) {
  throw new DisconnectError(code);
}

function remaining(deadlineAt, now) {
  const time = now();
  if (!Number.isFinite(time) || !Number.isFinite(deadlineAt) || time >= deadlineAt) {
    refuse('ACTION_DEADLINE_EXHAUSTED');
  }
  return Math.min(REQUEST_TIMEOUT_MS, Math.ceil(deadlineAt - time));
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

const ENVIRONMENT_METADATA = new Set([
  'id',
  'key',
  'type',
  'target',
  'configurationId',
  'gitBranch',
  'createdAt',
  'updatedAt',
  'customEnvironmentIds',
  'system',
  'contentHint',
  'decrypted',
]);
const SECRET_FIELD =
  /^(?:value|token|accessToken|refreshToken|secret|password|authorization|apiKey|privateKey|clientSecret|credentials)$/i;

function environmentMetadata(value) {
  if (!Array.isArray(value)) refuse('PROJECT_ENVIRONMENT_METADATA_MISSING');
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        refuse('PROJECT_ENVIRONMENT_METADATA_INVALID');
      }
      return Object.fromEntries(
        Object.entries(entry)
          .filter(([key]) => ENVIRONMENT_METADATA.has(key))
          .map(([key, child]) => [key, sanitized(child)])
      );
    })
    .sort((a, b) => JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))));
}

// Never hash environment values. Only hashes of this reduced project view leave memory.
function sanitized(value) {
  if (Array.isArray(value)) return value.map(sanitized);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      if (SECRET_FIELD.test(key)) return [];
      if (/^(?:env|buildEnv|environmentVariables)$/i.test(key)) {
        return [
          [
            key,
            Array.isArray(child) ? environmentMetadata(child) : Object.keys(child ?? {}).sort(),
          ],
        ];
      }
      return [[key, sanitized(child)]];
    })
  );
}

export function snapshotProject(project) {
  if (
    !project ||
    project.id !== PROJECT_ID ||
    project.accountId !== TEAM_ID ||
    project.name !== 'updog-restore'
  ) {
    refuse('PROJECT_IDENTITY_MISMATCH');
  }
  const production = project.targets?.production;
  if (!production || typeof production !== 'object' || typeof production.id !== 'string') {
    refuse('PRODUCTION_TARGET_MISSING');
  }
  const env = environmentMetadata(project.env);
  const link = project.link;
  if (
    link != null &&
    (typeof link !== 'object' ||
      Array.isArray(link) ||
      link.type !== 'github' ||
      link.org !== 'nikhillinit' ||
      link.repo !== 'Updog_restore' ||
      link.repoId !== 1023548405 ||
      link.productionBranch !== 'main')
  )
    refuse('REPOSITORY_LINK_MISMATCH');
  if (link != null && (!Array.isArray(link.deployHooks) || link.deployHooks.length !== 0)) {
    refuse('DEPLOY_HOOKS_NOT_CONFIRMED_EMPTY');
  }
  const { link: _link, env: _env, updatedAt: _updatedAt, targets, ...unrelated } = project;
  const { production: _production, ...otherTargets } = targets;
  return {
    projectId: PROJECT_ID,
    teamId: TEAM_ID,
    linkSha256: link == null ? null : digest(sanitized(link)),
    productionTargetSha256: digest(sanitized(production)),
    environmentMetadataSha256: digest(env),
    unrelatedSha256: digest(sanitized({ ...unrelated, targets: otherTargets })),
  };
}

function sameUnrelated(before, after) {
  return ['productionTargetSha256', 'environmentMetadataSha256', 'unrelatedSha256'].every(
    (key) => before[key] === after[key]
  );
}

function sourceEligibility(source, expectedSha) {
  const lines = typeof source.policy === 'string' ? source.policy.split(/\r?\n/) : [];
  const start = lines.indexOf(POLICY_HEADING);
  const following = start < 0 ? [] : lines.slice(start + 1);
  const end = following.findIndex((line) => line.startsWith('## '));
  const section = (end < 0 ? following : following.slice(0, end)).join('\n');
  const reasons = [];
  if (!SHA.test(expectedSha ?? '')) reasons.push('EXPECTED_SHA_INVALID');
  if (source.headSha !== expectedSha || source.liveMainSha !== expectedSha)
    reasons.push('SOURCE_SHA_MISMATCH');
  if (source.dirty) reasons.push('TRACKED_CHANGES_PRESENT');
  if (!source.trustedOrigin) reasons.push('ORIGIN_IDENTITY_MISMATCH');
  if (!source.helperMatchesProtected) reasons.push('HELPER_NOT_ADMITTED');
  if (
    !section.includes(`\`${ACTION_ID}\``) ||
    !(section.includes(`\`${SCRIPT_PATH}\``) || section.includes(`\`${SCRIPT_PATH} --execute\``))
  ) {
    reasons.push('POLICY_ROUTE_NOT_ADMITTED');
  }
  if (!SHA256.test(source.policySha256 ?? '') || !SHA256.test(source.helperSha256 ?? '')) {
    reasons.push('SOURCE_DIGEST_INVALID');
  }
  return reasons;
}

function assertEligible(source, expectedSha) {
  const reasons = sourceEligibility(source, expectedSha);
  if (reasons.length) refuse(reasons[0]);
}

async function safeCall(fn, argument, code) {
  try {
    return await fn(argument);
  } catch (error) {
    if (error instanceof DisconnectError) throw error;
    refuse(code);
  }
}

/** Injected IO is for tests; the CLI exposes no alternate target, transport, or ledger path. */
export async function executeDisconnect(options, io) {
  const { now = Date.now, readSource, readProject, deleteLink, ledger } = io;
  if (options.execute) {
    if (!options.ownerAuthorized) refuse('OWNER_AUTHORIZATION_REQUIRED');
    if (!options.acceptConcurrentLinkChangeRisk) refuse('CONCURRENT_LINK_CHANGE_RISK_NOT_ACCEPTED');
    if (!SHA.test(options.expectedSha ?? '')) refuse('EXPECTED_SHA_INVALID');
  }
  const deadlineAt = now() + ACTION_TIMEOUT_MS;
  remaining(deadlineAt, now);
  const source = await safeCall(readSource, { deadlineAt }, 'SOURCE_READ_FAILED');
  const expectedSha = options.expectedSha ?? source.liveMainSha;
  if (options.execute) assertEligible(source, expectedSha);
  remaining(deadlineAt, now);
  const before = snapshotProject(
    await safeCall(readProject, { deadlineAt }, 'PROVIDER_READ_FAILED')
  );
  const common = {
    actionId: ACTION_ID,
    expectedSha,
    acknowledged: false,
    observedUnlinked: before.linkSha256 === null,
  };
  if (!options.execute) {
    const reasons = sourceEligibility(source, expectedSha);
    return {
      ...common,
      outcome: 'DRY_RUN',
      executionEligible: reasons.length === 0,
      reasons,
      plan: before,
    };
  }
  if (before.linkSha256 === null) {
    return {
      ...common,
      outcome: 'ALREADY_UNLINKED',
      observationOnly: true,
    };
  }
  if (
    !SHA256.test(options.expectedLinkSha256 ?? '') ||
    options.expectedLinkSha256 !== before.linkSha256
  ) {
    refuse('REVIEWED_LINK_DIGEST_MISMATCH');
  }

  const binding = {
    actionId: ACTION_ID,
    expectedSha,
    helperSha256: source.helperSha256,
    policySha256: source.policySha256,
    plan: before,
    startedAt: new Date(now()).toISOString(),
    deadlineAt: new Date(deadlineAt).toISOString(),
  };
  const session = await safeCall(
    (record) => ledger.acquire(record),
    binding,
    'LEDGER_RESERVATION_FAILED'
  );
  let result;
  try {
    remaining(deadlineAt, now);
    const currentSource = await safeCall(readSource, { deadlineAt }, 'SOURCE_READ_FAILED');
    assertEligible(currentSource, expectedSha);
    if (
      currentSource.helperSha256 !== source.helperSha256 ||
      currentSource.policySha256 !== source.policySha256
    ) {
      refuse('SOURCE_DIGEST_CHANGED');
    }
    remaining(deadlineAt, now);
    const current = snapshotProject(
      await safeCall(readProject, { deadlineAt }, 'PROVIDER_READ_FAILED')
    );
    if (before.linkSha256 !== current.linkSha256 || !sameUnrelated(before, current)) {
      refuse('PROJECT_CHANGED_BEFORE_WRITE');
    }
    remaining(deadlineAt, now);
    await safeCall(
      (record) => session.attempted(record),
      {
        actionId: ACTION_ID,
        phase: 'DELETE_ATTEMPTED',
        expectedSha,
        linkSha256: before.linkSha256,
        attemptedAt: new Date(now()).toISOString(),
      },
      'ATTEMPT_RECEIPT_FAILED'
    );
    remaining(deadlineAt, now);
    let acknowledged = false;
    try {
      await deleteLink({ deadlineAt });
      acknowledged = true;
    } catch {
      // A lost response consumes the same attempt. Read once; never repeat DELETE.
    }
    result = {
      ...common,
      outcome: 'UNRESOLVED',
      acknowledged,
      observedUnlinked: false,
      unrelatedUnchanged: null,
    };
    try {
      remaining(deadlineAt, now);
      const after = snapshotProject(
        await safeCall(readProject, { deadlineAt }, 'PROVIDER_READ_FAILED')
      );
      result.observedUnlinked = after.linkSha256 === null;
      result.unrelatedUnchanged = sameUnrelated(before, after);
      result.postRead = after;
      if (result.observedUnlinked && result.unrelatedUnchanged) {
        result.outcome = acknowledged ? 'DISCONNECTED_VERIFIED' : 'DISCONNECT_OBSERVED';
      }
    } catch {
      // No second reconciliation or renewed timeout after an unavailable readback.
    }
  } catch (error) {
    const code = error instanceof DisconnectError ? error.code : 'ACTION_FAILED';
    await safeCall(
      (record) => session.finish(record),
      { ...common, outcome: 'BLOCKED', code },
      'RESULT_RECEIPT_FAILED'
    );
    refuse(code);
  }
  await safeCall((record) => session.finish(record), result, 'RESULT_RECEIPT_FAILED');
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
        if (error?.code === 'EEXIST') refuse('ACTION_ALREADY_RESERVED');
        refuse('LEDGER_RESERVATION_FAILED');
      }
      try {
        await syncDirectory(path.dirname(directory));
      } catch {
        refuse('LEDGER_SYNC_FAILED');
      }
      await writePhase('000-intent.json', binding);
      return {
        attempted: (record) => writePhase('001-delete-attempted.json', record),
        finish: (record) => writePhase('002-result.json', record),
      };
    },
  };
}

export function createVercelTransport({ token, fetchImpl = globalThis.fetch, now = Date.now }) {
  if (
    typeof token !== 'string' ||
    !token.trim() ||
    token !== token.trim() ||
    /[\r\n]/.test(token)
  ) {
    refuse('VERCEL_AUTH_UNAVAILABLE');
  }
  async function request(method, deadlineAt) {
    const timeoutMs = remaining(deadlineAt, now);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const endpoint = `/v9/projects/${PROJECT_ID}${method === 'DELETE' ? '/link' : ''}`;
    try {
      const response = await fetchImpl(`https://api.vercel.com${endpoint}?teamId=${TEAM_ID}`, {
        method,
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response?.ok) refuse('PROVIDER_REQUEST_FAILED');
      const result = method === 'GET' ? await response.json() : undefined;
      if (controller.signal.aborted) refuse('PROVIDER_REQUEST_TIMED_OUT');
      remaining(deadlineAt, now);
      return result;
    } catch {
      refuse('PROVIDER_REQUEST_FAILED');
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return {
    readProject: ({ deadlineAt }) => request('GET', deadlineAt),
    deleteLink: ({ deadlineAt }) => request('DELETE', deadlineAt),
  };
}

export function parseArguments(args) {
  const options = { execute: false };
  const seen = new Set();
  const booleanFlags = new Map([
    ['--owner-authorized', 'ownerAuthorized'],
    ['--accept-concurrent-link-change-risk', 'acceptConcurrentLinkChangeRisk'],
  ]);
  const valueFlags = new Map([
    ['--expected-sha', 'expectedSha'],
    ['--expected-link-sha256', 'expectedLinkSha256'],
  ]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) refuse('DUPLICATE_ARGUMENT');
    seen.add(flag);
    if (flag === '--execute' || flag === '--dry-run') {
      if (seen.has('--execute') && seen.has('--dry-run')) refuse('CONFLICTING_MODE');
      options.execute = flag === '--execute';
    } else if (booleanFlags.has(flag)) {
      options[booleanFlags.get(flag)] = true;
    } else if (valueFlags.has(flag)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) refuse('ARGUMENT_VALUE_REQUIRED');
      options[valueFlags.get(flag)] = value;
    } else refuse('UNKNOWN_ARGUMENT');
  }
  return options;
}

export async function readExistingToken({
  environment = process.env,
  platform = process.platform,
  home = os.homedir(),
  now = Date.now,
  readFileImpl = readFile,
} = {}) {
  if (environment.VERCEL_TOKEN !== undefined) return environment.VERCEL_TOKEN;
  if (platform !== 'darwin') refuse('VERCEL_AUTH_PLATFORM_UNSUPPORTED');
  let auth;
  try {
    auth = JSON.parse(
      await readFileImpl(
        path.join(home, 'Library/Application Support/com.vercel.cli/auth.json'),
        'utf8'
      )
    );
  } catch {
    refuse('VERCEL_AUTH_UNAVAILABLE');
  }
  if (
    typeof auth.expiresAt === 'number' &&
    (!Number.isFinite(auth.expiresAt) || auth.expiresAt < Math.floor(now() / 1000))
  ) {
    refuse('VERCEL_AUTH_EXPIRED');
  }
  if (typeof auth.token !== 'string' || !auth.token.trim()) refuse('VERCEL_AUTH_UNAVAILABLE');
  return auth.token;
}

function realSourceReader(repoRoot) {
  return async ({ deadlineAt }) => {
    const git = async (...args) => {
      try {
        const { stdout } = await execFileAsync('git', args, {
          cwd: repoRoot,
          encoding: 'utf8',
          timeout: remaining(deadlineAt, Date.now),
          maxBuffer: 2 * 1024 * 1024,
        });
        return stdout;
      } catch {
        refuse('SOURCE_READ_FAILED');
      }
    };
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
    const dirty = (await git('status', '--porcelain', '--untracked-files=no')).trim() !== '';
    const policy = await git('show', `${liveMainSha}:${POLICY_PATH}`);
    const helper = await readFile(fileURLToPath(import.meta.url), 'utf8');
    let helperMatchesProtected = false;
    // A new helper may prepare a plan before admission, but cannot execute it.
    try {
      helperMatchesProtected = (await git('show', `${liveMainSha}:${SCRIPT_PATH}`)) === helper;
    } catch {
      /* unadmitted source */
    }
    return {
      headSha,
      liveMainSha,
      dirty,
      trustedOrigin,
      helperMatchesProtected,
      policy,
      helperSha256: createHash('sha256').update(helper).digest('hex'),
      policySha256: createHash('sha256').update(policy).digest('hex'),
    };
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.execute && !options.ownerAuthorized) refuse('OWNER_AUTHORIZATION_REQUIRED');
  if (options.execute && !options.acceptConcurrentLinkChangeRisk)
    refuse('CONCURRENT_LINK_CHANGE_RISK_NOT_ACCEPTED');
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const home = os.userInfo().homedir;
  const token = await readExistingToken({ home });
  const result = await executeDisconnect(options, {
    readSource: realSourceReader(repoRoot),
    ...createVercelTransport({ token }),
    ledger: createFileLedger(path.join(home, '.codex/task-artifacts', ACTION_ID)),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.outcome === 'UNRESOLVED') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(
      `Vercel Git disconnect refused: ${error instanceof DisconnectError ? error.code : 'ACTION_FAILED'}\n`
    );
    process.exitCode = 1;
  });
}
