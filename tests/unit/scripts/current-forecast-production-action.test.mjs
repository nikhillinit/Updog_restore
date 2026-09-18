import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildActionRequest,
  databaseHostFingerprint,
  executeCurrentForecastProductionAction,
  parseReleaseEvidenceManifest,
} from '../../../scripts/release/current-forecast-production-action.mjs';

const SHA = 'a'.repeat(40);
const DATABASE_URL = 'postgres://user:password@ep-direct.neon.tech/production';
const FINGERPRINT = databaseHostFingerprint(DATABASE_URL);
const NOW = '2026-09-06T12:00:00.000Z';
const tempDirectories = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      })
    )
  );
});

function jsonResponse(body, status = 200, cookie) {
  return new globalThis.Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { 'set-cookie': cookie } : {}),
    },
  });
}

/**
 * @param {{
 *   configuredMode: string;
 *   killSwitchActive?: boolean;
 *   version: number;
 *   activatedAt?: string | null;
 *   shadowStartedAt?: string | null;
 *   cutoverReferenceId?: number | null;
 * }} options
 */
function modeRow({
  configuredMode,
  killSwitchActive = false,
  version,
  activatedAt = null,
  shadowStartedAt = null,
  cutoverReferenceId = null,
}) {
  return {
    configured_mode: configuredMode,
    kill_switch_active: killSwitchActive,
    version,
    activated_at: activatedAt,
    shadow_started_at: shadowStartedAt,
    cutover_reference_id: cutoverReferenceId,
  };
}

/**
 * @param {{
 *   configuredMode: string;
 *   effectiveMode?: string;
 *   killSwitchActive?: boolean;
 *   version: number;
 *   shadowStartedAt?: string | null;
 *   replayed: boolean;
 * }} options
 */
function apiMode({
  configuredMode,
  effectiveMode = configuredMode,
  killSwitchActive = false,
  version,
  shadowStartedAt = null,
  replayed,
}) {
  return {
    calculationKey: 'current_forecast',
    configuredMode,
    effectiveMode,
    killSwitchActive,
    shadowStartedAt,
    eligibleAt: null,
    residencyDaysRequired: 7,
    residencyStatus: configuredMode === 'shadow' ? 'pending' : 'not_applicable',
    currentSourceMatchesAccepted: false,
    unreconciledEditsPresent: false,
    blockers: [],
    version,
    replayed,
  };
}

function actionFixture(action) {
  const activatedAt = '2026-09-05T10:00:00.000Z';
  if (action === 'enter-shadow') {
    const shadowStartedAt = '2026-09-06T11:00:00.000Z';
    return {
      before: modeRow({ configuredMode: 'off', version: 4 }),
      after: modeRow({ configuredMode: 'shadow', version: 5, shadowStartedAt }),
      initial: apiMode({ configuredMode: 'shadow', version: 5, shadowStartedAt, replayed: false }),
      replay: apiMode({ configuredMode: 'shadow', version: 5, shadowStartedAt, replayed: true }),
    };
  }
  if (action === 'activate') {
    return {
      before: modeRow({
        configuredMode: 'shadow',
        version: 4,
        shadowStartedAt: '2026-09-01T10:00:00.000Z',
      }),
      after: modeRow({ configuredMode: 'on', version: 5, activatedAt, cutoverReferenceId: 9 }),
      initial: {
        calculationKey: 'current_forecast',
        configuredMode: 'on',
        activatedAt,
        cutoverReferenceId: 9,
        version: 5,
        replayed: false,
      },
      replay: {
        calculationKey: 'current_forecast',
        configuredMode: 'on',
        activatedAt,
        cutoverReferenceId: 9,
        version: 5,
        replayed: true,
      },
    };
  }
  if (action === 'kill') {
    return {
      before: modeRow({ configuredMode: 'on', version: 4, activatedAt, cutoverReferenceId: 9 }),
      after: modeRow({
        configuredMode: 'off',
        killSwitchActive: true,
        version: 5,
        activatedAt,
        cutoverReferenceId: 9,
      }),
      initial: apiMode({
        configuredMode: 'off',
        effectiveMode: 'off',
        killSwitchActive: true,
        version: 5,
        replayed: false,
      }),
      replay: apiMode({
        configuredMode: 'off',
        effectiveMode: 'off',
        killSwitchActive: true,
        version: 5,
        replayed: true,
      }),
    };
  }
  return {
    before: modeRow({
      configuredMode: 'off',
      killSwitchActive: true,
      version: 4,
      activatedAt,
      cutoverReferenceId: 9,
    }),
    after: modeRow({ configuredMode: 'on', version: 5, activatedAt, cutoverReferenceId: 9 }),
    initial: {
      calculationKey: 'current_forecast',
      configuredMode: 'on',
      killSwitchActive: false,
      activatedAt,
      cutoverReferenceId: 9,
      version: 5,
      replayed: false,
    },
    replay: {
      calculationKey: 'current_forecast',
      configuredMode: 'on',
      killSwitchActive: false,
      activatedAt,
      cutoverReferenceId: 9,
      version: 5,
      replayed: true,
    },
  };
}

async function createHarness(action = 'kill', overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'current-forecast-action-'));
  tempDirectories.push(directory);
  const manifestPath = join(directory, 'manifest.json');
  const manifestJson = overrides.manifestJson ?? { schemaVersion: 'fixture' };
  const manifestBytes = Buffer.from(JSON.stringify(manifestJson));
  await writeFile(manifestPath, manifestBytes);
  const fixture = actionFixture(action);
  const modeRows = [...(overrides.modeRows ?? [fixture.before, fixture.after])];
  const calls = [];
  let mutationCalls = 0;
  let actionResponseIndex = 0;
  const responses = overrides.actionResponses ?? [fixture.initial, fixture.replay];
  const client = {
    connect: vi.fn(async () => calls.push('db:connect')),
    end: vi.fn(async () => calls.push('db:end')),
    query: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT current_database')) {
        calls.push('db:identity');
        return { rows: [{ database_name: overrides.databaseName ?? 'production' }] };
      }
      if (sql.startsWith('SELECT created_at')) {
        calls.push('db:migration-tail');
        return { rows: [{ created_at: overrides.migrationCreatedAt ?? '1788235843534' }] };
      }
      calls.push('db:mode');
      return { rows: [modeRows.shift()] };
    }),
  };
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    if (url.startsWith('https://api.vercel.com/')) {
      calls.push('provider');
      return jsonResponse(
        overrides.vercelBody ?? {
          id: 'deployment',
          url: 'deployment.vercel.app',
          projectId: 'project',
          readyState: 'READY',
          target: 'production',
          aliases: ['updog.example'],
          meta: { githubCommitSha: SHA },
        }
      );
    }
    if (url.endsWith('/api/version')) {
      calls.push('api:version');
      return jsonResponse(
        overrides.versionBody ?? {
          version: '1.6.0',
          commit: SHA,
          nodeVersion: 'v22.23.2',
          platform: 'linux',
          arch: 'x64',
          environment: 'production',
          timestamp: NOW,
        }
      );
    }
    if (url.endsWith('/api/auth/csrf') && !init.headers?.cookie) {
      calls.push('api:bootstrap-csrf');
      return jsonResponse({ csrfToken: 'bootstrap' }, 200, 'csrf=bootstrap; Path=/');
    }
    if (url.endsWith('/api/auth/login')) {
      calls.push('api:login');
      return jsonResponse({ ok: true }, 200, 'session=authenticated; Path=/');
    }
    if (url.endsWith('/api/health/db')) {
      calls.push('api:health');
      return jsonResponse(
        overrides.healthBody ?? {
          database: 'connected',
          status: 'ok',
          databaseName: 'production',
          databaseUrlHostFingerprint: FINGERPRINT,
          timestamp: NOW,
        }
      );
    }
    if (url.endsWith('/api/auth/csrf')) {
      calls.push('api:refresh-csrf');
      return jsonResponse({ csrfToken: 'action' }, 200, 'csrf=action; Path=/');
    }
    mutationCalls += 1;
    calls.push(`mutation:${method}:${init.headers['idempotency-key']}`);
    if (action === 'activate' && actionResponseIndex === 2) {
      actionResponseIndex += 1;
      return jsonResponse(
        overrides.conflictBody ?? {
          error: 'stale_expected_version',
          expectedVersion: 4,
          actualVersion: 5,
        },
        409
      );
    }
    return jsonResponse(responses[actionResponseIndex++]);
  });
  const context = {
    expectedSha: SHA,
    fundId: 7,
    action,
    expectedVersion: action === 'readback' ? undefined : 4,
    referenceId: action === 'activate' ? 9 : undefined,
    vercelProjectId: 'project',
    vercelDeploymentId: 'deployment',
    canonicalHostname: 'updog.example',
    releaseManifest: {
      runId: '101',
      runAttempt: 1,
      artifactId: '202',
      artifactName: `release-evidence-manifest-v1-101-1-${SHA}`,
      artifactArchiveSha256: `sha256:${'c'.repeat(64)}`,
      fileSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    },
    databaseName: 'production',
    directHostFingerprint: FINGERPRINT,
  };
  const manifest = {
    source: { sha: SHA },
    workflow: {
      runId: '101',
      runAttempt: 1,
      manifestArtifactName: context.releaseManifest.artifactName,
    },
    release: {
      vercel: {
        projectId: 'project',
        deploymentId: 'deployment',
        hostname: 'updog.example',
        sourceSha: SHA,
      },
    },
  };
  const liveMainValues = [...(overrides.liveMainValues ?? [SHA, SHA])];
  const execute = () =>
    executeCurrentForecastProductionAction({
      context: { ...context, ...(overrides.context ?? {}) },
      secrets: {
        releaseManifestPath: manifestPath,
        vercelToken: 'vercel-token',
        vercelOrgId: 'org',
        databaseUrl: overrides.databaseUrl ?? DATABASE_URL,
        protectedDatabaseName: overrides.protectedDatabaseName ?? 'production',
        protectedDirectHostFingerprint: overrides.protectedFingerprint ?? FINGERPRINT,
        username: 'operator',
        password: 'password',
        bypassSecret: 'bypass',
      },
      fetchImpl,
      clientFactory: () => client,
      readLiveMainShaImpl: vi.fn(async () => {
        calls.push('git:main');
        return liveMainValues.shift() ?? SHA;
      }),
      manifestParser:
        overrides.manifestParser ??
        vi.fn(async () => {
          calls.push('manifest:schema');
          return overrides.manifest ?? manifest;
        }),
      sleepImpl: vi.fn(),
      uuidFactory: vi.fn().mockReturnValueOnce('same-key').mockReturnValueOnce('fresh-key'),
      now: () => new Date(NOW),
    });
  return { execute, calls, client, fetchImpl, getMutationCalls: () => mutationCalls };
}

describe('Current Forecast production action mapping', { retry: 0 }, () => {
  it('maps only existing routes', () => {
    expect(buildActionRequest({ action: 'kill', fundId: 7, expectedVersion: 4 })).toEqual({
      method: 'PUT',
      path: '/api/admin/funds/7/calculation-modes/current-forecast',
      body: { expectedVersion: 4, configuredMode: 'off', killSwitchActive: true },
    });
    expect(
      buildActionRequest({
        action: 'activate',
        fundId: 7,
        expectedVersion: 4,
        referenceId: 9,
      })
    ).toMatchObject({ method: 'POST', path: '/api/admin/funds/7/current-forecast/activate' });
    expect(buildActionRequest({ action: 'readback', fundId: 7 })).toBeNull();
  });

  it('refuses pooled database URLs and emits one-way fingerprints', () => {
    expect(FINGERPRINT).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => databaseHostFingerprint('postgres://u:p@ep-pooler.neon.tech/db')).toThrow(
      /pooled/i
    );
  });

  it('uses strict ReleaseEvidenceManifestV1Schema validation', async () => {
    await expect(
      parseReleaseEvidenceManifest({ schemaVersion: 'release-evidence-manifest-v1' })
    ).rejects.toThrow();
  });
});

describe('Current Forecast production action fences', { retry: 0 }, () => {
  it('stops before I/O when protected database identity differs', async () => {
    const harness = await createHarness('kill', { protectedDatabaseName: 'other' });
    await expect(harness.execute()).rejects.toThrow(/protected identity/i);
    expect(harness.fetchImpl).not.toHaveBeenCalled();
    expect(harness.client.connect).not.toHaveBeenCalled();
  });

  it.each([
    ['live main', { liveMainValues: ['b'.repeat(40)] }, /Live main SHA mismatch/],
    [
      'manifest schema',
      {
        manifestParser: vi.fn(async () => {
          throw new Error('bad');
        }),
      },
      /schema/,
    ],
    [
      'manifest identity',
      { manifest: { source: { sha: 'b'.repeat(40) }, workflow: {}, release: null } },
      /identity/,
    ],
    ['Vercel identity', { vercelBody: { id: 'wrong' } }, /Canonical promotion/],
    [
      'provider evidence contract',
      {
        vercelBody: {
          id: 'deployment',
          projectId: 'project',
          readyState: 'READY',
          target: 'production',
          aliases: ['updog.example'],
          meta: { githubCommitSha: SHA },
        },
      },
      /Provider evidence contract failed: Vercel deployment URL is required/,
    ],
    [
      'API production environment',
      {
        versionBody: {
          version: '1.6.0',
          commit: SHA,
          nodeVersion: 'v22.23.2',
          platform: 'linux',
          arch: 'x64',
          environment: 'preview',
          timestamp: NOW,
        },
      },
      /version identity/,
    ],
    ['database name', { databaseName: 'other' }, /database identity/],
    ['migration tail', { migrationCreatedAt: '1788235843533' }, /migration tail/],
    [
      'health host fingerprint',
      {
        healthBody: {
          database: 'connected',
          status: 'ok',
          databaseName: 'production',
          databaseUrlHostFingerprint: `sha256:${'d'.repeat(64)}`,
          timestamp: NOW,
        },
      },
      /API database identity/,
    ],
    [
      'expected version',
      { modeRows: [actionFixture('kill').before], context: { expectedVersion: 3 } },
      /expected version/,
    ],
    ['final live main', { liveMainValues: [SHA, 'b'.repeat(40)] }, /Final live main SHA mismatch/],
  ])('refuses %s mismatch with zero unsafe requests', async (_name, overrides, message) => {
    const harness = await createHarness('kill', overrides);
    await expect(harness.execute()).rejects.toThrow(message);
    expect(harness.getMutationCalls()).toBe(0);
  });
});

describe('Current Forecast production action execution', { retry: 0 }, () => {
  it.each(['enter-shadow', 'activate', 'kill', 'resume'])(
    'executes %s with same-key replay and exact direct/resolver post-state',
    async (action) => {
      const fixture = actionFixture(action);
      const modeRows =
        action === 'activate'
          ? [fixture.before, fixture.after, fixture.after]
          : [fixture.before, fixture.after];
      const harness = await createHarness(action, { modeRows });

      const result = await harness.execute();

      expect(result.action).toBe(action);
      expect(result.before.modeRow.version).toBe(4);
      expect(result.after.modeRow.version).toBe(5);
      expect(result.probes.replayed).toBe(true);
      expect(harness.getMutationCalls()).toBe(action === 'activate' ? 3 : 2);
      if (action === 'kill') {
        expect(result.after).toMatchObject({
          modeRow: { configuredMode: 'off', effectiveMode: 'off', killSwitchActive: true },
          servingResolver: { mode: 'held', cutoverReferenceId: 9, heldReason: 'kill_switch' },
        });
      }
      if (action === 'activate') expect(result.probes.freshKeyConflictStatus).toBe(409);
    }
  );

  it('orders identity, session, mode, final main, initial request, replay', async () => {
    const harness = await createHarness('kill');
    await harness.execute();
    const normalized = harness.calls.map((call) =>
      call.startsWith('mutation:') ? 'mutation' : call
    );
    expect(normalized).toEqual([
      'git:main',
      'manifest:schema',
      'provider',
      'api:version',
      'db:connect',
      'db:identity',
      'db:migration-tail',
      'api:bootstrap-csrf',
      'api:login',
      'api:health',
      'db:mode',
      'api:refresh-csrf',
      'git:main',
      'mutation',
      'mutation',
      'db:mode',
      'db:end',
    ]);
  });

  it('refuses wrong fresh-key activation 409 even when database state is unchanged', async () => {
    const fixture = actionFixture('activate');
    const harness = await createHarness('activate', {
      modeRows: [fixture.before, fixture.after],
      conflictBody: {
        error: 'activation_blocked',
        expectedVersion: 4,
        actualVersion: 5,
      },
    });
    await expect(harness.execute()).rejects.toThrow(/Fresh-key activation conflict probe failed/);
    expect(harness.getMutationCalls()).toBe(3);
  });

  it('readback emits identity and serving state without CSRF refresh or mutation', async () => {
    const fixture = actionFixture('kill');
    const harness = await createHarness('readback', { modeRows: [fixture.after] });
    const result = await harness.execute();
    expect(result).toMatchObject({
      action: 'readback',
      state: { servingResolver: { mode: 'held', cutoverReferenceId: 9 } },
      identity: { sourceSha: SHA, database: { databaseName: 'production' } },
    });
    expect(harness.getMutationCalls()).toBe(0);
    expect(harness.calls).not.toContain('api:refresh-csrf');
  });

  it.each([
    [
      'mapped HTTP response',
      {
        actionResponses: [
          { ...actionFixture('kill').initial, effectiveMode: 'on' },
          actionFixture('kill').replay,
        ],
      },
    ],
    [
      'database post-state',
      {
        modeRows: [
          actionFixture('kill').before,
          modeRow({
            configuredMode: 'off',
            killSwitchActive: true,
            version: 5,
            activatedAt: '2026-09-05T10:00:00.000Z',
            cutoverReferenceId: 10,
          }),
        ],
      },
    ],
    [
      'serving resolver held pointer',
      {
        modeRows: [
          actionFixture('kill').before,
          modeRow({
            configuredMode: 'off',
            killSwitchActive: true,
            version: 5,
            activatedAt: '2026-09-05T10:00:00.000Z',
            cutoverReferenceId: null,
          }),
        ],
      },
    ],
  ])('fails after HTTP 200 on bad %s', async (_name, overrides) => {
    const harness = await createHarness('kill', overrides);
    await expect(harness.execute()).rejects.toThrow();
    expect(harness.getMutationCalls()).toBeGreaterThan(0);
  });
});
