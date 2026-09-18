import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FundScenarioCapitalCalculationPayloadV1Schema,
  type CreateFundScenarioSetV3,
} from '../../shared/contracts/fund-scenario-sets-v1.contract';
import {
  CAPITAL_PLANNING_PROVISIONAL_LIMITS as limits,
  type CapitalPlanningInputV1,
  type CapitalFollowOnRoundV1,
  type CapitalUnitDeclarationsV1,
  CapitalPlanningInputV1Schema,
} from '../../shared/contracts/capital-planning-v1.contract';
import maximum from '../fixtures/capital-planning/maximum-shape.json';
import { makeCapitalInput, makeCapitalRawConfig } from '../fixtures/capital-planning/fixtures';
import {
  makeCapitalCreateBody,
  startCapitalScenarioHttpRuntime,
  type CapitalHttpRuntime,
} from '../helpers/capital-scenario-http-runtime';

import { inspectCapitalRefusal } from '../helpers/capital-scenario-refusal-proof';

const EVIDENCE =
  process.env['CAPITAL_TEST_EVIDENCE_DIR'] ?? path.resolve('.test-artifacts/capital-limits');
const records: unknown[] = [];
let runtime: CapitalHttpRuntime;
const createPath = () =>
  `/api/funds/${runtime.fundId}/scenario-sets?representation=capital-plan-v1`;
const inputOf = (body: CreateFundScenarioSetV3) =>
  body.variants[0]!.override.payload as CapitalPlanningInputV1;
function round(index: number): CapitalFollowOnRoundV1 {
  return {
    roundId: `r${index}`,
    stageId: `s${index + 1}`,
    roundLabel: `Round ${index}`,
    graduationRatio: '1.000000000000',
    participationRatio: '1.000000000000',
    checkPolicy: { type: 'fixed_check', checkUsd: '1.000000' },
    monthsAfterPreviousRound: 1,
    timeOrigin: 'previous_round',
  };
}
async function refuse(
  label: string,
  body: unknown,
  expectedLimit?: number,
  expectedObserved?: number,
  expectedPath?: string
) {
  const before = await runtime.snapshot();
  const response = await runtime.request('POST', createPath(), {
    body,
    headers: { 'Idempotency-Key': randomUUID() },
  });
  const after = await runtime.snapshot();
  const refusalProof = inspectCapitalRefusal(response, before);
  records.push({
    label,
    status: response.status,
    body: response.body,
    before,
    after,
    refusalProof,
  });
  expect(refusalProof.violations).toEqual([]);
  expect(after.sha256).toBe(before.sha256);
  expect(response.status, response.rawBody.toString()).toBe(422);
  expect(response.body).toMatchObject({ code: 'INPUT_TOO_LARGE' });
  if (expectedLimit !== undefined) {
    expect(response.body).toMatchObject({
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'INPUT_TOO_LARGE',
            limit: expectedLimit,
            observed: expectedObserved,
            ...(expectedPath ? { path: expectedPath } : {}),
          }),
        ]),
      },
    });
  }
}

describe('B8 independent limits refuse without durable writes', () => {
  beforeAll(async () => {
    await mkdir(EVIDENCE, { recursive: true });
    runtime = await startCapitalScenarioHttpRuntime({
      label: 'limits',
      evidenceDir: EVIDENCE,
      rateLimitMax: 1000,
    });
  }, 120_000);
  afterAll(async () => {
    if (runtime) {
      const lifecycle = await runtime.close();
      records.push({ lifecycle });
      expect(lifecycle.api.graceful).toBe(true);
      expect(lifecycle.containerStopped).toBe(true);
      expect(lifecycle.errors).toEqual([]);
    }
    await writeFile(
      path.join(EVIDENCE, 'limit-cases.json'),
      `${JSON.stringify(records, null, 2)}\n`
    );
  }, 30_000);

  const requestCases: Array<[string, number, (body: CreateFundScenarioSetV3) => void]> = [
    [
      'variant count',
      limits.maxVariants,
      (b) => {
        const first = b.variants[0]!;
        b.variants = Array.from({ length: limits.maxVariants + 1 }, (_, i) => ({
          ...structuredClone(first),
          variantId: i ? randomUUID() : first.variantId,
        }));
      },
    ],
    [
      'set name',
      120,
      (b) => {
        b.name = 'n'.repeat(121);
      },
    ],
    [
      'variant name',
      120,
      (b) => {
        b.variants[0]!.name = 'n'.repeat(121);
      },
    ],
    [
      'allocation label',
      240,
      (b) => {
        inputOf(b).allocations[0]!.name = 'n'.repeat(241);
      },
    ],
    [
      'allocation identifier',
      120,
      (b) => {
        inputOf(b).allocations[0]!.allocationId = 'a'.repeat(121);
      },
    ],
    [
      'decimal characters',
      limits.maxDecimalCharacters,
      (b) => {
        inputOf(b).allocations[0]!.initialCheckUsd = `${'1'.repeat(18)}.000000`;
      },
    ],
    [
      'allocation count',
      limits.maxAllocations,
      (b) => {
        const first = inputOf(b).allocations[0]!;
        inputOf(b).allocations = Array.from({ length: limits.maxAllocations + 1 }, (_, i) => ({
          ...structuredClone(first),
          allocationId: `a${i}`,
          budgetShareRatio: '0.010000000000',
        }));
      },
    ],
    [
      'follow-on count',
      limits.maxFollowOnRounds,
      (b) => {
        inputOf(b).allocations[0]!.followOnRounds = Array.from(
          { length: limits.maxFollowOnRounds + 1 },
          (_, i) => round(i)
        );
      },
    ],
    [
      'deployment years',
      limits.maxDeploymentYears,
      (b) => {
        inputOf(b).allocations[0]!.deploymentPeriodYears = limits.maxDeploymentYears + 1;
      },
    ],
    [
      'planned companies',
      limits.maxPlannedCompanies,
      (b) => {
        inputOf(b).allocations[0]!.plannedCompanyCount = limits.maxPlannedCompanies + 1;
      },
    ],
    [
      'round lag',
      limits.maxRoundLagMonths,
      (b) => {
        inputOf(b).allocations[0]!.followOnRounds = [
          { ...round(0), monthsAfterPreviousRound: limits.maxRoundLagMonths + 1 },
        ];
      },
    ],
    [
      'declaration count',
      limits.maxDeclarations,
      (b) => {
        b.unitDeclarations = Object.fromEntries(
          Array.from({ length: limits.maxDeclarations + 1 }, (_, i) => [
            `pipelineProfiles[${i}].stages[0].roundSize`,
            'usd',
          ])
        );
      },
    ],
  ];
  it.each(requestCases)('%s plus one', async (label, limit, mutate) => {
    const body = makeCapitalCreateBody(runtime);
    mutate(body);
    await refuse(label, body, limit, limit + 1);
  });

  it('rejects the next representable aggregate row count, 60012, before materialization', async () => {
    // Every admitted deployment/round block has 12 monthly rows; 60001 is unreachable.
    const inputs = Array.from({ length: 5 }, (_, variant) => {
      const input = makeCapitalInput();
      input.allocations = Array.from({ length: 10 }, (_, allocation) => {
        const index = variant * 10 + allocation;
        const item = {
          ...structuredClone(input.allocations[0]!),
          allocationId: `a${allocation}`,
          budgetShareRatio: '0.100000000000',
        };
        if (index < 36) {
          item.deploymentPeriodYears = 10;
          item.followOnRounds = Array.from({ length: 6 }, (_, i) => round(i));
        }
        if (index < 35) item.plannedCompanyCount = 1;
        if (index === 36) {
          item.deploymentPeriodYears = 3;
          item.followOnRounds = Array.from({ length: 5 }, (_, i) => round(i));
        }
        return item;
      });
      return input;
    });
    await refuse(
      'expanded rows next representable',
      makeCapitalCreateBody(runtime, { inputs }),
      limits.maxExpandedRows,
      60012
    );
  });

  it('rejects a 257-character unit declaration path before durable writes', async () => {
    const body = makeCapitalCreateBody(runtime);
    const prefix = 'pipelineProfiles[';
    const suffix = '].stages[0].roundSize';
    const declarationPath = `${prefix}${'1'.repeat(257 - prefix.length - suffix.length)}${suffix}`;
    expect(declarationPath.length).toBe(257);
    body.unitDeclarations[declarationPath] = 'usd';
    await refuse('unit declaration path characters', body, 256, 257, 'input');
  });

  type RawConfig = ReturnType<typeof makeCapitalRawConfig>;
  const sourceCases: Array<[string, number, (raw: RawConfig) => void]> = [
    [
      'fee tiers',
      limits.maxFeeExpensePieces,
      (raw) => {
        const model = raw.economicsAssumptions!.feeModel!;
        const first = model.tiers![0]!;
        model.tiers = Array.from({ length: limits.maxFeeExpensePieces + 1 }, (_, i) => ({
          ...structuredClone(first),
          id: `fee${i}`,
        }));
      },
    ],
    [
      'expenses',
      limits.maxFeeExpensePieces,
      (raw) => {
        const model = raw.economicsAssumptions!.expenseModel!;
        const first = model.annualExpenses![0]!;
        model.annualExpenses = Array.from({ length: limits.maxFeeExpensePieces + 1 }, (_, i) => ({
          ...structuredClone(first),
          id: `expense${i}`,
        }));
      },
    ],
    [
      'fund years',
      limits.maxFundYears,
      (raw) => {
        raw.fundLife = limits.maxFundYears + 1;
      },
    ],
  ];
  it.each(sourceCases)('%s source plus one', async (label, limit, mutate) => {
    const original = structuredClone(runtime.source.config.raw);
    const raw = makeCapitalRawConfig();
    mutate(raw);
    const source = { ...runtime.source, config: { ...runtime.source.config, raw } };
    try {
      await runtime.pool.query('UPDATE fundconfigs SET config=$1 WHERE id=$2', [
        JSON.stringify(raw),
        runtime.source.config.id,
      ]);
      await refuse(label, makeCapitalCreateBody({ source }), limit, limit + 1);
    } finally {
      await runtime.pool.query('UPDATE fundconfigs SET config=$1 WHERE id=$2', [
        JSON.stringify(original),
        runtime.source.config.id,
      ]);
    }
  });

  it.each(
    (['fee', 'expense'] as const).flatMap((kind) =>
      (['startMonth', 'endMonth'] as const).flatMap((field) =>
        (['fund_month_zero_based', 'fund_month_one_based'] as const).map((origin) => ({
          kind,
          field,
          origin,
        }))
      )
    )
  )(
    'rejects normalized $kind $field 840 under $origin before writes',
    async ({ kind, field, origin }) => {
      const original = runtime.source.config.raw;
      const raw = makeCapitalRawConfig();
      const source = { ...runtime.source, config: { ...runtime.source.config, raw } };
      const body = makeCapitalCreateBody({ source });
      const offset = origin === 'fund_month_one_based' ? 1 : 0;
      const months = { startMonth: offset, endMonth: 23 + offset };
      months[field] = limits.maxScheduleMonth + 1 + offset;
      const sourcePath = kind === 'fee' ? 'feeProfiles[0].feeTiers[0]' : 'fundExpenses[0]';
      if (kind === 'fee') {
        delete raw.economicsAssumptions!.feeModel!.tiers;
        raw.feeProfiles = [
          {
            id: 'legacy-fee',
            name: 'Legacy fee',
            feeTiers: [
              { id: 'fee-1', name: 'Fee', percentage: 2, feeBasis: 'committed_capital', ...months },
            ],
          },
        ];
        body.unitDeclarations[`${sourcePath}.percentage`] = 'percent_points';
      } else {
        delete raw.economicsAssumptions!.expenseModel!.annualExpenses;
        delete body.unitDeclarations['economicsAssumptions.expenseModel.annualExpenses[0].amount'];
        raw.fundExpenses = [
          { id: 'expense-1', category: 'administration', monthlyAmount: 1, ...months },
        ];
        body.unitDeclarations[`${sourcePath}.monthlyAmount`] = 'usd';
      }
      body.unitDeclarations[`${sourcePath}.startMonth`] = origin;
      body.unitDeclarations[`${sourcePath}.endMonth`] = origin;
      const request = makeCapitalCreateBody(
        { source },
        { unitDeclarations: body.unitDeclarations }
      );
      try {
        await runtime.pool.query('UPDATE fundconfigs SET config=$1 WHERE id=$2', [
          JSON.stringify(raw),
          runtime.source.config.id,
        ]);
        await refuse(
          `${kind} ${field} normalized schedule month ${origin}`,
          request,
          limits.maxScheduleMonth,
          limits.maxScheduleMonth + 1,
          `${sourcePath}.${field}`
        );
      } finally {
        await runtime.pool.query('UPDATE fundconfigs SET config=$1 WHERE id=$2', [
          JSON.stringify(original),
          runtime.source.config.id,
        ]);
      }
    }
  );

  it('applies the raw projection fact budget before source CAS and writes', async () => {
    const body = makeCapitalCreateBody(runtime);
    const raw = makeCapitalRawConfig();
    raw.pipelineProfiles = Array.from({ length: 1000 }, (_, i) => ({
      ...structuredClone(raw.pipelineProfiles![0]!),
      id: `p${i}`,
    }));
    const original = runtime.source.config.raw;
    try {
      await runtime.pool.query('UPDATE fundconfigs SET config=$1 WHERE id=$2', [
        JSON.stringify(raw),
        runtime.source.config.id,
      ]);
      await refuse('source facts plus one', body, limits.maxSourceFacts, limits.maxSourceFacts + 1);
    } finally {
      await runtime.pool.query('UPDATE fundconfigs SET config=$1 WHERE id=$2', [
        JSON.stringify(original),
        runtime.source.config.id,
      ]);
    }
  });

  it('rejects exactly 262145 transport bytes with 413 and no durable writes', async () => {
    const json = Buffer.from(JSON.stringify(makeCapitalCreateBody(runtime)));
    const rawBody = Buffer.concat([json, Buffer.alloc(262145 - json.length, ' ')]);
    const before = await runtime.snapshot();
    const response = await runtime.request('POST', createPath(), {
      rawBody,
      headers: { 'Idempotency-Key': randomUUID() },
    });
    const after = await runtime.snapshot();
    records.push({
      label: 'transport bytes plus one',
      observed: rawBody.length,
      limit: 262144,
      status: response.status,
      body: response.body,
      before,
      after,
    });
    const refusalProof = inspectCapitalRefusal(response, before);
    records.push({ label: 'transport-refusal-proof', refusalProof });
    expect(refusalProof.violations).toEqual([]);
    expect(response.status).toBe(413);
    expect(after.sha256).toBe(before.sha256);
  });
});

describe('B8 physical saved-envelope byte limit', () => {
  beforeAll(async () => {
    const source = maximum[0]!.source;
    runtime = await startCapitalScenarioHttpRuntime({
      label: 'saved-byte-limit',
      evidenceDir: EVIDENCE,
      rateLimitMax: 1000,
      source: {
        rawConfig: source.config.raw,
        fundSize: source.fund.size,
        baseCurrency: source.fund.baseCurrency,
        publishedAt: source.config.publishedAt,
      },
    });
  }, 120_000);
  afterAll(async () => {
    const lifecycle = await runtime.close();
    records.push({ label: 'saved-byte-lifecycle', lifecycle });
    expect(lifecycle.api.graceful).toBe(true);
    expect(lifecycle.containerStopped).toBe(true);
    expect(lifecycle.errors).toEqual([]);
    await writeFile(
      path.join(EVIDENCE, 'limit-cases.json'),
      `${JSON.stringify(records, null, 2)}\n`
    );
  }, 30_000);
  it('refuses exactly 2097153 stored bytes while request bytes remain below transport limit', async () => {
    const inputs = maximum.map((entry) => CapitalPlanningInputV1Schema.parse(entry.inputs[0]));
    inputs[4]!.allocations[0]!.name += 'x';
    const body = makeCapitalCreateBody(runtime, {
      inputs,
      unitDeclarations: maximum[0]!.unitDeclarations as CapitalUnitDeclarationsV1,
    });
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(262144);
    await refuse(
      'five physical envelopes input bytes plus one',
      body,
      limits.maxInputBytes,
      limits.maxInputBytes + 1
    );
  }, 30_000);
  it('rejects thirteen selected stages while raw unused stages remain a separate domain', async () => {
    const original = runtime.source.config.raw;
    const raw = structuredClone(maximum[0]!.source.config.raw);
    const profile = raw.pipelineProfiles[0]!;
    profile.stages.push({ ...structuredClone(profile.stages[11]!), id: 's12', name: 'Round 12' });
    const input = CapitalPlanningInputV1Schema.parse(maximum[0]!.inputs[0]);
    input.allocations = input.allocations.slice(0, 2);
    input.allocations.forEach((allocation) => {
      allocation.budgetShareRatio = '0.500000000000';
    });
    const second = input.allocations[1]!;
    second.entryStageId = 's6';
    second.followOnRounds.forEach((followOn, index) => {
      followOn.stageId = `s${index + 7}`;
    });
    const source = { ...runtime.source, config: { ...runtime.source.config, raw } };
    try {
      await runtime.pool.query('UPDATE fundconfigs SET config=$1 WHERE id=$2', [
        JSON.stringify(raw),
        runtime.source.config.id,
      ]);
      await refuse(
        'selected stages plus one',
        makeCapitalCreateBody(
          { source },
          {
            inputs: [input],
            unitDeclarations: maximum[0]!.unitDeclarations as CapitalUnitDeclarationsV1,
          }
        ),
        limits.maxStages,
        limits.maxStages + 1
      );
    } finally {
      await runtime.pool.query('UPDATE fundconfigs SET config=$1 WHERE id=$2', [
        JSON.stringify(original),
        runtime.source.config.id,
      ]);
    }
  });
});

describe('B8 physical snapshot byte boundary inside the durable HTTP transaction', () => {
  let store: typeof import('../../server/services/fund-scenario-capital-snapshot-store');
  let targetId: string;
  beforeAll(async () => {
    runtime = await startCapitalScenarioHttpRuntime({
      label: 'snapshot-byte-limit',
      mode: 'in-process',
      evidenceDir: EVIDENCE,
      rateLimitMax: 1000,
      beforeAppImport: async () => {
        vi.resetModules();
        store = await import('../../server/services/fund-scenario-capital-snapshot-store');
      },
    });
    const created = await runtime.request('POST', createPath(), {
      body: makeCapitalCreateBody(runtime),
      headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(created.status).toBe(201);
    targetId = (created.body as { scenarioSetId: string }).scenarioSetId;
  }, 120_000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    const lifecycle = await runtime.close();
    records.push({ label: 'snapshot-byte-lifecycle', lifecycle });
    expect(lifecycle.api.graceful).toBe(true);
    expect(lifecycle.containerStopped).toBe(true);
    expect(lifecycle.errors).toEqual([]);
    await writeFile(
      path.join(EVIDENCE, 'limit-cases.json'),
      `${JSON.stringify(records, null, 2)}\n`
    );
  }, 30_000);
  it('rejects a schema-valid 16777217-byte snapshot and rolls back its new run', async () => {
    const original = store.persistCapitalScenarioSnapshot;
    let observedBytes = 0;
    vi.spyOn(store, 'persistCapitalScenarioSnapshot').mockImplementation(
      async (client, input, context) => {
        const payload = structuredClone(input.payload);
        const construction = payload.variants[0]!.result.construction;
        const row = construction.monthlyDetail[0]!;
        construction.monthlyDetail = Array.from({ length: limits.maxExpandedRows }, () => ({
          ...row,
          allocationId: 'a',
        }));
        let remaining = limits.maxSnapshotBytes + 1 - Buffer.byteLength(JSON.stringify(payload));
        expect(remaining).toBeGreaterThan(0);
        for (const entry of construction.monthlyDetail) {
          const padding = Math.min(119, remaining);
          entry.allocationId += 'a'.repeat(padding);
          remaining -= padding;
          if (remaining === 0) break;
        }
        expect(remaining).toBe(0);
        expect(FundScenarioCapitalCalculationPayloadV1Schema.safeParse(payload).success).toBe(true);
        observedBytes = Buffer.byteLength(JSON.stringify(payload));
        expect(observedBytes).toBe(limits.maxSnapshotBytes + 1);
        return original(client, { ...input, payload }, context);
      }
    );
    const before = await runtime.snapshot();
    const response = await runtime.request(
      'POST',
      `/api/funds/${runtime.fundId}/scenario-sets/${targetId}/calculate?representation=capital-plan-v1`,
      { body: {} }
    );
    const after = await runtime.snapshot();
    records.push({
      label: 'snapshot bytes plus one',
      mode: 'call-through payload fault after real calculation',
      observedBytes,
      before,
      after,
      status: response.status,
      body: response.body,
    });
    const refusalProof = inspectCapitalRefusal(response, before);
    records.push({ label: 'snapshot-refusal-proof', refusalProof });
    expect(refusalProof.violations).toEqual([]);
    expect(response.status, response.rawBody.toString()).toBe(422);
    expect(response.body).toMatchObject({
      code: 'INPUT_TOO_LARGE',
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: 'snapshot',
            limit: limits.maxSnapshotBytes,
            observed: limits.maxSnapshotBytes + 1,
          }),
        ]),
      },
    });
    expect(after.sha256).toBe(before.sha256);
  }, 30_000);
});
