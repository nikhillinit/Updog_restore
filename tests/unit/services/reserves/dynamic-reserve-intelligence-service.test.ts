import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { IdempotentCommandError } from '../../../../server/lib/idempotent-command';
import {
  DynamicReserveIntelligenceServiceError,
  createDynamicReserveIntelligenceRun,
  getDynamicReserveIntelligenceRun,
  getLatestDynamicReserveIntelligenceRun,
  type DynamicReserveIntelligenceDependencies,
} from '../../../../server/services/reserves/dynamic-reserve-intelligence-service';
import { buildRankedReserveInputFromSnapshot } from '../../../../server/services/reserves/ranked-reserve-input-from-snapshot';
import { composeRankedReserveAllocation } from '../../../../server/services/reserves/ranked-reserve-orchestrator';
import {
  DynamicReserveIntelligencePayloadV1Schema,
  type DynamicReserveIntelligencePayloadV1,
  type PinnedMarginalReserveNonFactsSourcesV1,
  type PinnedReserveEnvelopeSourcesV1,
} from '../../../../shared/contracts/dynamic-reserve-intelligence-v1.contract';
import {
  PersistedFinancialFactsSnapshotV1Schema,
  type PersistedFinancialFactsSnapshotV1,
} from '../../../../shared/contracts/financial-facts-snapshot-v1.contract';
import { financialFactsSnapshots } from '../../../../shared/schema/financial-facts-snapshots';
import { fundSnapshots } from '../../../../shared/schema/fund';

const NOW = new Date('2026-07-29T20:00:00.000Z');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const dialect = new PgDialect();

function publishedConfig() {
  return {
    fundName: 'Fixture Fund',
    stages: [
      { id: 'seed', name: 'Seed', graduate: 40, exit: 10, months: 12 },
      { id: 'series-a', name: 'Series A', graduate: 30, exit: 20, months: 18 },
    ],
    sectorProfiles: [{ id: 'saas', name: 'SaaS', targetPercentage: 100 }],
    capitalPlanAllocations: [
      {
        id: 'saas-seed',
        name: 'SaaS Seed',
        sectorProfileId: 'saas',
        entryRound: 'Seed',
        capitalAllocationPct: 100,
        initialCheckStrategy: 'amount',
        initialCheckAmount: 500_000,
        followOnStrategy: 'amount',
        followOnAmount: 1_000_000,
        followOnParticipationPct: 100,
        investmentHorizonMonths: 60,
      },
    ],
    pipelineProfiles: [
      {
        id: 'default',
        name: 'Default',
        stages: [
          {
            id: 'seed',
            name: 'Seed',
            roundSize: 2,
            valuation: 8,
            valuationType: 'pre',
            esopPct: 10,
            graduationRate: 40,
            exitRate: 10,
            exitValuation: 30,
            monthsToGraduate: 12,
            monthsToExit: 48,
          },
          {
            id: 'series-a',
            name: 'Series A',
            roundSize: 5,
            valuation: 20,
            valuationType: 'pre',
            esopPct: 10,
            graduationRate: 30,
            exitRate: 20,
            exitValuation: 75,
            monthsToGraduate: 18,
            monthsToExit: 48,
          },
        ],
      },
    ],
  };
}

function factsSnapshot(
  overrides: Partial<PersistedFinancialFactsSnapshotV1> = {}
): PersistedFinancialFactsSnapshotV1 {
  return PersistedFinancialFactsSnapshotV1Schema.parse({
    policyVersion: 'financial-facts-policy/1.0.1',
    fundId: 1,
    asOfDate: '2026-07-29',
    knowledgeCutoff: '2026-07-29T12:00:00.000Z',
    vehicleScope: 'fund_all',
    vehicleIds: [],
    selectionSetHash: HASH_A,
    sourceFactsInputHash: HASH_B,
    snapshotInputHash: HASH_C,
    consumerEvaluations: [{ consumer: 'reserve', status: 'accepted', reasons: [] }],
    payload: {
      companyActuals: {
        fundId: 1,
        asOfDate: '2026-07-29',
        facts: [
          {
            fundId: 1,
            companyId: 11,
            companyName: 'Alpha',
            investmentIds: [101],
            activeRoundIds: [201],
            approvedPlanningFmvMarkId: null,
            planningFmvStatus: 'none',
            initialInvestmentAmount: '1000000.000000',
            followOnInvestmentAmount: '0.000000',
            amountOnlyNonEquityAmount: '0.000000',
            latestRoundDate: '2026-01-01',
            latestRoundValuation: '10000000.000000',
            latestPlanningFmvDate: null,
            latestPlanningFmvValue: null,
            currency: 'USD',
            currencyStatus: 'base_currency',
            supersedeLineage: [{ roundId: 201, supersedesRoundId: null }],
            warnings: [],
            provenance: {
              trustState: 'LIVE',
              core: {
                sourceKind: 'computed',
                actionability: 'actionable',
                sourceEngine: 'rounds-to-model',
                engineVersion: '1.0.0',
                inputHash: HASH_A,
                assumptionsHash: HASH_B,
                isFinanciallyActionable: true,
                warnings: [],
              },
              structuredWarnings: [],
            },
            inputHash: HASH_C,
          },
        ],
        inputHash: HASH_A,
      },
      sourceObservationIds: [],
      workingValueSelectionIds: [],
      participationTermRefs: [],
      cashFlowSeries: {
        series: [],
        totals: {
          contributions: '0.000000',
          distributions: '0.000000',
          recallableDistributions: '0.000000',
        },
        warnings: [],
      },
      marksSeries: { marks: [], periodNav: [], warnings: [] },
      vehicleRoster: [],
    },
    actorId: 7,
    createdAt: '2026-07-29T12:00:00.000Z',
    ...overrides,
  });
}

function nonFactsSources(): PinnedMarginalReserveNonFactsSourcesV1 {
  return {
    sourceSnapshotDate: '2026-07-29',
    baseCurrency: 'USD',
    companies: [
      {
        companyId: 11,
        stage: 'Seed',
        currentStage: 'Seed',
        sector: 'SaaS',
        currentOwnership: '0.125',
        plannedReservesCents: '100000000',
        allocationVersion: 3,
      },
    ],
    approvedAllocations: [
      {
        companyId: 11,
        decisionType: 'follow_on',
        decisionStatus: 'approved',
        finalPlannedReservesCents: '100000000',
        liveAllocationVersion: 3,
        decidedAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:00:00.000Z',
      },
    ],
    publishedAssumptions: {
      configId: 7,
      version: 3,
      publishedAt: '2026-07-28T00:00:00.000Z',
      config: publishedConfig(),
    },
  };
}

function envelopeSources(): PinnedReserveEnvelopeSourcesV1 {
  return {
    fund: {
      sizeDollars: '100',
      deployedCapitalDollars: '0',
      managementFeeRate: '0',
      baseCurrency: 'USD',
    },
    investments: [],
    config: {
      fundLifeYears: 10,
      expenses: [{ monthlyAmountDollars: 0, startMonth: 0, endMonth: 120 }],
      recyclingEnabled: true,
      recyclingCapDollars: 0.01,
    },
  };
}

interface FactsRow {
  id: number;
  fundId: number;
  policyVersion: string;
  payloadSchemaId: string;
  asOfDate: string;
  knowledgeCutoff: Date;
  vehicleScope: 'fund_all';
  vehicleIds: number[];
  selectionSetHash: string;
  sourceFactsInputHash: string;
  snapshotInputHash: string;
  payload: PersistedFinancialFactsSnapshotV1['payload'];
  consumerEvaluations: PersistedFinancialFactsSnapshotV1['consumerEvaluations'];
  actorId: number | null;
  idempotencyKey: string;
  requestHash: string;
  supersedesSnapshotId: number | null;
  createdAt: Date;
}

interface StoredSnapshot {
  id: number;
  fundId: number;
  type: string;
  payload: DynamicReserveIntelligencePayloadV1;
  createdAt: Date;
}

function factsRow(snapshot = factsSnapshot()): FactsRow {
  return {
    id: 31,
    fundId: snapshot.fundId,
    policyVersion: snapshot.policyVersion,
    payloadSchemaId:
      snapshot.policyVersion === 'financial-facts-policy/1.2.0'
        ? 'financial-facts-payload/3'
        : snapshot.policyVersion === 'financial-facts-policy/1.1.0'
          ? 'financial-facts-payload/2'
          : 'financial-facts-payload/1',
    asOfDate: snapshot.asOfDate,
    knowledgeCutoff: new Date(snapshot.knowledgeCutoff),
    vehicleScope: snapshot.vehicleScope,
    vehicleIds: snapshot.vehicleIds,
    selectionSetHash: snapshot.selectionSetHash,
    sourceFactsInputHash: snapshot.sourceFactsInputHash,
    snapshotInputHash: snapshot.snapshotInputHash,
    payload: snapshot.payload,
    consumerEvaluations: snapshot.consumerEvaluations,
    actorId: snapshot.actorId,
    idempotencyKey: 'facts-31',
    requestHash: HASH_A,
    supersedesSnapshotId: null,
    createdAt: new Date(snapshot.createdAt),
  };
}

function queryRows<T>(rows: readonly T[]) {
  const values = [...rows];
  const query = {
    where: (_condition: unknown) => query,
    orderBy: (..._order: unknown[]) => query,
    limit: (count: number) => Promise.resolve(values.slice(0, count)),
    then: <TResult1 = T[], TResult2 = never>(
      onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => Promise.resolve(values).then(onfulfilled, onrejected),
  };
  return query;
}

class FakeDatabase {
  facts = factsRow();
  factsOwnershipAllowed = true;
  readonly snapshots: StoredSnapshot[] = [];
  readonly statements: string[] = [];
  readonly inserts: Array<Record<string, unknown>> = [];

  select(fields?: Record<string, unknown>) {
    return {
      from: (table: unknown) => {
        if (table === financialFactsSnapshots) {
          return queryRows(
            fields === undefined
              ? [this.facts]
              : this.factsOwnershipAllowed
                ? [{ id: this.facts.id }]
                : []
          );
        }
        return queryRows([]);
      },
    };
  }

  async execute(query: SQL) {
    const rendered = dialect.sqlToQuery(query);
    this.statements.push(rendered.sql);
    if (rendered.sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (!rendered.sql.includes('FROM fund_snapshots')) return { rows: [] };

    const fundId = rendered.params.find((value): value is number => typeof value === 'number');
    let rows = this.snapshots.filter(
      (row) => row.fundId === fundId && row.type === 'RESERVE_INTELLIGENCE'
    );
    if (rendered.sql.includes("payload -> 'provenance'")) {
      const key = rendered.params.find(
        (value): value is string => typeof value === 'string' && value.startsWith('run-')
      );
      rows = rows.filter((row) => row.payload.provenance.idempotencyKey === key);
    }
    if (rendered.sql.includes('AND id =')) {
      const numericParams = rendered.params.filter(
        (value): value is number => typeof value === 'number'
      );
      const snapshotId = numericParams[1];
      rows = rows.filter((row) => row.id === snapshotId);
    }
    rows.sort((left, right) => right.id - left.id);
    return {
      rows: rows.slice(0, 1).map((row) => ({
        id: row.id,
        payload: row.payload,
        created_at: row.createdAt,
      })),
    };
  }

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table !== fundSnapshots) return [];
          this.inserts.push(values);
          const stored: StoredSnapshot = {
            id: this.snapshots.length + 1,
            fundId: values['fundId'] as number,
            type: values['type'] as string,
            payload: DynamicReserveIntelligencePayloadV1Schema.parse(values['payload']),
            createdAt: NOW,
          };
          this.snapshots.push(stored);
          return [{ id: stored.id, createdAt: stored.createdAt }];
        },
      }),
    };
  }

  transaction<T>(callback: (transaction: FakeDatabase) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

function dependencies(
  database: FakeDatabase,
  overrides: Partial<DynamicReserveIntelligenceDependencies> = {}
): DynamicReserveIntelligenceDependencies {
  return {
    database: database as never,
    clock: () => NOW,
    randomId: () => '00000000-0000-4000-8000-000000000014',
    getFundMoicRankingSources: vi.fn().mockResolvedValue({ source: 'mode-sources' }),
    resolveFundCalculationMode: vi.fn().mockResolvedValue({
      effectiveMode: 'on',
      killSwitchActive: false,
    }),
    buildRoundsToModelEvidence: vi.fn().mockResolvedValue({ coverage: {} }),
    resolveMoicActionability: vi.fn().mockResolvedValue({
      actionability: 'actionable',
      sourceFingerprint: {
        moicSourceInputHash: HASH_A,
        roundEvidenceInputHash: HASH_B,
        roundEvidenceAssumptionsHash: HASH_C,
        fingerprintHash: HASH_A,
        policyVersion: 'h9-policy-v1',
      },
    }),
    loadMarginalReserveInputSources: vi
      .fn()
      .mockImplementation(
        async (_input: { fundId: number; asOfDate: string }, options: { facts: unknown }) => ({
          ...nonFactsSources(),
          facts: options.facts,
          companies: nonFactsSources().companies.map((company) => ({
            ...company,
            plannedReservesCents: company.plannedReservesCents,
          })),
          approvedAllocations: nonFactsSources().approvedAllocations.map((allocation) => ({
            ...allocation,
            decidedAt: allocation.decidedAt === null ? null : new Date(allocation.decidedAt),
            updatedAt: new Date(allocation.updatedAt),
          })),
          publishedAssumptions: {
            ...nonFactsSources().publishedAssumptions,
            publishedAt: new Date('2026-07-28T00:00:00.000Z'),
          },
        })
      ),
    loadReserveEnvelopeSources: vi.fn().mockResolvedValue(envelopeSources()),
    ...overrides,
  };
}

function runInput(deps: DynamicReserveIntelligenceDependencies) {
  return {
    fundId: 1,
    financialFactsSnapshotId: 31,
    overlay: [{ companyId: 11, plannedReserveCents: 70_00 }],
    idempotencyKey: 'run-31',
    actorId: 7,
    dependencies: deps,
  };
}

describe('ranked reserve input from pinned snapshot', () => {
  it('composes a conserved allocation without live facts I/O', () => {
    const composeInput = buildRankedReserveInputFromSnapshot({
      factsSnapshot: factsSnapshot(),
      marginalNonFactsSources: nonFactsSources(),
      envelopeSources: envelopeSources(),
    });
    const result = composeRankedReserveAllocation(composeInput);

    expect(result.conservationOk).toBe(true);
    expect(result.failSafe).toBe(false);
    expect(result.totalAllocated).toBeGreaterThan(0);
    expect(result.allocations[0]?.companyId).toBe(11);
  });

  it('degrades a company with missing pinned facts to unavailable', () => {
    const snapshot = factsSnapshot();
    snapshot.payload.companyActuals.facts = [];
    const composeInput = buildRankedReserveInputFromSnapshot({
      factsSnapshot: snapshot,
      marginalNonFactsSources: nonFactsSources(),
      envelopeSources: envelopeSources(),
    });
    const result = composeRankedReserveAllocation(composeInput);

    expect(composeInput.candidates).toEqual([
      expect.objectContaining({ companyId: 11, status: 'unavailable', marginalMoic: null }),
    ]);
    expect(result.failSafeReason).toBe('no_actionable_candidates');
  });
});

describe('dynamic reserve intelligence service', () => {
  it.each([
    ['financial-facts-policy/1.1.0', 'financial-facts-payload/2', false],
    ['financial-facts-policy/1.2.0', 'financial-facts-payload/3', true],
  ] as const)(
    'pins %s into reserve provenance',
    async (policyVersion, payloadSchemaId, isPayload3) => {
      const database = new FakeDatabase();
      const legacy = factsSnapshot();
      const snapshot = PersistedFinancialFactsSnapshotV1Schema.parse({
        ...legacy,
        policyVersion,
        payloadSchemaId,
        payload: {
          ...legacy.payload,
          positionRefs: [],
          positionComponentRefs: [],
          ownershipRefs: [],
          valuationRefs: [],
          observationRefs: [],
          ...(isPayload3 ? { openingAccountingState: null } : {}),
        },
      });
      database.facts = factsRow(snapshot);

      const deps = dependencies(database);
      const response = await createDynamicReserveIntelligenceRun(runInput(deps));

      expect(response.result.provenance.factsSnapshot).toMatchObject({
        policyVersion,
        payloadSchemaId,
        ...(isPayload3 ? { payload: { openingAccountingState: null } } : {}),
      });
    }
  );

  it('persists conserved cents output and signed overlay divergence without plan write-back', async () => {
    const database = new FakeDatabase();
    const deps = dependencies(database);

    const response = await createDynamicReserveIntelligenceRun(runInput(deps));

    expect(response.replayed).toBe(false);
    expect(response.result.actionability).toBe('actionable');
    expect(response.result.fund.totalSystemAllocatedCents).toBeGreaterThan(0);
    expect(response.result.companies[0]).toMatchObject({
      companyId: 11,
      overlayPlannedCents: 70_00,
      deltaCents: 70_00 - (response.result.companies[0]?.systemAllocatedCents ?? Number.NaN),
    });
    expect(response.result.fund.totalDeltaCents).toBe(
      70_00 - response.result.fund.totalSystemAllocatedCents
    );
    expect(response.result.fund.totalSystemAllocatedCents).toBe(
      response.result.companies.reduce((sum, company) => sum + company.systemAllocatedCents, 0)
    );
    expect(response.result.companies[0]?.concentration).toBe('1.000000');
    expect(database.inserts).toHaveLength(1);
    expect(database.inserts[0]).toMatchObject({
      fundId: 1,
      type: 'RESERVE_INTELLIGENCE',
      state: null,
      scenarioSetId: null,
      h9ActionabilityStatus: 'actionable',
    });

    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const serviceSource = await readFile(
      path.join(repoRoot, 'server/services/reserves/dynamic-reserve-intelligence-service.ts'),
      'utf8'
    );
    const seamSource = await readFile(
      path.join(repoRoot, 'server/services/reserves/ranked-reserve-input-from-snapshot.ts'),
      'utf8'
    );
    expect(serviceSource).not.toContain('currentPlanVersions');
    expect(seamSource).not.toContain('currentPlanVersions');
    expect(serviceSource).not.toContain('facts-reserve-input-adapter');
    expect(seamSource).not.toContain('facts-reserve-input-adapter');
  });

  it('records unknown overlay companies as constraint findings', async () => {
    const database = new FakeDatabase();
    const deps = dependencies(database);

    const response = await createDynamicReserveIntelligenceRun({
      ...runInput(deps),
      overlay: [{ companyId: 999, plannedReserveCents: 12_00 }],
    });

    expect(response.result.constraintFindings).toEqual([
      { code: 'overlay_unknown_company', companyId: 999 },
    ]);
  });

  it('persists H9 non-actionable runs with their stored actionability', async () => {
    const database = new FakeDatabase();
    const deps = dependencies(database, {
      resolveMoicActionability: vi.fn().mockResolvedValue({
        actionability: 'non_actionable',
        sourceFingerprint: {
          moicSourceInputHash: HASH_A,
          roundEvidenceInputHash: HASH_B,
          roundEvidenceAssumptionsHash: HASH_C,
          fingerprintHash: HASH_A,
          policyVersion: 'h9-policy-v1',
        },
      }) as never,
    });

    const response = await createDynamicReserveIntelligenceRun(runInput(deps));

    expect(response.result.actionability).toBe('non_actionable');
    expect(database.inserts[0]?.['h9ActionabilityStatus']).toBe('non_actionable');
  });

  it('returns 404 for an active kill switch and persists zero rows', async () => {
    const database = new FakeDatabase();
    const deps = dependencies(database, {
      resolveFundCalculationMode: vi.fn().mockResolvedValue({
        effectiveMode: 'on',
        killSwitchActive: true,
      }) as never,
    });

    await expect(createDynamicReserveIntelligenceRun(runInput(deps))).rejects.toMatchObject({
      status: 404,
      code: 'RESERVE_INTELLIGENCE_NOT_FOUND',
    });
    expect(database.inserts).toHaveLength(0);
  });

  it('returns 404 when the effective mode is off and persists zero rows', async () => {
    const database = new FakeDatabase();
    const deps = dependencies(database, {
      resolveFundCalculationMode: vi.fn().mockResolvedValue({
        effectiveMode: 'off',
        killSwitchActive: false,
      }) as never,
    });

    await expect(createDynamicReserveIntelligenceRun(runInput(deps))).rejects.toMatchObject({
      status: 404,
      code: 'RESERVE_INTELLIGENCE_NOT_FOUND',
    });
    expect(database.inserts).toHaveLength(0);
    expect(deps.buildRoundsToModelEvidence).not.toHaveBeenCalled();
    expect(deps.loadMarginalReserveInputSources).not.toHaveBeenCalled();
  });

  it('rejects a cross-fund facts snapshot before source or gate work', async () => {
    const database = new FakeDatabase();
    database.factsOwnershipAllowed = false;
    const deps = dependencies(database);

    await expect(createDynamicReserveIntelligenceRun(runInput(deps))).rejects.toMatchObject({
      status: 404,
      code: 'FUND_SCOPE_NOT_FOUND',
    });
    expect(deps.getFundMoicRankingSources).not.toHaveBeenCalled();
    expect(database.inserts).toHaveLength(0);
  });

  it('blocks reserve consumer policy failures with 422 and zero writes', async () => {
    const database = new FakeDatabase();
    database.facts = factsRow(
      factsSnapshot({
        consumerEvaluations: [
          {
            consumer: 'reserve',
            status: 'blocked',
            reasons: ['unattributed_legacy_direct'],
          },
        ],
      })
    );
    const deps = dependencies(database);

    await expect(createDynamicReserveIntelligenceRun(runInput(deps))).rejects.toMatchObject({
      status: 422,
      code: 'FACTS_RESERVE_EVALUATION_BLOCKED',
    });
    expect(database.inserts).toHaveLength(0);
  });

  it('returns idempotency-key reuse before re-evaluating a now-blocked facts snapshot', async () => {
    const database = new FakeDatabase();
    const deps = dependencies(database);
    await createDynamicReserveIntelligenceRun(runInput(deps));
    database.facts = factsRow(
      factsSnapshot({
        consumerEvaluations: [
          {
            consumer: 'reserve',
            status: 'blocked',
            reasons: ['unattributed_legacy_direct'],
          },
        ],
      })
    );

    await expect(
      createDynamicReserveIntelligenceRun({
        ...runInput(deps),
        overlay: [{ companyId: 11, plannedReserveCents: 80_00 }],
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
    expect(database.inserts).toHaveLength(1);
  });

  it('replays the same command, rejects key reuse, and inserts only after advisory locking', async () => {
    const database = new FakeDatabase();
    const deps = dependencies(database);
    const first = await createDynamicReserveIntelligenceRun(runInput(deps));
    const replay = await createDynamicReserveIntelligenceRun(runInput(deps));

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ snapshotId: first.snapshotId, replayed: true });
    expect(database.inserts).toHaveLength(1);
    expect(database.statements.some((statement) => statement.includes('hashtextextended'))).toBe(
      true
    );

    await expect(
      createDynamicReserveIntelligenceRun({
        ...runInput(deps),
        overlay: [{ companyId: 11, plannedReserveCents: 80_00 }],
      })
    ).rejects.toBeInstanceOf(IdempotentCommandError);
    expect(database.inserts).toHaveLength(1);
  });

  it('serves latest and by-id reads without minting or recomputing gates', async () => {
    const database = new FakeDatabase();
    const deps = dependencies(database);
    const created = await createDynamicReserveIntelligenceRun(runInput(deps));
    vi.clearAllMocks();

    const latest = await getLatestDynamicReserveIntelligenceRun({
      fundId: 1,
      dependencies: deps,
    });
    const selected = await getDynamicReserveIntelligenceRun({
      fundId: 1,
      snapshotId: created.snapshotId,
      dependencies: deps,
    });

    expect(latest).toEqual(selected);
    expect(latest.snapshotId).toBe(created.snapshotId);
    expect(database.inserts).toHaveLength(1);
    expect(deps.resolveFundCalculationMode).not.toHaveBeenCalled();
    expect(deps.resolveMoicActionability).not.toHaveBeenCalled();
  });

  it('isolates run output from live facts changes by substituting pinned snapshot facts', async () => {
    const database = new FakeDatabase();
    let liveInitialInvestmentAmount = '1000000.000000';
    const loadSources = vi
      .fn()
      .mockImplementation(
        async (
          _input: { fundId: number; asOfDate: string },
          options: { facts: PersistedFinancialFactsSnapshotV1['payload']['companyActuals'] }
        ) => {
          const selectedFacts = options.facts ?? {
            ...factsSnapshot().payload.companyActuals,
            facts: factsSnapshot().payload.companyActuals.facts.map((fact) => ({
              ...fact,
              initialInvestmentAmount: liveInitialInvestmentAmount,
            })),
          };
          return {
            ...nonFactsSources(),
            facts: selectedFacts,
            companies: nonFactsSources().companies,
            approvedAllocations: nonFactsSources().approvedAllocations.map((allocation) => ({
              ...allocation,
              decidedAt: allocation.decidedAt === null ? null : new Date(allocation.decidedAt),
              updatedAt: new Date(allocation.updatedAt),
            })),
            publishedAssumptions: {
              ...nonFactsSources().publishedAssumptions,
              publishedAt: new Date('2026-07-28T00:00:00.000Z'),
            },
          };
        }
      );
    const deps = dependencies(database, {
      loadMarginalReserveInputSources: loadSources,
    });
    const first = await createDynamicReserveIntelligenceRun(runInput(deps));

    liveInitialInvestmentAmount = '9000000.000000';
    const second = await createDynamicReserveIntelligenceRun({
      ...runInput(deps),
      idempotencyKey: 'run-32',
    });

    expect(first.result.companies).toEqual(second.result.companies);
    expect(first.result.fund).toEqual(second.result.fund);
    expect(loadSources).toHaveBeenCalledTimes(2);
    expect(loadSources.mock.calls[1]?.[1].facts.facts[0]?.initialInvestmentAmount).toBe(
      '1000000.000000'
    );
  });

  it('uses pinned facts for command-time MOIC gates without invoking a live actuals load', async () => {
    const database = new FakeDatabase();
    const getSources = vi.fn().mockImplementation(
      async (
        _fundId: number,
        _database: unknown,
        factsSource: {
          status: string;
          response: { facts: Array<{ initialInvestmentAmount: string }> };
        }
      ) => {
        expect(factsSource.status).toBe('available');
        expect(factsSource.response.facts[0]?.initialInvestmentAmount).toBe('1000000.000000');
        return { source: 'mode-sources', factsSource };
      }
    );
    const deps = dependencies(database, {
      getFundMoicRankingSources: getSources as never,
    });

    await createDynamicReserveIntelligenceRun(runInput(deps));

    expect(getSources).toHaveBeenCalledOnce();
    expect(getSources.mock.calls[0]?.[2]).toMatchObject({
      status: 'available',
      response: {
        fundId: 1,
        asOfDate: '2026-07-29',
      },
    });
  });

  it('calculates from a historical pinned snapshot without current-date mismatch', async () => {
    const database = new FakeDatabase();
    const historicalSnapshot = factsSnapshot();
    historicalSnapshot.asOfDate = '2026-07-28';
    historicalSnapshot.payload.companyActuals.asOfDate = '2026-07-28';
    database.facts = factsRow(PersistedFinancialFactsSnapshotV1Schema.parse(historicalSnapshot));
    const deps = dependencies(database);

    const response = await createDynamicReserveIntelligenceRun(runInput(deps));

    expect(response.result.provenance.asOfDate).toBe('2026-07-28');
    expect(response.result.provenance.marginalNonFactsSources.sourceSnapshotDate).toBe(
      '2026-07-28'
    );
    expect(response.result.fund.failSafeReason).not.toBe('no_actionable_candidates');
    expect(response.result.companies[0]?.status).toBe('actionable');
  });

  it('replays identical composition numbers from persisted payload inputs alone', async () => {
    const database = new FakeDatabase();
    const deps = dependencies(database);
    const created = await createDynamicReserveIntelligenceRun(runInput(deps));
    const persisted = DynamicReserveIntelligencePayloadV1Schema.parse(created.result);

    const replayInput = buildRankedReserveInputFromSnapshot({
      factsSnapshot: persisted.provenance.factsSnapshot,
      marginalNonFactsSources: persisted.provenance.marginalNonFactsSources,
      envelopeSources: persisted.provenance.envelopeSources,
    });
    const replayed = composeRankedReserveAllocation(replayInput);

    expect(Math.round(replayed.totalAllocated * 100)).toBe(
      persisted.fund.totalSystemAllocatedCents
    );
    expect(replayed.factsInputHash).toBe(persisted.provenance.factsInputHash);
    expect(replayed.assumptionsHash).toBe(persisted.provenance.assumptionsHash);
    expect(replayed.envelopeInputHash).toBe(persisted.provenance.envelopeInputHash);
  });

  it('surfaces typed not-found reads', async () => {
    const database = new FakeDatabase();
    const deps = dependencies(database);

    await expect(
      getDynamicReserveIntelligenceRun({ fundId: 1, snapshotId: 999, dependencies: deps })
    ).rejects.toBeInstanceOf(DynamicReserveIntelligenceServiceError);
  });

  it('rejects cross-fund and same-fund wrong-type run ids', async () => {
    const crossFundDatabase = new FakeDatabase();
    const crossFundDeps = dependencies(crossFundDatabase);
    const crossFundRun = await createDynamicReserveIntelligenceRun(runInput(crossFundDeps));
    crossFundDatabase.snapshots[0]!.fundId = 2;

    await expect(
      getDynamicReserveIntelligenceRun({
        fundId: 1,
        snapshotId: crossFundRun.snapshotId,
        dependencies: crossFundDeps,
      })
    ).rejects.toMatchObject({ status: 404, code: 'RESERVE_INTELLIGENCE_RUN_NOT_FOUND' });

    const wrongTypeDatabase = new FakeDatabase();
    const wrongTypeDeps = dependencies(wrongTypeDatabase);
    const wrongTypeRun = await createDynamicReserveIntelligenceRun(runInput(wrongTypeDeps));
    wrongTypeDatabase.snapshots[0]!.type = 'CURRENT_FORECAST_V2';

    await expect(
      getDynamicReserveIntelligenceRun({
        fundId: 1,
        snapshotId: wrongTypeRun.snapshotId,
        dependencies: wrongTypeDeps,
      })
    ).rejects.toMatchObject({ status: 404, code: 'RESERVE_INTELLIGENCE_RUN_NOT_FOUND' });
  });
});
