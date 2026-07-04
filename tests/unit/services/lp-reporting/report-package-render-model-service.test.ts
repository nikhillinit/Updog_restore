/**
 * Unit tests for LP Reporting report-package render model service.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { db } from '../../../../server/db';
import type { MetricRunCommitError } from '../../../../server/services/lp-reporting/metric-run-commit-service';
import { getMetricRunReportPackageRenderModel } from '../../../../server/services/lp-reporting/report-package-render-model-service';
import { funds, type Fund } from '@shared/schema/fund';
import {
  lpMetricRuns,
  lpReportPackages,
  type LpMetricRun,
  type LpReportPackage,
} from '@shared/schema/lp-reporting-evidence';

const { assertH9ExportActionable } = vi.hoisted(() => ({
  assertH9ExportActionable: vi.fn(),
}));

vi.mock('../../../../server/services/lp-reporting/h9-export-gate', () => {
  return { assertH9ExportActionable };
});

const H9_FP = 'd'.repeat(64);
const H9_COLUMNS = {
  h9MoicSourceInputHash: 'a'.repeat(64),
  h9RoundEvidenceInputHash: 'b'.repeat(64),
  h9RoundEvidenceAssumptionsHash: 'c'.repeat(64),
  h9FingerprintHash: H9_FP,
  h9PolicyVersion: 'h9-policy-v1',
  h9ActionabilityStatus: 'actionable',
} as const;
const H9_STAMP = {
  fingerprintHash: H9_COLUMNS.h9FingerprintHash,
  policyVersion: H9_COLUMNS.h9PolicyVersion,
  actionabilityStatus: H9_COLUMNS.h9ActionabilityStatus,
};

const validXirrDiagnostic = {
  convergence: 'converged',
  iterations: 5,
  method: 'newton',
  boundHit: null,
  failureReason: null,
} as const;

interface State {
  funds: Fund[];
  metricRuns: LpMetricRun[];
  reportPackages: LpReportPackage[];
  writeCalls: string[];
}

const state: State = {
  funds: [],
  metricRuns: [],
  reportPackages: [],
  writeCalls: [],
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
    sourceEvidenceIds: [301],
    resultsJson: {},
    diagnosticsJson: {},
    methodologyVersion: 'lp-reporting-methodology-v1',
    calculationVersion: 'lp-reporting-metrics-engine-1.0.0',
    generatedBy: 7,
    approvedBy: 7,
    approvedAt: new Date('2026-05-10T01:00:00Z'),
    lockedBy: 7,
    lockedAt: new Date('2026-05-10T02:00:00Z'),
    exportedAt: null,
    version: 4,
    createdAt: new Date('2026-05-10T00:00:00Z'),
    updatedAt: new Date('2026-05-10T02:00:00Z'),
    ...overrides,
  };
}

function fundRow(overrides: Partial<Fund> = {}): Fund {
  return {
    id: 1,
    name: 'Press On Fund I',
    size: '100000000.00',
    deployedCapital: '0',
    managementFee: '0.0200',
    carryPercentage: '0.2000',
    vintageYear: 2024,
    establishmentDate: null,
    status: 'active',
    isActive: true,
    engineResults: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function reportPackagePayload() {
  const narratives = [
    ['no_dpi', 100, 'Approved no DPI copy.'],
    ['methodology', 101, 'Approved methodology copy.'],
    ['portfolio_update', 102, 'Approved portfolio update copy.'],
    ['risk_disclosure', 103, 'Approved risk disclosure copy.'],
  ] as const;

  return {
    payloadVersion: 1,
    results: {
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
    },
    diagnostics: {
      engineVersion: 'lp-reporting-engine@1.2.0',
      decimalPrecision: 6,
      excludedFutureMarks: [900, 800, 900],
      warnings: [{ code: 'LOW_CONFIDENCE_MARKS', message: 'One low-confidence mark.' }],
    },
    sourceEventIds: [102, 101, 101],
    sourceMarkIds: [201],
    evidenceRecordIds: [301, 300, 301],
    narratives: narratives.map(([narrativeType, narrativeRunId, effectiveText]) => ({
      narrativeType,
      narrativeRunId,
      narrativeVersion: 3,
      approvedBy: 7,
      approvedAt: '2026-05-10T02:30:00.000Z',
      textHash: 'a'.repeat(64),
      effectiveText,
    })),
  };
}

function reportPackageRow(overrides: Partial<LpReportPackage> = {}): LpReportPackage {
  const payload = reportPackagePayload();
  return {
    id: 501,
    fundId: 1,
    metricRunId: 11,
    status: 'assembled',
    asOfDate: '2026-03-31',
    metricRunVersion: 4,
    metricRunLockedBy: 7,
    metricRunLockedAt: new Date('2026-05-10T02:00:00Z'),
    narrativeRefs: payload.narratives.map((narrative) => ({
      narrativeType: narrative.narrativeType,
      narrativeRunId: narrative.narrativeRunId,
      narrativeVersion: narrative.narrativeVersion,
      approvedBy: narrative.approvedBy,
      approvedAt: narrative.approvedAt,
      textHash: narrative.textHash,
    })),
    payload,
    assembledBy: 7,
    assembledAt: new Date('2026-05-10T03:00:00Z'),
    version: 1,
    createdAt: new Date('2026-05-10T03:00:00Z'),
    updatedAt: new Date('2026-05-10T03:00:00Z'),
    ...H9_COLUMNS,
    ...overrides,
  };
}

function rowsFor(table: unknown): unknown[] {
  if (table === funds) return state.funds;
  if (table === lpMetricRuns) return state.metricRuns;
  if (table === lpReportPackages) return state.reportPackages;
  return [];
}

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = () => Promise.resolve(rows);
  return promise;
}

function makeDatabase(): typeof db {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => queryResult(rowsFor(table)),
      }),
    }),
    insert: () => {
      state.writeCalls.push('insert');
      throw new Error('render model service must not insert rows');
    },
    update: () => {
      state.writeCalls.push('update');
      throw new Error('render model service must not update rows');
    },
    execute: async () => {
      state.writeCalls.push('execute');
      return [];
    },
  } as unknown as typeof db;
}

beforeEach(() => {
  state.funds = [fundRow()];
  state.metricRuns = [metricRunRow()];
  state.reportPackages = [reportPackageRow()];
  state.writeCalls = [];
  assertH9ExportActionable.mockReset();
  assertH9ExportActionable.mockResolvedValue(undefined);
});

describe('getMetricRunReportPackageRenderModel', () => {
  it('projects an assembled package into deterministic renderer sections', async () => {
    const response = await getMetricRunReportPackageRenderModel(
      { fundId: 1, metricRunId: 11 },
      { database: makeDatabase() }
    );

    expect(response.renderModel.source.reportPackageId).toBe(501);
    expect(response.renderModel.fundDisplay).toEqual({
      fundId: 1,
      name: 'Press On Fund I',
      vintageYear: 2024,
      size: '100000000.00',
    });
    expect(response.renderModel.metricSections.map((section) => section.sectionId)).toEqual([
      'performance',
      'capital',
      'mark_confidence',
    ]);
    expect(response.renderModel.narrativeSections.map((section) => section.sectionId)).toEqual([
      'no_dpi',
      'methodology',
      'portfolio_update',
      'risk_disclosure',
    ]);
    expect(response.renderModel.references).toEqual({
      sourceEventIds: [101, 102],
      sourceMarkIds: [201],
      evidenceRecordIds: [300, 301],
      narrativeRunIds: [100, 101, 102, 103],
    });
    expect(response.renderModel.source.h9Stamp).toEqual(H9_STAMP);
    expect(response.renderModel.diagnostics.excludedFutureMarks).toEqual([800, 900]);
    expect(state.writeCalls).toEqual([]);
  });

  it('serves the render model when stored H9 matches the current fingerprint', async () => {
    const response = await getMetricRunReportPackageRenderModel(
      { fundId: 1, metricRunId: 11 },
      { database: makeDatabase() }
    );
    expect(response.renderModel).toBeDefined();
  });

  it('blocks H9_FINGERPRINT_STALE when the source fingerprint has drifted', async () => {
    assertH9ExportActionable.mockRejectedValueOnce(
      Object.assign(new Error('stale'), { code: 'H9_FINGERPRINT_STALE' })
    );
    await expect(
      getMetricRunReportPackageRenderModel(
        { fundId: 1, metricRunId: 11 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject({ code: 'H9_FINGERPRINT_STALE' });
  });

  it('returns REPORT_PACKAGE_ROW_INVALID when H9 metadata is missing after the gate', async () => {
    state.reportPackages = [
      reportPackageRow({
        h9MoicSourceInputHash: null,
        h9RoundEvidenceInputHash: null,
        h9RoundEvidenceAssumptionsHash: null,
        h9FingerprintHash: null,
        h9PolicyVersion: null,
        h9ActionabilityStatus: null,
      }),
    ];

    await expect(
      getMetricRunReportPackageRenderModel(
        { fundId: 1, metricRunId: 11 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 500,
      code: 'REPORT_PACKAGE_ROW_INVALID',
    });
  });

  it('returns REPORT_PACKAGE_NOT_FOUND when the package has not been assembled', async () => {
    state.reportPackages = [];

    await expect(
      getMetricRunReportPackageRenderModel(
        { fundId: 1, metricRunId: 11 },
        { database: makeDatabase() }
      )
    ).rejects.toMatchObject<Partial<MetricRunCommitError>>({
      status: 404,
      code: 'REPORT_PACKAGE_NOT_FOUND',
    });
    expect(state.writeCalls).toEqual([]);
  });
});
