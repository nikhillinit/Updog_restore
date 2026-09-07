#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import pg from 'pg';
import { tsImport } from 'tsx/esm/api';
import { z } from 'zod';

import { verifyVercelEvidence } from './provider-evidence-contract.mjs';
import { verifyCanonicalPromotion } from './verify-vercel-promotion.mjs';

const execFileAsync = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const IO_TIMEOUT_MS = 10_000;

const VersionResponseSchema = z
  .object({
    version: z.string(),
    commit: z.string().regex(SHA),
    nodeVersion: z.string(),
    platform: z.string(),
    arch: z.string(),
    environment: z.literal('production'),
    timestamp: z.string().datetime(),
  })
  .strict();
const DatabaseHealthIdentitySchema = z
  .object({
    database: z.literal('connected'),
    status: z.literal('ok'),
    databaseName: z.string().min(1),
    databaseUrlHostFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    timestamp: z.string().datetime(),
  })
  .strict();
const ModeResponseSchema = z
  .object({
    calculationKey: z.literal('current_forecast'),
    configuredMode: z.enum(['off', 'shadow', 'on']),
    effectiveMode: z.enum(['off', 'shadow', 'on']),
    killSwitchActive: z.boolean(),
    shadowStartedAt: z.string().datetime().nullable(),
    eligibleAt: z.string().datetime().nullable(),
    residencyDaysRequired: z.number().int().positive(),
    residencyStatus: z.enum(['not_applicable', 'pending', 'eligible']),
    currentSourceMatchesAccepted: z.boolean(),
    unreconciledEditsPresent: z.boolean(),
    blockers: z.array(z.string()),
    version: z.number().int().nonnegative(),
    replayed: z.boolean(),
  })
  .strict();
const ActivationResponseSchema = z
  .object({
    calculationKey: z.literal('current_forecast'),
    configuredMode: z.literal('on'),
    activatedAt: z.string().datetime(),
    cutoverReferenceId: z.number().int().positive(),
    version: z.number().int().nonnegative(),
    replayed: z.boolean(),
  })
  .strict();
const ResumeResponseSchema = ActivationResponseSchema.extend({
  killSwitchActive: z.literal(false),
}).strict();
const ConflictResponseSchema = z
  .object({
    error: z.literal('stale_expected_version'),
    expectedVersion: z.number().int().nonnegative(),
    actualVersion: z.number().int().positive(),
  })
  .strict();

/**
 * @param {{ action: string, fundId: number, expectedVersion?: number, referenceId?: number }} context
 */
export function buildActionRequest({ action, fundId, expectedVersion, referenceId }) {
  const root = `/api/admin/funds/${fundId}`;
  switch (action) {
    case 'enter-shadow':
      return {
        method: 'PUT',
        path: `${root}/calculation-modes/current-forecast`,
        body: { expectedVersion, configuredMode: 'shadow', killSwitchActive: false },
      };
    case 'activate':
      return {
        method: 'POST',
        path: `${root}/current-forecast/activate`,
        body: { referenceId, expectedVersion },
      };
    case 'kill':
      return {
        method: 'PUT',
        path: `${root}/calculation-modes/current-forecast`,
        body: { expectedVersion, configuredMode: 'off', killSwitchActive: true },
      };
    case 'resume':
      return {
        method: 'POST',
        path: `${root}/calculation-modes/current-forecast/resume`,
        body: { expectedVersion },
      };
    case 'readback':
      return null;
    default:
      throw new Error('Unsupported Current Forecast action');
  }
}

export function databaseHostFingerprint(connectionString) {
  const hostname = new URL(connectionString).hostname.toLowerCase();
  if (hostname.includes('pooler')) throw new Error('Pooled production database URL refused');
  return `sha256:${createHash('sha256').update(hostname).digest('hex')}`;
}

export async function parseReleaseEvidenceManifest(value) {
  const contract = await tsImport(
    '../../shared/contracts/release-evidence-manifest-v1.contract.ts',
    import.meta.url
  );
  return contract.ReleaseEvidenceManifestV1Schema.parse(value);
}

async function readLiveMainSha() {
  await execFileAsync('git', ['fetch', '--no-tags', 'origin', 'main'], { timeout: 30_000 });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'origin/main'], { timeout: 30_000 });
  return stdout.trim();
}

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value.trim();
}

function cookieHeader(response) {
  const values =
    response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')].filter(Boolean);
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

function mergeCookies(...headers) {
  return [
    ...new Map(
      headers
        .flatMap((header) => header.split('; ').filter(Boolean))
        .map((cookie) => [cookie.split('=', 1)[0], cookie])
    ).values(),
  ].join('; ');
}

/**
 * @typedef {{ method?: string, headers?: Record<string, any>, body?: string, signal?: AbortSignal }} JsonRequestInit
 * @typedef {{ ok: boolean, status: number, headers: { getSetCookie?: () => string[], get: (name: string) => string | null }, json: () => Promise<any> }} JsonResponse
 * @param {(input: string, init?: JsonRequestInit) => Promise<JsonResponse>} fetchImpl
 * @param {string} url
 * @param {JsonRequestInit} [init]
 * @returns {Promise<{ response: JsonResponse, body: Record<string, any> | null }>}
 */
async function fetchJson(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    signal: init.signal ?? globalThis.AbortSignal.timeout(IO_TIMEOUT_MS),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Status and schema checks below provide the bounded failure.
  }
  return { response, body };
}

async function authenticate({ fetchImpl, baseUrl, username, password, bypassSecret }) {
  const common = bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {};
  const csrf = await fetchJson(fetchImpl, `${baseUrl}/api/auth/csrf`, { headers: common });
  if (!csrf.response.ok || typeof csrf.body?.csrfToken !== 'string') {
    throw new Error('Bootstrap CSRF failed');
  }
  const preCookie = cookieHeader(csrf.response);
  const login = await fetchJson(fetchImpl, `${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      ...common,
      cookie: preCookie,
      'x-csrf-token': csrf.body.csrfToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  const loginCookie = cookieHeader(login.response);
  if (!login.response.ok || loginCookie === '') {
    throw new Error('Current Forecast action login failed');
  }
  return { cookie: mergeCookies(preCookie, loginCookie), common };
}

function toIso(value) {
  if (value === null || value === undefined) return null;
  return new Date(value).toISOString();
}

function normalizeModeRow(row) {
  const configuredMode = row?.configured_mode ?? 'off';
  const killSwitchActive = row?.kill_switch_active ?? false;
  const activatedAt = toIso(row?.activated_at);
  const cutoverReferenceId =
    row?.cutover_reference_id === null || row?.cutover_reference_id === undefined
      ? null
      : Number(row.cutover_reference_id);
  const modeRow = {
    configuredMode,
    effectiveMode: killSwitchActive ? 'off' : configuredMode,
    killSwitchActive,
    shadowStartedAt: toIso(row?.shadow_started_at),
    activatedAt,
    cutoverReferenceId,
    version: Number(row?.version ?? 0),
  };
  if (activatedAt === null) {
    return {
      modeRow,
      servingResolver: {
        mode:
          !killSwitchActive && (configuredMode === 'shadow' || configuredMode === 'on')
            ? configuredMode
            : 'off',
        cutoverReferenceId: null,
      },
    };
  }
  if (!killSwitchActive && configuredMode === 'on') {
    return { modeRow, servingResolver: { mode: 'on', cutoverReferenceId } };
  }
  if (cutoverReferenceId === null) {
    throw new Error('Current Forecast held serving state has no pointer');
  }
  return {
    modeRow,
    servingResolver: {
      mode: 'held',
      cutoverReferenceId,
      heldReason: killSwitchActive
        ? 'kill_switch'
        : configuredMode === 'shadow'
          ? 'configured_shadow'
          : 'configured_off',
    },
  };
}

async function readDatabaseIdentity(client) {
  const identity = await client.query('SELECT current_database() AS database_name');
  const tail = await client.query(
    'SELECT created_at FROM public.drizzle_migrations ORDER BY created_at DESC LIMIT 1'
  );
  return {
    databaseName: identity.rows[0]?.database_name,
    migrationTail:
      String(tail.rows[0]?.created_at) === '1788235843534'
        ? '0055_current_forecast_recompute_commands'
        : 'unknown',
  };
}

async function readModeState(client, fundId) {
  const mode = await client.query(
    `SELECT configured_mode, kill_switch_active, shadow_started_at, activated_at,
            cutover_reference_id, version
       FROM fund_calculation_modes
      WHERE fund_id = $1 AND calculation_key = 'current_forecast'`,
    [fundId]
  );
  return normalizeModeRow(mode.rows[0]);
}

function responseSchemaFor(action) {
  if (action === 'activate') return ActivationResponseSchema;
  if (action === 'resume') return ResumeResponseSchema;
  return ModeResponseSchema;
}

function assertMappedResponse(action, result, replayed) {
  const parsed = responseSchemaFor(action).safeParse(result.body);
  if (!result.response.ok || !parsed.success || parsed.data.replayed !== replayed) {
    throw new Error(`${replayed ? 'Same-key replay' : 'Current Forecast action'} response invalid`);
  }
  return parsed.data;
}

function assertPostState(action, before, after, referenceId) {
  const row = after.modeRow;
  const resolver = after.servingResolver;
  if (row.version !== before.modeRow.version + 1) {
    throw new Error(`${action} post-state version mismatch`);
  }
  if (
    action === 'enter-shadow' &&
    (row.configuredMode !== 'shadow' ||
      row.effectiveMode !== 'shadow' ||
      row.killSwitchActive ||
      !row.shadowStartedAt ||
      resolver.mode !== 'shadow')
  )
    throw new Error('enter-shadow post-state mismatch');
  if (
    action === 'activate' &&
    (row.configuredMode !== 'on' ||
      row.effectiveMode !== 'on' ||
      row.killSwitchActive ||
      row.cutoverReferenceId !== referenceId ||
      resolver.mode !== 'on' ||
      resolver.cutoverReferenceId !== referenceId)
  )
    throw new Error('activate post-state mismatch');
  if (
    action === 'kill' &&
    (row.configuredMode !== 'off' ||
      row.effectiveMode !== 'off' ||
      !row.killSwitchActive ||
      row.cutoverReferenceId !== before.modeRow.cutoverReferenceId ||
      resolver.mode !== 'held' ||
      resolver.cutoverReferenceId !== before.modeRow.cutoverReferenceId)
  )
    throw new Error('kill post-state mismatch');
  if (
    action === 'resume' &&
    (row.configuredMode !== 'on' ||
      row.effectiveMode !== 'on' ||
      row.killSwitchActive ||
      row.cutoverReferenceId !== before.modeRow.cutoverReferenceId ||
      resolver.mode !== 'on' ||
      resolver.cutoverReferenceId !== before.modeRow.cutoverReferenceId)
  )
    throw new Error('resume post-state mismatch');
}

function assertActionResponseMatchesState(response, after) {
  if (
    response.version !== after.modeRow.version ||
    response.configuredMode !== after.modeRow.configuredMode
  ) {
    throw new Error('Current Forecast API and database post-state mismatch');
  }
  if ('effectiveMode' in response && response.effectiveMode !== after.modeRow.effectiveMode) {
    throw new Error('Current Forecast API and database effective-mode mismatch');
  }
  if (
    'killSwitchActive' in response &&
    response.killSwitchActive !== after.modeRow.killSwitchActive
  ) {
    throw new Error('Current Forecast API and database kill-switch mismatch');
  }
  if (
    'cutoverReferenceId' in response &&
    response.cutoverReferenceId !== after.modeRow.cutoverReferenceId
  ) {
    throw new Error('Current Forecast API and database pointer mismatch');
  }
  if ('shadowStartedAt' in response && response.shadowStartedAt !== after.modeRow.shadowStartedAt) {
    throw new Error('Current Forecast API and database shadow timestamp mismatch');
  }
}

/**
 * @param {{
 *   context: Record<string, any>;
 *   secrets: Record<string, any>;
 *   fetchImpl?: (input: string, init?: JsonRequestInit) => Promise<JsonResponse>;
 *   clientFactory?: (config: Record<string, any>) => { connect: () => Promise<any>, end: () => Promise<any>, query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };
 *   readLiveMainShaImpl?: () => Promise<string>;
 *   manifestParser?: (value: Record<string, any>) => Promise<Record<string, any>>;
 *   sleepImpl?: (milliseconds: number) => Promise<any>;
 *   uuidFactory?: () => string;
 *   now?: () => Date;
 * }} options
 * @returns {Promise<Record<string, any>>}
 */
export async function executeCurrentForecastProductionAction({
  context,
  secrets,
  fetchImpl = globalThis.fetch,
  clientFactory = (config) => new pg.Client(config),
  readLiveMainShaImpl = readLiveMainSha,
  manifestParser = parseReleaseEvidenceManifest,
  sleepImpl = sleep,
  uuidFactory = randomUUID,
  now = () => new Date(),
}) {
  if (!SHA.test(context.expectedSha)) throw new Error('expectedSha is invalid');
  if (!Number.isSafeInteger(context.fundId) || context.fundId < 1) {
    throw new Error('fundId is invalid');
  }
  if (!['readback', 'enter-shadow', 'activate', 'kill', 'resume'].includes(context.action)) {
    throw new Error('action is invalid');
  }
  if (
    context.action !== 'readback' &&
    (!Number.isSafeInteger(context.expectedVersion) || context.expectedVersion < 0)
  ) {
    throw new Error('expectedVersion is invalid');
  }
  if (
    context.action === 'activate' &&
    (!Number.isSafeInteger(context.referenceId) || context.referenceId < 1)
  ) {
    throw new Error('referenceId is invalid');
  }
  if (!SHA256.test(context.directHostFingerprint)) {
    throw new Error('directHostFingerprint is invalid');
  }
  if (
    context.databaseName !== secrets.protectedDatabaseName ||
    context.directHostFingerprint !== secrets.protectedDirectHostFingerprint
  ) {
    throw new Error('Dispatch database identity differs from protected identity');
  }
  if ((await readLiveMainShaImpl()) !== context.expectedSha) {
    throw new Error('Live main SHA mismatch');
  }

  const manifestBytes = await readFile(secrets.releaseManifestPath);
  if (
    createHash('sha256').update(manifestBytes).digest('hex') !== context.releaseManifest.fileSha256
  ) {
    throw new Error('Release manifest file digest mismatch');
  }
  let manifestJson;
  try {
    manifestJson = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    throw new Error('Release manifest JSON is invalid');
  }
  let manifest;
  try {
    manifest = await manifestParser(manifestJson);
  } catch {
    throw new Error('Release manifest schema is invalid');
  }
  if (
    manifest.source.sha !== context.expectedSha ||
    String(manifest.workflow.runId) !== context.releaseManifest.runId ||
    manifest.workflow.runAttempt !== context.releaseManifest.runAttempt ||
    manifest.workflow.manifestArtifactName !== context.releaseManifest.artifactName ||
    manifest.release?.vercel.projectId !== context.vercelProjectId ||
    manifest.release?.vercel.deploymentId !== context.vercelDeploymentId ||
    manifest.release?.vercel.hostname !== context.canonicalHostname ||
    manifest.release?.vercel.sourceSha !== context.expectedSha
  ) {
    throw new Error('Release manifest identity mismatch');
  }

  const vercelResponse = await fetchJson(
    fetchImpl,
    `https://api.vercel.com/v13/deployments/${context.vercelDeploymentId}` +
      `?teamId=${encodeURIComponent(secrets.vercelOrgId)}`,
    { headers: { Authorization: `Bearer ${secrets.vercelToken}` } }
  );
  if (!vercelResponse.response.ok) throw new Error('Vercel deployment lookup failed');
  verifyCanonicalPromotion({
    canonicalHostname: context.canonicalHostname,
    deployment: vercelResponse.body,
    expectedDeploymentId: context.vercelDeploymentId,
    expectedProjectId: context.vercelProjectId,
    expectedSha: context.expectedSha,
  });
  verifyVercelEvidence(vercelResponse.body, context.vercelProjectId, {
    kind: 'canonical_baseline',
    canonicalHostname: context.canonicalHostname,
  });

  if (databaseHostFingerprint(secrets.databaseUrl) !== context.directHostFingerprint) {
    throw new Error('Production database host fingerprint mismatch');
  }
  const baseUrl = `https://${context.canonicalHostname}`;
  const bypassHeaders = secrets.bypassSecret
    ? { 'x-vercel-protection-bypass': secrets.bypassSecret }
    : {};
  const version = await fetchJson(fetchImpl, `${baseUrl}/api/version`, {
    headers: bypassHeaders,
  });
  const versionBody = VersionResponseSchema.safeParse(version.body);
  if (
    !version.response.ok ||
    !versionBody.success ||
    versionBody.data.commit !== context.expectedSha
  ) {
    throw new Error('Deployed API version identity mismatch');
  }

  const client = clientFactory({
    connectionString: secrets.databaseUrl,
    connectionTimeoutMillis: IO_TIMEOUT_MS,
    query_timeout: IO_TIMEOUT_MS,
  });
  await client.connect();
  try {
    const databaseIdentity = await readDatabaseIdentity(client);
    if (
      databaseIdentity.databaseName !== context.databaseName ||
      databaseIdentity.migrationTail !== '0055_current_forecast_recompute_commands'
    ) {
      throw new Error('Production database identity or migration tail mismatch');
    }

    const session = await authenticate({
      fetchImpl,
      baseUrl,
      username: secrets.username,
      password: secrets.password,
      bypassSecret: secrets.bypassSecret,
    });
    const health = await fetchJson(fetchImpl, `${baseUrl}/api/health/db`, {
      headers: { ...session.common, cookie: session.cookie },
    });
    const healthBody = DatabaseHealthIdentitySchema.safeParse(health.body);
    if (
      !health.response.ok ||
      !healthBody.success ||
      healthBody.data.databaseName !== context.databaseName ||
      healthBody.data.databaseUrlHostFingerprint !== context.directHostFingerprint
    ) {
      throw new Error('Deployed API database identity mismatch');
    }

    const before = await readModeState(client, context.fundId);
    if (context.action !== 'readback' && before.modeRow.version !== context.expectedVersion) {
      throw new Error('Current Forecast expected version mismatch');
    }
    const identity = {
      sourceSha: context.expectedSha,
      releaseManifest: { ...context.releaseManifest },
      provider: {
        projectId: context.vercelProjectId,
        deploymentId: context.vercelDeploymentId,
        canonicalHostname: context.canonicalHostname,
      },
      database: {
        databaseName: databaseIdentity.databaseName,
        directHostFingerprint: context.directHostFingerprint,
        migrationTail: databaseIdentity.migrationTail,
      },
    };
    if (context.action === 'readback') {
      return {
        action: 'readback',
        identity,
        state: before,
        health: healthBody.data,
        completedAt: now().toISOString(),
      };
    }

    const csrf = await fetchJson(fetchImpl, `${baseUrl}/api/auth/csrf`, {
      headers: { ...session.common, cookie: session.cookie },
    });
    if (!csrf.response.ok || typeof csrf.body?.csrfToken !== 'string') {
      throw new Error('Action CSRF refresh failed');
    }
    const csrfToken = csrf.body.csrfToken;
    if ((await readLiveMainShaImpl()) !== context.expectedSha) {
      throw new Error('Final live main SHA mismatch');
    }

    const request = buildActionRequest({
      action: context.action,
      fundId: context.fundId,
      expectedVersion: context.expectedVersion,
      referenceId: context.referenceId,
    });
    if (request === null) throw new Error('Unsafe action request is missing');
    const idempotencyKey = uuidFactory();
    const actionCookie = mergeCookies(session.cookie, cookieHeader(csrf.response));
    const send = (key) =>
      fetchJson(fetchImpl, `${baseUrl}${request.path}`, {
        method: request.method,
        headers: {
          ...session.common,
          cookie: actionCookie,
          'x-csrf-token': csrfToken,
          'idempotency-key': key,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request.body),
      });
    const boundedSend = async (key) => {
      let lastError = new Error('Current Forecast action request failed');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await send(key);
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error('Current Forecast action request failed');
          if (attempt < 2) await sleepImpl(250 * (attempt + 1));
        }
      }
      throw lastError;
    };

    const initial = await boundedSend(idempotencyKey);
    const initialBody = assertMappedResponse(context.action, initial, false);
    const replay = await boundedSend(idempotencyKey);
    const replayBody = assertMappedResponse(context.action, replay, true);
    const afterReplay = await readModeState(client, context.fundId);
    assertPostState(context.action, before, afterReplay, context.referenceId);
    assertActionResponseMatchesState(initialBody, afterReplay);
    assertActionResponseMatchesState(replayBody, afterReplay);

    /** @type {number | null} */
    let freshKeyConflictStatus = null;
    if (context.action === 'activate') {
      const conflict = await send(uuidFactory());
      const conflictBody = ConflictResponseSchema.safeParse(conflict.body);
      if (
        conflict.response.status !== 409 ||
        !conflictBody.success ||
        conflictBody.data.expectedVersion !== context.expectedVersion ||
        conflictBody.data.actualVersion !== context.expectedVersion + 1
      ) {
        throw new Error('Fresh-key activation conflict probe failed');
      }
      const afterConflict = await readModeState(client, context.fundId);
      if (JSON.stringify(afterConflict) !== JSON.stringify(afterReplay)) {
        throw new Error('Fresh-key activation conflict changed state');
      }
      freshKeyConflictStatus = 409;
    }

    return {
      action: context.action,
      identity,
      before,
      after: afterReplay,
      probes: {
        liveMain: 'matched_before_and_immediately_pre_action',
        manifestSchema: 'valid',
        provider: 'canonical',
        version: 'production_exact_sha',
        database: 'direct_exact_identity',
        health: 'authenticated_exact_identity',
        initialStatus: initial.response.status,
        replayStatus: replay.response.status,
        replayed: true,
        freshKeyConflictStatus,
      },
      referenceId: context.referenceId ?? null,
      completedAt: now().toISOString(),
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const action = required(process.env.ACTION, 'ACTION');
  const expectedVersion = action === 'readback' ? undefined : Number(process.env.EXPECTED_VERSION);
  const result = await executeCurrentForecastProductionAction({
    context: {
      expectedSha: required(process.env.EXPECTED_SHA, 'EXPECTED_SHA'),
      fundId: Number(process.env.FUND_ID),
      action,
      expectedVersion,
      referenceId: action === 'activate' ? Number(process.env.REFERENCE_ID) : undefined,
      vercelProjectId: required(process.env.VERCEL_PROJECT_ID, 'VERCEL_PROJECT_ID'),
      vercelDeploymentId: required(process.env.VERCEL_DEPLOYMENT_ID, 'VERCEL_DEPLOYMENT_ID'),
      canonicalHostname: required(process.env.CANONICAL_HOSTNAME, 'CANONICAL_HOSTNAME'),
      releaseManifest: {
        runId: required(process.env.RELEASE_MANIFEST_RUN_ID, 'RELEASE_MANIFEST_RUN_ID'),
        runAttempt: Number(process.env.RELEASE_MANIFEST_RUN_ATTEMPT),
        artifactId: required(
          process.env.RELEASE_MANIFEST_ARTIFACT_ID,
          'RELEASE_MANIFEST_ARTIFACT_ID'
        ),
        artifactName: required(
          process.env.RELEASE_MANIFEST_ARTIFACT_NAME,
          'RELEASE_MANIFEST_ARTIFACT_NAME'
        ),
        artifactArchiveSha256: required(
          process.env.RELEASE_MANIFEST_ARTIFACT_ARCHIVE_SHA256,
          'RELEASE_MANIFEST_ARTIFACT_ARCHIVE_SHA256'
        ),
        fileSha256: required(
          process.env.RELEASE_MANIFEST_FILE_SHA256,
          'RELEASE_MANIFEST_FILE_SHA256'
        ),
      },
      databaseName: required(process.env.DATABASE_NAME, 'DATABASE_NAME'),
      directHostFingerprint: required(
        process.env.DIRECT_HOST_FINGERPRINT,
        'DIRECT_HOST_FINGERPRINT'
      ),
    },
    secrets: {
      releaseManifestPath: required(process.env.RELEASE_MANIFEST_PATH, 'RELEASE_MANIFEST_PATH'),
      vercelToken: required(process.env.VERCEL_TOKEN, 'VERCEL_TOKEN'),
      vercelOrgId: required(process.env.VERCEL_ORG_ID, 'VERCEL_ORG_ID'),
      databaseUrl: required(process.env.PRODUCTION_DATABASE_URL, 'PRODUCTION_DATABASE_URL'),
      protectedDatabaseName: required(
        process.env.PRODUCTION_DATABASE_NAME,
        'PRODUCTION_DATABASE_NAME'
      ),
      protectedDirectHostFingerprint: required(
        process.env.PRODUCTION_DATABASE_DIRECT_HOST_SHA256,
        'PRODUCTION_DATABASE_DIRECT_HOST_SHA256'
      ),
      username: required(process.env.CANARY_RECONCILER_USERNAME, 'CANARY_RECONCILER_USERNAME'),
      password: required(process.env.CANARY_RECONCILER_PASSWORD, 'CANARY_RECONCILER_PASSWORD'),
      bypassSecret: required(
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        'VERCEL_AUTOMATION_BYPASS_SECRET'
      ),
    },
  });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`
    );
  }
}

if (process.argv[1]?.endsWith('current-forecast-production-action.mjs')) {
  main().catch((error) => {
    process.stderr.write(`Current Forecast production action failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
