#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';
import pg from 'pg';
import { assertActualsDraftProductionPrerequisites } from './actuals-draft-prerequisites.mjs';
import { assertActualsRestatementProductionPrerequisites } from './actuals-restatement-prerequisites.mjs';

const SHA = /^[a-f0-9]{40}$/;
const NEON_ID = /^[a-z0-9-]{1,60}$/;
const DATABASE = /^[A-Za-z0-9_-]{1,63}$/;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPECTED_TAILS = new Set(['0049_kpi_observations', '0053_g3_release_gate_hardening']);
const READY_ENDPOINT_STATES = new Set(['active', 'idle']);

function required(value, label, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

export function validateRehearsalInput(input) {
  const mode = input.mode ?? 'current-forecast-0050-0055';
  if (
    !['current-forecast-0050-0055', 'actuals-draft-0056', 'actuals-restatement-0057'].includes(mode)
  ) {
    throw new Error('Rehearsal mode is invalid');
  }
  const expectedTailAllowed =
    mode === 'actuals-restatement-0057'
      ? input.expectedParentMigrationTail === '0056_actuals_draft_revisions'
      : mode === 'actuals-draft-0056'
        ? input.expectedParentMigrationTail === '0055_current_forecast_recompute_commands'
        : EXPECTED_TAILS.has(input.expectedParentMigrationTail);
  return {
    ...(input.mode === undefined ? {} : { mode }),
    expectedSha: required(input.expectedSha, 'expectedSha', SHA),
    projectId: required(input.projectId, 'projectId', NEON_ID),
    parentBranchId: required(input.parentBranchId, 'parentBranchId', NEON_ID),
    databaseName: required(input.databaseName, 'databaseName', DATABASE),
    expectedParentMigrationTail: expectedTailAllowed
      ? input.expectedParentMigrationTail
      : (() => {
          throw new Error('expectedParentMigrationTail is invalid');
        })(),
  };
}

export function directHostFingerprint(connectionString) {
  const hostname = parseConnectionUri(connectionString).hostname.toLowerCase();
  if (hostname.includes('-pooler.') || hostname.includes('pooler')) {
    throw new Error('Pooled Neon connection is forbidden');
  }
  return `sha256:${createHash('sha256').update(hostname).digest('hex')}`;
}

function parseConnectionUri(uri) {
  try {
    const parsed = new URL(uri);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname)
      throw new Error();
    return parsed;
  } catch {
    throw new Error('Neon connection URI is invalid');
  }
}

async function neonJson(fetchImpl, apiKey, path, init = {}) {
  const response = await fetchImpl(`https://console.neon.tech/api/v2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!response?.ok) throw new Error('Neon API request failed');
  return response.json();
}

function oneReadWriteEndpoint(endpoints, identity) {
  const matches = Array.isArray(endpoints)
    ? endpoints.filter((endpoint) => endpoint?.type === 'read_write')
    : [];
  if (matches.length !== 1)
    throw new Error(`${identity} read-write endpoint identity is ambiguous`);
  return matches[0];
}

export function validateEndpoint(
  endpoint,
  { projectId, branchId, identity, requireReady = false }
) {
  const endpointId = required(endpoint?.id, `${identity} endpoint ID`, NEON_ID);
  if (
    endpoint.project_id !== projectId ||
    endpoint.branch_id !== branchId ||
    endpoint.type !== 'read_write'
  ) {
    throw new Error(`${identity} endpoint identity mismatch`);
  }
  if (requireReady && (endpoint.disabled || !READY_ENDPOINT_STATES.has(endpoint.current_state))) {
    throw new Error(`${identity} endpoint is not ready`);
  }
  return {
    endpointId,
    host: required(endpoint.host, `${identity} endpoint host`, /^[A-Za-z0-9.-]+$/),
  };
}

export function validateDatabase(database, { branchId, databaseName, identity }) {
  if (database?.branch_id !== branchId || database.name !== databaseName) {
    throw new Error(`${identity} database identity mismatch`);
  }
  return required(database.owner_name, `${identity} database owner`, /^[A-Za-z0-9_.-]{1,63}$/);
}

/**
 * @param {string} uri
 * @param {{ databaseName: string, roleName: string, endpointHost: string, forbiddenHost?: string, identity: string }} identity
 */
export function validateConnectionUri(
  uri,
  { databaseName, roleName, endpointHost, forbiddenHost, identity }
) {
  const parsed = parseConnectionUri(uri);
  const hostname = parsed.hostname.toLowerCase();
  if (
    decodeURIComponent(parsed.pathname.slice(1)) !== databaseName ||
    decodeURIComponent(parsed.username) !== roleName ||
    hostname !== endpointHost.toLowerCase() ||
    (forbiddenHost && hostname === forbiddenHost.toLowerCase())
  ) {
    throw new Error(`${identity} connection URI identity mismatch`);
  }
  directHostFingerprint(uri);
  return hostname;
}

async function waitForOperations({
  operations,
  projectId,
  branchId,
  endpointId,
  apiKey,
  fetchImpl,
  sleepImpl,
}) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error('Created Neon operation identity is ambiguous');
  }
  for (const initial of operations) {
    const operationId = required(initial?.id, 'returned operation ID', OPERATION_ID);
    let operation = initial;
    for (let attempt = 0; attempt < 20 && operation.status !== 'finished'; attempt += 1) {
      if (operation.status === 'failed' || operation.status === 'cancelled') {
        throw new Error('Created Neon operation failed');
      }
      await sleepImpl(1_000);
      ({ operation } = await neonJson(
        fetchImpl,
        apiKey,
        `/projects/${projectId}/operations/${operationId}`
      ));
    }
    if (
      operation?.id !== operationId ||
      operation.project_id !== projectId ||
      operation.branch_id !== branchId ||
      (operation.endpoint_id && operation.endpoint_id !== endpointId)
    ) {
      throw new Error('Created Neon operation identity mismatch');
    }
    if (operation.status !== 'finished' || operation.failures_count !== 0) {
      throw new Error('Created Neon operation did not finish successfully');
    }
  }
}

async function readMigrationTail(connectionString) {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const ledger = await client.query(
      'SELECT created_at FROM public.drizzle_migrations ORDER BY created_at DESC LIMIT 1'
    );
    const byWhen = new Map([
      ['1785714000000', '0049_kpi_observations'],
      ['1786059600000', '0053_g3_release_gate_hardening'],
      ['1788235843534', '0055_current_forecast_recompute_commands'],
      ['1788825600000', '0056_actuals_draft_revisions'],
    ]);
    return byWhen.get(String(ledger.rows[0]?.created_at)) ?? 'unknown';
  } finally {
    await client.end();
  }
}

/** @returns {Promise<void>} */
function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve(undefined) : reject(new Error(`${command} failed`))
    );
  });
}

/**
 * @param {{
 *   input: Record<string, any>;
 *   apiKey: string;
 *   githubRunId: string;
 *   githubRunAttempt: number;
 *   fetchImpl?: (input: string, init?: Record<string, any>) => Promise<{ ok: boolean, json: () => Promise<Record<string, any>> }>;
 *   tailReader?: (connectionString: string) => Promise<string>;
 *   commandRunner?: (command: string, args: string[], env: Record<string, string>) => Promise<void>;
 *   sleepImpl?: (milliseconds: number) => Promise<void>;
 * }} options
 */
export async function rehearseCurrentForecastNeon({
  input,
  apiKey,
  githubRunId,
  githubRunAttempt,
  fetchImpl = globalThis.fetch,
  tailReader = readMigrationTail,
  commandRunner = runCommand,
  sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const value = validateRehearsalInput(input);
  if (value.mode === 'actuals-draft-0056') {
    // The local owned-container proof does not authorize creating or mutating a provider branch.
    assertActualsDraftProductionPrerequisites();
  }
  if (value.mode === 'actuals-restatement-0057') {
    assertActualsRestatementProductionPrerequisites();
  }
  if (!apiKey) throw new Error('NEON_API_KEY is required');
  if (githubRunAttempt !== 1) throw new Error('Rehearsal requires GitHub run attempt 1');

  const project = await neonJson(fetchImpl, apiKey, `/projects/${value.projectId}`);
  if (project?.project?.id !== value.projectId) throw new Error('Neon project identity mismatch');
  const parent = await neonJson(
    fetchImpl,
    apiKey,
    `/projects/${value.projectId}/branches/${value.parentBranchId}`
  );
  if (parent?.branch?.id !== value.parentBranchId || parent.branch.project_id !== value.projectId) {
    throw new Error('Neon parent branch identity mismatch');
  }
  const parentDatabase = await neonJson(
    fetchImpl,
    apiKey,
    `/projects/${value.projectId}/branches/${value.parentBranchId}/databases/${value.databaseName}`
  );
  const roleName = validateDatabase(parentDatabase.database, {
    branchId: value.parentBranchId,
    databaseName: value.databaseName,
    identity: 'Parent Neon',
  });
  const parentEndpoints = await neonJson(
    fetchImpl,
    apiKey,
    `/projects/${value.projectId}/branches/${value.parentBranchId}/endpoints`
  );
  const parentEndpoint = validateEndpoint(
    oneReadWriteEndpoint(parentEndpoints.endpoints, 'Parent Neon'),
    {
      projectId: value.projectId,
      branchId: value.parentBranchId,
      identity: 'Parent Neon',
      requireReady: true,
    }
  );
  const parentUri = await neonJson(
    fetchImpl,
    apiKey,
    `/projects/${value.projectId}/connection_uri?branch_id=${value.parentBranchId}` +
      `&endpoint_id=${parentEndpoint.endpointId}&database_name=${value.databaseName}` +
      `&role_name=${encodeURIComponent(roleName)}&pooled=false`
  );
  const parentHost = validateConnectionUri(parentUri.uri, {
    databaseName: value.databaseName,
    roleName,
    endpointHost: parentEndpoint.host,
    forbiddenHost: undefined,
    identity: 'Parent Neon',
  });
  let beforeMigrationTail;
  try {
    beforeMigrationTail = await tailReader(parentUri.uri);
  } catch {
    throw new Error('Parent migration tail read failed');
  }
  if (beforeMigrationTail !== value.expectedParentMigrationTail) {
    throw new Error('Parent migration tail mismatch');
  }

  const created = await neonJson(fetchImpl, apiKey, `/projects/${value.projectId}/branches`, {
    method: 'POST',
    body: JSON.stringify({
      endpoints: [{ type: 'read_write' }],
      branch: {
        parent_id: value.parentBranchId,
        name: `current-forecast-${githubRunId}-${githubRunAttempt}`,
      },
    }),
  });
  const rehearsalBranchId = required(created?.branch?.id, 'returned branch ID', NEON_ID);
  if (
    created.branch.project_id !== value.projectId ||
    created.branch.parent_id !== value.parentBranchId
  ) {
    throw new Error('Created Neon branch identity mismatch');
  }
  const returnedEndpoint = validateEndpoint(
    oneReadWriteEndpoint(created.endpoints, 'Created Neon'),
    {
      projectId: value.projectId,
      branchId: rehearsalBranchId,
      identity: 'Created Neon',
    }
  );
  await waitForOperations({
    operations: created.operations,
    projectId: value.projectId,
    branchId: rehearsalBranchId,
    endpointId: returnedEndpoint.endpointId,
    apiKey,
    fetchImpl,
    sleepImpl,
  });
  const child = await neonJson(
    fetchImpl,
    apiKey,
    `/projects/${value.projectId}/branches/${rehearsalBranchId}`
  );
  if (
    child?.branch?.id !== rehearsalBranchId ||
    child.branch.project_id !== value.projectId ||
    child.branch.parent_id !== value.parentBranchId ||
    child.branch.current_state !== 'ready'
  ) {
    throw new Error('Created Neon branch readiness mismatch');
  }
  const childDatabase = await neonJson(
    fetchImpl,
    apiKey,
    `/projects/${value.projectId}/branches/${rehearsalBranchId}/databases/${value.databaseName}`
  );
  const childRoleName = validateDatabase(childDatabase.database, {
    branchId: rehearsalBranchId,
    databaseName: value.databaseName,
    identity: 'Created Neon',
  });
  if (childRoleName !== roleName) throw new Error('Created Neon database owner mismatch');
  const childEndpoints = await neonJson(
    fetchImpl,
    apiKey,
    `/projects/${value.projectId}/branches/${rehearsalBranchId}/endpoints`
  );
  const childEndpoint = validateEndpoint(
    oneReadWriteEndpoint(childEndpoints.endpoints, 'Created Neon'),
    {
      projectId: value.projectId,
      branchId: rehearsalBranchId,
      identity: 'Created Neon',
      requireReady: true,
    }
  );
  if (
    childEndpoint.endpointId !== returnedEndpoint.endpointId ||
    childEndpoint.host.toLowerCase() !== returnedEndpoint.host.toLowerCase()
  ) {
    throw new Error('Created Neon endpoint identity mismatch');
  }
  const rehearsalUri = await neonJson(
    fetchImpl,
    apiKey,
    `/projects/${value.projectId}/connection_uri?branch_id=${rehearsalBranchId}` +
      `&endpoint_id=${childEndpoint.endpointId}&database_name=${value.databaseName}` +
      `&role_name=${encodeURIComponent(childRoleName)}&pooled=false`
  );
  validateConnectionUri(rehearsalUri.uri, {
    databaseName: value.databaseName,
    roleName: childRoleName,
    endpointHost: childEndpoint.host,
    forbiddenHost: parentHost,
    identity: 'Created Neon',
  });
  const fingerprint = directHostFingerprint(rehearsalUri.uri);

  try {
    await commandRunner(
      'node',
      ['scripts/run-current-forecast-journaled-migrations.mjs', '--apply', '--yes'],
      {
        DATABASE_URL: rehearsalUri.uri,
      }
    );
    await commandRunner('node', ['scripts/run-current-forecast-journaled-migrations.mjs'], {
      DATABASE_URL: rehearsalUri.uri,
    });
    await commandRunner(
      'npx',
      [
        'vitest',
        'run',
        'tests/integration/current-forecast-journaled-migration-recovery.test.ts',
        'tests/integration/current-forecast-manual-recompute.pg.test.ts',
        'tests/integration/current-forecast-reference.pg.test.ts',
        '--config',
        'vitest.config.testcontainers.ts',
        '--configLoader',
        'native',
        '--retry=0',
      ],
      { TEST_DATABASE_URL: rehearsalUri.uri }
    );
  } catch {
    throw new Error('Rehearsal command failed');
  }
  let afterMigrationTail;
  try {
    afterMigrationTail = await tailReader(rehearsalUri.uri);
  } catch {
    throw new Error('Rehearsal migration tail read failed');
  }
  if (afterMigrationTail !== '0055_current_forecast_recompute_commands') {
    throw new Error('Rehearsal migration tail mismatch');
  }
  return {
    githubRunId: String(githubRunId),
    githubRunAttempt: 1,
    candidateSha: value.expectedSha,
    projectId: value.projectId,
    parentBranchId: value.parentBranchId,
    rehearsalBranchId,
    databaseName: value.databaseName,
    directHostFingerprint: fingerprint,
    beforeMigrationTail: value.expectedParentMigrationTail,
    afterMigrationTail,
    completedAt: new Date().toISOString(),
  };
}

async function main() {
  const result = await rehearseCurrentForecastNeon({
    input: {
      mode: process.env.ACTUALS_MIGRATION_REHEARSAL_MODE,
      expectedSha: process.env.EXPECTED_SHA,
      projectId: process.env.NEON_PROJECT_ID,
      parentBranchId: process.env.NEON_PARENT_BRANCH_ID,
      databaseName: process.env.NEON_DATABASE_NAME,
      expectedParentMigrationTail: process.env.EXPECTED_PARENT_MIGRATION_TAIL,
    },
    apiKey: required(process.env.NEON_API_KEY, 'NEON_API_KEY', /^.+$/),
    githubRunId: required(process.env.GITHUB_RUN_ID, 'GITHUB_RUN_ID', /^[1-9][0-9]*$/),
    githubRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  });
  const safeJson = JSON.stringify(result);
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `result=${safeJson}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\`\`\`json\n${safeJson}\n\`\`\`\n`);
}

if (process.argv[1]?.endsWith('rehearse-current-forecast-neon.mjs')) {
  main().catch((error) => {
    process.stderr.write(`Current Forecast Neon rehearsal failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
