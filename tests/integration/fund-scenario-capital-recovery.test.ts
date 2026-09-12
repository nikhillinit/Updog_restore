import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FundScenarioCapitalCalculateResponseV1Schema,
  FundScenarioCapitalCreateResponseV1Schema,
  FundScenarioCapitalDetailResponseV1Schema,
  FundScenarioCapitalListResponseV1Schema,
  FundScenarioCapitalResultsResponseV1Schema,
  FundScenarioCapitalSourceResponseV1Schema,
  FundScenarioCapitalStoredOverrideV1Schema,
} from '../../shared/contracts/fund-scenario-sets-v1.contract';
import { canonicalJson } from '../../shared/lib/canonical-json';
import { createCapitalScenarioInputHash } from '../../server/lib/scenarios/scenario-input-hash';
import { FundScenarioCapitalComparisonV1Schema } from '../../shared/contracts/fund-scenario-comparison-v1.contract';
import historical from '../fixtures/capital-planning/completed-interpretation-1.0.0.json';
import {
  makeCapitalCreateBody,
  requestCapitalHttp,
  startCapitalResponseLossProxy,
  startCapitalScenarioHttpRuntime,
  type CapitalHttpRuntime,
  type CapitalHttpResponse,
} from '../helpers/capital-scenario-http-runtime';

import { inspectCapitalRefusal } from '../helpers/capital-scenario-refusal-proof';

const EVIDENCE =
  process.env['CAPITAL_TEST_EVIDENCE_DIR'] ?? path.resolve('.test-artifacts/capital-recovery');
const SELECTOR = '?representation=capital-plan-v1';
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
let runtime: CapitalHttpRuntime;
const evidence: unknown[] = [];
const setPath = (id = '') => `/api/funds/${runtime.fundId}/scenario-sets${id ? `/${id}` : ''}`;
async function create() {
  const body = makeCapitalCreateBody(runtime);
  const response = await runtime.request('POST', setPath() + SELECTOR, {
    body,
    headers: { 'Idempotency-Key': randomUUID() },
  });
  expect(response.status, response.rawBody.toString()).toBe(201);
  return FundScenarioCapitalCreateResponseV1Schema.parse(response.body).scenarioSetId;
}
async function calculate(id: string) {
  const response = await runtime.request('POST', `${setPath(id)}/calculate${SELECTOR}`, {
    body: {},
  });
  expect(response.status, response.rawBody.toString()).toBe(200);
  FundScenarioCapitalCalculateResponseV1Schema.parse(response.body);
  return response;
}
async function archive(id: string) {
  const response = await runtime.request('POST', `${setPath(id)}/archive${SELECTOR}`, { body: {} });
  expect(response.status, response.rawBody.toString()).toBe(200);
}

async function recordRefusal(
  label: string,
  response: CapitalHttpResponse,
  before: Awaited<ReturnType<CapitalHttpRuntime['snapshot']>>
) {
  const after = await runtime.snapshot();
  const refusalProof = inspectCapitalRefusal(response, before);
  evidence.push({
    label,
    status: response.status,
    responseBody: response.body,
    before,
    after,
    refusalProof,
  });
  expect(after).toEqual(before);
  expect(refusalProof.violations).toEqual([]);
}

describe('B8 committed response loss and forward recovery against the actual application', () => {
  beforeAll(async () => {
    await mkdir(EVIDENCE, { recursive: true });
    runtime = await startCapitalScenarioHttpRuntime({
      label: 'recovery',
      evidenceDir: EVIDENCE,
      rateLimitMax: 1000,
      source: {
        rawConfig: historical.rawSource.config.raw,
        fundSize: historical.rawSource.fund.size,
        baseCurrency: historical.rawSource.fund.baseCurrency,
        publishedAt: historical.rawSource.config.publishedAt,
      },
    });
  }, 120_000);
  afterAll(async () => {
    if (runtime) {
      const lifecycle = await runtime.close();
      evidence.push({ lifecycle });
      expect(lifecycle.api.graceful).toBe(true);
      expect(lifecycle.api.forced).toBe(false);
      expect(lifecycle.containerStopped).toBe(true);
      expect(lifecycle.errors).toEqual([]);
    }
    await writeFile(
      path.join(EVIDENCE, 'recovery-cases.json'),
      `${JSON.stringify(evidence, null, 2)}\n`
    );
  }, 30_000);

  it('retries exact create bytes and key after independently observed commit and downstream response loss', async () => {
    const requestPath = setPath() + SELECTOR;
    const rawBody = Buffer.from(JSON.stringify(makeCapitalCreateBody(runtime)));
    const key = randomUUID();
    const headers = {
      ...runtime.actors.writer.bearerHeaders,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    };
    const before = await runtime.snapshot();
    const proxy = await startCapitalResponseLossProxy(runtime, {
      method: 'POST',
      path: requestPath,
      verifyCommitted: async (response) => {
        const body = FundScenarioCapitalCreateResponseV1Schema.parse(response.body);
        const observed = await runtime.pool.query('SELECT id FROM fund_scenario_sets WHERE id=$1', [
          body.scenarioSetId,
        ]);
        expect(observed.rowCount).toBe(1);
        return {
          observedAt: new Date().toISOString(),
          setId: body.scenarioSetId,
          state: await runtime.snapshot(),
        };
      },
    });
    try {
      await expect(
        requestCapitalHttp(proxy.baseUrl + requestPath, 'POST', { headers, rawBody })
      ).rejects.toThrow();
      const lost = await proxy.lostResponse;
      const committed = await runtime.snapshot();
      const retry = await runtime.request('POST', requestPath, { headers, rawBody });
      expect(retry.status).toBe(lost.upstream.status);
      expect(retry.rawBody).toEqual(lost.upstream.rawBody);
      expect(await runtime.snapshot()).toEqual(committed);
      evidence.push({
        label: 'DUR-create-response-loss',
        key,
        requestSha256: hash(rawBody),
        before,
        committed,
        upstreamResponseSha256: hash(lost.upstream.rawBody),
        retryResponseSha256: hash(retry.rawBody),
        observedCommit: lost.committed,
      });
      await archive(FundScenarioCapitalCreateResponseV1Schema.parse(retry.body).scenarioSetId);
    } finally {
      await proxy.close();
    }
  });

  it('retries completed calculation after commit observation and response loss without another run or snapshot', async () => {
    const id = await create();
    const requestPath = `${setPath(id)}/calculate${SELECTOR}`;
    const rawBody = Buffer.from('{}');
    const headers = { ...runtime.actors.writer.bearerHeaders, 'Content-Type': 'application/json' };
    const before = await runtime.snapshot();
    const proxy = await startCapitalResponseLossProxy(runtime, {
      method: 'POST',
      path: requestPath,
      verifyCommitted: async (response) => {
        const body = FundScenarioCapitalCalculateResponseV1Schema.parse(response.body);
        const observed = await runtime.pool.query(
          'SELECT id,status,snapshot_id FROM fund_scenario_calculation_runs WHERE scenario_set_id=$1',
          [id]
        );
        expect(observed.rows).toEqual([
          expect.objectContaining({ status: 'completed', snapshot_id: body.snapshotId }),
        ]);
        const snapshot = await runtime.pool.query(
          'SELECT payload FROM fund_snapshots WHERE id=$1',
          [body.snapshotId]
        );
        expect(snapshot.rows[0]?.payload).toEqual(body.payload);
        return {
          observedAt: new Date().toISOString(),
          runs: observed.rows,
          snapshotId: body.snapshotId,
          state: await runtime.snapshot(),
        };
      },
    });
    try {
      await expect(
        requestCapitalHttp(proxy.baseUrl + requestPath, 'POST', { headers, rawBody })
      ).rejects.toThrow();
      const lost = await proxy.lostResponse;
      const committed = await runtime.snapshot();
      const retry = await runtime.request('POST', requestPath, { rawBody });
      expect(retry.status).toBe(lost.upstream.status);
      expect(retry.rawBody).toEqual(lost.upstream.rawBody);
      expect(await runtime.snapshot()).toEqual(committed);
      const result = FundScenarioCapitalResultsResponseV1Schema.parse(
        (await runtime.request('GET', `${setPath(id)}/results${SELECTOR}`)).body
      );
      expect(result.savedResult?.payload).toEqual(
        FundScenarioCapitalCalculateResponseV1Schema.parse(retry.body).payload
      );
      evidence.push({
        label: 'DUR-calculate-response-loss',
        before,
        committed,
        observedCommit: lost.committed,
        upstreamResponseSha256: hash(lost.upstream.rawBody),
        retryResponseSha256: hash(retry.rawBody),
      });
      await archive(id);
    } finally {
      await proxy.close();
    }
  });

  it('replays admitted historical completed identity while refusing unsupported uncompleted interpretation without writes', async () => {
    const fixturePath = path.resolve(
      'tests/fixtures/capital-planning/completed-interpretation-1.0.0.json'
    );
    const fixtureBefore = await readFile(fixturePath);
    const payload = structuredClone(historical.snapshot.payload);
    const preimage = {
      version: 'scenario-input-hash-v1' as const,
      contractVersion: 'fund-scenarios-v1' as const,
      fundId: runtime.fundId,
      scenarioSetId: historical.scenarioSet.id,
      sourceConfigId: runtime.source.config.id,
      sourceConfigVersion: 1,
      calculationDomain: 'capital_plan' as const,
      calculationMode: 'sync_capital_plan' as const,
      overrideType: 'capital_plan' as const,
      capitalPreimageVersion: 'capital-preimage/1.0.0' as const,
      methodVersion: 'capital-planning/1.0.0' as const,
      interpretationVersion: 'capital-source-interpretation/1.0.0',
      engineVersion: '1.0.0',
      baselineVariantId: payload.baselineVariantId,
      sourceBundleHash: payload.sourceBundleHash,
      variants: historical.variants.map((v) => ({
        variantId: v.id,
        sortOrder: v.sort_order,
        override: FundScenarioCapitalStoredOverrideV1Schema.parse({
          overrideType: 'capital_plan',
          payload: v.override_payload,
        }),
      })),
    };
    const inputHash = createCapitalScenarioInputHash(preimage);
    payload.inputHash = inputHash;
    const historicalCreateRequest = makeCapitalCreateBody(runtime, {
      name: historical.scenarioSet.name,
      inputs: preimage.variants.map((v) => v.override.payload.input),
      variantIds: preimage.variants.map((v) => v.variantId),
    });
    historicalCreateRequest.expectedInterpretationVersion = 'capital-source-interpretation/1.0.0';
    const historicalCreateKey = randomUUID();
    const historicalCreateHash = hash(
      canonicalJson({ fundId: runtime.fundId, input: historicalCreateRequest })
    );
    await runtime.pool.query(
      `INSERT INTO fund_scenario_sets(id,fund_id,name,source_config_id,source_config_version)
      VALUES($1,$2,$3,$4,1)`,
      [
        historical.scenarioSet.id,
        runtime.fundId,
        historical.scenarioSet.name,
        runtime.source.config.id,
      ]
    );
    await runtime.pool.query(
      'UPDATE fund_scenario_sets SET idempotency_key=$2,idempotency_request_hash=$3 WHERE id=$1',
      [historical.scenarioSet.id, historicalCreateKey, historicalCreateHash]
    );
    for (const v of historical.variants)
      await runtime.pool.query(
        `INSERT INTO fund_scenario_variants
      (id,scenario_set_id,name,sort_order,override_type,override_payload) VALUES($1,$2,$3,$4,'capital_plan',$5)`,
        [v.id, historical.scenarioSet.id, v.name, v.sort_order, v.override_payload]
      );
    const snapshot = await runtime.pool.query<{ id: number }>(
      `INSERT INTO fund_snapshots
      (fund_id,scenario_set_id,config_id,config_version,type,calc_version,state_hash,payload,correlation_id,snapshot_time)
      VALUES($1,$2,$3,1,'SCENARIOS','1.0.0',$4,$5,$6,$7) RETURNING id`,
      [
        runtime.fundId,
        historical.scenarioSet.id,
        runtime.source.config.id,
        inputHash,
        payload,
        historical.snapshot.correlation_id,
        historical.snapshot.snapshot_time,
      ]
    );
    const run = await runtime.pool.query(
      `INSERT INTO fund_scenario_calculation_runs
      (fund_id,scenario_set_id,source_config_id,source_config_version,calculation_mode,override_type,input_hash,hash_kind,correlation_id,status,snapshot_id)
      VALUES($1,$2,$3,1,'sync_capital_plan','capital_plan',$4,'scenario-input-hash-v1',$5,'completed',$6) RETURNING id`,
      [
        runtime.fundId,
        historical.scenarioSet.id,
        runtime.source.config.id,
        inputHash,
        historical.snapshot.correlation_id,
        snapshot.rows[0]!.id,
      ]
    );
    const before = await runtime.snapshot();
    const createReplay = await runtime.request('POST', setPath() + SELECTOR, {
      body: historicalCreateRequest,
      headers: { 'Idempotency-Key': historicalCreateKey },
    });
    expect(createReplay.status, createReplay.rawBody.toString()).toBe(201);
    expect(FundScenarioCapitalCreateResponseV1Schema.parse(createReplay.body).scenarioSetId).toBe(
      historical.scenarioSet.id
    );
    expect(await runtime.snapshot()).toEqual(before);
    const response = await calculate(historical.scenarioSet.id);
    const decoded = FundScenarioCapitalCalculateResponseV1Schema.parse(response.body);
    expect(decoded.payload).toEqual(payload);
    expect(decoded.snapshotId).toBe(snapshot.rows[0]!.id);
    expect(await runtime.snapshot()).toEqual(before);
    expect(await readFile(fixturePath)).toEqual(fixtureBefore);
    const current = await create();
    await runtime.pool.query(
      `UPDATE fund_scenario_variants SET override_payload=$2 WHERE scenario_set_id=$1`,
      [current, historical.variants[0]!.override_payload]
    );
    const uncompletedBefore = await runtime.snapshot();
    const refused = await runtime.request('POST', `${setPath(current)}/calculate${SELECTOR}`, {
      body: {},
    });
    expect(refused.status, refused.rawBody.toString()).toBe(422);
    expect(refused.body).toMatchObject({ code: 'INTERPRETATION_VERSION_UNSUPPORTED' });
    await recordRefusal(
      'historical-uncompleted-interpretation-refusal',
      refused,
      uncompletedBefore
    );
    expect(await runtime.snapshot()).toEqual(uncompletedBefore);
    evidence.push({
      label: 'historical-admitted-command-fixture',
      scope:
        'Synthetic historical persistence command fixture; economic output retained from B7 producer, outer command inputHash replaced with admitted preimage identity.',
      fixtureSha256: hash(fixtureBefore),
      preimage,
      inputHash,
      historicalCreateHash,
      historicalCreateRequest,
      historicalCreateReplay: createReplay.body,
      snapshotId: decoded.snapshotId,
      runId: run.rows[0]!.id,
      before,
      after: await runtime.snapshot(),
      responseSha256: hash(response.rawBody),
    });
    await archive(current);
    await archive(historical.scenarioSet.id);
  });

  it('retains source, list, detail, results, comparison and status reads across mixed saved states after targeted forward repair', async () => {
    const uncalculated = await create();
    const completed = await create();
    const saved = await calculate(completed);
    const archived = await create();
    await archive(archived);
    const legacy = randomUUID();
    await runtime.pool.query(
      `INSERT INTO fund_scenario_sets(id,fund_id,name,source_config_id,source_config_version)
      VALUES($1,$2,'Retained legacy set',$3,1)`,
      [legacy, runtime.fundId, runtime.source.config.id]
    );
    await runtime.pool.query(
      `INSERT INTO fund_scenario_variants(scenario_set_id,name,sort_order,override_type,override_payload)
      VALUES($1,'Legacy fee',0,'fee_profile',$2)`,
      [
        legacy,
        {
          feeProfiles: [
            {
              id: 'legacy-fee',
              name: 'Legacy fee',
              feeTiers: [
                {
                  id: 'legacy-tier',
                  name: 'Management fee',
                  percentage: 2,
                  feeBasis: 'committed_capital',
                  startMonth: 0,
                },
              ],
            },
          ],
        },
      ]
    );
    const sourceBefore = runtime.source.config.raw;
    const legacyReads = new Map<string, { status: number; bytes: Buffer }>();
    for (const suffix of ['', '/results', '/comparison', '/calculation-status']) {
      const response = await runtime.request('GET', setPath(legacy) + suffix);
      expect([200, 404, 409], response.rawBody.toString()).toContain(response.status);
      legacyReads.set(suffix, { status: response.status, bytes: response.rawBody });
    }
    await runtime.pool.query(
      `UPDATE fundconfigs SET config=jsonb_set(config,'{fundName}','"Temporary forward repair defect"') WHERE id=$1`,
      [runtime.source.config.id]
    );
    await runtime.pool.query('UPDATE fundconfigs SET config=$2 WHERE id=$1', [
      runtime.source.config.id,
      sourceBefore,
    ]);
    const before = await runtime.snapshot();
    FundScenarioCapitalSourceResponseV1Schema.parse(
      (await runtime.request('GET', `${setPath()}/source-config${SELECTOR}`)).body
    );
    const listResponse = await runtime.request(
      'GET',
      `${setPath() + SELECTOR}&includeArchived=true`
    );
    const list = FundScenarioCapitalListResponseV1Schema.parse(listResponse.body);
    expect(list.scenarioSets.map((s) => s.id)).toEqual(
      expect.arrayContaining([uncalculated, completed, archived])
    );
    expect(list.scenarioSets.map((s) => s.id)).not.toContain(legacy);
    for (const id of [uncalculated, completed, archived]) {
      const detail = await runtime.request('GET', setPath(id) + SELECTOR);
      expect(detail.status).toBe(200);
      FundScenarioCapitalDetailResponseV1Schema.parse(detail.body);
      const result = await runtime.request('GET', `${setPath(id)}/results${SELECTOR}`);
      expect(result.status).toBe(200);
      const parsed = FundScenarioCapitalResultsResponseV1Schema.parse(result.body);
      if (id === completed)
        expect(parsed.savedResult?.payload).toEqual(
          FundScenarioCapitalCalculateResponseV1Schema.parse(saved.body).payload
        );
      else expect(parsed.savedResult).toBeNull();
      const comparison = await runtime.request('GET', `${setPath(id)}/comparison${SELECTOR}`);
      expect(comparison.status, comparison.rawBody.toString()).toBe(200);
      FundScenarioCapitalComparisonV1Schema.parse(comparison.body);
      const status = await runtime.request('GET', `${setPath(id)}/calculation-status${SELECTOR}`);
      expect(status.status, status.rawBody.toString()).toBe(409);
      await recordRefusal('capital-status-mode-refusal', status, before);
      expect(status.body).toMatchObject({ code: 'capital_plan_calculation_status_not_applicable' });
    }
    for (const suffix of ['', '/results', '/comparison', '/calculation-status']) {
      const response = await runtime.request('GET', setPath(legacy) + suffix);
      expect(response.status, response.rawBody.toString()).toBe(legacyReads.get(suffix)!.status);
      expect(response.rawBody).toEqual(legacyReads.get(suffix)!.bytes);
      if (response.status >= 400)
        await recordRefusal(`legacy-read-refusal-${suffix}`, response, before);
    }
    expect(await runtime.snapshot()).toEqual(before);
    evidence.push({
      label: 'ROLL-R3-002-retained-mixed-reads',
      before,
      after: await runtime.snapshot(),
      capitalIds: [uncalculated, completed, archived],
      legacyId: legacy,
    });
  });

  it('DUR-R3-013/014/016/019 preserves independent saved axes and output across changed currency, missing source and a new publish', async () => {
    const id = await create();
    const saved = FundScenarioCapitalCalculateResponseV1Schema.parse((await calculate(id)).body);
    const originalSource = structuredClone(runtime.source);
    const rawBefore = await runtime.pool.query(
      'SELECT config::text AS raw FROM fundconfigs WHERE id=$1',
      [originalSource.config.id]
    );
    for (const mode of ['currency', 'missing', 'publish'] as const) {
      if (mode === 'currency')
        await runtime.pool.query("UPDATE funds SET base_currency='EUR' WHERE id=$1", [
          runtime.fundId,
        ]);
      else
        await runtime.pool.query('UPDATE fundconfigs SET is_published=false WHERE id=$1', [
          originalSource.config.id,
        ]);
      if (mode === 'publish')
        await runtime.pool.query(
          `INSERT INTO fundconfigs(id,fund_id,version,config,is_draft,is_published,published_at) VALUES(23,$1,2,$2,false,true,$3)`,
          [runtime.fundId, originalSource.config.raw, '2026-09-02T00:00:00.000Z']
        );
      try {
        const before = await runtime.snapshot();
        const response = await runtime.request('GET', `${setPath(id)}/results${SELECTOR}`);
        expect(response.status, response.rawBody.toString()).toBe(200);
        const read = FundScenarioCapitalResultsResponseV1Schema.parse(response.body);
        expect(read.savedResult?.payload).toEqual(saved.payload);
        expect(read.readState.sourceFreshness).toBe(
          mode === 'currency'
            ? 'STALE_SOURCE'
            : mode === 'missing'
              ? 'STALE_SOURCE_UNAVAILABLE'
              : 'STALE_PUBLISH'
        );
        expect(read.readState.calculationReadiness.state).toBe('READY');
        expect(read.readState.interpretationCompatibility.state).toBe('CURRENT');
        const comparison = FundScenarioCapitalComparisonV1Schema.parse(
          (await runtime.request('GET', `${setPath(id)}/comparison${SELECTOR}`)).body
        );
        expect(comparison.readState).toEqual(read.readState);
        expect(await runtime.snapshot()).toEqual(before);
        if (mode === 'publish') {
          const stale = await runtime.request('POST', setPath() + SELECTOR, {
            body: makeCapitalCreateBody(runtime),
            headers: { 'Idempotency-Key': randomUUID() },
          });
          expect(stale.status, stale.rawBody.toString()).toBe(409);
          await recordRefusal('fresh-create-published-source-refusal', stale, before);
          expect(await runtime.snapshot()).toEqual(before);
          const currentSource = {
            ...originalSource,
            config: {
              ...originalSource.config,
              id: 23,
              version: 2,
              publishedAt: '2026-09-02T00:00:00.000Z',
            },
          };
          const duplicate = await runtime.request('POST', setPath() + SELECTOR, {
            body: makeCapitalCreateBody({ ...runtime, source: currentSource }),
            headers: { 'Idempotency-Key': randomUUID() },
          });
          expect(duplicate.status, duplicate.rawBody.toString()).toBe(201);
          const duplicateId = FundScenarioCapitalCreateResponseV1Schema.parse(
            duplicate.body
          ).scenarioSetId;
          expect(duplicateId).not.toBe(id);
          expect(
            (
              await runtime.pool.query('SELECT payload FROM fund_snapshots WHERE id=$1', [
                saved.snapshotId,
              ])
            ).rows[0]!.payload
          ).toEqual(saved.payload);
          await archive(duplicateId);
        }
        evidence.push({
          label: `DUR-read-axis-${mode}`,
          read,
          comparison,
          before,
          after: await runtime.snapshot(),
        });
      } finally {
        await runtime.pool.query("UPDATE funds SET base_currency='USD' WHERE id=$1", [
          runtime.fundId,
        ]);
        await runtime.pool.query('UPDATE fundconfigs SET is_published=(id=$2) WHERE fund_id=$1', [
          runtime.fundId,
          originalSource.config.id,
        ]);
      }
    }
    expect(
      (
        await runtime.pool.query('SELECT config::text AS raw FROM fundconfigs WHERE id=$1', [
          originalSource.config.id,
        ])
      ).rows
    ).toEqual(rawBefore.rows);
    await archive(id);
  });
});
