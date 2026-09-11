import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FundScenarioCapitalCalculateResponseV1Schema,
  FundScenarioCapitalCreateResponseV1Schema,
  FundScenarioCapitalDetailResponseV1Schema,
  FundScenarioCapitalResultsResponseV1Schema,
} from '../../shared/contracts/fund-scenario-sets-v1.contract';
import { CapitalPlanningDraftV1Schema } from '../../shared/contracts/capital-planning-v1.contract';
import { CAPITAL_BENCHMARK_CATALOG_VERSION } from '../../shared/lib/capital-planning/benchmark-presets';
import {
  makeCapitalInput,
  makeCapitalRawConfig,
  makeCapitalDeclarations,
} from '../fixtures/capital-planning/fixtures';
import { fingerprintCapitalSource } from '../../shared/lib/capital-planning/materialize-from-fund-draft';
import { createCapitalScenarioInputHash } from '../../server/lib/scenarios/scenario-input-hash';
import {
  makeCapitalCreateBody,
  startCapitalScenarioHttpRuntime,
  type CapitalHttpRuntime,
  type CapitalHttpResponse,
} from '../helpers/capital-scenario-http-runtime';

import { inspectCapitalRefusal } from '../helpers/capital-scenario-refusal-proof';

const EVIDENCE =
  process.env['CAPITAL_TEST_EVIDENCE_DIR'] ?? path.resolve('.test-artifacts/capital-persistence');
const SELECTOR = '?representation=capital-plan-v1';
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let runtime: CapitalHttpRuntime;
const evidence: unknown[] = [];
const setPath = (id = '') => `/api/funds/${runtime.fundId}/scenario-sets${id ? `/${id}` : ''}`;
function parsedCreate(response: CapitalHttpResponse) {
  expect(response.status, response.rawBody.toString()).toBe(201);
  return FundScenarioCapitalCreateResponseV1Schema.parse(response.body);
}
function parsedCalculation(response: CapitalHttpResponse) {
  expect(response.status, response.rawBody.toString()).toBe(200);
  return FundScenarioCapitalCalculateResponseV1Schema.parse(response.body);
}
async function create(body = makeCapitalCreateBody(runtime), key = randomUUID()) {
  const response = await runtime.request('POST', setPath() + SELECTOR, {
    body,
    headers: { 'Idempotency-Key': key },
  });
  return { body, key, response, id: parsedCreate(response).scenarioSetId };
}
async function archive(id: string) {
  const response = await runtime.request('POST', `${setPath(id)}/archive${SELECTOR}`, { body: {} });
  expect(response.status, response.rawBody.toString()).toBe(200);
}
async function unchanged(
  label: string,
  run: () => Promise<CapitalHttpResponse>,
  status: number,
  code?: string
) {
  const before = await runtime.snapshot();
  const response = await run();
  expect(response.status, response.rawBody.toString()).toBe(status);
  if (code) expect(response.body).toMatchObject({ code });
  const after = await runtime.snapshot();
  expect(after).toEqual(before);
  const refusalProof = status >= 400 ? inspectCapitalRefusal(response, before) : undefined;
  evidence.push({ label, status, responseBody: response.body, before, after, refusalProof });
  if (refusalProof) expect(refusalProof.violations).toEqual([]);
  return response;
}

describe('B8 capital persistence through actual application and migrated PostgreSQL', () => {
  beforeAll(async () => {
    await mkdir(EVIDENCE, { recursive: true });
    runtime = await startCapitalScenarioHttpRuntime({
      label: 'persistence',
      evidenceDir: EVIDENCE,
      rateLimitMax: 1000,
    });
  }, 120_000);
  afterAll(async () => {
    if (runtime) {
      const lifecycle = await runtime.close();
      evidence.push({ lifecycle });
      expect(lifecycle.api.graceful).toBe(true);
      expect(lifecycle.containerStopped).toBe(true);
      expect(lifecycle.errors).toEqual([]);
    }
    await writeFile(
      path.join(EVIDENCE, 'persistence-cases.json'),
      `${JSON.stringify(evidence, null, 2)}\n`
    );
  }, 30_000);

  it('records actual application database identity and non-bypass role separately from policy presence', async () => {
    expect(runtime.identity['mode']).toBe('process');
    expect(runtime.identity['migratedThrough']).toBe('0058_capital_plan_override');
    expect(runtime.identity['roleState']).toEqual([
      expect.objectContaining({ rolsuper: false, rolbypassrls: false }),
    ]);
    const identity = runtime.identity['database'] as { role: string };
    expect(
      (runtime.identity['relations'] as Array<{ owner: string }>).every(
        (r) => r.owner !== identity.role
      )
    ).toBe(true);
    evidence.push({
      effectiveDatabasePolicies: runtime.identity['policies'],
      claim:
        'Actual app request-context boundary; database-policy isolation is not inferred from absent policies.',
    });
  });

  it('DUR-R3-001/WIRE-R3-013 accepts only V3 capital creates and requires capital selector for existing-set mutations', async () => {
    const body = makeCapitalCreateBody(runtime);
    const key = randomUUID();
    const response = await runtime.request('POST', setPath(), {
      body,
      headers: { 'Idempotency-Key': key },
    });
    const id = parsedCreate(response).scenarioSetId;
    for (const version of ['fund-scenario-set-create/1.0.0', 'fund-scenario-set-create/2.0.0']) {
      const legacyBody = { ...makeCapitalCreateBody(runtime), contractVersion: version };
      await unchanged(
        `DUR-V3-only-${version}`,
        () =>
          runtime.request('POST', setPath() + SELECTOR, {
            body: legacyBody,
            headers: { 'Idempotency-Key': randomUUID() },
          }),
        406
      );
    }
    for (const command of ['calculate', 'archive'])
      await unchanged(
        `WIRE-capital-${command}-selector`,
        () => runtime.request('POST', `${setPath(id)}/${command}`, { body: {} }),
        406
      );
    await archive(id);
  });

  it('persists stable variant identities and server-owned benchmark snapshots, then preserves full saved results on reload', async () => {
    const inputs = ['5000000.000000', '6000000.000000'].map((totalPrimaryRoundUsd) =>
      CapitalPlanningDraftV1Schema.parse({
        input: makeCapitalInput(),
        benchmarkSelections: [
          {
            target: { allocationId: 'a1', kind: 'entry' },
            selector: { version: CAPITAL_BENCHMARK_CATALOG_VERSION, stage: 'seed' },
            overrides: { totalPrimaryRoundUsd },
          },
        ],
      })
    );
    const body = makeCapitalCreateBody(runtime, { inputs });
    const before = await runtime.snapshot();
    const saved = await create(body);
    expect(saved.response.body).toEqual({
      contractVersion: 'fund-scenario-capital-create/1.0.0',
      representation: 'capital-plan-v1',
      scenarioSetId: saved.id,
    });
    const detailResponse = await runtime.request('GET', setPath(saved.id) + SELECTOR);
    const detail = FundScenarioCapitalDetailResponseV1Schema.parse(detailResponse.body);
    expect(detail.variants.map((v) => v.id)).toEqual(body.variants.map((v) => v.variantId));
    expect(detail.baselineVariantId).toBe(body.baselineVariantId);
    for (const variant of detail.variants) {
      expect(variant.override.payload).toHaveProperty('benchmarkSnapshots');
      expect(variant.override.payload.sourceBundleHash).toBe(body.expectedSourceBundleHash);
    }
    const uncalculated = await runtime.request('GET', `${setPath(saved.id)}/results${SELECTOR}`);
    expect(
      FundScenarioCapitalResultsResponseV1Schema.parse(uncalculated.body).savedResult
    ).toBeNull();
    const calculated = await runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, {
      body: {},
    });
    const response = parsedCalculation(calculated);
    const stored = await runtime.pool.query<{
      payload: unknown;
      state_hash: string;
      correlation_id: string;
    }>('SELECT payload,state_hash,correlation_id FROM fund_snapshots WHERE id=$1', [
      response.snapshotId,
    ]);
    expect(stored.rows[0]).toMatchObject({
      payload: response.payload,
      state_hash: response.payload.inputHash,
      correlation_id: response.correlationId,
    });
    const reload = FundScenarioCapitalResultsResponseV1Schema.parse(
      (await runtime.request('GET', `${setPath(saved.id)}/results${SELECTOR}`)).body
    );
    expect(reload.savedResult?.payload).toEqual(response.payload);
    expect(reload.savedResult?.snapshotId).toBe(response.snapshotId);
    expect(response.payload.variants[0]!.result.construction.monthlyDetail.length).toBeGreaterThan(
      0
    );
    const complete = await runtime.snapshot();
    expect(
      complete.tables['fund_scenario_sets']!.length - before.tables['fund_scenario_sets']!.length
    ).toBe(1);
    expect(
      complete.tables['fund_scenario_variants']!.length -
        before.tables['fund_scenario_variants']!.length
    ).toBe(2);
    expect(
      complete.tables['fund_scenario_calculation_runs']!.length -
        before.tables['fund_scenario_calculation_runs']!.length
    ).toBe(1);
    expect(
      complete.tables['fund_snapshots']!.length - before.tables['fund_snapshots']!.length
    ).toBe(1);
    evidence.push({
      label: 'server-owned-benchmark-persistence',
      before,
      after: complete,
      response: calculated.body,
    });
    await archive(saved.id);
  });

  it.each(['configId', 'configVersion', 'sourceBundleHash'] as const)(
    'DUR-R3-003 refuses fresh-create stale %s without changing a retained completed result',
    async (pin) => {
      const saved = await create();
      const completedResponse = await runtime.request(
        'POST',
        `${setPath(saved.id)}/calculate${SELECTOR}`,
        { body: {} }
      );
      const completed = parsedCalculation(completedResponse);
      const fresh = makeCapitalCreateBody(runtime);
      const current = {
        currentSourceConfigId: fresh.expectedSourceConfigId,
        currentSourceConfigVersion: fresh.expectedSourceConfigVersion,
        currentSourceBundleHash: fresh.expectedSourceBundleHash,
      };
      if (pin === 'configId') fresh.expectedSourceConfigId += 1;
      if (pin === 'configVersion') fresh.expectedSourceConfigVersion += 1;
      if (pin === 'sourceBundleHash') {
        fresh.expectedSourceBundleHash = `${fresh.expectedSourceBundleHash[0] === '0' ? '1' : '0'}${fresh.expectedSourceBundleHash.slice(1)}`;
      }
      const response = await unchanged(
        `DUR-R3-003-fresh-create-stale-${pin}`,
        () =>
          runtime.request('POST', setPath() + SELECTOR, {
            body: fresh,
            headers: { 'Idempotency-Key': randomUUID() },
          }),
        409,
        'scenario_source_config_stale'
      );
      expect(response.body).toMatchObject({
        code: 'scenario_source_config_stale',
        details: {
          suppliedSourceConfigId: fresh.expectedSourceConfigId,
          suppliedSourceConfigVersion: fresh.expectedSourceConfigVersion,
          suppliedSourceBundleHash: fresh.expectedSourceBundleHash,
          ...current,
        },
      });
      const reloaded = await runtime.request('GET', `${setPath(saved.id)}/results${SELECTOR}`);
      expect(reloaded.status).toBe(200);
      expect(
        FundScenarioCapitalResultsResponseV1Schema.parse(reloaded.body).savedResult?.payload
      ).toEqual(completed.payload);
      await archive(saved.id);
    }
  );

  it('positively controls the shared refusal proof without treating counters or source pins as saved IDs', () => {
    const setId = 'a1111111-1111-4111-8111-111111111111';
    const variantId = 'b2222222-2222-4222-8222-222222222222';
    const before: Awaited<ReturnType<CapitalHttpRuntime['snapshot']>> = {
      tables: {
        fund_scenario_sets: [{ id: setId, row: '{}', rowBinary: '' }],
        fund_scenario_variants: [{ id: variantId, row: '{}', rowBinary: '' }],
        fund_scenario_calculation_runs: [{ id: '1', row: '{}', rowBinary: '' }],
        fund_snapshots: [{ id: '2', row: '{}', rowBinary: '' }],
      },
      payloads: [],
      sha256: 'a'.repeat(64),
    };
    const proof = (body: unknown) =>
      inspectCapitalRefusal(
        {
          status: 422,
          headers: {},
          body,
          rawBody: Buffer.from(JSON.stringify(body)),
          elapsedMs: 0,
        },
        before
      );
    expect(
      proof({
        code: 'INPUT_TOO_LARGE',
        details: {
          limit: 1,
          observed: 2,
          suppliedSourceConfigId: 1,
          currentSourceConfigVersion: 2,
          variants: { _errors: [], payload: { _errors: ['Invalid caller input'] } },
        },
      }).violations
    ).toEqual([]);
    for (const body of [
      { error: setId },
      { error: variantId },
      { snapshotId: 2 },
      { runId: 1 },
      { id: 1 },
      { ids: [1, 2] },
      { run: { id: 1 } },
      { runs: [{ id: 1 }] },
      { calculationRun: { id: 1 } },
      { calculationRuns: [{ id: 1 }] },
      { snapshots: [{ id: 2 }] },
      { details: { id: 2 } },
      { payload: { monthlyDetail: [] } },
      { savedResult: null },
      { message: JSON.stringify({ payload: { monthlyDetail: [] } }) },
    ])
      expect(proof(body).violations.length).toBeGreaterThan(0);
    evidence.push({
      label: 'refusal-proof-positive-controls',
      scope: 'Assertion-control support only; synthetic failure shapes do not prove HTTP behavior.',
      storedSetUuid: setId,
      storedVariantUuid: variantId,
    });
  });

  it('replays the exact create acknowledgement before changed source and archive state without new rows', async () => {
    const saved = await create();
    await archive(saved.id);
    const original = await runtime.pool.query<{ config: unknown }>(
      'SELECT config FROM fundconfigs WHERE id=$1',
      [runtime.source.config.id]
    );
    await runtime.pool.query(
      "UPDATE fundconfigs SET config=jsonb_set(config,'{fundName}','\"Changed after create\"') WHERE id=$1",
      [runtime.source.config.id]
    );
    try {
      const replay = await unchanged(
        'create-replay-after-source-change-and-archive',
        () =>
          runtime.request('POST', setPath() + SELECTOR, {
            body: saved.body,
            headers: { 'Idempotency-Key': saved.key },
          }),
        201
      );
      expect(replay.rawBody).toEqual(saved.response.rawBody);
      const changed = structuredClone(saved.body);
      changed.name += ' changed';
      await unchanged(
        'create-key-conflict-before-source-CAS',
        () =>
          runtime.request('POST', setPath() + SELECTOR, {
            body: changed,
            headers: { 'Idempotency-Key': saved.key },
          }),
        422,
        'idempotency_key_reused'
      );
    } finally {
      await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
        runtime.source.config.id,
        original.rows[0]!.config,
      ]);
    }
  });

  it.each([
    'unauthenticated',
    'wrong-fund',
    'write-role',
    'cookie-missing',
    'cookie-mismatch',
    'cookie-wrong-jti',
    'cookie-cross-site',
  ] as const)(
    'denies %s before disclosure or create replay with no database changes',
    async (kind) => {
      const body = makeCapitalCreateBody(runtime);
      const saved = await create(body);
      const options: Parameters<CapitalHttpRuntime['request']>[2] = {
        body,
        headers: { 'Idempotency-Key': saved.key },
      };
      if (kind === 'unauthenticated') options.credential = 'none';
      if (kind === 'wrong-fund') options.actor = runtime.actors.deniedFund;
      if (kind === 'write-role') options.actor = runtime.actors.service;
      if (kind.startsWith('cookie')) {
        options.credential = 'cookie';
        if (kind === 'cookie-missing') options.headers = { ...options.headers, 'X-CSRF-Token': '' };
        if (kind === 'cookie-mismatch')
          options.headers = { ...options.headers, 'X-CSRF-Token': 'invalid' };
        if (kind === 'cookie-wrong-jti')
          options.headers = {
            ...options.headers,
            Cookie: `updog.session=${runtime.actors.writer.sessionToken}; updog.csrf=${runtime.actors.dualFund.csrfToken}`,
            'X-CSRF-Token': runtime.actors.dualFund.csrfToken,
          };
        if (kind === 'cookie-cross-site')
          options.headers = { ...options.headers, 'Sec-Fetch-Site': 'cross-site' };
      }
      const response = await unchanged(
        `guard-${kind}`,
        () => runtime.request('POST', setPath() + SELECTOR, options),
        kind === 'unauthenticated' ? 401 : 403
      );
      expect(response.rawBody.toString()).not.toContain(saved.id);
      await archive(saved.id);
    }
  );

  it('accepts valid cookie CSRF and keeps same keys scoped by target fund without wrong-fund identity disclosure', async () => {
    const saved = await create();
    const cookieReplay = await unchanged(
      'valid-cookie-create-replay',
      () =>
        runtime.request('POST', setPath() + SELECTOR, {
          credential: 'cookie',
          body: saved.body,
          headers: { 'Idempotency-Key': saved.key },
        }),
      201
    );
    expect(cookieReplay.rawBody).toEqual(saved.response.rawBody);
    await unchanged(
      'authorized-second-fund-copied-pin',
      () =>
        runtime.request('POST', `/api/funds/${runtime.secondFundId}/scenario-sets${SELECTOR}`, {
          actor: runtime.actors.dualFund,
          body: saved.body,
          headers: { 'Idempotency-Key': saved.key },
        }),
      409,
      'scenario_source_config_stale'
    );
    for (const action of ['calculate', 'archive'])
      await unchanged(
        `wrong-fund-${action}`,
        () =>
          runtime.request(
            'POST',
            `/api/funds/${runtime.secondFundId}/scenario-sets/${saved.id}/${action}${SELECTOR}`,
            { actor: runtime.actors.dualFund, body: {} }
          ),
        404,
        'scenario_set_not_found'
      );
    await archive(saved.id);
  });

  it.each([
    '',
    'unknown',
    'capital-plan-v1&representation=capital-plan-v1',
    'capital-plan-v1&representation[]=capital-plan-v1',
  ])('refuses malformed representation %s without create writes', async (representation) => {
    await unchanged(
      `selector-${representation}`,
      () =>
        runtime.request('POST', `${setPath()}?representation=${representation}`, {
          body: makeCapitalCreateBody(runtime),
        }),
      400
    );
  });

  it.each([
    'set-name',
    'variant-name',
    'variant-count',
    'allocation-count',
    'transport',
    'client-provenance',
  ] as const)(
    'refuses independent %s admission boundary without any persisted changes',
    async (kind) => {
      const body = makeCapitalCreateBody(runtime);
      if (kind === 'set-name') body.name = 'x'.repeat(121);
      if (kind === 'variant-name') body.variants[0]!.name = 'x'.repeat(121);
      if (kind === 'variant-count') {
        body.variants = Array.from({ length: 6 }, (_, index) => ({
          ...structuredClone(body.variants[0]!),
          variantId: randomUUID(),
          name: `Variant ${index}`,
        }));
        body.baselineVariantId = body.variants[0]!.variantId;
      }
      if (kind === 'allocation-count') {
        const input = makeCapitalInput();
        input.allocations = Array.from({ length: 11 }, (_, index) => ({
          ...input.allocations[0]!,
          allocationId: `a${index}`,
          name: `A${index}`,
          budgetShareRatio: '0.090909090909',
        }));
        body.variants[0]!.override.payload = input;
      }
      if (kind === 'client-provenance')
        Object.assign(body.variants[0]!.override.payload, { provenance: [] });
      if (kind === 'transport') {
        const prefix = Buffer.from(JSON.stringify(body));
        const rawBody = Buffer.concat([prefix, Buffer.alloc(262145 - prefix.byteLength, ' ')]);
        expect(rawBody.byteLength).toBe(262145);
        await unchanged(
          kind,
          () => runtime.request('POST', setPath() + SELECTOR, { rawBody }),
          413
        );
      } else
        await unchanged(kind, () => runtime.request('POST', setPath() + SELECTOR, { body }), 422);
    }
  );

  it('returns exact completed calculation bytes under serial/concurrent replay and records one run, snapshot and calculated event', async () => {
    const saved = await create();
    const results = await Promise.all(
      [1, 2].map(() =>
        runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, { body: {} })
      )
    );
    results.forEach(parsedCalculation);
    expect(results[0]!.rawBody).toEqual(results[1]!.rawBody);
    const replay = await unchanged(
      'completed-calculation-replay',
      () => runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, { body: {} }),
      200
    );
    expect(replay.rawBody).toEqual(results[0]!.rawBody);
    const counts = await runtime.pool.query<{ runs: number; snapshots: number; events: number }>(
      `SELECT
      (SELECT count(*)::int FROM fund_scenario_calculation_runs WHERE scenario_set_id=$1) AS runs,
      (SELECT count(*)::int FROM fund_snapshots WHERE scenario_set_id=$1) AS snapshots,
      (SELECT count(*)::int FROM fund_scenario_set_events WHERE scenario_set_id=$1 AND event_type='calculated') AS events`,
      [saved.id]
    );
    expect(counts.rows[0]).toEqual({ runs: 1, snapshots: 1, events: 1 });
    await runtime.pool.query(
      "UPDATE fund_scenario_calculation_runs SET status='running' WHERE scenario_set_id=$1",
      [saved.id]
    );
    await unchanged(
      'explicit-active-run-conflict',
      () => runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, { body: {} }),
      409,
      'scenario_calculation_in_progress'
    );
    await runtime.pool.query(
      "UPDATE fund_scenario_calculation_runs SET status='completed' WHERE scenario_set_id=$1",
      [saved.id]
    );
    await archive(saved.id);
  });

  it('refuses changed historical source before acquiring a new run, while completed replay remains immutable', async () => {
    const pending = await create();
    const done = await create();
    const first = await runtime.request('POST', `${setPath(done.id)}/calculate${SELECTOR}`, {
      body: {},
    });
    parsedCalculation(first);
    const original = await runtime.pool.query<{ config: unknown }>(
      'SELECT config FROM fundconfigs WHERE id=$1',
      [runtime.source.config.id]
    );
    await runtime.pool.query(
      "UPDATE fundconfigs SET config=jsonb_set(config,'{fundName}','\"Mutated historical source\"') WHERE id=$1",
      [runtime.source.config.id]
    );
    try {
      await unchanged(
        'historical-integrity-new-run-refusal',
        () => runtime.request('POST', `${setPath(pending.id)}/calculate${SELECTOR}`, { body: {} }),
        422,
        'HISTORICAL_SOURCE_INTEGRITY_FAILED'
      );
      const replay = await unchanged(
        'completed-replay-before-historical-integrity',
        () => runtime.request('POST', `${setPath(done.id)}/calculate${SELECTOR}`, { body: {} }),
        200
      );
      expect(replay.rawBody).toEqual(first.rawBody);
    } finally {
      await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
        runtime.source.config.id,
        original.rows[0]!.config,
      ]);
    }
    await archive(pending.id);
    await archive(done.id);
  });
});

describe('B8 source admission and saved financial field retention over actual HTTP', () => {
  beforeAll(async () => {
    runtime = await startCapitalScenarioHttpRuntime({
      label: 'financial-admission',
      evidenceDir: EVIDENCE,
      rateLimitMax: 1000,
    });
  }, 120_000);
  afterAll(async () => {
    const lifecycle = await runtime.close();
    evidence.push({ label: 'financial-admission-lifecycle', lifecycle });
    expect(lifecycle.api.graceful).toBe(true);
    expect(lifecycle.containerStopped).toBe(true);
    expect(lifecycle.errors).toEqual([]);
    await writeFile(
      path.join(EVIDENCE, 'persistence-cases.json'),
      `${JSON.stringify(evidence, null, 2)}\n`
    );
  }, 30_000);

  type Raw = ReturnType<typeof makeCapitalRawConfig>;
  type Refusal = {
    id: string;
    code?: string;
    status?: number;
    raw?: (raw: Raw) => void;
    input?: (input: ReturnType<typeof makeCapitalInput>) => void;
    currency?: string;
    declarations?: (declarations: ReturnType<typeof makeCapitalDeclarations>) => void;
    prepare?: (raw: Raw, declarations: ReturnType<typeof makeCapitalDeclarations>) => void;
  };
  function legacyFee(raw: Raw, declarations: ReturnType<typeof makeCapitalDeclarations>) {
    delete raw.economicsAssumptions!.feeModel!.tiers;
    raw.feeProfiles = [
      {
        id: 'legacy-fee',
        name: 'Legacy',
        feeTiers: [
          {
            id: 't1',
            name: 'Fee',
            percentage: 2,
            feeBasis: 'committed_capital',
            startMonth: 0,
            endMonth: 23,
          },
        ],
      },
    ];
    declarations['feeProfiles[0].feeTiers[0].percentage'] = 'percent_points';
    declarations['feeProfiles[0].feeTiers[0].startMonth'] = 'fund_month_zero_based';
    declarations['feeProfiles[0].feeTiers[0].endMonth'] = 'fund_month_zero_based';
  }
  const refusalCases: Refusal[] = [
    ...[-1, 101].map((percentage) => ({
      id: `FEE-R3-015-${percentage}`,
      code: 'FEE_RATE_INVALID',
      prepare: (raw: Raw, d: ReturnType<typeof makeCapitalDeclarations>) => {
        legacyFee(raw, d);
        raw.feeProfiles![0]!.feeTiers[0]!.percentage = percentage;
      },
    })),
    {
      id: 'FEE-R3-015-ratio',
      code: 'FEE_RATE_INVALID',
      prepare: (raw, d) => {
        legacyFee(raw, d);
        raw.feeProfiles![0]!.feeTiers[0]!.percentage = 1.01;
        d['feeProfiles[0].feeTiers[0].percentage'] = 'ratio';
      },
    },
    {
      id: 'FEE-R3-011-multiple',
      code: 'FEE_PROFILE_APPLICABILITY_UNSUPPORTED',
      prepare: (raw, d) => {
        legacyFee(raw, d);
        raw.feeProfiles!.push({ ...raw.feeProfiles![0]!, id: 'second' });
      },
    },
    {
      id: 'FEE-R3-011-empty',
      code: 'FEE_MODEL_UNRESOLVED',
      prepare: (raw, d) => {
        legacyFee(raw, d);
        raw.feeProfiles![0]!.feeTiers = [];
      },
    },
    {
      id: 'FEE-R3-008-legacy-malformed',
      code: 'INVALID_INPUT',
      status: 409,
      prepare: (raw, d) => {
        legacyFee(raw, d);
        Object.assign(raw.feeProfiles![0]!.feeTiers[0]!, { percentage: '2' });
      },
    },
    {
      id: 'FEE-PERIOD-PROVISIONAL',
      code: 'FEE_PERIOD_NOT_REPRESENTABLE',
      prepare: (raw, d) => {
        legacyFee(raw, d);
        raw.feeProfiles![0]!.feeTiers[0]!.startMonth = 6;
      },
    },
    {
      id: 'FEE-R3-014-origin',
      code: 'TIME_ORIGIN_UNRESOLVED',
      prepare: (raw, d) => {
        legacyFee(raw, d);
        d['feeProfiles[0].feeTiers[0].endMonth'] = 'fund_month_one_based';
      },
    },
    {
      id: 'FEE-R3-014-missing-origin',
      code: 'TIME_ORIGIN_UNRESOLVED',
      prepare: (raw, d) => {
        legacyFee(raw, d);
        delete d['feeProfiles[0].feeTiers[0].endMonth'];
      },
    },
    {
      id: 'FEE-R3-012-unit',
      code: 'UNIT_PROVENANCE_UNRESOLVED',
      prepare: (raw, d) => {
        legacyFee(raw, d);
        delete d['feeProfiles[0].feeTiers[0].percentage'];
      },
    },
    {
      id: 'FEE-R3-012-rate',
      code: 'FEE_RATE_INVALID',
      prepare: (raw, d) => {
        legacyFee(raw, d);
        d['feeProfiles[0].feeTiers[0].percentage'] = 'ratio';
      },
    },
    {
      id: 'FEE-R3-016-monthly-negative',
      code: 'EXPENSE_AMOUNT_INVALID',
      prepare: (raw, d) => {
        delete raw.economicsAssumptions!.expenseModel!.annualExpenses;
        raw.fundExpenses = [
          { id: 'monthly', category: 'Other', monthlyAmount: -1, startMonth: 0, endMonth: 23 },
        ];
        d['fundExpenses[0].monthlyAmount'] = 'usd';
        d['fundExpenses[0].startMonth'] = 'fund_month_zero_based';
        d['fundExpenses[0].endMonth'] = 'fund_month_zero_based';
      },
    },
    {
      id: 'SRCB-R3-012-size-mismatch',
      code: 'FUND_SIZE_SOURCE_MISMATCH',
      raw: (r) => {
        r.fundSize = 101;
      },
    },
    {
      id: 'GP-R3-007',
      code: 'GP_COMMITMENT_UNRESOLVED',
      raw: (r) => {
        delete r.economicsAssumptions!.gpCommitmentModel;
      },
    },
    {
      id: 'GP-R3-014',
      code: 'INVALID_INPUT',
      status: 409,
      raw: (r) => {
        r.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = -1;
        r.gpCommitment = 5;
      },
    },
    {
      id: 'GP-R3-015',
      code: 'INVALID_INPUT',
      status: 409,
      raw: (r) => {
        delete r.economicsAssumptions!.gpCommitmentModel!.commitmentAmount;
        r.economicsAssumptions!.gpCommitmentModel!.commitmentPct = -0.1;
        r.gpCommitment = 5;
      },
    },
    {
      id: 'GP-R3-016',
      code: 'GP_COMMITMENT_EXCEEDS_COMMITMENTS',
      raw: (r) => {
        r.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 101;
      },
    },
    ...[-0.1, 1.1].map((value) => ({
      id: `GP-R3-017-${value}`,
      code: 'INVALID_INPUT',
      status: 409,
      raw: (r: Raw) => {
        r.fundedFromFeesPct = value;
      },
    })),
    {
      id: 'GP-R3-026',
      input: (i) => {
        i.netInvestableCapitalUsd = '-1.000000';
      },
    },
    {
      id: 'SRC-R3-001',
      code: 'FUND_VEHICLE_MODE_UNSUPPORTED',
      raw: (r) => {
        r.isEvergreen = true;
      },
    },
    {
      id: 'SRC-R3-002',
      code: 'FUND_VEHICLE_MODE_UNRESOLVED',
      raw: (r) => {
        delete r.isEvergreen;
      },
    },
    { id: 'SRC-R3-005-EUR', code: 'FUND_CURRENCY_UNSUPPORTED', currency: 'EUR' },
    { id: 'SRC-R3-005-empty', code: 'FUND_CURRENCY_UNRESOLVED', currency: '' },
    {
      id: 'FEE-R3-003',
      code: 'FEE_TIER_SCHEDULE_REQUIRED',
      raw: (r) => {
        r.economicsAssumptions!.feeModel!.tiers = [];
        r.economicsAssumptions!.feeModel!.defaultRate = 0;
        r.managementFeeRate = 0.02;
      },
    },
    ...[
      'called_capital_period',
      'called_capital_cumulative',
      'called_capital_net_of_returns',
      'invested_capital',
      'fair_market_value',
      'unrealized_cost',
    ].map((basis) => ({
      id: `CP-038/FEE-R3-004-${basis}`,
      code: 'FEE_BASIS_UNSUPPORTED',
      raw: (r: Raw) => {
        Object.assign(r.economicsAssumptions!.feeModel!.tiers![0]!, { basis });
      },
    })),
    {
      id: 'FEE-R3-008',
      code: 'INVALID_INPUT',
      status: 409,
      raw: (r) => {
        Object.assign(r.economicsAssumptions!.feeModel!.tiers![0]!, { basis: 'unknown_basis' });
      },
    },
    {
      id: 'FEE-R3-010-cap',
      code: 'EXPENSE_CAP_UNSUPPORTED',
      raw: (r) => {
        r.economicsAssumptions!.expenseModel!.orgExpenseCap = 0;
      },
    },
    {
      id: 'FEE-R3-010-growth',
      code: 'EXPENSE_GROWTH_UNSUPPORTED',
      raw: (r) => {
        r.economicsAssumptions!.expenseModel!.annualExpenses![0]!.growthRate = 0.1;
      },
    },
    {
      id: 'SRCB-R3-011-fund-unit',
      code: 'UNIT_PROVENANCE_UNRESOLVED',
      declarations: (d) => {
        delete d['funds.size'];
      },
    },
    {
      id: 'SRCB-R3-011-raw-fund-unit',
      code: 'UNIT_PROVENANCE_UNRESOLVED',
      declarations: (d) => {
        delete d['fundSize'];
      },
    },
    {
      id: 'SRCB-R3-011-independent-valuation',
      code: 'UNIT_PROVENANCE_UNRESOLVED',
      declarations: (d) => {
        delete d['pipelineProfiles[0].stages[0].valuation'];
      },
    },
    {
      id: 'SRCB-R3-011-independent-percent',
      code: 'UNIT_PROVENANCE_UNRESOLVED',
      declarations: (d) => {
        delete d['pipelineProfiles[0].stages[0].esopPct'];
      },
    },
    {
      id: 'FEE-R3-016-independent-expense-unit',
      code: 'UNIT_PROVENANCE_UNRESOLVED',
      declarations: (d) => {
        delete d['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
      },
    },
  ];
  it.each(refusalCases)(
    '$id refuses before create writes and retains complete prior state',
    async (fixture) => {
      const source = structuredClone(runtime.source);
      const raw = makeCapitalRawConfig();
      const input = makeCapitalInput();
      const declarations = makeCapitalDeclarations();
      fixture.raw?.(raw);
      fixture.input?.(input);
      fixture.declarations?.(declarations);
      fixture.prepare?.(raw, declarations);
      source.config.raw = raw;
      if (fixture.currency !== undefined) source.fund.baseCurrency = fixture.currency;
      await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
        source.config.id,
        raw,
      ]);
      await runtime.pool.query('UPDATE funds SET base_currency=$2 WHERE id=$1', [
        runtime.fundId,
        source.fund.baseCurrency,
      ]);
      try {
        const body = makeCapitalCreateBody(
          { ...runtime, source },
          { inputs: [input], unitDeclarations: declarations }
        );
        await unchanged(
          fixture.id,
          () =>
            runtime.request('POST', setPath() + SELECTOR, {
              body,
              headers: { 'Idempotency-Key': randomUUID() },
            }),
          fixture.status ?? 422,
          fixture.code
        );
      } finally {
        await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
          runtime.source.config.id,
          runtime.source.config.raw,
        ]);
        await runtime.pool.query('UPDATE funds SET base_currency=$2 WHERE id=$1', [
          runtime.fundId,
          runtime.source.fund.baseCurrency,
        ]);
      }
    }
  );

  it('GP-R3-019/020 saves absent and explicit zero defaults distinctly while preserving raw source bytes and economics', async () => {
    const outputs = [];
    for (const fraction of [undefined, 0]) {
      const source = structuredClone(runtime.source);
      const raw = makeCapitalRawConfig();
      if (fraction === undefined) delete raw.fundedFromFeesPct;
      else raw.fundedFromFeesPct = fraction;
      source.config.raw = raw;
      await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
        source.config.id,
        raw,
      ]);
      const body = makeCapitalCreateBody({ ...runtime, source });
      const rawBefore = await runtime.pool.query(
        'SELECT config::text AS bytes FROM fundconfigs WHERE id=$1',
        [source.config.id]
      );
      const created = await create(body);
      const calculated = parsedCalculation(
        await runtime.request('POST', `${setPath(created.id)}/calculate${SELECTOR}`, { body: {} })
      );
      const result = calculated.payload.variants[0]!.result;
      expect(result.sourceBundle.gp.deemedContributionUsd).toBe('0.000000');
      expect(result.sourceBundle.gp.fundedFromFeesPct.state).toBe(
        fraction === undefined ? 'absent' : 'present'
      );
      expect(
        await runtime.pool
          .query('SELECT config::text AS bytes FROM fundconfigs WHERE id=$1', [source.config.id])
          .then((r) => r.rows)
      ).toEqual(rawBefore.rows);
      outputs.push(result);
      await archive(created.id);
    }
    expect(outputs[0]!.sourceBundle.feeExpense).toEqual(outputs[1]!.sourceBundle.feeExpense);
    expect(outputs[0]!.sourceBundle.sourceBundleHash).not.toBe(
      outputs[1]!.sourceBundle.sourceBundleHash
    );
    await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
      runtime.source.config.id,
      runtime.source.config.raw,
    ]);
    evidence.push({ label: 'GP-R3-019/020', outputs });
  });

  it.each([
    { id: 'GP-R3-023', rate: 0.09, expense: 1, available: '0.000000' },
    { id: 'GP-R3-024/025', rate: 0.1, expense: 2.5, available: '-5.000000' },
  ])(
    '$id persists signed capacity while explicit planning budget remains independent',
    async (fixture) => {
      const source = structuredClone(runtime.source);
      const raw = makeCapitalRawConfig();
      raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 100;
      raw.fundedFromFeesPct = 0.8;
      raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = fixture.rate;
      raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!.amount = fixture.expense;
      source.config.raw = raw;
      await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
        source.config.id,
        raw,
      ]);
      try {
        const input = makeCapitalInput();
        input.netInvestableCapitalUsd = '1000.000000';
        const saved = await create(
          makeCapitalCreateBody({ ...runtime, source }, { inputs: [input] })
        );
        const response = parsedCalculation(
          await runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, { body: {} })
        );
        const result = response.payload.variants[0]!.result;
        expect(result.input.netInvestableCapitalUsd).toBe('1000.000000');
        expect(result.construction.budget.availableConstructionCapitalUsd).toBe(fixture.available);
        evidence.push({ label: fixture.id, response });
        await archive(saved.id);
      } finally {
        await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
          runtime.source.config.id,
          runtime.source.config.raw,
        ]);
      }
    }
  );

  it('SRCB-R3-016/017/018 keeps raw fingerprint independent of declarations and refuses interpretation-only pin drift before writes', async () => {
    const before = fingerprintCapitalSource(runtime.source);
    const body = makeCapitalCreateBody(runtime);
    body.expectedInterpretationVersion = 'capital-source-interpretation/1.0.0';
    await unchanged(
      'SRCB-R3-017-interpretation-pin',
      () =>
        runtime.request('POST', setPath() + SELECTOR, {
          body,
          headers: { 'Idempotency-Key': randomUUID() },
        }),
      422,
      'INTERPRETATION_VERSION_UNSUPPORTED'
    );
    expect(fingerprintCapitalSource(runtime.source)).toEqual(before);
  });

  it('CP-053/054 persists companion add/change/remove with identical construction and complete reload fields', async () => {
    const base = makeCapitalInput();
    const companion = {
      methodVersion: 'aggregate-preference-forecast/1.0.0' as const,
      issuerLabel: 'Synthetic issuer',
      issuerKind: 'representative_issuer' as const,
      exitEquityValueUsd: '0.000000',
      exitDate: '2026-01-01',
      asConvertedOwnershipRatio: '0.250000000000',
      manualOwnershipOverrideRatio: '0.500000000000',
      ownershipOverrideExplanation: 'Synthetic explicit override',
      fundLiquidationPreferenceUsd: '4000000.000000',
      preferenceType: 'participating' as const,
      participationCap: { type: 'none' as const },
      totalPreferencesSeniorUsd: '2000000.000000',
      totalPreferencesPariPassuUsd: '4000000.000000',
      totalPreferencesJuniorUsd: '2000000.000000',
      investedCostUsd: '2000000.000000',
      positionFmv: { amountUsd: '7.000000', asOfDate: '2026-08-01', basis: 'direct' as const },
      manualFmvOverride: {
        amountUsd: '99.000000',
        asOfDate: '2026-09-01',
        basis: 'manual' as const,
      },
    };
    const inputs = [
      base,
      { ...structuredClone(base), performanceCase: companion },
      {
        ...structuredClone(base),
        performanceCase: { ...companion, exitEquityValueUsd: '999999999999999.000000' },
      },
      structuredClone(base),
      {
        ...structuredClone(base),
        performanceCase: {
          ...companion,
          manualFmvOverride: { ...companion.manualFmvOverride, amountUsd: '1.000000' },
        },
      },
    ];
    const saved = await create(makeCapitalCreateBody(runtime, { inputs }));
    const calculated = parsedCalculation(
      await runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, { body: {} })
    );
    const results = calculated.payload.variants.map((v) => v.result);
    for (const result of results) expect(result.construction).toEqual(results[0]!.construction);
    expect(results[0]!.performance).toBeNull();
    expect(results[3]!.performance).toBeNull();
    expect(results[1]!.performance!.input).toEqual(companion);
    expect(results[1]!.performance!.constructionFunding).toBe('excluded');
    expect(results[1]!.performance!.ownershipOrigin).toBe('manual_override');
    expect(results[1]!.performance!.effectiveOwnershipRatio).toBe('0.500000000000');
    expect(results[1]!.performance!.juniorPreferenceLabel).toBe('Preferences Behind Position');
    expect(results[1]!.performance!.effectiveFmv?.amountUsd).toBe('99.000000');
    expect(results[4]!.performance!.effectiveFmv?.amountUsd).toBe('1.000000');
    for (const key of [
      'adjustedProceedsUsd',
      'adjustedMoic',
      'baselineMoic',
      'noPreferenceBaselineUsd',
    ] as const)
      expect(results[4]!.performance![key]).toEqual(results[1]!.performance![key]);
    const reload = FundScenarioCapitalResultsResponseV1Schema.parse(
      (await runtime.request('GET', `${setPath(saved.id)}/results${SELECTOR}`)).body
    );
    expect(reload.savedResult?.payload).toEqual(calculated.payload);
    for (const result of results) {
      expect(result.construction).toHaveProperty('monthlyDetail');
      expect(result.construction).toHaveProperty('annualSchedule');
      expect(result.construction).toHaveProperty('disclosures');
      expect(result.construction).toHaveProperty('verdicts');
    }
    evidence.push({ label: 'CP-053/054', response: calculated, reload });
    await archive(saved.id);
    for (const [label, mutation] of [
      [
        'PERF-R3-004-missing-cost',
        (value: typeof companion) => {
          Reflect.deleteProperty(value, 'investedCostUsd');
        },
      ],
      [
        'PERF-R3-004-negative-cost',
        (value: typeof companion) => {
          value.investedCostUsd = '-1.000000';
        },
      ],
      [
        'supplemental-companion-missing-ownership',
        (value: typeof companion) => {
          Reflect.deleteProperty(value, 'asConvertedOwnershipRatio');
          Reflect.deleteProperty(value, 'manualOwnershipOverrideRatio');
          Reflect.deleteProperty(value, 'ownershipOverrideExplanation');
        },
      ],
      [
        'supplemental-companion-invalid-cap',
        (value: typeof companion) => {
          Object.assign(value, {
            participationCap: { type: 'total_payout', capAmountUsd: '1.000000' },
          });
        },
      ],
    ] as const) {
      const value = structuredClone(companion);
      mutation(value);
      await unchanged(
        label,
        () =>
          runtime.request('POST', setPath() + SELECTOR, {
            body: makeCapitalCreateBody(runtime, { inputs: [{ ...base, performanceCase: value }] }),
            headers: { 'Idempotency-Key': randomUUID() },
          }),
        422
      );
    }
    const noFmv = structuredClone(companion);
    Reflect.deleteProperty(noFmv, 'positionFmv');
    Reflect.deleteProperty(noFmv, 'manualFmvOverride');
    const zeroCost = { ...companion, investedCostUsd: '0.000000' };
    const followup = await create(
      makeCapitalCreateBody(runtime, {
        inputs: [
          { ...base, performanceCase: noFmv },
          { ...base, performanceCase: zeroCost },
        ],
      })
    );
    const followupResponse = parsedCalculation(
      await runtime.request('POST', `${setPath(followup.id)}/calculate${SELECTOR}`, { body: {} })
    );
    const noFmvResult = followupResponse.payload.variants[0]!.result.performance!;
    expect(noFmvResult.effectiveFmv).toBeNull();
    expect(noFmvResult.fmvUnavailableReason).toBe('FMV_UNAVAILABLE');
    for (const key of [
      'adjustedProceedsUsd',
      'signedPreferenceBenefitUsd',
      'adjustedMoic',
      'baselineMoic',
    ] as const)
      expect(noFmvResult[key]).toEqual(results[1]!.performance![key]);
    expect(followupResponse.payload.variants[1]!.result.performance!.adjustedMoic).toEqual({
      state: 'unavailable',
      value: null,
      reason: 'ZERO_COST',
    });
    expect(followupResponse.payload.variants[1]!.result.performance!.baselineMoic).toEqual({
      state: 'unavailable',
      value: null,
      reason: 'ZERO_COST',
    });
    evidence.push({ label: 'PERF-R3-004/005-persisted', followupResponse });
    await archive(followup.id);
  });

  it('FEE-R3-012/014/016 and SRCB-R3-013/014 persist consumed legacy amount/rate/origin metadata and declaration identity', async () => {
    const source = structuredClone(runtime.source);
    const raw = makeCapitalRawConfig();
    const declarations = makeCapitalDeclarations();
    legacyFee(raw, declarations);
    delete raw.economicsAssumptions!.expenseModel!.annualExpenses;
    delete declarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
    raw.fundExpenses = [
      { id: 'monthly', category: 'Other', monthlyAmount: 1, startMonth: 0, endMonth: 0 },
    ];
    declarations['fundExpenses[0].monthlyAmount'] = 'usd';
    declarations['fundExpenses[0].startMonth'] = 'fund_month_zero_based';
    declarations['fundExpenses[0].endMonth'] = 'fund_month_zero_based';
    source.config.raw = raw;
    await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
      source.config.id,
      raw,
    ]);
    try {
      const saved = await create(
        makeCapitalCreateBody({ ...runtime, source }, { unitDeclarations: declarations })
      );
      const response = parsedCalculation(
        await runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, { body: {} })
      );
      const bundle = response.payload.variants[0]!.result.sourceBundle;
      expect(bundle.feeExpense).toMatchObject({
        feeSelection: 'legacy_profile',
        selectedFeeProfileId: 'legacy-fee',
        lifetimeFeesUsd: '4.000000',
        lifetimeExpensesUsd: '1.000000',
      });
      expect(bundle.feeExpense.feeTiers[0]!.rate).toMatchObject({
        path: 'feeProfiles[0].feeTiers[0].percentage',
        rawValue: 2,
        normalizedValue: '0.020000000000',
      });
      expect(bundle.feeExpense.expenses[0]!.period).toMatchObject({
        normalizedStartMonth: 0,
        normalizedEndMonth: 0,
      });
      const detail = FundScenarioCapitalDetailResponseV1Schema.parse(
        (await runtime.request('GET', setPath(saved.id) + SELECTOR)).body
      );
      expect(detail.variants[0]!.override.payload.sourceBundle).toEqual(bundle);
      expect(detail.variants[0]!.override.payload.sourceBundle.unitDeclarations).toEqual(
        declarations
      );
      expect(detail.variants[0]!.override.payload.sourceBundleHash).toBe(
        fingerprintCapitalSource(source).sourceBundleHash
      );
      evidence.push({ label: 'FEE-source-declarations-persistence', response, detail });
      await archive(saved.id);
    } finally {
      await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
        source.config.id,
        runtime.source.config.raw,
      ]);
    }
  });

  it('FEE-R3-012 persists exact selected explicit amounts and empty-expense shadowing through completed replay', async () => {
    for (const empty of [false, true]) {
      const source = structuredClone(runtime.source);
      const raw = makeCapitalRawConfig();
      const declarations = makeCapitalDeclarations();
      raw.feeProfiles = [
        {
          id: 'shadow-fee',
          name: 'Shadow',
          feeTiers: [
            {
              id: 'shadow-tier',
              name: 'Shadow',
              percentage: 100,
              feeBasis: 'committed_capital',
              startMonth: 0,
              endMonth: 23,
            },
          ],
        },
      ];
      raw.fundExpenses = [
        {
          id: 'shadow-expense',
          category: 'Other',
          monthlyAmount: 100,
          startMonth: 0,
          endMonth: 23,
        },
      ];
      if (empty) {
        raw.economicsAssumptions!.expenseModel!.annualExpenses = [];
        delete declarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
      }
      source.config.raw = raw;
      await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
        source.config.id,
        raw,
      ]);
      try {
        const saved = await create(
          makeCapitalCreateBody({ ...runtime, source }, { unitDeclarations: declarations })
        );
        const first = await runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, {
          body: {},
        });
        const response = parsedCalculation(first);
        expect(response.payload.variants[0]!.result.construction.budget).toMatchObject({
          committedCapitalUsd: '100.000000',
          gpDeemedContributionUsd: '4.000000',
          lifetimeFeesUsd: '4.000000',
          lifetimeExpensesUsd: empty ? '0.000000' : '2.000000',
          availableConstructionCapitalUsd: empty ? '92.000000' : '90.000000',
        });
        await runtime.pool.query(
          "UPDATE fundconfigs SET config=jsonb_set(config,'{fundName}','\"changed live source\"') WHERE id=$1",
          [source.config.id]
        );
        const replay = await unchanged(
          `FEE-R3-012-replay-empty-${empty}`,
          () => runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, { body: {} }),
          200
        );
        expect(replay.rawBody).toEqual(first.rawBody);
        await archive(saved.id);
      } finally {
        await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
          source.config.id,
          runtime.source.config.raw,
        ]);
      }
    }
  });

  it('SRCB-R3-011 proves declaration-only source stability, changed create identity and changed normalized calculation identity', async () => {
    const regularBody = makeCapitalCreateBody(runtime);
    const regular = await create(regularBody);
    const regularResponse = parsedCalculation(
      await runtime.request('POST', `${setPath(regular.id)}/calculate${SELECTOR}`, { body: {} })
    );
    const declarations = makeCapitalDeclarations();
    declarations['funds.size'] = 'usd_millions';
    declarations['fundSize'] = 'usd_millions';
    const replayBody = { ...regularBody, unitDeclarations: declarations };
    await unchanged(
      'SRCB-R3-011-create-key-unit-conflict',
      () =>
        runtime.request('POST', setPath() + SELECTOR, {
          body: replayBody,
          headers: { 'Idempotency-Key': regular.key },
        }),
      422,
      'idempotency_key_reused'
    );
    const millions = await create(
      makeCapitalCreateBody(runtime, { unitDeclarations: declarations })
    );
    const millionsResponse = parsedCalculation(
      await runtime.request('POST', `${setPath(millions.id)}/calculate${SELECTOR}`, { body: {} })
    );
    const first = regularResponse.payload;
    const second = millionsResponse.payload;
    expect(first.sourceBundleHash).toBe(second.sourceBundleHash);
    expect(first.variants[0]!.result.construction.budget.committedCapitalUsd).toBe('100.000000');
    expect(second.variants[0]!.result.construction.budget.committedCapitalUsd).toBe(
      '100000000.000000'
    );
    const details = await Promise.all(
      [regular.id, millions.id].map(async (id) =>
        FundScenarioCapitalDetailResponseV1Schema.parse(
          (await runtime.request('GET', setPath(id) + SELECTOR)).body
        )
      )
    );
    expect(details[0]!.readState.sourceFreshness).toBe('CURRENT');
    expect(details[1]!.readState.sourceFreshness).toBe('CURRENT');
    const envelope = {
      version: 'scenario-input-hash-v1' as const,
      contractVersion: 'fund-scenarios-v1' as const,
      fundId: runtime.fundId,
      scenarioSetId: regular.id,
      sourceConfigId: runtime.source.config.id,
      sourceConfigVersion: 1,
      calculationDomain: 'capital_plan' as const,
      calculationMode: 'sync_capital_plan' as const,
      overrideType: 'capital_plan' as const,
      capitalPreimageVersion: first.capitalPreimageVersion,
      methodVersion: first.methodVersion,
      interpretationVersion: first.interpretationVersion,
      engineVersion: first.calculationVersion,
      baselineVariantId: regularBody.baselineVariantId!,
      sourceBundleHash: first.sourceBundleHash,
    };
    const normalizedHashes = details.map((detail) =>
      createCapitalScenarioInputHash({
        ...envelope,
        variants: detail.variants.map((v, index) => ({
          variantId: regularBody.variants[index]!.variantId!,
          sortOrder: index,
          override: v.override,
        })),
      })
    );
    expect(normalizedHashes[0]).toBe(first.inputHash);
    expect(normalizedHashes[1]).not.toBe(normalizedHashes[0]);
    evidence.push({
      label: 'SRCB-R3-011',
      regularResponse,
      millionsResponse,
      normalizedHashes,
      normalization:
        'Set and variant IDs held constant in both hash envelopes; only admitted stored override contents differ.',
    });
    await archive(regular.id);
    await archive(millions.id);
  });

  it('DUR-R3-010 keeps existing v2 hash lineage for capital runs when a source effective date is present', async () => {
    const source = structuredClone(runtime.source);
    const raw = makeCapitalRawConfig();
    raw.modelInputsAsOfDate = '2026-07-01';
    source.config.raw = raw;
    await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
      source.config.id,
      raw,
    ]);
    try {
      const saved = await create(makeCapitalCreateBody({ ...runtime, source }));
      const response = parsedCalculation(
        await runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, { body: {} })
      );
      expect(response.payload.lineage).toEqual({
        hashKind: 'scenario-input-hash-v2',
        modelInputsAsOfDate: '2026-07-01',
        comparisonLineageVersion: 'comparison-lineage-v1',
      });
      const run = await runtime.pool.query(
        'SELECT hash_kind,model_inputs_as_of_date::text,comparison_lineage_version,calculation_mode,override_type FROM fund_scenario_calculation_runs WHERE scenario_set_id=$1',
        [saved.id]
      );
      expect(run.rows).toEqual([
        {
          hash_kind: 'scenario-input-hash-v2',
          model_inputs_as_of_date: '2026-07-01',
          comparison_lineage_version: 'comparison-lineage-v1',
          calculation_mode: 'sync_capital_plan',
          override_type: 'capital_plan',
        },
      ]);
      evidence.push({ label: 'DUR-R3-010-v2-capital', response, run: run.rows });
      await archive(saved.id);
    } finally {
      await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
        source.config.id,
        runtime.source.config.raw,
      ]);
    }
  });
});

describe('B8 r2 remaining canonical HTTP finance cases', () => {
  beforeAll(async () => {
    runtime = await startCapitalScenarioHttpRuntime({
      label: 'canonical-gaps',
      evidenceDir: EVIDENCE,
      rateLimitMax: 1000,
    });
  }, 120_000);
  afterAll(async () => {
    const lifecycle = await runtime.close();
    evidence.push({ label: 'canonical-gaps-lifecycle', lifecycle });
    expect(lifecycle.api.graceful).toBe(true);
    expect(lifecycle.containerStopped).toBe(true);
    expect(lifecycle.errors).toEqual([]);
    await writeFile(
      path.join(EVIDENCE, 'persistence-cases.json'),
      `${JSON.stringify(evidence, null, 2)}\n`
    );
  }, 30_000);

  it.each([
    ['negative-pre-money', 'valuationUsd', '-1.000000'],
    ['zero-round', 'totalPrimaryRoundUsd', '0.000000'],
    ['invalid-basis', 'valuationBasis', 'fair_market_value'],
    ['unsupported-security', 'securityType', 'safe'],
  ] as const)(
    'CP-030 refuses selected entry financing %s before any durable write',
    async (label, field, value) => {
      const input = makeCapitalInput();
      input.allocations[0]!.entryFinancing = {
        valuationUsd: '10.000000',
        valuationBasis: 'pre_money',
        totalPrimaryRoundUsd: '2.000000',
      };
      Object.assign(input.allocations[0]!.entryFinancing, { [field]: value });
      const response = await unchanged(
        `CP-030-${label}`,
        () =>
          runtime.request('POST', setPath() + SELECTOR, {
            body: makeCapitalCreateBody(runtime, { inputs: [input] }),
            headers: { 'Idempotency-Key': randomUUID() },
          }),
        422
      );
      expect(response.rawBody.toString()).toContain('entryFinancing');
    }
  );
  it.each(['check-above-round', 'post-money-below-round', 'invalid-ratio'] as const)(
    'CP-030 refuses %s without writes',
    async (mode) => {
      const input = makeCapitalInput();
      const allocation = input.allocations[0]!;
      allocation.entryFinancing = {
        valuationUsd: '10.000000',
        valuationBasis: 'pre_money',
        totalPrimaryRoundUsd: '2.000000',
      };
      if (mode === 'check-above-round') allocation.initialCheckUsd = '3.000000';
      if (mode === 'post-money-below-round')
        allocation.entryFinancing = {
          valuationUsd: '1.000000',
          valuationBasis: 'post_money',
          totalPrimaryRoundUsd: '2.000000',
        };
      if (mode === 'invalid-ratio') allocation.budgetShareRatio = '1.100000000000';
      await unchanged(
        `CP-030-${mode}`,
        () =>
          runtime.request('POST', setPath() + SELECTOR, {
            body: makeCapitalCreateBody(runtime, { inputs: [input] }),
            headers: { 'Idempotency-Key': randomUUID() },
          }),
        422
      );
    }
  );

  it.each([
    'secondary',
    'transfer',
    'safe_conversion',
    'note_conversion',
    'warrant_conversion',
    'ownership_only',
    'ambiguous_seniority',
  ] as const)(
    'PERF-R3-003 refuses selected %s with typed mapping reason and zero writes',
    async (transactionType) => {
      const input = makeCapitalInput();
      input.performanceCase = {
        methodVersion: 'aggregate-preference-forecast/1.0.0',
        issuerLabel: 'Synthetic issuer',
        issuerKind: 'representative_issuer',
        exitEquityValueUsd: '10000000.000000',
        exitDate: '2027-01-01',
        asConvertedOwnershipRatio: '0.500000000000',
        fundLiquidationPreferenceUsd: '2000000.000000',
        preferenceType: 'non_participating',
        participationCap: { type: 'none' },
        totalPreferencesSeniorUsd: '0.000000',
        totalPreferencesPariPassuUsd: '0.000000',
        totalPreferencesJuniorUsd: '0.000000',
        investedCostUsd: '2000000.000000',
      };
      Object.assign(input.performanceCase, { transactionType });
      const response = await unchanged(
        `PERF-R3-003-${transactionType}`,
        () =>
          runtime.request('POST', setPath() + SELECTOR, {
            body: makeCapitalCreateBody(runtime, { inputs: [input] }),
            headers: { 'Idempotency-Key': randomUUID() },
          }),
        422,
        'INSTRUMENT_MAPPING_UNSUPPORTED'
      );
      expect(response.body).toMatchObject({
        details: {
          issues: expect.arrayContaining([
            expect.objectContaining({
              code: 'INSTRUMENT_MAPPING_UNSUPPORTED',
              support: 'unsupported',
              path: expect.stringContaining('performanceCase'),
            }),
          ]),
        },
      });
    }
  );

  it.each([
    { id: 'GP-R3-023', rate: 0.09, expense: 1, available: '0.000000' },
    { id: 'GP-R3-024', rate: 0.1, expense: 2.5, available: '-5.000000' },
  ])('$id persists derived budget semantics without a planning override', async (fixture) => {
    const source = structuredClone(runtime.source);
    const raw = makeCapitalRawConfig();
    raw.economicsAssumptions!.gpCommitmentModel!.commitmentAmount = 100;
    raw.fundedFromFeesPct = 0.8;
    raw.economicsAssumptions!.feeModel!.tiers![0]!.rate = fixture.rate;
    raw.economicsAssumptions!.expenseModel!.annualExpenses![0]!.amount = fixture.expense;
    source.config.raw = raw;
    await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
      source.config.id,
      raw,
    ]);
    try {
      const saved = await create(makeCapitalCreateBody({ ...runtime, source }));
      const calculated = parsedCalculation(
        await runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, { body: {} })
      );
      const result = calculated.payload.variants[0]!.result;
      expect(result.input).not.toHaveProperty('netInvestableCapitalUsd');
      expect(result.construction.budget.availableConstructionCapitalUsd).toBe(fixture.available);
      expect(result.construction.budget.planningBudgetOrigin).toBe('derived_available_capital');
      expect(result.construction.budget.planningBudgetUsd).toEqual(
        fixture.id === 'GP-R3-023'
          ? { state: 'available', value: '0.000000' }
          : { state: 'unavailable', value: null, reason: 'NO_CONSTRUCTION_CAPITAL' }
      );
      expect(result.construction.qualifications).toContain(
        fixture.id === 'GP-R3-023' ? 'ZERO_CONSTRUCTION_CAPITAL' : 'NO_CONSTRUCTION_CAPITAL'
      );
      const reload = FundScenarioCapitalResultsResponseV1Schema.parse(
        (await runtime.request('GET', `${setPath(saved.id)}/results${SELECTOR}`)).body
      );
      expect(reload.savedResult?.payload).toEqual(calculated.payload);
      evidence.push({ label: `${fixture.id}-derived-no-override`, calculated, reload });
      await archive(saved.id);
    } finally {
      await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
        source.config.id,
        runtime.source.config.raw,
      ]);
    }
  });

  it.each([0, 100])(
    'FEE-R3-015 saves valid legacy percentage endpoint %s with normalized rate and full-fund basis',
    async (percentage) => {
      const source = structuredClone(runtime.source);
      const raw = makeCapitalRawConfig();
      delete raw.economicsAssumptions!.feeModel!.tiers;
      raw.feeProfiles = [
        {
          id: 'legacy-endpoint',
          name: 'Legacy endpoint',
          feeTiers: [
            {
              id: 'legacy-tier',
              name: 'Management fee',
              percentage,
              feeBasis: 'committed_capital',
              startMonth: 0,
              endMonth: 23,
            },
          ],
        },
      ];
      const declarations = makeCapitalDeclarations();
      declarations['feeProfiles[0].feeTiers[0].percentage'] = 'percent_points';
      declarations['feeProfiles[0].feeTiers[0].startMonth'] = 'fund_month_zero_based';
      declarations['feeProfiles[0].feeTiers[0].endMonth'] = 'fund_month_zero_based';
      source.config.raw = raw;
      await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
        source.config.id,
        raw,
      ]);
      try {
        const input = makeCapitalInput();
        input.netInvestableCapitalUsd = '100.000000';
        const saved = await create(
          makeCapitalCreateBody(
            { ...runtime, source },
            { inputs: [input], unitDeclarations: declarations }
          )
        );
        const calculated = parsedCalculation(
          await runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, { body: {} })
        );
        const fees = calculated.payload.variants[0]!.result.sourceBundle.feeExpense;
        expect(fees.feeTiers[0]!.rate).toMatchObject({
          rawValue: percentage,
          sourceUnit: 'percent_points',
          normalizedValue: percentage === 0 ? '0.000000000000' : '1.000000000000',
        });
        expect(fees.feeBasisUsd).toBe('100.000000');
        expect(fees.lifetimeFeesUsd).toBe(percentage === 0 ? '0.000000' : '200.000000');
        const reload = FundScenarioCapitalResultsResponseV1Schema.parse(
          (await runtime.request('GET', `${setPath(saved.id)}/results${SELECTOR}`)).body
        );
        expect(reload.savedResult?.payload).toEqual(calculated.payload);
        evidence.push({ label: `FEE-R3-015-valid-${percentage}`, calculated, reload });
        await archive(saved.id);
      } finally {
        await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
          source.config.id,
          runtime.source.config.raw,
        ]);
      }
    }
  );
});

// These cases use actual makeApp/PG transactions with local call-through faults; capacity never uses this mode.
describe('B8 full durable transaction rollback at each capital calculation boundary', () => {
  let targetId: string;
  let runs: typeof import('../../server/services/fund-scenario-calculation-run-service');
  let store: typeof import('../../server/services/fund-scenario-capital-snapshot-store');
  let sets: typeof import('../../server/services/fund-scenario-set-service');
  let calculator: typeof import('../../shared/lib/capital-planning/capital-planning-v1');
  let contracts: typeof import('../../shared/contracts/fund-scenario-sets-v1.contract');
  let benchmarkProvider: typeof import('../../shared/lib/capital-planning/benchmark-presets');
  beforeAll(async () => {
    runtime = await startCapitalScenarioHttpRuntime({
      label: 'rollback',
      evidenceDir: EVIDENCE,
      mode: 'in-process',
      rateLimitMax: 1000,
      beforeAppImport: async () => {
        vi.resetModules();
        runs = await import('../../server/services/fund-scenario-calculation-run-service');
        store = await import('../../server/services/fund-scenario-capital-snapshot-store');
        sets = await import('../../server/services/fund-scenario-set-service');
        calculator = await import('../../shared/lib/capital-planning/capital-planning-v1');
        contracts = await import('../../shared/contracts/fund-scenario-sets-v1.contract');
        benchmarkProvider = await import('../../shared/lib/capital-planning/benchmark-presets');
      },
    });
    const previous = await create();
    parsedCalculation(
      await runtime.request('POST', `${setPath(previous.id)}/calculate${SELECTOR}`, { body: {} })
    );
    targetId = (await create()).id;
  }, 120_000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (runtime) {
      const lifecycle = await runtime.close();
      expect(lifecycle.api.graceful).toBe(true);
      expect(lifecycle.errors).toEqual([]);
      evidence.push({ label: 'rollback-lifecycle', lifecycle });
    }
    await writeFile(
      path.join(EVIDENCE, 'persistence-cases.json'),
      `${JSON.stringify(evidence, null, 2)}\n`
    );
  }, 30_000);
  it('CP-029 persists a trusted preset and replays saved bytes without re-entering the current catalog resolver', async () => {
    const resolver = vi.spyOn(benchmarkProvider, 'resolveCapitalPlanningDraftV1');
    const draft = CapitalPlanningDraftV1Schema.parse({
      input: makeCapitalInput(),
      benchmarkSelections: [
        {
          target: { allocationId: 'a1', kind: 'entry' },
          selector: { version: CAPITAL_BENCHMARK_CATALOG_VERSION, stage: 'seed' },
        },
      ],
    });
    const saved = await create(makeCapitalCreateBody(runtime, { inputs: [draft] }));
    expect(resolver).toHaveBeenCalled();
    const first = await runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, {
      body: {},
    });
    const calculated = parsedCalculation(first);
    const before = await runtime.snapshot();
    resolver.mockClear();
    const replay = await runtime.request('POST', `${setPath(saved.id)}/calculate${SELECTOR}`, {
      body: {},
    });
    expect(replay.status).toBe(200);
    expect(replay.rawBody).toEqual(first.rawBody);
    const reload = FundScenarioCapitalResultsResponseV1Schema.parse(
      (await runtime.request('GET', `${setPath(saved.id)}/results${SELECTOR}`)).body
    );
    expect(reload.savedResult?.payload).toEqual(calculated.payload);
    const detail = FundScenarioCapitalDetailResponseV1Schema.parse(
      (await runtime.request('GET', setPath(saved.id) + SELECTOR)).body
    );
    expect(detail.variants[0]!.override.payload.benchmarkSnapshots).toHaveLength(1);
    expect(resolver).not.toHaveBeenCalled();
    expect(await runtime.snapshot()).toEqual(before);
    const bindings = [];
    for (const file of [
      'shared/lib/capital-planning/benchmark-presets.ts',
      'tests/unit/lib/capital-planning-benchmarks.test.ts',
      'tests/unit/services/fund-scenario-set-family-readers.test.ts',
    ])
      bindings.push({
        file,
        sha256: createHash('sha256')
          .update(await readFile(path.resolve(SOURCE_ROOT, file)))
          .digest('hex'),
      });
    evidence.push({
      label: 'CP-029-no-current-catalog-call',
      proof:
        'Call-through resolver spy is positively exercised during actual create, then records zero calls across completed replay and saved reads. Catalog getter is internal to the resolver module. No live catalog mutation or historical writer execution is claimed.',
      bindings,
      calculated,
      reload,
      before,
      after: await runtime.snapshot(),
    });
    await archive(saved.id);
  });

  it.each([
    'acquisition-return',
    'running-fence',
    'calculator',
    'snapshot-insert',
    'completion-fence',
    'event-insert',
    'response-contract',
    'serialization',
  ] as const)(
    'rolls back all new rows and preserves earlier saved bytes after %s failure',
    async (stage) => {
      const fail = () => {
        throw new Error(`B8 injected ${stage}`);
      };
      if (stage === 'acquisition-return') {
        const original = runs.acquireScenarioCalculationRunWithCreation;
        vi.spyOn(runs, 'acquireScenarioCalculationRunWithCreation').mockImplementation(
          async (...args) => {
            await original(...args);
            return fail();
          }
        );
      }
      if (stage === 'running-fence')
        vi.spyOn(runs, 'markScenarioCalculationRunRunning').mockResolvedValue(0);
      if (stage === 'calculator')
        vi.spyOn(calculator, 'calculateCapitalPlanningV1').mockImplementation(fail);
      if (stage === 'snapshot-insert') {
        const original = store.persistCapitalScenarioSnapshot;
        vi.spyOn(store, 'persistCapitalScenarioSnapshot').mockImplementation(async (...args) => {
          await original(...args);
          return fail();
        });
      }
      if (stage === 'completion-fence')
        vi.spyOn(runs, 'markScenarioCalculationRunCompleted').mockResolvedValue(0);
      if (stage === 'event-insert') {
        const original = sets.insertScenarioSetEvent;
        vi.spyOn(sets, 'insertScenarioSetEvent').mockImplementation(async (...args) => {
          await original(...args);
          fail();
        });
      }
      if (stage === 'response-contract')
        vi.spyOn(store, 'prepareCapitalCalculateResponse').mockImplementation(fail);
      if (stage === 'serialization') {
        const original = store.prepareCapitalCalculateResponse;
        vi.spyOn(store, 'prepareCapitalCalculateResponse').mockImplementation((saved) => {
          original(saved);
          const cycle: Record<string, unknown> = {};
          cycle['self'] = cycle;
          JSON.stringify(cycle);
          return fail();
        });
      }
      const failed = vi.spyOn(runs, 'markScenarioCalculationRunFailed');
      const response = await unchanged(
        `rollback-${stage}`,
        () => runtime.request('POST', `${setPath(targetId)}/calculate${SELECTOR}`, { body: {} }),
        stage.endsWith('fence') ? 409 : 500
      );
      expect(failed).not.toHaveBeenCalled();
      expect(response.rawBody.toString()).not.toContain('snapshotId');
    }
  );
  it.each([
    'set-insert',
    'variant-insert',
    'created-event',
    'create-response',
    'create-serialization',
  ] as const)(
    'rolls back create idempotency and all inserted rows after %s fault',
    async (stage) => {
      const table =
        stage === 'set-insert'
          ? 'fund_scenario_sets'
          : stage === 'variant-insert'
            ? 'fund_scenario_variants'
            : 'fund_scenario_set_events';
      const sqlFault = !stage.startsWith('create-');
      if (sqlFault) {
        await runtime.pool.query(
          "CREATE FUNCTION b8_create_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'B8 create insert fault'; END $$"
        );
        await runtime.pool.query(
          `CREATE TRIGGER b8_create_fault AFTER INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION b8_create_fault()`
        );
      } else {
        const schema = contracts.FundScenarioCapitalCreateResponseV1Schema;
        const original = schema.safeParse.bind(schema);
        vi.spyOn(schema, 'safeParse').mockImplementation((...args) => {
          const parsed = original(...args);
          const response = args[0];
          if (typeof response !== 'object' || response === null)
            throw new Error('Expected acknowledgement object');
          if (stage === 'create-response')
            throw new Error('B8 create acknowledgement preparation fault');
          Object.assign(response, { cycle: response });
          return parsed;
        });
      }
      try {
        await unchanged(
          `create-rollback-${stage}`,
          () =>
            runtime.request('POST', setPath() + SELECTOR, {
              body: makeCapitalCreateBody(runtime),
              headers: { 'Idempotency-Key': randomUUID() },
            }),
          500
        );
      } finally {
        if (sqlFault) {
          await runtime.pool.query(`DROP TRIGGER b8_create_fault ON ${table}`);
          await runtime.pool.query('DROP FUNCTION b8_create_fault()');
        }
      }
    }
  );
});
