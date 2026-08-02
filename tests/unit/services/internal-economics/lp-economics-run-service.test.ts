/**
 * lp-economics-run-service.test.ts
 *
 * WP-L3 Phase C acceptance fixtures (T-C1..T-C17, T-C19, T-C20). T-C18 (the
 * worst-case wall-clock benchmark) lives in its own pure-compute file per
 * the plan's isolation requirement (P-D7 R6):
 * tests/unit/internal-economics/lp-economics-run-worst-case-benchmark.test.ts.
 *
 * Uses an in-memory Drizzle-query-shaped mock database (`FakeRunDb`),
 * mirroring the precedent established by
 * tests/unit/services/financial-facts-snapshot-service.test.ts, extended
 * with a real per-fundId keyed-mutex simulation of
 * `pg_advisory_xact_lock` so the concurrency fixtures (T-C6/T-C7) exercise
 * genuine serialization rather than JS microtask ordering alone. No real
 * Postgres connection is used or required.
 */
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import type { db } from '../../../../server/db';
import { IdempotentCommandError } from '../../../../server/lib/idempotent-command';
import {
  LP_ECONOMICS_RESULT_CALC_VERSION,
  LP_ECONOMICS_RUN_ENGINE_VERSION,
  LP_ECONOMICS_RUN_METHODOLOGY_VERSION,
  MAX_CASH_ASSEMBLY_PERIOD_COUNT,
  MAX_CASH_ASSEMBLY_TOTAL_EVENT_COUNT,
  executeLpEconomicsRun,
  getRunWithResult,
} from '../../../../server/services/internal-economics/lp-economics-run-service';
import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';
import { Decimal } from '../../../../shared/lib/decimal-config';
import * as cashAssemblyPeriodLoopModule from '../../../../shared/lib/internal-economics/cash-assembly-period-loop-v1';
import {
  CashAssemblyPeriodLoopV1Error,
  executeCashAssemblyPeriodLoopV1,
} from '../../../../shared/lib/internal-economics/cash-assembly-period-loop-v1';
import { DecimalWaterfallCoreV1Error } from '../../../../shared/lib/internal-economics/decimal-waterfall-core-v1';
import {
  CashAssemblyEventStreamInvariantError,
  CashAssemblyEventStreamV1Error,
} from '../../../../shared/lib/internal-economics/cash-assembly-event-stream-v1';
import { CashAssemblyCallSizingV1Error } from '../../../../shared/lib/internal-economics/cash-assembly-call-sizing-v1';
import { PresentationRoundingError } from '../../../../shared/lib/internal-economics/presentation-rounding-v1';
import {
  TerminalPolicyV1Error,
  INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
} from '../../../../shared/contracts/internal-economics/terminal-policy-v1.contract';
import { LP_ECONOMICS_RUN_CONTRACT_VERSION as LEGACY_LP_ECONOMICS_RUN_CONTRACT_VERSION } from '../../../../shared/contracts/internal-economics/lp-economics-run-v1.contract';
import {
  LP_ECONOMICS_RUN_CONTRACT_VERSION_V1_1,
  LpEconomicsRunRequestV1_1Schema,
  type LpEconomicsRunRequestV1_1,
} from '../../../../shared/contracts/internal-economics/lp-economics-run-v1.1.contract';
import {
  internalCapitalEnvelopeVersions,
  internalEconomicsPolicyVersions,
  internalLpEconomicsRuns,
} from '../../../../shared/schema/internal-economics';
import { financialFactsSnapshots } from '../../../../shared/schema/financial-facts-snapshots';
import { currentPlanVersions } from '../../../../shared/schema/current-plans';
import { fundConfigs, fundSnapshots } from '../../../../shared/schema/fund';

type RunDatabase = typeof db;

// ---------------------------------------------------------------------------
// Keyed mutex: faithfully simulates `pg_advisory_xact_lock`'s
// transaction-scoped, per-key serialization (real Postgres semantics this
// service's correctness depends on -- see P-D7 step 1).
// ---------------------------------------------------------------------------

class KeyedMutex {
  private tails = new Map<string, Promise<unknown>>();

  async acquire(key: string): Promise<() => void> {
    const prior = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(
      key,
      prior.then(() => next)
    );
    await prior;
    return release;
  }
}

function paramMatches(rowValue: unknown, param: unknown): boolean {
  if (rowValue instanceof Date) {
    const paramTime = param instanceof Date ? param.getTime() : new Date(String(param)).getTime();
    return rowValue.getTime() === paramTime;
  }
  return rowValue === param;
}

class FakeRunDb {
  policyRows: Record<string, unknown>[] = [];
  envelopeRows: Record<string, unknown>[] = [];
  factsRows: Record<string, unknown>[] = [];
  planRows: Record<string, unknown>[] = [];
  fundSnapshotRows: Record<string, unknown>[] = [];
  fundConfigRows: Record<string, unknown>[] = [];
  runRows: Record<string, unknown>[] = [];

  transactionAttempts = 0;
  readonly transactionConfigs: Record<string, unknown>[] = [];
  insertSerializationFailuresRemaining = 0;
  readonly runInsertAttempts: Record<string, unknown>[] = [];

  private readonly mutex = new KeyedMutex();
  private readonly pendingReleases: Array<() => void> = [];
  private nextRunRowId = 1;

  asDatabase(): RunDatabase {
    return this as unknown as RunDatabase;
  }

  async transaction<T>(
    callback: (transaction: RunDatabase) => Promise<T>,
    config?: Record<string, unknown>
  ): Promise<T> {
    this.transactionAttempts += 1;
    this.transactionConfigs.push(config ?? {});
    const releasesBefore = this.pendingReleases.length;
    try {
      return await callback(this.asDatabase());
    } finally {
      while (this.pendingReleases.length > releasesBefore) {
        const release = this.pendingReleases.pop();
        release?.();
      }
    }
  }

  async execute(query: SQL): Promise<{ rows: unknown[] }> {
    const rendered = new PgDialect().sqlToQuery(query);
    if (rendered.sql.includes('pg_advisory_xact_lock')) {
      const lockKey = String(rendered.params[0]);
      const release = await this.mutex.acquire(lockKey);
      this.pendingReleases.push(release);
      return { rows: [] };
    }
    return { rows: [] };
  }

  select(_projection?: unknown) {
    return {
      from: (table: unknown) => ({
        where: (condition: unknown) => ({
          limit: async (_count: number) => this.filterRows(table, condition),
        }),
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: (_opts: unknown) => ({
          returning: async () => {
            if (table !== internalLpEconomicsRuns) return [];
            this.runInsertAttempts.push(values);
            if (this.insertSerializationFailuresRemaining > 0) {
              this.insertSerializationFailuresRemaining -= 1;
              throw Object.assign(new Error('serialization_failure'), { code: '40001' });
            }
            const conflict = this.runRows.some(
              (row) =>
                row['fundId'] === values['fundId'] &&
                row['idempotencyKey'] === values['idempotencyKey']
            );
            if (conflict) return [];
            const inserted = { id: this.nextRunRowId, createdAt: new Date(), ...values };
            this.nextRunRowId += 1;
            this.runRows.push(inserted);
            return [inserted];
          },
        }),
        returning: async (projection?: Record<string, unknown>) => {
          if (table !== fundSnapshots) return [];
          // Computed from current rows (not a standalone counter) so a
          // pre-seeded row (e.g. the golden fixture's forecast snapshot,
          // inserted directly into the array rather than through this
          // method) can never collide with a later service-issued insert.
          const nextId =
            Math.max(0, ...this.fundSnapshotRows.map((row) => Number(row['id']) || 0)) + 1;
          const inserted: Record<string, unknown> = {
            id: nextId,
            eventCount: 0,
            metadata: null,
            stateHash: null,
            runId: null,
            configId: null,
            configVersion: null,
            scenarioSetId: null,
            h9MoicSourceInputHash: null,
            h9RoundEvidenceInputHash: null,
            h9RoundEvidenceAssumptionsHash: null,
            h9FingerprintHash: null,
            h9PolicyVersion: null,
            h9ActionabilityStatus: null,
            createdAt: new Date(),
            ...values,
          };
          this.fundSnapshotRows.push(inserted);
          if (projection) return [{ id: inserted['id'] }];
          return [inserted];
        },
      }),
    };
  }

  private rowsFor(table: unknown): Record<string, unknown>[] {
    if (table === internalEconomicsPolicyVersions) return this.policyRows;
    if (table === internalCapitalEnvelopeVersions) return this.envelopeRows;
    if (table === financialFactsSnapshots) return this.factsRows;
    if (table === currentPlanVersions) return this.planRows;
    if (table === fundSnapshots) return this.fundSnapshotRows;
    if (table === fundConfigs) return this.fundConfigRows;
    if (table === internalLpEconomicsRuns) return this.runRows;
    return [];
  }

  private filterRows(table: unknown, condition: unknown): Record<string, unknown>[] {
    const rows = this.rowsFor(table);
    const rendered = new PgDialect().sqlToQuery(condition as SQL);
    return rows.filter((row) =>
      rendered.params.every((param) =>
        Object.values(row).some((value) => paramMatches(value, param))
      )
    );
  }
}

// ---------------------------------------------------------------------------
// Golden-path fixture: the minimal, mutually-consistent basis set that
// clears every section 8 gate and produces a genuine indicative loop
// result. FUND_ID is shared across the whole suite; each test builds its
// own FakeRunDb instance so rows never leak across tests.
// ---------------------------------------------------------------------------

const FUND_ID = 500;
const ACTOR_ID = 7;
const CLOCK = '2026-06-30T23:59:59.000Z';
const CUTOVER_INSTANT = '2025-12-31T23:59:59.999Z';
const PERIOD_START = '2026-01-01';
const PERIOD_END = '2026-03-31';

const ZERO_MONEY = '0.000000';
const ZERO_RATIO = '0.000000000000';
const ONE_RATIO = '1.000000000000';

/** A syntactically valid (lowercase hex, 64 chars) sha256-shaped fixture. */
function hex64(index: number): string {
  return '0123456789abcdef'[index % 16]!.repeat(64);
}

interface GoldenFixtureIds {
  readonly policyId: number;
  readonly envelopeId: number;
  readonly factsId: number;
  readonly planId: number;
  readonly forecastSnapshotId: number;
  readonly fundConfigId: number;
}

function zeroOpeningStateFields() {
  return {
    cashBalanceUsd: ZERO_MONEY,
    cumulativeLpPaidInUsd: ZERO_MONEY,
    cumulativeGpPaidInUsd: ZERO_MONEY,
    gpUnreturnedContributedCapitalUsd: ZERO_MONEY,
    lpDistributionsReturnOfCapitalUsd: ZERO_MONEY,
    lpDistributionsProfitUsd: ZERO_MONEY,
    actualLpDistributionsCumulativeUsd: ZERO_MONEY,
    gpInvestmentDistributionsPaidUsd: ZERO_MONEY,
    gpCarryPaidUsd: ZERO_MONEY,
    accruedPreferredReturnUsd: ZERO_MONEY,
    recallableDistributionsCumulativeUsd: ZERO_MONEY,
    recallableDistributionsOutstandingUsd: ZERO_MONEY,
    recycledProceedsCumulativeUsd: ZERO_MONEY,
    realizedProceedsCumulativeUsd: ZERO_MONEY,
  } as const;
}

/** Resolved (post-adapter) v1.1 opening-state observation, embedded exactly
 * as it would be persisted in a v4 facts payload row. Overrides apply to the
 * raw fields; `lpUnreturnedContributedCapitalUsd` is re-derived to stay
 * internally consistent (cumulativeLpPaidInUsd - lpDistributionsReturnOfCapitalUsd). */
function resolvedOpeningState(overrides: Partial<ReturnType<typeof zeroOpeningStateFields>> = {}) {
  const base = { ...zeroOpeningStateFields(), ...overrides };
  const paidIn = Number(base.cumulativeLpPaidInUsd);
  const roc = Number(base.lpDistributionsReturnOfCapitalUsd);
  return {
    contractVersion: 'fund-accounting-state-observation/1.1.0',
    cutoverInstant: CUTOVER_INSTANT,
    currency: 'USD',
    ...base,
    accruedPreferredReturnThroughInstant: CUTOVER_INSTANT,
    methodologyVersion: 'opening-state-methodology/1.0.0',
    lpUnreturnedContributedCapitalUsd: (paidIn - roc).toFixed(6),
  } as const;
}

/** The full embedded ref shape a v4 facts payload row persists (P-D10 R1):
 * `{sourceArtifactId, sourceArtifactSha256, sourceArtifactCreatedAt,
 * attestedByActorId, observation}`, resolved (post-adapter) form. */
function resolvedOpeningAccountingStateRef(
  overrides: Partial<ReturnType<typeof zeroOpeningStateFields>> = {}
) {
  return {
    sourceArtifactId: 1,
    sourceArtifactSha256: hex64(15),
    sourceArtifactCreatedAt: '2026-01-01T00:00:00.000Z',
    attestedByActorId: ACTOR_ID,
    observation: resolvedOpeningState(overrides),
  };
}

function goldenForecastSeries() {
  return [
    {
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      source: 'projected' as const,
      deployedUsd: ZERO_MONEY,
      contributionsUsd: ZERO_MONEY,
      distributionsUsd: ZERO_MONEY,
      navUsd: ZERO_MONEY,
      tvpi: ZERO_RATIO,
      dpi: ZERO_RATIO,
      activeCompanyCount: 0,
      projectedCohortCount: 0,
    },
  ];
}

function goldenForecastPayload() {
  return {
    contractVersion: 'current-forecast-v2' as const,
    fundId: FUND_ID,
    financialFactsSnapshotId: '1',
    currentPlanVersionId: '1',
    asOfDate: '2026-06-30',
    status: 'available' as const,
    series: goldenForecastSeries(),
    remainingDeployableCapitalUsd: ZERO_MONEY,
    committedCapitalUsd: '1000000.000000',
    calledToDateUsd: ZERO_MONEY,
    projectedFeesRemainingUsd: ZERO_MONEY,
    recallableDistributionsUsd: ZERO_MONEY,
    uncalledCapitalUsd: '1000000.000000',
    netIrr: null,
    inputHash: hex64(1),
    assumptionsHash: hex64(2),
    resultHash: null,
    engineVersion: 'current-forecast-v2-engine/1.0.0' as const,
    methodologyVersion: 'cohort-projection-v2/1.0.0' as const,
    unavailableReasons: [],
    warnings: [],
  };
}

function goldenFundConfig() {
  return {
    fundName: 'Test Fund',
    managementFeeRate: 0,
    lpClasses: [],
    fundExpenses: [],
    feeProfiles: [
      {
        id: 'fp1',
        name: 'Zero Profile',
        feeTiers: [
          {
            id: 'ft1',
            name: 'Zero Tier',
            percentage: 0,
            feeBasis: 'committed_capital',
            startMonth: 0,
          },
        ],
      },
    ],
    economicsAssumptions: {
      version: 'v1',
      feeModel: {
        source: 'economics_override',
        tiers: [{ id: 't1', name: 'Zero', rate: 0, basis: 'committed_capital', startYear: 1 }],
        defaultRate: 0,
      },
      expenseModel: {
        source: 'economics_override',
        annualExpenses: [],
        orgExpenseCap: 0,
      },
    },
  };
}

function goldenPacingAssumptions() {
  return {
    contractVersion: 'current-plan-pacing-v1',
    deploymentQuarters: 1,
    quarterlyDeploymentPcts: [ONE_RATIO],
    followOnReservePct: ZERO_RATIO,
    annualFeeDragPct: ZERO_RATIO,
  };
}

function goldenCohortAssumptions() {
  return {
    contractVersion: 'current-plan-cohort-v1',
    averageInitialCheckUsd: ZERO_MONEY,
    stageDistribution: [{ stage: 'seed', pct: ONE_RATIO }],
    graduationMatrix: [],
    exitAssumptions: [],
  };
}

function goldenFactsPayload(openingAccountingState: unknown = resolvedOpeningAccountingStateRef()) {
  return {
    companyActuals: {
      fundId: FUND_ID,
      asOfDate: '2026-06-30',
      facts: [],
      inputHash: hex64(3),
    },
    sourceObservationIds: [],
    workingValueSelectionIds: [],
    cashFlowSeries: {
      series: [],
      totals: {
        contributions: ZERO_MONEY,
        distributions: ZERO_MONEY,
        recallableDistributions: ZERO_MONEY,
      },
      warnings: [],
    },
    marksSeries: { marks: [], periodNav: [], warnings: [] },
    vehicleRoster: [
      {
        vehicleId: 1,
        vehicleType: 'main_fund',
        vehicleSlug: 'main',
        name: 'Main Fund',
        currency: 'USD',
      },
    ],
    positionRefs: [],
    positionComponentRefs: [],
    ownershipRefs: [],
    valuationRefs: [],
    participationTermRefs: [],
    observationRefs: [],
    openingAccountingState,
  };
}

/** Seeds a fully eligible golden basis set into `fakeDb` and returns the row
 * IDs. Every gate passes; the loop should execute successfully. */
function seedGoldenFixture(fakeDb: FakeRunDb): GoldenFixtureIds {
  const envelope = {
    id: 1,
    fundId: FUND_ID,
    version: 1,
    mainFundVehicleId: 1,
    lpCommitmentUsd: '1000000.000000',
    gpCommitmentUsd: ZERO_MONEY,
    totalCommitmentUsd: '1000000.000000',
    currency: 'USD',
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
    sourceArtifactId: 1,
    sourceConfigId: 1,
    sourceConfigVersion: 1,
    sourceConfigHash: hex64(4),
    attestedBy: ACTOR_ID,
    attestedAt: new Date('2026-01-01T00:00:00.000Z'),
    envelopeHash: hex64(5),
    parentEnvelopeVersionId: null,
    idempotencyKey: 'envelope-golden',
    requestHash: hex64(6),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  fakeDb.envelopeRows.push(envelope);

  const policy = {
    id: 1,
    fundId: FUND_ID,
    version: 1,
    policySchemaVersion: 'internal-economics-policy/1.0.0',
    policyBody: {
      waterfallTemplate: 'deal_by_deal',
      carryPct: 0.2,
      hurdle: { basis: 'none' },
      managementFeesUsd: ZERO_MONEY,
      fundExpenses: [],
      cashBufferQuarters: 0,
      terminalMode: 'hold_unrealized',
      // resolveTerminalPeriodEndV1('2021-01-01', 5yr=60mo) -> 2026-01-01 ->
      // containing quarter end 2026-03-31, matching PERIOD_END below (the
      // gate-8 match-assert re-derives and compares this exactly).
      termStartDate: '2021-01-01',
      fundLifeYears: '5',
    },
    normalizationWarnings: [],
    terminalPeriodEnd: PERIOD_END,
    terminalResolutionMethodologyVersion: INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
    capitalEnvelopeVersionId: envelope.id,
    assumptionsHash: hex64(7),
    sourceConfigId: 1,
    sourceConfigVersion: 1,
    parentPolicyVersionId: null,
    createdBy: ACTOR_ID,
    idempotencyKey: 'policy-golden',
    requestHash: hex64(8),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  fakeDb.policyRows.push(policy);

  const facts = {
    id: 1,
    fundId: FUND_ID,
    policyVersion: 'financial-facts-policy/1.3.0',
    payloadSchemaId: 'financial-facts-payload/4',
    asOfDate: '2026-06-30',
    knowledgeCutoff: new Date('2026-06-30T00:00:00.000Z'),
    vehicleScope: 'fund_all',
    vehicleIds: [1],
    selectionSetHash: hex64(9),
    sourceFactsInputHash: hex64(10),
    snapshotInputHash: hex64(11),
    payload: goldenFactsPayload(),
    consumerEvaluations: [
      { consumer: 'economics', status: 'accepted', reasons: [] },
      { consumer: 'forecast', status: 'accepted', reasons: [] },
    ],
    actorId: ACTOR_ID,
    idempotencyKey: 'facts-golden',
    requestHash: hex64(12),
    supersedesSnapshotId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  fakeDb.factsRows.push(facts);

  const plan = {
    id: 1,
    fundId: FUND_ID,
    version: 1,
    sourceConfigId: 1,
    sourceConfigVersion: 1,
    sourceFactsSnapshotId: facts.id,
    deployableCapitalUsd: '1000000.000000',
    planTransformationVersion: 'plan-transform/1.0.0',
    allocations: [],
    pacingAssumptions: goldenPacingAssumptions(),
    cohortAssumptions: goldenCohortAssumptions(),
    reservePolicyVersion: 'reserve-policy/1.0.0',
    assumptionsHash: hex64(13),
    supersedesVersionId: null,
    supersededByVersionId: null,
    idempotencyKey: 'plan-golden',
    requestHash: hex64(14),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  fakeDb.planRows.push(plan);

  const forecastSnapshot = {
    id: 1,
    fundId: FUND_ID,
    type: 'CURRENT_FORECAST_V2',
    payload: goldenForecastPayload(),
    calcVersion: 'current-forecast-v2-engine/1.0.0',
    correlationId: randomUUID(),
    metadata: null,
    snapshotTime: new Date('2026-06-30T00:00:00.000Z'),
    eventCount: 0,
    stateHash: null,
    state: null,
    runId: null,
    configId: null,
    configVersion: null,
    scenarioSetId: null,
    h9MoicSourceInputHash: null,
    h9RoundEvidenceInputHash: null,
    h9RoundEvidenceAssumptionsHash: null,
    h9FingerprintHash: null,
    h9PolicyVersion: null,
    h9ActionabilityStatus: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  fakeDb.fundSnapshotRows.push(forecastSnapshot);

  const fundConfig = {
    id: 1,
    fundId: FUND_ID,
    version: 1,
    config: goldenFundConfig(),
    isDraft: false,
    isPublished: true,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  fakeDb.fundConfigRows.push(fundConfig);

  return {
    policyId: policy.id,
    envelopeId: envelope.id,
    factsId: facts.id,
    planId: plan.id,
    forecastSnapshotId: forecastSnapshot.id,
    fundConfigId: fundConfig.id,
  };
}

function goldenRequest(
  overrides: Partial<LpEconomicsRunRequestV1_1> = {}
): LpEconomicsRunRequestV1_1 {
  return {
    policyVersionId: 1,
    factsSnapshotId: 1,
    planVersionId: 1,
    forecastSnapshotId: 1,
    terminalMode: 'hold_unrealized',
    clock: CLOCK,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T-C1: completed-indicative happy path.
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C1 indicative happy path', () => {
  it('persists one run row + one snapshot in a single transaction, with a stable result_hash across replay', async () => {
    const fakeDb = new FakeRunDb();
    seedGoldenFixture(fakeDb);

    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'run-golden-1',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });

    expect(receipt.run.runState).toBe('completed');
    expect(receipt.run.resultStatus).toBe('indicative');
    expect(receipt.run.calculationContractVersion).toBe('lp-economics/1.1.0');
    expect(receipt.run.resultSnapshotId).not.toBeNull();
    expect(receipt.run.failureCode).toBeNull();
    expect(receipt.run.engineVersion).toBe(LP_ECONOMICS_RUN_ENGINE_VERSION);
    expect(receipt.run.methodologyVersion).toBe(LP_ECONOMICS_RUN_METHODOLOGY_VERSION);
    expect(LP_ECONOMICS_RUN_CONTRACT_VERSION_V1_1).toBe('lp-economics/1.1.0');
    expect(LP_ECONOMICS_RUN_ENGINE_VERSION).toBe('cash-assembly-period-loop-v1/1.1.0');
    expect(LP_ECONOMICS_RUN_METHODOLOGY_VERSION).toBe(
      'cash-assembly-period-loop-methodology/1.1.0'
    );
    expect(LP_ECONOMICS_RESULT_CALC_VERSION).toBe('lp-economics/1.1.0');
    expect(receipt.run.requestHash).toBe(
      canonicalSha256({
        commandKind: 'internal-economics-run:create',
        fundId: FUND_ID,
        contractVersion: 'lp-economics/1.1.0',
        request: goldenRequest(),
        engineVersion: 'cash-assembly-period-loop-v1/1.1.0',
        methodologyVersion: 'cash-assembly-period-loop-methodology/1.1.0',
      })
    );
    expect(receipt.result).not.toBeNull();
    expect(receipt.result?.resultStatus).toBe('indicative');
    expect(fakeDb.fundSnapshotRows).toHaveLength(2); // seeded forecast + persisted result
    expect(fakeDb.runRows).toHaveLength(1);
    expect(fakeDb.transactionAttempts).toBe(1);

    const resultSnapshot = fakeDb.fundSnapshotRows.find(
      (row) => row['type'] === 'INTERNAL_LP_ECONOMICS'
    );
    expect(resultSnapshot).toBeDefined();
    expect(resultSnapshot?.['calcVersion']).toBe(LP_ECONOMICS_RESULT_CALC_VERSION);

    const replay = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID + 1,
      idempotencyKey: 'run-golden-1',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });

    expect(replay.run.id).toBe(receipt.run.id);
    expect(replay.run.createdBy).toBe(ACTOR_ID);
    expect(replay.run.resultHash).toBe(receipt.run.resultHash);
    expect(replay.result).toEqual(receipt.result);
    expect(fakeDb.runRows).toHaveLength(1);
    expect(fakeDb.fundSnapshotRows).toHaveLength(2);
  });

  it('persists DB status from a validated cap-free V1.1 value payload', async () => {
    const fakeDb = new FakeRunDb();
    seedGoldenFixture(fakeDb);
    const originalLoop = cashAssemblyPeriodLoopModule.executeCashAssemblyPeriodLoopV1;
    const spy = vi
      .spyOn(cashAssemblyPeriodLoopModule, 'executeCashAssemblyPeriodLoopV1')
      .mockImplementation((input) => ({
        ...originalLoop(input),
        resultStatus: 'available',
        resultStatusReasons: [],
      }));

    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'run-available-status',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    spy.mockRestore();

    expect(receipt.run.resultStatus).toBe('available');
    expect(receipt.result?.resultStatus).toBe('available');
    expect(receipt.result?.reasons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T-C2: every section 8 gate -> completed-unavailable, exactly one
// persisted snapshot, reasons sorted/deduplicated, plus the defensive
// loop-seam OPENING_STATE_INELIGIBLE injection.
// ---------------------------------------------------------------------------

function seededDb(mutate: (fakeDb: FakeRunDb) => void): FakeRunDb {
  const fakeDb = new FakeRunDb();
  seedGoldenFixture(fakeDb);
  mutate(fakeDb);
  return fakeDb;
}

async function expectUnavailable(
  fakeDb: FakeRunDb,
  idempotencyKey: string,
  expectedCode: string,
  requestOverrides: Partial<LpEconomicsRunRequestV1_1> = {}
) {
  const receipt = await executeLpEconomicsRun({
    fundId: FUND_ID,
    actorId: ACTOR_ID,
    idempotencyKey,
    request: goldenRequest(requestOverrides),
    database: fakeDb.asDatabase(),
  });
  expect(receipt.run.runState).toBe('completed');
  expect(receipt.run.resultStatus).toBe('unavailable');
  expect(receipt.run.calculationContractVersion).toBe('lp-economics/1.1.0');
  expect(receipt.run.failureCode).toBeNull();
  expect(receipt.result?.resultStatus).toBe('unavailable');
  const reasons = receipt.result?.resultStatus === 'unavailable' ? receipt.result.reasons : [];
  expect(reasons.map((reason) => reason.code)).toContain(expectedCode);
  expect(
    fakeDb.fundSnapshotRows.filter((row) => row['type'] === 'INTERNAL_LP_ECONOMICS')
  ).toHaveLength(1);
  return receipt;
}

describe('executeLpEconomicsRun -- T-C2 section 8 gates', () => {
  it('gate 1: MAIN_FUND_VEHICLE_ABSENT when the pinned vehicle is reclassified', async () => {
    const fakeDb = seededDb((db_) => {
      const facts = db_.factsRows[0]!;
      const payload = facts['payload'] as { vehicleRoster: Array<Record<string, unknown>> };
      payload.vehicleRoster[0]!['vehicleType'] = 'spv';
    });
    await expectUnavailable(fakeDb, 'gate1-absent', 'MAIN_FUND_VEHICLE_ABSENT');
  });

  it('gate 1: MAIN_FUND_CURRENCY_UNSUPPORTED', async () => {
    const fakeDb = seededDb((db_) => {
      const facts = db_.factsRows[0]!;
      const payload = facts['payload'] as { vehicleRoster: Array<Record<string, unknown>> };
      payload.vehicleRoster[0]!['currency'] = 'EUR';
    });
    await expectUnavailable(fakeDb, 'gate1-currency', 'MAIN_FUND_CURRENCY_UNSUPPORTED');
  });

  it('gate 1: MAIN_FUND_SCOPED_FORECAST_UNAVAILABLE when an spv roster entry is present', async () => {
    const fakeDb = seededDb((db_) => {
      const facts = db_.factsRows[0]!;
      const payload = facts['payload'] as { vehicleRoster: Array<Record<string, unknown>> };
      payload.vehicleRoster.push({
        vehicleId: 2,
        vehicleType: 'spv',
        vehicleSlug: 'spv-1',
        name: 'SPV One',
        currency: 'USD',
      });
    });
    await expectUnavailable(fakeDb, 'gate1-spv', 'MAIN_FUND_SCOPED_FORECAST_UNAVAILABLE');
  });

  it('gate 2: CONFIG_LINEAGE_MISMATCH when policy/plan diverge on source config version', async () => {
    const fakeDb = seededDb((db_) => {
      db_.planRows[0]!['sourceConfigVersion'] = 2;
    });
    await expectUnavailable(fakeDb, 'gate2', 'CONFIG_LINEAGE_MISMATCH');
  });

  it.each(['unavailable', 'failed', 'held'] as const)(
    'gate 3: forecast status %s maps to the matching registry code',
    async (status) => {
      const expectedCode =
        status === 'unavailable'
          ? 'FORECAST_UNAVAILABLE'
          : status === 'failed'
            ? 'FORECAST_FAILED'
            : 'FORECAST_HELD_UNSUPPORTED';
      const fakeDb = seededDb((db_) => {
        const forecastRow = db_.fundSnapshotRows.find(
          (row) => row['type'] === 'CURRENT_FORECAST_V2'
        )!;
        (forecastRow['payload'] as Record<string, unknown>)['status'] = status;
      });
      await expectUnavailable(fakeDb, `gate3-${status}`, expectedCode);
    }
  );

  it('gate 4: FACTS_ECONOMICS_EVALUATION_BLOCKED when economics is blocked', async () => {
    const fakeDb = seededDb((db_) => {
      db_.factsRows[0]!['consumerEvaluations'] = [
        { consumer: 'economics', status: 'blocked', reasons: [] },
      ];
    });
    await expectUnavailable(fakeDb, 'gate4-blocked', 'FACTS_ECONOMICS_EVALUATION_BLOCKED');
  });

  it('gate 4: FACTS_ECONOMICS_EVALUATION_BLOCKED when the economics entry is missing', async () => {
    const fakeDb = seededDb((db_) => {
      db_.factsRows[0]!['consumerEvaluations'] = [
        { consumer: 'forecast', status: 'accepted', reasons: [] },
      ];
    });
    await expectUnavailable(fakeDb, 'gate4-missing', 'FACTS_ECONOMICS_EVALUATION_BLOCKED');
  });

  it('gate 4: FACTS_ECONOMICS_EVALUATION_BLOCKED when the economics entry is duplicated', async () => {
    const fakeDb = seededDb((db_) => {
      db_.factsRows[0]!['consumerEvaluations'] = [
        { consumer: 'economics', status: 'accepted', reasons: [] },
        { consumer: 'economics', status: 'accepted', reasons: [] },
      ];
    });
    await expectUnavailable(fakeDb, 'gate4-duplicate', 'FACTS_ECONOMICS_EVALUATION_BLOCKED');
  });

  it('gate 5: OPENING_CASH_UNAVAILABLE when openingAccountingState is null', async () => {
    const fakeDb = seededDb((db_) => {
      (db_.factsRows[0]!['payload'] as Record<string, unknown>)['openingAccountingState'] = null;
    });
    await expectUnavailable(fakeDb, 'gate5-null', 'OPENING_CASH_UNAVAILABLE');
  });

  it('gate 5: OPENING_STATE_CONTRACT_INELIGIBLE for a v3/v1-ref payload', async () => {
    const fakeDb = seededDb((db_) => {
      const facts = db_.factsRows[0]!;
      facts['policyVersion'] = 'financial-facts-policy/1.2.0';
      facts['payloadSchemaId'] = 'financial-facts-payload/3';
      (facts['payload'] as Record<string, unknown>)['openingAccountingState'] = {
        sourceArtifactId: 1,
        sourceArtifactSha256: hex64(16),
        sourceArtifactCreatedAt: '2026-01-01T00:00:00.000Z',
        attestedByActorId: ACTOR_ID,
        observation: {
          contractVersion: 'fund-accounting-state-observation/1.0.0',
          cutoverInstant: CUTOVER_INSTANT,
          currency: 'USD',
          ...zeroOpeningStateFields(),
          lpUnreturnedContributedCapitalUsd: ZERO_MONEY,
          accruedPreferredReturnThroughInstant: CUTOVER_INSTANT,
          methodologyVersion: 'opening-state-methodology/1.0.0',
        },
      };
    });
    await expectUnavailable(fakeDb, 'gate5-v1ref', 'OPENING_STATE_CONTRACT_INELIGIBLE');
  });

  it.each([
    'cumulativeGpPaidInUsd',
    'gpUnreturnedContributedCapitalUsd',
    'gpInvestmentDistributionsPaidUsd',
    'accruedPreferredReturnUsd',
  ] as const)('gate 5: OPENING_STATE_INELIGIBLE on %s alone, loop never invoked', async (field) => {
    const fakeDb = seededDb((db_) => {
      (db_.factsRows[0]!['payload'] as Record<string, unknown>)['openingAccountingState'] =
        resolvedOpeningAccountingStateRef({ [field]: '0.000001' });
    });
    const spy = vi.spyOn(cashAssemblyPeriodLoopModule, 'executeCashAssemblyPeriodLoopV1');
    const receipt = await expectUnavailable(fakeDb, `gate5-${field}`, 'OPENING_STATE_INELIGIBLE');
    expect(spy).not.toHaveBeenCalled();
    const reasons = receipt.result?.resultStatus === 'unavailable' ? receipt.result.reasons : [];
    const reason = reasons.find((entry) => entry.code === 'OPENING_STATE_INELIGIBLE');
    expect(reason?.context).toMatchObject({ field, valueUsd: '0.000001' });
    spy.mockRestore();
  });

  it('gate 5: OPENING_STATE_INELIGIBLE picks the first nonzero field in fixed order when several are nonzero', async () => {
    const fakeDb = seededDb((db_) => {
      (db_.factsRows[0]!['payload'] as Record<string, unknown>)['openingAccountingState'] =
        resolvedOpeningAccountingStateRef({
          gpUnreturnedContributedCapitalUsd: '0.000002',
          accruedPreferredReturnUsd: '0.000003',
        });
    });
    const spy = vi.spyOn(cashAssemblyPeriodLoopModule, 'executeCashAssemblyPeriodLoopV1');
    const receipt = await expectUnavailable(fakeDb, 'gate5-multi', 'OPENING_STATE_INELIGIBLE');
    expect(spy).not.toHaveBeenCalled();
    const reasons = receipt.result?.resultStatus === 'unavailable' ? receipt.result.reasons : [];
    const reason = reasons.find((entry) => entry.code === 'OPENING_STATE_INELIGIBLE');
    // Fixed order: cumulativeGpPaidInUsd, gpUnreturnedContributedCapitalUsd,
    // gpInvestmentDistributionsPaidUsd, accruedPreferredReturnUsd -- the
    // second field in that order must win, not the third.
    expect(reason?.context).toMatchObject({ field: 'gpUnreturnedContributedCapitalUsd' });
    spy.mockRestore();
  });

  it('gate 6: GP_COMMITMENT_UNSUPPORTED when the envelope carries a nonzero GP commitment', async () => {
    const fakeDb = seededDb((db_) => {
      db_.envelopeRows[0]!['gpCommitmentUsd'] = '1.000000';
    });
    await expectUnavailable(fakeDb, 'gate6', 'GP_COMMITMENT_UNSUPPORTED');
  });

  it('gate 7: FORECAST_FEE_BASIS_INCOMPATIBLE when the source fund config is missing', async () => {
    const fakeDb = seededDb((db_) => {
      db_.fundConfigRows.length = 0;
    });
    await expectUnavailable(fakeDb, 'gate7-missing', 'FORECAST_FEE_BASIS_INCOMPATIBLE');
  });

  it('gate 7: FORECAST_FEE_BASIS_INCOMPATIBLE when the config carries a nonzero management fee', async () => {
    const fakeDb = seededDb((db_) => {
      (db_.fundConfigRows[0]!['config'] as Record<string, unknown>)['managementFeeRate'] = 0.02;
    });
    await expectUnavailable(fakeDb, 'gate7-nonzero', 'FORECAST_FEE_BASIS_INCOMPATIBLE');
  });

  it('gate 8: TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED for an unrecognized methodology version', async () => {
    const fakeDb = seededDb((db_) => {
      db_.policyRows[0]!['terminalResolutionMethodologyVersion'] = 'some-other-methodology/9.9.9';
    });
    await expectUnavailable(
      fakeDb,
      'gate8-methodology',
      'TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED'
    );
  });

  it('gate 8: TERMINAL_RESOLUTION_MISMATCH when the persisted period diverges from the policy-time resolution', async () => {
    const fakeDb = seededDb((db_) => {
      db_.policyRows[0]!['terminalPeriodEnd'] = '2026-06-30';
      const forecastRow = db_.fundSnapshotRows.find(
        (row) => row['type'] === 'CURRENT_FORECAST_V2'
      )!;
      const payload = forecastRow['payload'] as { series: Array<Record<string, unknown>> };
      payload.series[0]!['periodEnd'] = '2026-06-30';
      payload.series[0]!['periodStart'] = '2026-04-01';
    });
    await expectUnavailable(fakeDb, 'gate8-mismatch', 'TERMINAL_RESOLUTION_MISMATCH');
  });

  it('gate 8: TERMINAL_BEFORE_CUTOVER when the opening cutover is after the terminal instant', async () => {
    const fakeDb = seededDb((db_) => {
      (db_.factsRows[0]!['payload'] as Record<string, unknown>)['openingAccountingState'] =
        resolvedOpeningAccountingStateRef();
      const opening = (
        (db_.factsRows[0]!['payload'] as Record<string, unknown>)[
          'openingAccountingState'
        ] as Record<string, unknown>
      )['observation'] as Record<string, unknown>;
      opening['cutoverInstant'] = '2026-12-31T23:59:59.999Z';
      opening['accruedPreferredReturnThroughInstant'] = '2026-12-31T23:59:59.999Z';
    });
    await expectUnavailable(fakeDb, 'gate8-cutover', 'TERMINAL_BEFORE_CUTOVER');
  });

  it('gate 8: FORECAST_HORIZON_SHORT when the forecast never reaches the terminal period', async () => {
    const fakeDb = seededDb((db_) => {
      db_.policyRows[0]!['terminalPeriodEnd'] = '2030-03-31';
      db_.policyRows[0]!['terminalResolutionMethodologyVersion'] =
        INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION;
      // Keep the match-assert satisfied by aligning the term anchor with the
      // new terminal period (2021-01-01 + 9yr = 2030-01-01 -> Q1 end 2030-03-31).
      (db_.policyRows[0]!['policyBody'] as Record<string, unknown>)['fundLifeYears'] = '9';
    });
    await expectUnavailable(fakeDb, 'gate8-horizon', 'FORECAST_HORIZON_SHORT');
  });
});

// ---------------------------------------------------------------------------
// T-C3: typed engine failure -> failed run, no snapshot, key consumed,
// replay returns the same failure. Full seven-class, all-code dispatch
// table sweep via loop-seam injection (P-D7 step 6, normative source).
// ---------------------------------------------------------------------------

interface DispatchCase {
  readonly label: string;
  readonly build: () => Error;
  readonly disposition: 'failed' | 'unavailable';
  readonly code: string;
}

const DISPATCH_TABLE: readonly DispatchCase[] = [
  // CashAssemblyPeriodLoopV1Error -- mixed; every non-OPENING_STATE_INELIGIBLE code failed.
  ...(
    [
      'FACT_AFTER_CUTOVER',
      'PARTIAL_PROJECTED_PERIOD',
      'SCHEDULE_GRID_MISMATCH',
      'HISTORICAL_RECONCILIATION_MISMATCH',
      'CORE_ROW_MAPPING_MISMATCH',
      'TERMINAL_RECONCILIATION_FAILED',
      'MONOTONICITY_VIOLATION',
      'CARRY_PCT_INVALID',
    ] as const
  ).map((code): DispatchCase => ({
    label: `CashAssemblyPeriodLoopV1Error/${code}`,
    build: () => new CashAssemblyPeriodLoopV1Error(code, `${code} synthetic`),
    disposition: 'failed',
    code,
  })),
  {
    label: 'CashAssemblyPeriodLoopV1Error/OPENING_STATE_INELIGIBLE',
    build: () =>
      new CashAssemblyPeriodLoopV1Error('OPENING_STATE_INELIGIBLE', 'synthetic', {
        field: 'cumulativeGpPaidInUsd',
        valueUsd: '0.000001',
      }),
    disposition: 'unavailable',
    code: 'OPENING_STATE_INELIGIBLE',
  },
  // DecimalWaterfallCoreV1Error -- no registry codes, always failed.
  ...(
    [
      'PREF_BEARING_UNSUPPORTED_V1',
      'OPENING_STATE_INVALID',
      'CARRY_RATIO_INVALID',
      'EVENT_INPUT_INVALID',
      'DUPLICATE_EVENT_ID',
      'CONSERVATION_FAILED',
      'UNRETURNED_CAPITAL_MONOTONICITY',
    ] as const
  ).map((code): DispatchCase => ({
    label: `DecimalWaterfallCoreV1Error/${code}`,
    build: () => new DecimalWaterfallCoreV1Error(code, `${code} synthetic`),
    disposition: 'failed',
    code,
  })),
  // TerminalPolicyV1Error -- registry codes unavailable, FUND_LIFE_GRID_UNREPRESENTABLE failed.
  ...(
    [
      'TERMINAL_RESOLUTION_METHODOLOGY_UNSUPPORTED',
      'TERMINAL_RESOLUTION_MISMATCH',
      'TERMINAL_BEFORE_CUTOVER',
      'FORECAST_HORIZON_SHORT',
      'FORECAST_TERMINAL_PERIOD_UNREPRESENTABLE',
      'NEGATIVE_SOURCE_MONEY',
    ] as const
  ).map((code): DispatchCase => ({
    label: `TerminalPolicyV1Error/${code}`,
    build: () => new TerminalPolicyV1Error(code, `${code} synthetic`),
    disposition: 'unavailable',
    code,
  })),
  {
    label: 'TerminalPolicyV1Error/FUND_LIFE_GRID_UNREPRESENTABLE',
    build: () => new TerminalPolicyV1Error('FUND_LIFE_GRID_UNREPRESENTABLE', 'synthetic'),
    disposition: 'failed',
    code: 'FUND_LIFE_GRID_UNREPRESENTABLE',
  },
  // CashAssemblyEventStreamV1Error -- all 3 codes are registry codes, unavailable.
  ...(
    [
      'POST_TERM_ACTIVITY',
      'NEGATIVE_SOURCE_MONEY',
      'FORECAST_DEPLOYMENT_CUMULATIVE_DECREASE',
    ] as const
  ).map((code): DispatchCase => ({
    label: `CashAssemblyEventStreamV1Error/${code}`,
    build: () => new CashAssemblyEventStreamV1Error(code, `${code} synthetic`),
    disposition: 'unavailable',
    code,
  })),
  // CashAssemblyEventStreamInvariantError -- message-only, always failed.
  {
    label: 'CashAssemblyEventStreamInvariantError',
    build: () => new CashAssemblyEventStreamInvariantError('invariant synthetic'),
    disposition: 'failed',
    code: 'INVARIANT_VIOLATION',
  },
  // CashAssemblyCallSizingV1Error -- mixed dispatch.
  {
    label: 'CashAssemblyCallSizingV1Error/OPENING_CASH_UNAVAILABLE',
    build: () => new CashAssemblyCallSizingV1Error('OPENING_CASH_UNAVAILABLE', 'synthetic'),
    disposition: 'unavailable',
    code: 'OPENING_CASH_UNAVAILABLE',
  },
  {
    label: 'CashAssemblyCallSizingV1Error/COMMITTED_CAPITAL_EXCEEDED',
    build: () => new CashAssemblyCallSizingV1Error('COMMITTED_CAPITAL_EXCEEDED', 'synthetic'),
    disposition: 'unavailable',
    code: 'COMMITTED_CAPITAL_EXCEEDED',
  },
  {
    label: 'CashAssemblyCallSizingV1Error/NEGATIVE_SCHEDULED_AMOUNT',
    build: () => new CashAssemblyCallSizingV1Error('NEGATIVE_SCHEDULED_AMOUNT', 'synthetic'),
    disposition: 'failed',
    code: 'NEGATIVE_SCHEDULED_AMOUNT',
  },
  {
    label: 'CashAssemblyCallSizingV1Error/NONZERO_FEE_EXPENSE_UNSUPPORTED_V1',
    build: () =>
      new CashAssemblyCallSizingV1Error('NONZERO_FEE_EXPENSE_UNSUPPORTED_V1', 'synthetic'),
    disposition: 'failed',
    code: 'NONZERO_FEE_EXPENSE_UNSUPPORTED_V1',
  },
  // PresentationRoundingError -- always failed (D9).
  ...(
    [
      'INVALID_USD_AMOUNT',
      'INVALID_TARGET_CENTS',
      'INVALID_ENTITLEMENT',
      'NEGATIVE_LRM_SHORTFALL',
      'OUTPUT_CONSERVATION_FAILED',
      'FULL_PRECISION_CONSERVATION_FAILED',
    ] as const
  ).map((code): DispatchCase => ({
    label: `PresentationRoundingError/${code}`,
    build: () => new PresentationRoundingError(code, `${code} synthetic`),
    disposition: 'failed',
    code,
  })),
];

describe('executeLpEconomicsRun -- T-C3 typed engine failure dispatch (P-D7 step 6, full table)', () => {
  it.each(DISPATCH_TABLE.map((entry) => [entry.label, entry] as const))(
    '%s -> %s',
    async (_label, entry) => {
      const fakeDb = seededDb(() => {});
      const spy = vi
        .spyOn(cashAssemblyPeriodLoopModule, 'executeCashAssemblyPeriodLoopV1')
        .mockImplementation(() => {
          throw entry.build();
        });

      const receipt = await executeLpEconomicsRun({
        fundId: FUND_ID,
        actorId: ACTOR_ID,
        idempotencyKey: `dispatch-${entry.label}`,
        request: goldenRequest(),
        database: fakeDb.asDatabase(),
      });

      if (entry.disposition === 'failed') {
        expect(receipt.run.runState).toBe('failed');
        expect(receipt.run.calculationContractVersion).toBe('lp-economics/1.1.0');
        expect(receipt.run.resultSnapshotId).toBeNull();
        expect(receipt.run.failureCode).toBe(entry.code);
        expect(receipt.result).toBeNull();
        expect(
          fakeDb.fundSnapshotRows.filter((row) => row['type'] === 'INTERNAL_LP_ECONOMICS')
        ).toHaveLength(0);
      } else {
        expect(receipt.run.runState).toBe('completed');
        expect(receipt.run.resultStatus).toBe('unavailable');
        const reasons =
          receipt.result?.resultStatus === 'unavailable' ? receipt.result.reasons : [];
        expect(reasons.map((reason) => reason.code)).toContain(entry.code);
      }

      // Replay returns the identical persisted outcome; key is consumed
      // either way (idempotency-key uniqueness on the run row).
      const replay = await executeLpEconomicsRun({
        fundId: FUND_ID,
        actorId: ACTOR_ID,
        idempotencyKey: `dispatch-${entry.label}`,
        request: goldenRequest(),
        database: fakeDb.asDatabase(),
      });
      expect(replay.run.id).toBe(receipt.run.id);
      expect(fakeDb.runRows).toHaveLength(1);

      spy.mockRestore();
    }
  );
});

// ---------------------------------------------------------------------------
// T-C4: unexpected exception -> full rollback, no run row, no snapshot,
// key NOT consumed.
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C4 unexpected exception', () => {
  it('an unrecognized error at the loop seam propagates uncaught and persists nothing', async () => {
    const fakeDb = seededDb(() => {});
    const spy = vi
      .spyOn(cashAssemblyPeriodLoopModule, 'executeCashAssemblyPeriodLoopV1')
      .mockImplementation(() => {
        throw new Error('totally unexpected infrastructure failure');
      });

    await expect(
      executeLpEconomicsRun({
        fundId: FUND_ID,
        actorId: ACTOR_ID,
        idempotencyKey: 'unexpected-1',
        request: goldenRequest(),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toThrow('totally unexpected infrastructure failure');

    expect(fakeDb.runRows).toHaveLength(0);
    expect(
      fakeDb.fundSnapshotRows.filter((row) => row['type'] === 'INTERNAL_LP_ECONOMICS')
    ).toHaveLength(0);

    spy.mockRestore();

    // Key not consumed: an identical retry with the SAME idempotency key
    // (loop now behaving normally) succeeds fresh, not a replay of a
    // nonexistent prior outcome.
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'unexpected-1',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    expect(receipt.run.runState).toBe('completed');
    expect(fakeDb.runRows).toHaveLength(1);
  });

  it('a persistence-seam failure (fund_snapshots insert throws) rolls back with nothing persisted', async () => {
    const fakeDb = seededDb(() => {});
    const originalInsert = fakeDb.insert.bind(fakeDb);
    vi.spyOn(fakeDb, 'insert').mockImplementation((table: unknown) => {
      if (table === fundSnapshots) {
        return {
          values: () => ({
            returning: async () => {
              throw new Error('simulated persistence-seam failure');
            },
          }),
        } as ReturnType<typeof fakeDb.insert>;
      }
      return originalInsert(table);
    });

    await expect(
      executeLpEconomicsRun({
        fundId: FUND_ID,
        actorId: ACTOR_ID,
        idempotencyKey: 'unexpected-2',
        request: goldenRequest(),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toThrow('simulated persistence-seam failure');

    expect(fakeDb.runRows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-C5: basis explicitness -- no latest-resolution anywhere. An absent
// basis ID is a validation/not-found error, never a fallback read.
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C5 no latest-resolution fallback', () => {
  it('an unknown policyVersionId 404s rather than falling back to any "latest" policy', async () => {
    const fakeDb = seededDb(() => {});
    await expect(
      executeLpEconomicsRun({
        fundId: FUND_ID,
        actorId: ACTOR_ID,
        idempotencyKey: 'no-fallback-policy',
        request: goldenRequest({ policyVersionId: 999 }),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({ code: 'FUND_SCOPE_NOT_FOUND' });
    expect(fakeDb.runRows).toHaveLength(0);
  });

  it('an unknown forecastSnapshotId 404s rather than resolving the latest CURRENT_FORECAST_V2 snapshot', async () => {
    const fakeDb = seededDb(() => {});
    await expect(
      executeLpEconomicsRun({
        fundId: FUND_ID,
        actorId: ACTOR_ID,
        idempotencyKey: 'no-fallback-forecast',
        request: goldenRequest({ forecastSnapshotId: 999 }),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({ code: 'FUND_SCOPE_NOT_FOUND' });
    expect(fakeDb.runRows).toHaveLength(0);
  });

  it('the request schema requires every basis ID explicitly (no optional field admits a fallback)', () => {
    const request = goldenRequest() as Record<string, unknown>;
    delete request['factsSnapshotId'];
    const parsed = LpEconomicsRunRequestV1_1Schema.safeParse(request);
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-C6/T-C7: concurrency races, serialized by the advisory-lock mutex
// (real Postgres semantics simulated by FakeRunDb's KeyedMutex).
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C6/T-C7 concurrency races', () => {
  it('T-C6: concurrent identical requests yield one execution and one replay', async () => {
    const fakeDb = seededDb(() => {});
    const input = {
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'race-identical',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    };

    const [left, right] = await Promise.all([
      executeLpEconomicsRun(input),
      executeLpEconomicsRun(input),
    ]);

    expect(left.run.id).toBe(right.run.id);
    expect(fakeDb.runRows).toHaveLength(1);
    expect(
      fakeDb.fundSnapshotRows.filter((row) => row['type'] === 'INTERNAL_LP_ECONOMICS')
    ).toHaveLength(1);
  });

  it('T-C7: concurrent changed-preimage requests yield one success and one 409', async () => {
    const fakeDb = seededDb(() => {});
    const results = await Promise.allSettled([
      executeLpEconomicsRun({
        fundId: FUND_ID,
        actorId: ACTOR_ID,
        idempotencyKey: 'race-changed',
        request: goldenRequest(),
        database: fakeDb.asDatabase(),
      }),
      executeLpEconomicsRun({
        fundId: FUND_ID,
        actorId: ACTOR_ID,
        idempotencyKey: 'race-changed',
        request: goldenRequest({ clock: '2026-07-31T23:59:59.000Z' }),
        database: fakeDb.asDatabase(),
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(IdempotentCommandError);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    expect(fakeDb.runRows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T-C9: getRunWithResult joins the result snapshot and validates
// type/ownership.
// ---------------------------------------------------------------------------

describe('getRunWithResult -- T-C9 lineage read joins + type/ownership', () => {
  it('joins the persisted result snapshot for a completed run', async () => {
    const fakeDb = seededDb(() => {});
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'lineage-1',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });

    const read = await getRunWithResult({
      fundId: FUND_ID,
      runId: receipt.run.id,
      database: fakeDb.asDatabase(),
    });
    expect(read.run.id).toBe(receipt.run.id);
    expect(read.result).toEqual(receipt.result);
  });

  it('rejects a cross-fund read with a fund-scope 404', async () => {
    const fakeDb = seededDb(() => {});
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'lineage-2',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });

    await expect(
      getRunWithResult({
        fundId: FUND_ID + 1,
        runId: receipt.run.id,
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({ code: 'FUND_SCOPE_NOT_FOUND' });
  });

  it('returns a null result for a failed run', async () => {
    const fakeDb = seededDb(() => {});
    const spy = vi
      .spyOn(cashAssemblyPeriodLoopModule, 'executeCashAssemblyPeriodLoopV1')
      .mockImplementation(() => {
        throw new CashAssemblyPeriodLoopV1Error('CARRY_PCT_INVALID', 'synthetic');
      });
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'lineage-3',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    spy.mockRestore();

    const read = await getRunWithResult({
      fundId: FUND_ID,
      runId: receipt.run.id,
      database: fakeDb.asDatabase(),
    });
    expect(read.run.runState).toBe('failed');
    expect(read.result).toBeNull();
  });

  it('maps only the exact completed legacy-null tuple to the frozen V1 parser', async () => {
    const fakeDb = seededDb(() => {});
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'legacy-null-completed',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    const runRow = fakeDb.runRows.find((row) => row['id'] === receipt.run.id)!;
    const snapshotRow = fakeDb.fundSnapshotRows.find(
      (row) => row['id'] === receipt.run.resultSnapshotId
    )!;
    runRow['calculationContractVersion'] = null;
    runRow['engineVersion'] = 'cash-assembly-period-loop-v1/1.0.0';
    runRow['methodologyVersion'] = 'cash-assembly-period-loop-methodology/1.0.0';
    snapshotRow['calcVersion'] = 'lp-economics/1.0.0';

    const legacy = await getRunWithResult({
      fundId: FUND_ID,
      runId: receipt.run.id,
      database: fakeDb.asDatabase(),
    });
    expect(legacy.result?.resultStatus).toBe('indicative');

    runRow['engineVersion'] = 'cash-assembly-period-loop-v1/9.9.9';
    await expect(
      getRunWithResult({
        fundId: FUND_ID,
        runId: receipt.run.id,
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 500,
      code: 'UNSUPPORTED_CALCULATION_CONTRACT_VERSION',
    });
  });

  it('rejects an explicit V1.0 calculation contract on an otherwise exact completed tuple', async () => {
    const fakeDb = seededDb(() => {});
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'explicit-v1-completed',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    const runRow = fakeDb.runRows.find((row) => row['id'] === receipt.run.id)!;
    const snapshotRow = fakeDb.fundSnapshotRows.find(
      (row) => row['id'] === receipt.run.resultSnapshotId
    )!;
    runRow['calculationContractVersion'] = 'lp-economics/1.0.0';
    runRow['engineVersion'] = 'cash-assembly-period-loop-v1/1.0.0';
    runRow['methodologyVersion'] = 'cash-assembly-period-loop-methodology/1.0.0';
    snapshotRow['calcVersion'] = 'lp-economics/1.0.0';

    await expect(
      getRunWithResult({
        fundId: FUND_ID,
        runId: receipt.run.id,
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 500,
      code: 'UNSUPPORTED_CALCULATION_CONTRACT_VERSION',
    });
  });

  it('maps only the exact failed legacy-null tuple with no result snapshot', async () => {
    const fakeDb = seededDb(() => {});
    const spy = vi
      .spyOn(cashAssemblyPeriodLoopModule, 'executeCashAssemblyPeriodLoopV1')
      .mockImplementation(() => {
        throw new CashAssemblyPeriodLoopV1Error('CARRY_PCT_INVALID', 'synthetic');
      });
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'legacy-null-failed',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    spy.mockRestore();
    const runRow = fakeDb.runRows.find((row) => row['id'] === receipt.run.id)!;
    runRow['calculationContractVersion'] = null;
    runRow['engineVersion'] = 'cash-assembly-period-loop-v1/1.0.0';
    runRow['methodologyVersion'] = 'cash-assembly-period-loop-methodology/1.0.0';

    const legacy = await getRunWithResult({
      fundId: FUND_ID,
      runId: receipt.run.id,
      database: fakeDb.asDatabase(),
    });
    expect(legacy.result).toBeNull();

    runRow['methodologyVersion'] = 'cash-assembly-period-loop-methodology/9.9.9';
    await expect(
      getRunWithResult({
        fundId: FUND_ID,
        runId: receipt.run.id,
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 500,
      code: 'UNSUPPORTED_CALCULATION_CONTRACT_VERSION',
    });
  });

  it('rejects an explicit V1.0 calculation contract on an otherwise exact failed tuple', async () => {
    const fakeDb = seededDb(() => {});
    const spy = vi
      .spyOn(cashAssemblyPeriodLoopModule, 'executeCashAssemblyPeriodLoopV1')
      .mockImplementation(() => {
        throw new CashAssemblyPeriodLoopV1Error('CARRY_PCT_INVALID', 'synthetic');
      });
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'explicit-v1-failed',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    spy.mockRestore();
    const runRow = fakeDb.runRows.find((row) => row['id'] === receipt.run.id)!;
    runRow['calculationContractVersion'] = 'lp-economics/1.0.0';
    runRow['engineVersion'] = 'cash-assembly-period-loop-v1/1.0.0';
    runRow['methodologyVersion'] = 'cash-assembly-period-loop-methodology/1.0.0';

    await expect(
      getRunWithResult({
        fundId: FUND_ID,
        runId: receipt.run.id,
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 500,
      code: 'UNSUPPORTED_CALCULATION_CONTRACT_VERSION',
    });
  });

  it('fails closed when V1.1 run identity disagrees with result calculation identity', async () => {
    const fakeDb = seededDb(() => {});
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tuple-mismatch',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    const runRow = fakeDb.runRows.find((row) => row['id'] === receipt.run.id)!;
    const snapshotRow = fakeDb.fundSnapshotRows.find(
      (row) => row['id'] === receipt.run.resultSnapshotId
    )!;
    runRow['calculationContractVersion'] = 'lp-economics/1.1.0';
    runRow['engineVersion'] = 'cash-assembly-period-loop-v1/1.1.0';
    runRow['methodologyVersion'] = 'cash-assembly-period-loop-methodology/1.1.0';
    snapshotRow['calcVersion'] = 'lp-economics/1.0.0';

    await expect(
      getRunWithResult({
        fundId: FUND_ID,
        runId: receipt.run.id,
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 500,
      code: 'UNSUPPORTED_CALCULATION_CONTRACT_VERSION',
    });
  });
});

// ---------------------------------------------------------------------------
// T-C10 (P-D8 amendment): replaying under a bumped engine/methodology
// version returns 409, never a silent replay of the prior engine's result.
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C10 engine/methodology version bump', () => {
  it('a prior run persisted under an older engine version 409s rather than replaying silently', async () => {
    const fakeDb = seededDb(() => {});
    const request = goldenRequest();
    const staleRequestHash = canonicalSha256({
      fundId: FUND_ID,
      contractVersion: LEGACY_LP_ECONOMICS_RUN_CONTRACT_VERSION,
      request,
      engineVersion: 'cash-assembly-period-loop-v1/1.0.0',
      methodologyVersion: 'cash-assembly-period-loop-methodology/1.0.0',
    });
    fakeDb.runRows.push({
      id: 1,
      fundId: FUND_ID,
      policyVersionId: 1,
      factsSnapshotId: 1,
      planVersionId: 1,
      forecastSnapshotId: 1,
      forecastSnapshotType: 'CURRENT_FORECAST_V2',
      resultSnapshotId: null,
      resultSnapshotType: null,
      runState: 'failed',
      calculationContractVersion: null,
      resultStatus: null,
      failureCode: 'SOME_OLD_FAILURE',
      failureContext: {},
      evaluationClock: new Date(request.clock),
      terminalMode: request.terminalMode,
      engineVersion: 'cash-assembly-period-loop-v1/1.0.0',
      methodologyVersion: 'cash-assembly-period-loop-methodology/1.0.0',
      inputHash: hex64(17),
      resultHash: null,
      createdBy: ACTOR_ID,
      idempotencyKey: 'version-bump',
      requestHash: staleRequestHash,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      executeLpEconomicsRun({
        fundId: FUND_ID,
        actorId: ACTOR_ID,
        idempotencyKey: 'version-bump',
        request,
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
  });
});

// ---------------------------------------------------------------------------
// T-C11 (P-D10 amendment): the service never touches source_artifacts.
// Statically proven (the service module imports no source_artifacts
// schema/table at all) and behaviorally proven (the happy path succeeds
// with no source_artifacts row modeled anywhere in the mock database).
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C11 no source_artifacts touch', () => {
  it('the service module source never references source_artifacts', async () => {
    // tests/setup/node-setup.ts stubs the NAMED `fs.readFileSync` export
    // globally (returns undefined by default); `default` stays real, so a
    // genuine file read here must go through vi.importActual (repo lesson).
    const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = realFs.readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../server/services/internal-economics/lp-economics-run-service.ts'
      ),
      'utf8'
    );
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/sourceArtifacts|source_artifacts/);
  });

  it('a run executes successfully against an eligible v4 snapshot with no source_artifacts row modeled at all', async () => {
    const fakeDb = seededDb(() => {});
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'no-source-artifacts',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    expect(receipt.run.runState).toBe('completed');
    expect(receipt.result?.resultStatus).toBe('indicative');
  });
});

// ---------------------------------------------------------------------------
// T-C12 (G6/gate-1 amendment, corrected R3): gate 1 reads the PINNED facts
// snapshot roster, never a live `vehicles` table (which this service does
// not even query).
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C12 basis-purity of the vehicle-type re-check', () => {
  it('(a) a facts snapshot taken AFTER reclassification refuses via the pinned roster', async () => {
    const fakeDb = seededDb((db_) => {
      const laterFacts = structuredClone(db_.factsRows[0]!);
      laterFacts['id'] = 2;
      laterFacts['idempotencyKey'] = 'facts-later';
      (
        laterFacts['payload'] as { vehicleRoster: Array<Record<string, unknown>> }
      ).vehicleRoster[0]!['vehicleType'] = 'spv';
      db_.factsRows.push(laterFacts);
    });
    await expectUnavailable(fakeDb, 'tc12a', 'MAIN_FUND_VEHICLE_ABSENT', { factsSnapshotId: 2 });
  });

  it('(b) a facts snapshot taken WHILE main_fund stays eligible even after a later live reclassification', async () => {
    // Basis purity: this service never reads a live `vehicles` table at
    // all, so there is no "later reclassification" code path that could
    // affect an already-pinned facts snapshot's roster state.
    const fakeDb = seededDb(() => {});
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc12b',
      request: goldenRequest({ factsSnapshotId: 1 }),
      database: fakeDb.asDatabase(),
    });
    expect(receipt.run.runState).toBe('completed');
    expect(receipt.run.resultStatus).toBe('indicative');
  });
});

// ---------------------------------------------------------------------------
// T-C13 (section 6 amendment): event rows carry correct
// eventSequence/eventId/eventKind, derived from array position plus the
// frozen loop's own literal `:terminal_liquidation` sourceId suffix — never
// by interpreting any other part of the opaque sourceId string. The
// "ordinary" case below proves position alone is insufficient (a lone
// non-terminal event at the last index must not be misclassified).
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C13 event enrichment structural correctness', () => {
  it('an ordinary distribution event gets eventSequence 0 and forecast_quarterly_distribution', async () => {
    const fakeDb = seededDb((db_) => {
      const forecastRow = db_.fundSnapshotRows.find(
        (row) => row['type'] === 'CURRENT_FORECAST_V2'
      )!;
      const payload = forecastRow['payload'] as { series: Array<Record<string, unknown>> };
      payload.series[0]!['distributionsUsd'] = '100.000000';
      payload.series[0]!['navUsd'] = ZERO_MONEY;
    });

    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc13-ordinary',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });

    expect(receipt.result?.resultStatus).toBe('indicative');
    const events =
      receipt.result?.resultStatus === 'indicative' ? receipt.result.waterfallEvents : [];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventSequence: 0,
      eventKind: 'forecast_quarterly_distribution',
      sourceRefs: [{ sourceId: events[0]!.sourceId }],
    });
    expect(events[0]!.eventId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('a terminal liquidation event is always last and carries terminal_realization', async () => {
    const fakeDb = seededDb((db_) => {
      const forecastRow = db_.fundSnapshotRows.find(
        (row) => row['type'] === 'CURRENT_FORECAST_V2'
      )!;
      const payload = forecastRow['payload'] as { series: Array<Record<string, unknown>> };
      payload.series[0]!['distributionsUsd'] = '100.000000';
      payload.series[0]!['navUsd'] = '500.000000';
      const policy = db_.policyRows[0]!;
      (policy['policyBody'] as Record<string, unknown>)['terminalMode'] = 'liquidate_at_horizon';
    });

    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc13-terminal',
      request: goldenRequest({ terminalMode: 'liquidate_at_horizon' }),
      database: fakeDb.asDatabase(),
    });

    expect(receipt.result?.resultStatus).toBe('indicative');
    const events =
      receipt.result?.resultStatus === 'indicative' ? receipt.result.waterfallEvents : [];
    expect(events.length).toBeGreaterThanOrEqual(1);
    const lastEvent = events.at(-1);
    expect(lastEvent?.eventKind).toBe('terminal_realization');
    expect(lastEvent?.sourceId).toMatch(/:terminal_liquidation$/);
    expect(lastEvent?.eventSequence).toBe(events.length - 1);
  });
});

// ---------------------------------------------------------------------------
// T-C14 (section 6 amendment): reason-array ORDER differences produce
// identical persisted payloads and identical result_hash.
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C14 reason order does not affect result_hash', () => {
  it('two runs whose loop reasons differ only in array order hash identically', async () => {
    const fakeDbA = seededDb(() => {});
    const fakeDbB = seededDb(() => {});
    const baseline = executeCashAssemblyPeriodLoopV1({
      factsSnapshotId: 1,
      forecastSnapshotId: 1,
      economicsPolicyVersion: 'internal-economics-policy/1.0.0',
      engineVersion: LP_ECONOMICS_RUN_ENGINE_VERSION,
      methodologyVersion: LP_ECONOMICS_RUN_METHODOLOGY_VERSION,
      factsEvents: [],
      factsNavMarks: [],
      factsPeriodNav: [],
      openingState: resolvedOpeningState(),
      forecastSeries: goldenForecastSeries(),
      scheduledNeeds: [
        {
          period: { periodStart: PERIOD_START, periodEnd: PERIOD_END, source: 'projected' },
          scheduledDeploymentUsd: new Decimal(0),
          scheduledFeeUsd: new Decimal(0),
          scheduledExpenseUsd: new Decimal(0),
        },
      ],
      cashBufferQuarters: 0,
      unfundedEnvelopeRemainingUsd: new Decimal('1000000'),
      persistedTerminalResolution: {
        terminalPeriodEnd: PERIOD_END,
        terminalResolutionMethodologyVersion: INTERNAL_ECONOMICS_TERMINAL_RESOLUTION_VERSION,
      },
      terminalMode: 'hold_unrealized',
      carryPct: 0.2,
    });

    const spyA = vi
      .spyOn(cashAssemblyPeriodLoopModule, 'executeCashAssemblyPeriodLoopV1')
      .mockReturnValueOnce({
        ...baseline,
        resultStatusReasons: ['FLOAT64_WATERFALL_PATH', 'LP_NET_NAV_FLAT_SHARE_APPROXIMATION'],
      });
    const receiptA = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc14-a',
      request: goldenRequest(),
      database: fakeDbA.asDatabase(),
    });
    spyA.mockRestore();

    const spyB = vi
      .spyOn(cashAssemblyPeriodLoopModule, 'executeCashAssemblyPeriodLoopV1')
      .mockReturnValueOnce({
        ...baseline,
        resultStatusReasons: ['LP_NET_NAV_FLAT_SHARE_APPROXIMATION', 'FLOAT64_WATERFALL_PATH'],
      });
    const receiptB = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc14-b',
      request: goldenRequest(),
      database: fakeDbB.asDatabase(),
    });
    spyB.mockRestore();

    expect(receiptA.run.resultHash).toBe(receiptB.run.resultHash);
    expect(receiptA.result).toEqual(receiptB.result);
  });
});

// ---------------------------------------------------------------------------
// T-C15 (P-D4 mapping amendment): the persisted result fund_snapshots row
// carries exactly the normative column mapping, direct row readback.
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C15 fund_snapshots column mapping', () => {
  it('state IS NULL, snapshot_time = pinned clock, calc_version/correlation_id set correctly', async () => {
    const fakeDb = seededDb(() => {});
    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc15',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });

    const row = fakeDb.fundSnapshotRows.find(
      (entry) => entry['id'] === receipt.run.resultSnapshotId
    )!;
    expect(row['state']).toBeNull();
    expect(row['runId']).toBeNull();
    expect(row['type']).toBe('INTERNAL_LP_ECONOMICS');
    expect((row['snapshotTime'] as Date).toISOString()).toBe(CLOCK);
    expect(row['calcVersion']).toBe(LP_ECONOMICS_RESULT_CALC_VERSION);
    expect(row['correlationId']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(row['configId']).toBeNull();
    expect(row['configVersion']).toBeNull();
    expect(row['scenarioSetId']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-C16 (P-D7 isolation/retry amendment): 40001 retry-then-succeed within
// the 3-attempt bound; persistent failure falls through to the unexpected-
// exception path.
// ---------------------------------------------------------------------------

describe('executeLpEconomicsRun -- T-C16 SQLSTATE 40001 retry', () => {
  it('succeeds on the second attempt after one simulated 40001', async () => {
    const fakeDb = seededDb(() => {});
    fakeDb.insertSerializationFailuresRemaining = 1;

    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc16-retry',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });

    expect(receipt.run.runState).toBe('completed');
    expect(fakeDb.transactionAttempts).toBe(2);
    expect(fakeDb.transactionConfigs).toEqual([
      { isolationLevel: 'repeatable read', accessMode: 'read write' },
      { isolationLevel: 'repeatable read', accessMode: 'read write' },
    ]);
    expect(fakeDb.runRows).toHaveLength(1);
  });

  it('a persistent 40001 past the 3-attempt bound surfaces as an unexpected exception', async () => {
    const fakeDb = seededDb(() => {});
    fakeDb.insertSerializationFailuresRemaining = 3;

    await expect(
      executeLpEconomicsRun({
        fundId: FUND_ID,
        actorId: ACTOR_ID,
        idempotencyKey: 'tc16-exhausted',
        request: goldenRequest(),
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({ code: '40001' });

    expect(fakeDb.transactionAttempts).toBe(3);
    expect(fakeDb.runRows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-C19/T-C20 (P-D7 R5-R7 amendments): pre-invocation admission-control
// guards persist a FAILED run row, no snapshot, key consumed, replay
// returns the same persisted failure.
// ---------------------------------------------------------------------------

function manyForecastPoints(count: number) {
  return Array.from({ length: count }, (_unused, index) => {
    const quarterIndex = index + 1;
    const year = 2026 + Math.floor((quarterIndex - 1) / 4);
    const quarterInYear = ((quarterIndex - 1) % 4) + 1;
    const startMonth = (quarterInYear - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const periodStart = `${year}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = endMonth === 3 || endMonth === 12 ? 31 : endMonth === 6 ? 30 : 30;
    const periodEnd = `${year}-${String(endMonth).padStart(2, '0')}-${endMonth === 3 ? 31 : lastDay}`;
    return {
      periodStart,
      periodEnd,
      source: 'projected' as const,
      deployedUsd: ZERO_MONEY,
      contributionsUsd: ZERO_MONEY,
      distributionsUsd: ZERO_MONEY,
      navUsd: ZERO_MONEY,
      tvpi: ZERO_RATIO,
      dpi: ZERO_RATIO,
      activeCompanyCount: 0,
      projectedCohortCount: 0,
    };
  });
}

describe('executeLpEconomicsRun -- T-C19/T-C20 admission-control bounds', () => {
  it('T-C19: 201 forecast periods refuses pre-invocation as a persisted failed run', async () => {
    const fakeDb = seededDb((db_) => {
      const forecastRow = db_.fundSnapshotRows.find(
        (row) => row['type'] === 'CURRENT_FORECAST_V2'
      )!;
      const series = manyForecastPoints(201);
      (forecastRow['payload'] as Record<string, unknown>)['series'] = series;
      // Gate 8's match-assert re-derives terminalPeriodEnd from
      // termStartDate/fundLifeYears and compares it against the persisted
      // value, so both must be updated together: 2021-01-01 + 55yr(220
      // quarters) -> 2076-01-01 -> containing quarter end 2076-03-31, the
      // series' natural 201st point (same formula as PERIOD_END's own
      // 5yr/60mo derivation above).
      db_.policyRows[0]!['terminalPeriodEnd'] = series.at(-1)!.periodEnd;
      (db_.policyRows[0]!['policyBody'] as Record<string, unknown>)['fundLifeYears'] = '55';
    });

    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc19',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });

    expect(receipt.run.runState).toBe('failed');
    expect(receipt.run.failureCode).toBe('CASH_ASSEMBLY_PERIOD_COUNT_EXCEEDED');
    expect(receipt.run.failureContext).toMatchObject({
      bound: MAX_CASH_ASSEMBLY_PERIOD_COUNT,
      observed: 201,
    });
    expect(receipt.result).toBeNull();
    expect(
      fakeDb.fundSnapshotRows.filter((row) => row['type'] === 'INTERNAL_LP_ECONOMICS')
    ).toHaveLength(0);

    const replay = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc19',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    expect(replay.run.id).toBe(receipt.run.id);
    expect(fakeDb.runRows).toHaveLength(1);
  });

  it('T-C20: total event count above the bound refuses pre-invocation as a persisted failed run', async () => {
    const fakeDb = seededDb((db_) => {
      const facts = db_.factsRows[0]!;
      const payload = facts['payload'] as { cashFlowSeries: Record<string, unknown> };
      payload.cashFlowSeries = {
        series: [
          {
            eventType: 'lp_capital_call',
            vehicleId: null,
            perspective: 'lp_net',
            points: Array.from({ length: 10001 }, (_unused, index) => ({
              eventId: index + 1,
              effectiveAt: '2025-06-30T00:00:00.000Z',
              amount: ZERO_MONEY,
            })),
          },
        ],
        totals: {
          contributions: ZERO_MONEY,
          distributions: ZERO_MONEY,
          recallableDistributions: ZERO_MONEY,
        },
        warnings: [],
      };
    });

    const receipt = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc20',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });

    expect(receipt.run.runState).toBe('failed');
    expect(receipt.run.failureCode).toBe('CASH_ASSEMBLY_TOTAL_EVENT_COUNT_EXCEEDED');
    expect(receipt.run.failureContext).toMatchObject({
      bound: MAX_CASH_ASSEMBLY_TOTAL_EVENT_COUNT,
    });
    expect(receipt.result).toBeNull();

    const replay = await executeLpEconomicsRun({
      fundId: FUND_ID,
      actorId: ACTOR_ID,
      idempotencyKey: 'tc20',
      request: goldenRequest(),
      database: fakeDb.asDatabase(),
    });
    expect(replay.run.id).toBe(receipt.run.id);
    expect(fakeDb.runRows).toHaveLength(1);
  });
});
