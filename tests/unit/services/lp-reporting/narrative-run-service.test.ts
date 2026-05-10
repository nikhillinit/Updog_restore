/**
 * Unit tests for LP Reporting narrative draft service.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import type { MetricRunCommitError } from '../../../../server/services/lp-reporting/metric-run-commit-service';
import {
  createNarrativeDraft,
  generateNarrativeText,
  getNarrativeDraft,
  listNarrativeDrafts,
} from '../../../../server/services/lp-reporting/narrative-run-service';
import {
  lpMetricRuns,
  narrativeRuns,
  type InsertNarrativeRun,
  type LpMetricRun,
  type NarrativeRun,
} from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';

const validXirrDiagnostic = {
  convergence: 'converged',
  iterations: 5,
  method: 'newton',
  boundHit: null,
  failureReason: null,
} as const;

function validResults() {
  return {
    asOfDate: '2026-03-31',
    currency: 'USD',
    dpi: '0.450000',
    rvpi: '1.250000',
    tvpi: '1.700000',
    moic: '1.700000',
    netIrr: '0.150000',
    grossIrr: '0.180000',
    xirrDiagnostic: {
      net: validXirrDiagnostic,
      gross: validXirrDiagnostic,
    },
    contributionsTotal: '50000000.000000',
    distributionsTotal: '22500000.000000',
    currentNav: '62500000.000000',
    markConfidenceMix: { high: 8, medium: 3, low: 1 },
  };
}

function validDiagnostics() {
  return {
    engineVersion: 'lp-reporting-engine@1.2.0',
    decimalPrecision: 6,
    excludedFutureMarks: [900],
    warnings: [{ code: 'LOW_CONFIDENCE_MARKS', message: 'One low-confidence mark.' }],
  };
}

interface State {
  metricRuns: LpMetricRun[];
  narratives: NarrativeRun[];
  users: number[];
  insertValues: InsertNarrativeRun[];
  conflictTargets: unknown[];
  nextNarrativeId: number;
  dropNextInsert: boolean;
}

const state: State = {
  metricRuns: [],
  narratives: [],
  users: [],
  insertValues: [],
  conflictTargets: [],
  nextNarrativeId: 1000,
  dropNextInsert: false,
};

function metricRunRow(overrides: Partial<LpMetricRun> = {}): LpMetricRun {
  return {
    id: 11,
    fundId: 1,
    vehicleId: null,
    asOfDate: '2026-03-31',
    runType: 'quarterly_report',
    perspective: 'lp_net',
    status: 'locked',
    inputsHash: 'a'.repeat(64),
    sourceEventIds: [101, 102],
    sourceMarkIds: [201],
    sourceEvidenceIds: [301, 302],
    resultsJson: validResults(),
    diagnosticsJson: validDiagnostics(),
    methodologyVersion: 'lp-reporting-methodology-v1',
    calculationVersion: 'lp-reporting-metrics-engine-1.0.0',
    generatedBy: 7,
    approvedBy: 7,
    approvedAt: new Date('2026-05-10T01:00:00Z'),
    lockedBy: 7,
    lockedAt: new Date('2026-05-10T02:00:00Z'),
    exportedAt: null,
    version: 3,
    createdAt: new Date('2026-05-10T00:00:00Z'),
    updatedAt: new Date('2026-05-10T02:00:00Z'),
    ...overrides,
  };
}

function narrativeRow(overrides: Partial<NarrativeRun> = {}): NarrativeRun {
  return {
    id: 1000,
    fundId: 1,
    metricRunId: 11,
    asOfDate: '2026-03-31',
    narrativeType: 'methodology',
    generatedText: 'Methodology draft as of 2026-03-31.',
    editedText: null,
    status: 'draft',
    generatedBy: 7,
    editedBy: null,
    approvedBy: null,
    approvedAt: null,
    exportedAt: null,
    createdAt: new Date('2026-05-10T00:00:00Z'),
    updatedAt: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

function rowsFor(table: unknown): unknown[] {
  if (table === lpMetricRuns) return state.metricRuns;
  if (table === narrativeRuns) return state.narratives;
  if (table === users) return state.users.map((id) => ({ id }));
  return [];
}

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = (count: number) => Promise.resolve(rows.slice(0, count));
  return promise;
}

function makeDatabase(): typeof db {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => queryResult(rowsFor(table)),
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: InsertNarrativeRun) => ({
        onConflictDoNothing: (config?: { target?: unknown }) => ({
          returning: async () => {
            if (table !== narrativeRuns) return [];
            state.conflictTargets.push(config?.target);
            const existing = state.narratives.find(
              (candidate) =>
                candidate.metricRunId === row.metricRunId &&
                candidate.narrativeType === row.narrativeType
            );
            if (existing) return [];

            const inserted = narrativeRow({
              id: state.nextNarrativeId++,
              fundId: row.fundId,
              metricRunId: row.metricRunId,
              asOfDate: row.asOfDate,
              narrativeType: row.narrativeType,
              generatedText: row.generatedText,
              editedText: row.editedText ?? null,
              status: row.status ?? 'draft',
              generatedBy: row.generatedBy ?? null,
            });
            state.narratives.push(inserted);

            if (state.dropNextInsert) {
              state.dropNextInsert = false;
              return [];
            }

            state.insertValues.push(row);
            return [inserted];
          },
        }),
      }),
    }),
  } as unknown as typeof db;
}

beforeEach(() => {
  state.metricRuns = [metricRunRow()];
  state.narratives = [];
  state.users = [7];
  state.insertValues = [];
  state.conflictTargets = [];
  state.nextNarrativeId = 1000;
  state.dropNextInsert = false;
});

describe('generateNarrativeText', () => {
  const source = {
    metricRun: metricRunRow(),
    results: validResults(),
    diagnostics: validDiagnostics(),
    sourceEventCount: 2,
    sourceMarkCount: 1,
    sourceEvidenceCount: 2,
  };

  it.each([
    ['no_dpi' as const, ['2026-03-31', '0.450000', '22500000.000000', '50000000.000000']],
    [
      'methodology' as const,
      [
        'quarterly_report',
        'lp_net',
        '2 events',
        '1 marks',
        '2 evidence records',
        'lp-reporting-engine@1.2.0',
        'Decimal precision: 6',
        'newton',
        'converged',
      ],
    ],
    [
      'portfolio_update' as const,
      ['1.700000', '1.250000', '62500000.000000', 'high 8', 'medium 3', 'low 1'],
    ],
    [
      'risk_disclosure' as const,
      ['LOW_CONFIDENCE_MARKS', 'Excluded future marks: 1', 'Low-confidence marks: 1'],
    ],
  ])('includes required facts for %s', (narrativeType, expectedParts) => {
    const text = generateNarrativeText(narrativeType, source);
    for (const expected of expectedParts) {
      expect(text).toContain(expected);
    }
  });

  it('does not include unsupported inference language', () => {
    const combined = [
      generateNarrativeText('no_dpi', source),
      generateNarrativeText('methodology', source),
      generateNarrativeText('portfolio_update', source),
      generateNarrativeText('risk_disclosure', source),
    ].join(' ');

    expect(combined).not.toMatch(/\b(improved|declined|trend|pipeline|legal advice)\b/i);
    expect(combined).not.toMatch(/\bmanual adjustment|file upload|company-level\b/i);
  });
});

describe('createNarrativeDraft', () => {
  it('creates a draft for a locked metric run using route-owned fields', async () => {
    const result = await createNarrativeDraft(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: { narrativeType: 'methodology' },
      },
      { database: makeDatabase() }
    );

    expect(result.inserted).toBe(true);
    expect(result.record.metricRunId).toBe(11);
    expect(result.record.status).toBe('draft');
    expect(result.record.generatedBy).toBe(7);
    expect(result.record.editedText).toBeNull();
    expect(result.record.generatedText).toContain('Engine version: lp-reporting-engine@1.2.0');
    expect(state.insertValues).toHaveLength(1);
    expect(state.insertValues[0]).toMatchObject({
      fundId: 1,
      metricRunId: 11,
      asOfDate: '2026-03-31',
      narrativeType: 'methodology',
      generatedBy: 7,
      status: 'draft',
      editedText: null,
    });
    expect(state.insertValues[0]?.approvedBy).toBeUndefined();
    expect(state.insertValues[0]?.exportedAt).toBeUndefined();
    expect(state.conflictTargets).toEqual([
      [narrativeRuns.metricRunId, narrativeRuns.narrativeType],
    ]);
  });

  it('rejects missing source metric runs', async () => {
    state.metricRuns = [];

    await expect(
      createNarrativeDraft(
        { fundId: 1, metricRunId: 11, userId: 7, body: { narrativeType: 'no_dpi' } },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 404,
      code: 'METRIC_RUN_NOT_FOUND',
    } satisfies Partial<MetricRunCommitError>);
    expect(state.insertValues).toHaveLength(0);
  });

  it('rejects non-locked source metric runs', async () => {
    state.metricRuns = [metricRunRow({ status: 'approved' })];

    await expect(
      createNarrativeDraft(
        { fundId: 1, metricRunId: 11, userId: 7, body: { narrativeType: 'no_dpi' } },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'METRIC_RUN_NOT_LOCKED',
    } satisfies Partial<MetricRunCommitError>);
    expect(state.insertValues).toHaveLength(0);
  });

  it('rejects unresolved numeric app users before insert', async () => {
    state.users = [];

    await expect(
      createNarrativeDraft(
        { fundId: 1, metricRunId: 11, userId: 7, body: { narrativeType: 'no_dpi' } },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_USER_ID_UNRESOLVED',
    } satisfies Partial<MetricRunCommitError>);
    expect(state.insertValues).toHaveLength(0);
  });

  it('rejects invalid persisted resultsJson before insert', async () => {
    state.metricRuns = [metricRunRow({ resultsJson: { bad: true } })];

    await expect(
      createNarrativeDraft(
        { fundId: 1, metricRunId: 11, userId: 7, body: { narrativeType: 'no_dpi' } },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 500,
      code: 'METRIC_RUN_PAYLOAD_INVALID',
    } satisfies Partial<MetricRunCommitError>);
    expect(state.insertValues).toHaveLength(0);
  });

  it('rejects invalid persisted diagnosticsJson before insert', async () => {
    state.metricRuns = [metricRunRow({ diagnosticsJson: { bad: true } })];

    await expect(
      createNarrativeDraft(
        { fundId: 1, metricRunId: 11, userId: 7, body: { narrativeType: 'no_dpi' } },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 500,
      code: 'METRIC_RUN_PAYLOAD_INVALID',
    } satisfies Partial<MetricRunCommitError>);
    expect(state.insertValues).toHaveLength(0);
  });

  it('returns existing rows unchanged on duplicate create', async () => {
    state.narratives = [
      narrativeRow({ narrativeType: 'no_dpi', generatedText: 'Existing generated text.' }),
    ];

    const result = await createNarrativeDraft(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: { narrativeType: 'no_dpi' },
      },
      { database: makeDatabase() }
    );

    expect(result.inserted).toBe(false);
    expect(result.record.generatedText).toBe('Existing generated text.');
    expect(state.insertValues).toHaveLength(0);
  });

  it('reloads an existing row after a conflict-targeted insert race', async () => {
    state.dropNextInsert = true;

    const result = await createNarrativeDraft(
      {
        fundId: 1,
        metricRunId: 11,
        userId: 7,
        body: { narrativeType: 'portfolio_update' },
      },
      { database: makeDatabase() }
    );

    expect(result.inserted).toBe(false);
    expect(result.record.narrativeType).toBe('portfolio_update');
    expect(state.insertValues).toHaveLength(0);
    expect(state.narratives).toHaveLength(1);
  });

  it('does not import or read live evidence_records for template content', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'server', 'services', 'lp-reporting', 'narrative-run-service.ts'),
      'utf8'
    );

    expect(source).not.toMatch(/evidenceRecords/);
    expect(source).not.toMatch(/from\(evidenceRecords\)/);
  });
});

describe('listNarrativeDrafts', () => {
  it('lists route metric-run rows in stable narrative type order', async () => {
    state.narratives = [
      narrativeRow({ id: 1002, narrativeType: 'risk_disclosure' }),
      narrativeRow({ id: 1001, narrativeType: 'no_dpi' }),
      narrativeRow({ id: 1003, metricRunId: 99, narrativeType: 'methodology' }),
      narrativeRow({ id: 1004, fundId: 2, narrativeType: 'portfolio_update' }),
    ];

    const result = await listNarrativeDrafts(
      { fundId: 1, metricRunId: 11 },
      { database: makeDatabase() }
    );

    expect(result.records.map((record) => record.narrativeType)).toEqual([
      'no_dpi',
      'risk_disclosure',
    ]);
  });
});

describe('getNarrativeDraft', () => {
  it('returns route-scoped detail', async () => {
    state.narratives = [narrativeRow({ id: 1001, narrativeType: 'risk_disclosure' })];

    const result = await getNarrativeDraft(
      { fundId: 1, metricRunId: 11, narrativeRunId: 1001 },
      { database: makeDatabase() }
    );

    expect(result.record.narrativeRunId).toBe(1001);
    expect(result.record.narrativeType).toBe('risk_disclosure');
  });

  it('rejects narrative rows outside the route metric run', async () => {
    state.narratives = [narrativeRow({ id: 1001, metricRunId: 99 })];

    await expect(
      getNarrativeDraft(
        { fundId: 1, metricRunId: 11, narrativeRunId: 1001 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({
      status: 404,
      code: 'NARRATIVE_RUN_NOT_FOUND',
    } satisfies Partial<MetricRunCommitError>);
  });
});
