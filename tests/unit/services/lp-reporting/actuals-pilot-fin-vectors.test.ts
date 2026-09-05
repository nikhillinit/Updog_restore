import { describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import { previewActualsPilot } from '../../../../server/services/lp-reporting/actuals-pilot-preview-service';
import {
  calculateActualsV1,
  type ActualsCalculatorInputV1,
} from '@shared/lib/financial-facts/actuals-calculator';
import {
  ACTUALS_LEDGER_TEMPLATE_HEADER,
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_HEADER,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from '@shared/contracts/lp-reporting/actuals-pilot-templates';
import type { ActualsPreviewRequestV1, ActualsPreviewResponseV1 } from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import { cashFlowEvents, valuationMarks } from '@shared/schema/lp-reporting-evidence';
import { portfolioCompanies } from '@shared/schema/portfolio';
import { vehicles } from '@shared/schema/vehicles';

type PreviewDatabase = typeof db;
type CalculatorLedgerRow = ActualsCalculatorInputV1['ledgerRows'][number];
type CalculatorValuationMark = ActualsCalculatorInputV1['valuationMarks'][number];

const AS_OF_DATE = '2026-03-31';
const VEHICLE_ID = 7;
const COMPANY_IDS = new Map([
  ['Acme Labs', 42],
  ['Beta Systems', 43],
]);
const ROSTER = [
  { vehicleId: VEHICLE_ID, companyId: 42 },
  { vehicleId: VEHICLE_ID, companyId: 43 },
] as const;

const LEDGER_COLUMNS = [
  'event_type',
  'effective_date',
  'amount',
  'currency',
  'company_name',
  'vehicle_slug',
  'deployment_category',
  'description',
  'expense_category',
  'distribution_type',
  'recallable',
  'external_ref',
] as const;
type LedgerColumn = (typeof LEDGER_COLUMNS)[number];
type LedgerCells = Record<LedgerColumn, string>;

const VALUATION_COLUMNS = [
  'company_name',
  'vehicle_slug',
  'mark_date',
  'position_fair_value',
  'currency',
  'mark_source',
  'confidence_level',
  'valuation_method',
  'cost_basis',
  'external_ref',
] as const;
type ValuationColumn = (typeof VALUATION_COLUMNS)[number];
type ValuationCells = Record<ValuationColumn, string>;

interface CompanyRow {
  id: number;
  fundId: number | null;
  name: string;
}

interface VehicleRow {
  id: number;
  fundId: number;
  vehicleSlug: string;
  vehicleType: string;
  status: string;
  currency: string;
}

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = (count: number) => Promise.resolve(rows.slice(0, count));
  return promise;
}

class FakePreviewDb {
  writeCalls = 0;
  private projectedCashCalls = 0;

  asDatabase(): PreviewDatabase {
    return this as unknown as PreviewDatabase;
  }

  select(projection?: unknown) {
    return {
      from: (table: unknown) => ({
        where: (_condition: unknown) => {
          if (table === portfolioCompanies) {
            return queryResult<CompanyRow>([
              { id: 42, fundId: 1, name: 'Acme Labs' },
              { id: 43, fundId: 1, name: 'Beta Systems' },
            ]);
          }
          if (table === vehicles) {
            return queryResult<VehicleRow>([
              {
                id: VEHICLE_ID,
                fundId: 1,
                vehicleSlug: 'main',
                vehicleType: 'main_fund',
                status: 'active',
                currency: 'USD',
              },
            ]);
          }
          if (table === cashFlowEvents) {
            if (projection === undefined) return queryResult([]);
            return queryResult(this.projectedCashCalls++ === 0 ? [] : [{ id: 900 }]);
          }
          if (table === valuationMarks) return queryResult([]);
          return queryResult([]);
        },
      }),
    };
  }

  insert(): never {
    this.writeCalls += 1;
    throw new Error('FIN vector preview must not insert rows.');
  }

  update(): never {
    this.writeCalls += 1;
    throw new Error('FIN vector preview must not update rows.');
  }

  delete(): never {
    this.writeCalls += 1;
    throw new Error('FIN vector preview must not delete rows.');
  }
}

function ledgerCells(overrides: Partial<LedgerCells> = {}): LedgerCells {
  return {
    event_type: 'settled_contribution',
    effective_date: AS_OF_DATE,
    amount: '100.00',
    currency: 'USD',
    company_name: '',
    vehicle_slug: '',
    deployment_category: '',
    description: '',
    expense_category: '',
    distribution_type: '',
    recallable: '',
    external_ref: 'ledger-ref',
    ...overrides,
  };
}

function valuationCells(overrides: Partial<ValuationCells> = {}): ValuationCells {
  return {
    company_name: 'Acme Labs',
    vehicle_slug: 'main',
    mark_date: AS_OF_DATE,
    position_fair_value: '100.00',
    currency: 'USD',
    mark_source: 'board_update',
    confidence_level: 'medium',
    valuation_method: 'manual',
    cost_basis: '',
    external_ref: 'mark-ref',
    ...overrides,
  };
}

function csv(header: string, rows: readonly string[][]): Buffer {
  return Buffer.from(`${[header, ...rows.map((row) => row.join(','))].join('\n')}\n`);
}

function request(
  templateVersion: typeof ACTUALS_LEDGER_TEMPLATE_VERSION | typeof ACTUALS_VALUATION_TEMPLATE_VERSION,
  payload: Buffer
): ActualsPreviewRequestV1 {
  return {
    contractVersion: 'actuals-preview-request/1.0.0',
    templateVersion,
    asOfDate: AS_OF_DATE,
    fileName: 'fin-vector.csv',
    payload: payload.toString('base64'),
  };
}

function ledgerCsvRows(rows: readonly LedgerCells[]): string[][] {
  return rows.map((row) => LEDGER_COLUMNS.map((column) => row[column]));
}

function valuationCsvRows(rows: readonly ValuationCells[]): string[][] {
  return rows.map((row) => VALUATION_COLUMNS.map((column) => row[column]));
}

type LedgerPreview = Extract<
  ActualsPreviewResponseV1,
  { templateVersion: typeof ACTUALS_LEDGER_TEMPLATE_VERSION }
>;
type ValuationPreview = Extract<
  ActualsPreviewResponseV1,
  { templateVersion: typeof ACTUALS_VALUATION_TEMPLATE_VERSION }
>;

function asLedgerPreview(response: ActualsPreviewResponseV1): LedgerPreview {
  if (response.templateVersion !== ACTUALS_LEDGER_TEMPLATE_VERSION) {
    throw new Error('Expected ledger preview.');
  }
  return response;
}

function asValuationPreview(response: ActualsPreviewResponseV1): ValuationPreview {
  if (response.templateVersion !== ACTUALS_VALUATION_TEMPLATE_VERSION) {
    throw new Error('Expected valuation preview.');
  }
  return response;
}

async function previewLedger(rows: readonly LedgerCells[]) {
  const database = new FakePreviewDb();
  const response = asLedgerPreview(
    await previewActualsPilot(
      {
        fundId: 1,
        request: request(
          ACTUALS_LEDGER_TEMPLATE_VERSION,
          csv(ACTUALS_LEDGER_TEMPLATE_HEADER, ledgerCsvRows(rows))
        ),
      },
      { database: database.asDatabase() }
    )
  );
  expect(response.rowCounts.valid).toBe(rows.length);
  expect(response.rowCounts.invalid).toBe(0);
  expect(database.writeCalls).toBe(0);
  return { response, rows };
}

async function previewValuation(rows: readonly ValuationCells[]) {
  const database = new FakePreviewDb();
  const response = asValuationPreview(
    await previewActualsPilot(
      {
        fundId: 1,
        request: request(
          ACTUALS_VALUATION_TEMPLATE_VERSION,
          csv(ACTUALS_VALUATION_TEMPLATE_HEADER, valuationCsvRows(rows))
        ),
      },
      { database: database.asDatabase() }
    )
  );
  expect(response.rowCounts.valid).toBe(rows.length);
  expect(response.rowCounts.invalid).toBe(0);
  expect(database.writeCalls).toBe(0);
  return { response, rows };
}

function calculatorLedgerRows(
  preview: LedgerPreview,
  sourceRows: readonly LedgerCells[]
): CalculatorLedgerRow[] {
  return preview.rows
    .filter((row) => row.status === 'valid')
    .map((row) => {
      const source = sourceRows[row.rowNumber - 1]!;
      const eventType = row.eventType! as CalculatorLedgerRow['eventType'];
      return {
        contractVersion: 'actuals-pilot-cash-flow/1.0.0',
        sourceExternalRef: row.sourceExternalRef!,
        rowContentHash: row.rowContentHash!,
        templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
        settlementStatus: eventType === 'settled_contribution' ? 'settled' : null,
        deploymentCategory: (source.deployment_category || null) as CalculatorLedgerRow['deploymentCategory'],
        expenseCategory: (source.expense_category || null) as CalculatorLedgerRow['expenseCategory'],
        distributionType: (source.distribution_type || null) as CalculatorLedgerRow['distributionType'],
        recallable:
          source.recallable === '' ? null : source.recallable === 'true',
        canonicalAmount: row.canonicalAmount!,
        eventType,
        effectiveDate: row.effectiveDate!,
        resolvedCompanyId: COMPANY_IDS.get(source.company_name) ?? null,
        resolvedVehicleId: VEHICLE_ID,
      } satisfies CalculatorLedgerRow;
    });
}

function calculatorValuationMarks(
  preview: ValuationPreview,
  sourceRows: readonly ValuationCells[]
): CalculatorValuationMark[] {
  return preview.rows
    .filter((row) => row.status === 'valid')
    .map((row) => {
      const source = sourceRows[row.rowNumber - 1]!;
      const rowContentHash = row.rowContentHash!;
      return {
        contractVersion: 'actuals-pilot-valuation-mark/1.0.0',
        sourceExternalRef: row.sourceExternalRef!,
        rowContentHash,
        templateVersion: ACTUALS_VALUATION_TEMPLATE_VERSION,
        markId: 100 + row.rowNumber,
        markDate: row.effectiveDate!,
        positionFairValue: row.canonicalAmount!,
        markSource: source.mark_source,
        confidenceLevel: source.confidence_level as CalculatorValuationMark['confidenceLevel'],
        resolvedCompanyId: COMPANY_IDS.get(source.company_name)!,
        resolvedVehicleId: VEHICLE_ID,
        externalRefHash: rowContentHash,
      } satisfies CalculatorValuationMark;
    });
}

function calculatorInput(
  ledger: { response: LedgerPreview; rows: readonly LedgerCells[] },
  valuation?: { response: ValuationPreview; rows: readonly ValuationCells[] }
): ActualsCalculatorInputV1 {
  return {
    ledgerRows: calculatorLedgerRows(ledger.response, ledger.rows),
    vehicleCommitment: {
      vehicleId: VEHICLE_ID,
      amount: '1000000.000000',
      sourceHash: 'commitment-source',
    },
    roster: ROSTER,
    valuationMarks: valuation
      ? calculatorValuationMarks(valuation.response, valuation.rows)
      : [],
    ledgerCoverage: 'complete',
    ledgerPayloadSha256: ledger.response.payloadSha256,
    valuationPayloadSha256: valuation?.response.payloadSha256 ?? null,
    predecessorSnapshotInputHash: null,
  };
}

function successful(input: ActualsCalculatorInputV1) {
  const result = calculateActualsV1(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result;
}

function expectLedgerTotals(
  preview: LedgerPreview,
  actuals: ReturnType<typeof successful>['capitalActuals']
): void {
  const pairs = [
    ['settledPaidIn', 'paidInCapital'],
    ['deployed', 'deployedCapital'],
    ['initialDeployed', 'initialDeployedCapital'],
    ['followOnDeployed', 'followOnDeployedCapital'],
    ['secondaryDeployed', 'secondaryDeployedCapital'],
    ['otherDeployed', 'otherDeployedCapital'],
    ['managementFees', 'managementFeesPaid'],
    ['otherExpenses', 'otherExpensesPaid'],
    ['realizedFundProceeds', 'realizedFundProceeds'],
    ['distributionsToPartners', 'distributionsToPartners'],
  ] as const;
  for (const [fileField, calculatorField] of pairs) {
    expect(preview.fileTotals[fileField]).toBe(actuals[calculatorField].value);
  }
}

describe('actuals pilot FIN vectors through real template previews', () => {
  it('FIN-V001 keeps template totals and unsupported facts unavailable', async () => {
    const rows = [
      ledgerCells({ amount: '250000.00', external_ref: 'v001-contribution' }),
      ledgerCells({
        event_type: 'portfolio_investment',
        amount: '100000.00',
        company_name: 'Acme Labs',
        vehicle_slug: 'main',
        deployment_category: 'initial',
        external_ref: 'v001-investment',
      }),
      ledgerCells({
        event_type: 'management_fee',
        amount: '10000.00',
        expense_category: 'management_fee',
        external_ref: 'v001-fee',
      }),
      ledgerCells({
        event_type: 'fund_expense',
        amount: '5000.00',
        expense_category: 'legal',
        external_ref: 'v001-expense',
      }),
      ledgerCells({
        event_type: 'lp_distribution',
        amount: '50000.00',
        distribution_type: 'return_of_capital',
        recallable: 'false',
        external_ref: 'v001-distribution',
      }),
    ];
    const ledger = await previewLedger(rows);
    const actuals = successful(calculatorInput(ledger)).capitalActuals;

    expect(actuals.paidInCapital.value).toBe('250000.000000');
    expect(actuals.deployedCapital.value).toBe('100000.000000');
    expect(actuals.dpi.value).toBe('0.200000000000');
    expect(actuals.managementFeesPaid.value).toBe('10000.000000');
    expect(actuals.otherExpensesPaid.value).toBe('5000.000000');
    for (const field of [
      'calledCapitalIssued',
      'netCalledCapital',
      'uncalledCapital',
      'nav',
      'rvpi',
      'tvpi',
    ] as const) {
      expect(actuals[field].availability).toBe('unavailable');
      expect(actuals[field].value).toBeNull();
    }
    expectLedgerTotals(ledger.response, actuals);
  });

  it('FIN-V002 keeps realized proceeds separate from partner distributions', async () => {
    const rows = [
      ledgerCells({ amount: '100000.00', external_ref: 'v002-contribution' }),
      ledgerCells({
        event_type: 'realized_proceeds',
        amount: '80000.00',
        company_name: 'Acme Labs',
        vehicle_slug: 'main',
        external_ref: 'v002-proceeds',
      }),
      ledgerCells({
        event_type: 'lp_distribution',
        amount: '30000.00',
        distribution_type: 'gain',
        recallable: 'false',
        external_ref: 'v002-distribution',
      }),
    ];
    const ledger = await previewLedger(rows);
    const actuals = successful(calculatorInput(ledger)).capitalActuals;

    expect(actuals.realizedFundProceeds.value).toBe('80000.000000');
    expect(actuals.distributionsToPartners.value).toBe('30000.000000');
    expectLedgerTotals(ledger.response, actuals);
  });

  it('FIN-V003 leaves paid-in unchanged for recallable distributions', async () => {
    const rows = [
      ledgerCells({ amount: '100000.00', external_ref: 'v003-contribution' }),
      ledgerCells({
        event_type: 'lp_distribution',
        amount: '25000.00',
        distribution_type: 'return_of_capital',
        recallable: 'true',
        external_ref: 'v003-recallable-distribution',
      }),
    ];
    const ledger = await previewLedger(rows);
    const actuals = successful(calculatorInput(ledger)).capitalActuals;

    expect(actuals.paidInCapital.value).toBe('100000.000000');
    expect(actuals.recallableDistributions.value).toBe('25000.000000');
    expect(actuals.availableRecallCapacity).toMatchObject({
      value: null,
      availability: 'unavailable',
      reasonCodes: ['RECALL_LIFECYCLE_UNAVAILABLE'],
    });
    expectLedgerTotals(ledger.response, actuals);
  });

  it('FIN-V004 exposes FMV only for complete roster coverage', async () => {
    const ledgerRows = [ledgerCells({ amount: '250000.00', external_ref: 'v004-contribution' })];
    const ledger = await previewLedger(ledgerRows);
    const fullRows = [
      valuationCells({
        company_name: 'Acme Labs',
        position_fair_value: '60000.00',
        external_ref: 'v004-acme-mark',
      }),
      valuationCells({
        company_name: 'Beta Systems',
        position_fair_value: '25000.00',
        external_ref: 'v004-beta-mark',
      }),
    ];
    const fullValuation = await previewValuation(fullRows);
    const full = successful(calculatorInput(ledger, fullValuation));

    expect(full.capitalActuals.portfolioFmv).toMatchObject({
      value: '85000.000000',
      availability: 'available',
      sourceRefs: [
        `actuals-pilot:ledger:${ledger.response.payloadSha256}`,
        `actuals-pilot:valuation:${fullValuation.response.payloadSha256}`,
      ],
    });
    expect(full.capitalActuals.nav).toMatchObject({ value: null, availability: 'unavailable' });
    expect(full.valuationActuals.missingCompanyIds).toEqual([]);
    expect(fullValuation.response.fileTotals.positionFairValue).toBe(
      full.capitalActuals.portfolioFmv.value
    );
    expect(fullValuation.response.fileTotals.markedCompanyCount).toBe(
      full.valuationActuals.marks.length
    );
    expect(full.valuationActuals.marks.map((mark) => mark.externalRefHash)).toEqual(
      fullValuation.response.rows.map((row) => row.rowContentHash)
    );

    const partialRows = [fullRows[0]!];
    const partialValuation = await previewValuation(partialRows);
    const partial = successful(calculatorInput(ledger, partialValuation));

    expect(partial.capitalActuals.portfolioFmv).toMatchObject({
      value: null,
      availability: 'unavailable',
      reasonCodes: ['VALUATION_COVERAGE_PARTIAL'],
    });
    expect(partial.valuationActuals.missingCompanyIds).toEqual([43]);
    expect(partialValuation.response.fileTotals.positionFairValue).toBe(
      partial.valuationActuals.marks[0]!.positionFairValue
    );
    expect(partialValuation.response.fileTotals.markedCompanyCount).toBe(
      partial.valuationActuals.marks.length
    );
  });
});
