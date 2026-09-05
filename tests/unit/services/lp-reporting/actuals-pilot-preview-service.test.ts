import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import {
  computeActualsPilotRowContentHash,
  computeActualsPilotRowSourceHash,
  previewActualsPilot,
} from '../../../../server/services/lp-reporting/actuals-pilot-preview-service';
import {
  ACTUALS_LEDGER_MAX_BYTES,
  type ActualsPreviewRequestV1,
  ACTUALS_MAX_ROWS,
  ACTUALS_PREVIEW_MAX_ISSUES,
} from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  ACTUALS_LEDGER_TEMPLATE_HEADER,
  ACTUALS_LEDGER_TEMPLATE_VERSION,
  ACTUALS_VALUATION_TEMPLATE_HEADER,
  ACTUALS_VALUATION_TEMPLATE_VERSION,
} from '@shared/contracts/lp-reporting/actuals-pilot-templates';
import { cashFlowEvents, valuationMarks } from '@shared/schema/lp-reporting-evidence';
import { portfolioCompanies } from '@shared/schema/portfolio';
import { vehicles } from '@shared/schema/vehicles';

type PreviewDatabase = typeof db;
type FakeRow = Record<string, unknown>;

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

interface FakePreviewState {
  companies: CompanyRow[];
  vehicles: VehicleRow[];
  ownershipCashRows: FakeRow[];
  ownershipValuationRows: FakeRow[];
  existingCashRows: FakeRow[];
  existingValuationSourceRows: FakeRow[];
  existingValuationDateRows: FakeRow[];
  rosterRows: FakeRow[];
}

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = (count: number) => Promise.resolve(rows.slice(0, count));
  return promise;
}

class FakePreviewDb {
  readonly state: FakePreviewState;
  readonly selectCalls: unknown[] = [];
  writeCalls = 0;

  private projectedCashCalls = 0;
  private unprojectedValuationCalls = 0;

  constructor(overrides: Partial<FakePreviewState> = {}) {
    this.state = {
      companies: [{ id: 42, fundId: 1, name: 'Acme Labs' }],
      vehicles: [
        {
          id: 7,
          fundId: 1,
          vehicleSlug: 'main',
          vehicleType: 'main_fund',
          status: 'active',
          currency: 'USD',
        },
      ],
      ownershipCashRows: [],
      ownershipValuationRows: [],
      existingCashRows: [],
      existingValuationSourceRows: [],
      existingValuationDateRows: [],
      rosterRows: [{ id: 900 }],
      ...overrides,
    };
  }

  asDatabase(): PreviewDatabase {
    return this as unknown as PreviewDatabase;
  }

  select(projection?: unknown) {
    return {
      from: (table: unknown) => ({
        where: (_condition: unknown) => {
          this.selectCalls.push({ table, projected: projection !== undefined });

          if (table === portfolioCompanies) return queryResult(this.state.companies);
          if (table === vehicles) return queryResult(this.state.vehicles);

          if (table === cashFlowEvents) {
            if (projection === undefined) return queryResult(this.state.existingCashRows);
            const rows =
              this.projectedCashCalls++ === 0
                ? this.state.ownershipCashRows
                : this.state.rosterRows;
            return queryResult(rows);
          }

          if (table === valuationMarks) {
            if (projection === undefined) {
              const rows =
                this.unprojectedValuationCalls++ === 0
                  ? this.state.existingValuationSourceRows
                  : this.state.existingValuationDateRows;
              return queryResult(rows);
            }
            return queryResult(this.state.ownershipValuationRows);
          }

          return queryResult([]);
        },
      }),
    };
  }

  insert(): never {
    this.writeCalls += 1;
    throw new Error('Preview must not insert rows.');
  }

  update(): never {
    this.writeCalls += 1;
    throw new Error('Preview must not update rows.');
  }

  delete(): never {
    this.writeCalls += 1;
    throw new Error('Preview must not delete rows.');
  }
}

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

function ledgerRow(
  overrides: Partial<Record<(typeof LEDGER_COLUMNS)[number], string>> = {}
): string[] {
  const values: Record<string, string> = {
    event_type: 'settled_contribution',
    effective_date: '2026-03-31',
    amount: '100.00',
    currency: 'USD',
    company_name: '',
    vehicle_slug: '',
    deployment_category: '',
    description: '',
    expense_category: '',
    distribution_type: '',
    recallable: '',
    external_ref: 'ref-1',
    ...overrides,
  };
  return LEDGER_COLUMNS.map((column) => values[column]!);
}

function valuationRow(
  overrides: Partial<Record<(typeof VALUATION_COLUMNS)[number], string>> = {}
): string[] {
  const values: Record<string, string> = {
    company_name: 'Acme Labs',
    vehicle_slug: 'main',
    mark_date: '2026-03-31',
    position_fair_value: '100.00',
    currency: 'USD',
    mark_source: 'board_update',
    confidence_level: 'medium',
    valuation_method: 'manual',
    cost_basis: '',
    external_ref: 'mark-1',
    ...overrides,
  };
  return VALUATION_COLUMNS.map((column) => values[column]!);
}

function csv(header: string, rows: string[][], ending = '\n'): Buffer {
  return Buffer.from([header, ...rows.map((row) => row.join(','))].join('\n') + ending);
}

function request(
  templateVersion:
    typeof ACTUALS_LEDGER_TEMPLATE_VERSION | typeof ACTUALS_VALUATION_TEMPLATE_VERSION,
  payload: Buffer,
  asOfDate = '2026-03-31',
  fileName = 'actuals.csv'
): ActualsPreviewRequestV1 {
  return {
    contractVersion: 'actuals-preview-request/1.0.0',
    templateVersion,
    asOfDate,
    fileName,
    payload: payload.toString('base64'),
  };
}

async function preview(
  templateVersion:
    typeof ACTUALS_LEDGER_TEMPLATE_VERSION | typeof ACTUALS_VALUATION_TEMPLATE_VERSION,
  payload: Buffer,
  database = new FakePreviewDb(),
  asOfDate = '2026-03-31'
) {
  const response = await previewActualsPilot(
    { fundId: 1, request: request(templateVersion, payload, asOfDate) },
    { database: database.asDatabase() }
  );
  return { response, database };
}

beforeEach(() => {
  delete process.env['TZ'];
});

afterEach(() => {
  delete process.env['TZ'];
});

describe('actuals pilot preview service', () => {
  it('previews both fixed templates and returns cent-exact totals', async () => {
    const ledger = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [
        ledgerRow({ external_ref: 'contribution-1', amount: '100.00' }),
        ledgerRow({
          event_type: 'portfolio_investment',
          company_name: 'Acme Labs',
          vehicle_slug: 'main',
          deployment_category: 'initial',
          amount: '25.50',
          external_ref: 'investment-1',
        }),
        ledgerRow({
          event_type: 'realized_proceeds',
          company_name: 'Acme Labs',
          amount: '5.25',
          external_ref: 'proceeds-1',
        }),
      ])
    );

    expect(ledger.response.rowCounts).toEqual({
      total: 3,
      valid: 3,
      invalid: 0,
      duplicateInFile: 0,
      alreadyImported: 0,
    });
    expect(ledger.response.fileTotals).toMatchObject({
      settledPaidIn: '100.000000',
      deployed: '25.500000',
      initialDeployed: '25.500000',
      realizedFundProceeds: '5.250000',
    });
    expect(ledger.response.categoryCoverage).toBe('complete');
    expect(ledger.response.canPublish).toBe(true);
    expect(ledger.database.writeCalls).toBe(0);

    const valuation = await preview(
      ACTUALS_VALUATION_TEMPLATE_VERSION,
      csv(ACTUALS_VALUATION_TEMPLATE_HEADER, [valuationRow({ position_fair_value: '25.50' })])
    );

    expect(valuation.response.rowCounts.valid).toBe(1);
    expect(valuation.response.fileTotals).toMatchObject({
      positionFairValue: '25.500000',
      markedCompanyCount: 1,
    });
    expect(valuation.response.categoryCoverage).toBe('not_applicable');
    expect(valuation.response.canPublish).toBe(true);
  });

  it('returns a blocked response for a wrong header and flags row width', async () => {
    const wrongHeader = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER.replace('amount', 'total'), [ledgerRow()])
    );
    expect(wrongHeader.response.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_HEADER', rowNumber: 1, column: null }),
      ])
    );
    expect(wrongHeader.response.canPublish).toBe(false);

    const shortRow = ledgerRow().slice(0, -1);
    const width = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [shortRow])
    );
    expect(width.response.rows[0]).toMatchObject({
      rowNumber: 1,
      status: 'invalid',
      issues: [expect.objectContaining({ code: 'INVALID_ROW_WIDTH', column: null })],
    });
    expect(width.response.canPublish).toBe(false);
  });

  it.each([
    ['invalid UTF-8', Buffer.from([0xff])],
    ['NUL byte', Buffer.from(`${ACTUALS_LEDGER_TEMPLATE_HEADER}\n${ledgerRow().join(',')}\u0000`)],
    [
      'mixed line endings',
      Buffer.from(`${ACTUALS_LEDGER_TEMPLATE_HEADER}\r\n${ledgerRow().join(',')}\n`),
    ],
    [
      'unmatched quote',
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow({ description: '"unterminated' })], ''),
    ],
    ['alternate delimiter', Buffer.from(ACTUALS_LEDGER_TEMPLATE_HEADER.replaceAll(',', ';'))],
    [
      'embedded newline',
      Buffer.from(
        `${ACTUALS_LEDGER_TEMPLATE_HEADER}\n${ledgerRow({ description: '"line one\nline two"' }).join(',')}`
      ),
    ],
  ])('rejects %s as INVALID_CSV', async (_name, payload) => {
    await expect(preview(ACTUALS_LEDGER_TEMPLATE_VERSION, payload)).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_CSV',
    });
  });

  it('accepts one leading BOM, rejects whitespace cells, formula-like values, and bad enums', async () => {
    const bom = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      Buffer.from(
        `\uFEFF${ACTUALS_LEDGER_TEMPLATE_HEADER}\n${ledgerRow({ external_ref: 'bom-1' }).join(',')}`
      )
    );
    expect(bom.response.rows[0]?.status).toBe('valid');

    await expect(
      preview(
        ACTUALS_LEDGER_TEMPLATE_VERSION,
        Buffer.from(`\uFEFF\uFEFF${ACTUALS_LEDGER_TEMPLATE_HEADER}\n${ledgerRow().join(',')}`)
      )
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_CSV' });

    const blankRow = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      Buffer.from(`${ACTUALS_LEDGER_TEMPLATE_HEADER}\n\n`)
    );
    expect(blankRow.response.rows[0]).toMatchObject({
      status: 'invalid',
      issues: [expect.objectContaining({ code: 'INVALID_ROW_WIDTH' })],
    });

    const formula = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow({ description: ' =SUM(A1:A2)' })])
    );
    expect(formula.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FORMULA_LIKE_VALUE', column: 'description' }),
      ])
    );

    const whitespace = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [
        ledgerRow({ event_type: 'portfolio_investment', company_name: '   ' }),
      ])
    );
    expect(whitespace.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_VALUE', column: 'company_name' }),
      ])
    );

    const badEnums = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [
        ledgerRow({ event_type: 'lp_distribution', distribution_type: 'other', recallable: 'yes' }),
      ])
    );
    expect(badEnums.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_VALUE', column: 'distribution_type' }),
        expect.objectContaining({ code: 'INVALID_VALUE', column: 'recallable' }),
      ])
    );

    const subcent = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow({ amount: '10.001' })])
    );
    expect(subcent.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SUBCENT_USD_UNSUPPORTED', column: 'amount' }),
      ])
    );
  });

  it('resolves Unicode and whitespace variants through two fund-scoped queries', async () => {
    const database = new FakePreviewDb();
    const result = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [
        ledgerRow({
          event_type: 'portfolio_investment',
          company_name: 'Ａcme\t Labs',
          vehicle_slug: '  MAIN  ',
          deployment_category: 'initial',
        }),
      ]),
      database
    );

    expect(result.response.rows[0]?.status).toBe('valid');
    expect(result.response.rows[0]?.issues).toEqual([]);
    expect(result.database.selectCalls.slice(0, 2)).toEqual([
      { table: portfolioCompanies, projected: true },
      { table: vehicles, projected: true },
    ]);
  });

  it('reports missing, ambiguous, and unsupported fund-scoped identities', async () => {
    const missingCompany = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [
        ledgerRow({ event_type: 'portfolio_investment', company_name: 'Unknown Co' }),
      ])
    );
    expect(missingCompany.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'COMPANY_NOT_FOUND' })])
    );

    const missingVehicle = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow({ vehicle_slug: 'missing' })])
    );
    expect(missingVehicle.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'VEHICLE_NOT_FOUND' })])
    );

    const ambiguous = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [
        ledgerRow({ event_type: 'portfolio_investment', company_name: 'Acme Labs' }),
      ]),
      new FakePreviewDb({
        companies: [
          { id: 42, fundId: 1, name: 'Acme Labs' },
          { id: 43, fundId: 1, name: ' acme  labs ' },
        ],
      })
    );
    expect(ambiguous.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'COMPANY_NAME_AMBIGUOUS' })])
    );

    const unsupportedDefault = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow()]),
      new FakePreviewDb({
        vehicles: [
          {
            id: 8,
            fundId: 1,
            vehicleSlug: 'spv-1',
            vehicleType: 'spv',
            status: 'active',
            currency: 'USD',
          },
        ],
      })
    );
    expect(unsupportedDefault.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'UNSUPPORTED_VEHICLE_SCOPE' })])
    );
  });

  it('flags every duplicate external reference and every duplicate valuation company mark', async () => {
    const duplicateRefs = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [
        ledgerRow({ external_ref: 'same-ref' }),
        ledgerRow({ external_ref: 'same-ref', amount: '200.00' }),
      ])
    );
    expect(duplicateRefs.response.rows.map((row) => row.status)).toEqual([
      'duplicate_in_file',
      'duplicate_in_file',
    ]);
    expect(duplicateRefs.response.rows.flatMap((row) => row.issues)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_EXTERNAL_REF', rowNumber: 1 }),
        expect.objectContaining({ code: 'DUPLICATE_EXTERNAL_REF', rowNumber: 2 }),
      ])
    );

    const duplicateMarks = await preview(
      ACTUALS_VALUATION_TEMPLATE_VERSION,
      csv(ACTUALS_VALUATION_TEMPLATE_HEADER, [
        valuationRow({ external_ref: 'mark-1' }),
        valuationRow({ external_ref: 'mark-2', position_fair_value: '200.00' }),
      ])
    );
    expect(duplicateMarks.response.rows.map((row) => row.status)).toEqual([
      'duplicate_in_file',
      'duplicate_in_file',
    ]);
    expect(duplicateMarks.response.rows.flatMap((row) => row.issues)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_COMPANY_MARK', rowNumber: 1 }),
        expect.objectContaining({ code: 'DUPLICATE_COMPANY_MARK', rowNumber: 2 }),
      ])
    );
  });

  it('enforces ledger cutoff and valuation as-of equality', async () => {
    const ledger = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow({ effective_date: '2026-04-01' })])
    );
    expect(ledger.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'DATE_AFTER_CUTOFF' })])
    );

    const valuation = await preview(
      ACTUALS_VALUATION_TEMPLATE_VERSION,
      csv(VALUATION_COLUMNS.join(','), [valuationRow({ mark_date: '2026-04-01' })])
    );
    expect(valuation.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'VALUATION_AS_OF_MISMATCH' })])
    );
  });

  it('classifies already-imported rows and includes them only in file totals', async () => {
    const payload = csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow()]);
    const first = await preview(ACTUALS_LEDGER_TEMPLATE_VERSION, payload);
    const sourceHash = first.response.rows[0]!.rowSourceHash!;
    const rowContentHash = first.response.rows[0]!.rowContentHash!;

    const replay = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      payload,
      new FakePreviewDb({
        existingCashRows: [
          {
            sourceHash,
            importedFrom: 'actuals_pilot_v1',
            payload: { rowContentHash },
          },
        ],
      })
    );
    expect(replay.response.rows[0]?.status).toBe('already_imported');
    expect(replay.response.rowCounts.alreadyImported).toBe(1);
    expect(replay.response.fileTotals.settledPaidIn).toBe('100.000000');
    expect(replay.response.netNewEffectTotals.settledPaidIn).toBe('0.000000');
    expect(replay.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ALREADY_IMPORTED', severity: 'warning' }),
      ])
    );
    expect(replay.response.canPublish).toBe(false);
  });

  it('rejects pilot hash reuse with changed content and non-pilot provenance', async () => {
    const payload = csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow()]);
    const first = await preview(ACTUALS_LEDGER_TEMPLATE_VERSION, payload);
    const sourceHash = first.response.rows[0]!.rowSourceHash!;

    const changedContent = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      payload,
      new FakePreviewDb({
        existingCashRows: [
          {
            sourceHash,
            importedFrom: 'actuals_pilot_v1',
            payload: { rowContentHash: 'b'.repeat(64) },
          },
        ],
      })
    );
    expect(changedContent.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EXTERNAL_REF_REUSE_CONFLICT' })])
    );

    const nonPilot = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      payload,
      new FakePreviewDb({ existingCashRows: [{ sourceHash, importedFrom: 'csv' }] })
    );
    expect(nonPilot.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EXISTING_IMPORT_PROVENANCE_CONFLICT' }),
      ])
    );
  });

  it('classifies an existing valuation mark for the same position and date', async () => {
    const database = new FakePreviewDb({
      existingValuationDateRows: [
        {
          companyId: 42,
          vehicleId: 7,
          markDate: '2026-03-31',
          sourceHash: computeActualsPilotRowSourceHash(1, 'other-ref'),
          status: 'approved',
        },
      ],
    });
    const result = await preview(
      ACTUALS_VALUATION_TEMPLATE_VERSION,
      csv(ACTUALS_VALUATION_TEMPLATE_HEADER, [valuationRow()]),
      database
    );
    expect(result.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'VALUATION_MARK_ALREADY_EXISTS', column: 'mark_date' }),
      ])
    );
    expect(result.response.canPublish).toBe(false);
  });

  it('resolves identities and existing valuation marks after 1,001 unrelated rows', async () => {
    const database = new FakePreviewDb({
      companies: [
        ...Array.from({ length: 1_001 }, (_, index) => ({
          id: index + 1,
          fundId: 1,
          name: `Unrelated Company ${index + 1}`,
        })),
        { id: 2_002, fundId: 1, name: 'Target Company' },
      ],
      vehicles: [
        ...Array.from({ length: 1_001 }, (_, index) => ({
          id: index + 10_000,
          fundId: 1,
          vehicleSlug: `unrelated-vehicle-${index + 1}`,
          vehicleType: 'spv',
          status: 'active',
          currency: 'USD',
        })),
        {
          id: 11_002,
          fundId: 1,
          vehicleSlug: 'target-vehicle',
          vehicleType: 'main_fund',
          status: 'active',
          currency: 'USD',
        },
      ],
      existingValuationDateRows: [
        ...Array.from({ length: 1_001 }, (_, index) => ({
          companyId: index + 20_000,
          vehicleId: index + 30_000,
          markDate: '2026-03-31',
          sourceHash: computeActualsPilotRowSourceHash(1, `unrelated-mark-${index + 1}`),
          status: 'approved',
        })),
        {
          companyId: 2_002,
          vehicleId: 11_002,
          markDate: '2026-03-31',
          sourceHash: computeActualsPilotRowSourceHash(1, 'existing-target-mark'),
          status: 'approved',
        },
      ],
    });

    const result = await preview(
      ACTUALS_VALUATION_TEMPLATE_VERSION,
      csv(
        ACTUALS_VALUATION_TEMPLATE_HEADER,
        [
          valuationRow({
            company_name: 'Target Company',
            vehicle_slug: 'target-vehicle',
            external_ref: 'target-mark',
          }),
        ]
      ),
      database
    );

    expect(result.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'VALUATION_MARK_ALREADY_EXISTS', column: 'mark_date' }),
      ])
    );
  });

  it('keeps canonical row hashes stable across shuffled file order', async () => {
    const rows = [
      ledgerRow({ external_ref: 'order-a', amount: '10.00' }),
      ledgerRow({ external_ref: 'order-b', amount: '20.00' }),
    ];
    const first = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, rows)
    );
    const second = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [rows[1]!, rows[0]!])
    );

    expect(first.response.canonicalRowsHash).toBe(second.response.canonicalRowsHash);
    expect(new Set(first.response.rows.map((row) => row.rowSourceHash))).toEqual(
      new Set(second.response.rows.map((row) => row.rowSourceHash))
    );
    expect(first.response.payloadSha256).not.toBe(second.response.payloadSha256);
    expect(first.response.previewHash).not.toBe(second.response.previewHash);
  });

  it('reports S15 ownership as one fund-level error and performs no writes', async () => {
    const database = new FakePreviewDb({ ownershipCashRows: [{ id: 11 }] });
    const result = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow()]),
      database
    );
    const ownershipIssues = result.response.issues.filter(
      (issue) => issue.code === 'FUND_LEDGER_NOT_PILOT_OWNED'
    );
    expect(ownershipIssues).toEqual([
      expect.objectContaining({ rowNumber: 0, column: null, severity: 'error' }),
    ]);
    expect(result.response.canPublish).toBe(false);
    expect(result.database.writeCalls).toBe(0);
  });

  it('keeps date behavior stable under non-UTC process and database-session timestamps', async () => {
    process.env['TZ'] = 'America/Los_Angeles';
    const processTimezone = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow()])
    );
    expect(processTimezone.response.rows[0]?.effectiveDate).toBe('2026-03-31');

    const sessionTimezone = await preview(
      ACTUALS_VALUATION_TEMPLATE_VERSION,
      csv(ACTUALS_VALUATION_TEMPLATE_HEADER, [valuationRow()]),
      new FakePreviewDb({
        existingValuationDateRows: [
          {
            companyId: 42,
            vehicleId: 7,
            markDate: new Date('2026-03-31T00:00:00.000Z'),
            sourceHash: computeActualsPilotRowSourceHash(1, 'session-ref'),
            status: 'approved',
          },
        ],
      })
    );
    expect(sessionTimezone.response.rows[0]?.effectiveDate).toBe('2026-03-31');
    expect(sessionTimezone.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'VALUATION_MARK_ALREADY_EXISTS' })])
    );
  });

  it('enforces decoded byte and row caps before database work', async () => {
    await expect(
      preview(ACTUALS_LEDGER_TEMPLATE_VERSION, Buffer.alloc(ACTUALS_LEDGER_MAX_BYTES + 1, 0x20))
    ).rejects.toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });

    const tooManyRows = Array.from({ length: 1_001 }, (_, index) =>
      ledgerRow({ external_ref: `row-${index + 1}` })
    );
    await expect(
      preview(ACTUALS_LEDGER_TEMPLATE_VERSION, csv(ACTUALS_LEDGER_TEMPLATE_HEADER, tooManyRows))
    ).rejects.toMatchObject({ status: 413, code: 'ROW_CAP_EXCEEDED' });
  });

  it('has no H9 invalidation wiring and remains write-free', async () => {
    const servicePath = path.join(
      process.cwd(),
      'server/services/lp-reporting/actuals-pilot-preview-service.ts'
    );
    const source = fs.readFileSync(servicePath, 'utf8');
    expect(source).not.toContain('invalidateH9Artifacts');

    const database = new FakePreviewDb();
    await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow()]),
      database
    );
    expect(database.writeCalls).toBe(0);
  });

  it('uses the declared row-content hash preimage for resolved pilot rows', async () => {
    const result = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [
        ledgerRow({ external_ref: 'preimage-1', description: 'verbatim note' }),
      ])
    );
    const row = result.response.rows[0]!;
    expect(row.rowSourceHash).toBe(computeActualsPilotRowSourceHash(1, 'preimage-1'));
    expect(row.rowContentHash).toBe(
      computeActualsPilotRowContentHash({
        templateVersion: ACTUALS_LEDGER_TEMPLATE_VERSION,
        rowSourceHash: row.rowSourceHash!,
        canonicalEconomicFields: {
          eventType: 'settled_contribution',
          effectiveDate: '2026-03-31',
          amount: '100.000000',
          currency: 'USD',
          deploymentCategory: null,
          description: 'verbatim note',
          expenseCategory: null,
          distributionType: null,
          recallable: null,
        },
        resolvedCompanyId: null,
        resolvedVehicleId: 7,
      })
    );
  });

  it('resolves a blank vehicle_slug only when the fund has exactly one vehicle', async () => {
    const sidecar = new FakePreviewDb({
      vehicles: [
        {
          id: 7,
          fundId: 1,
          vehicleSlug: 'main',
          vehicleType: 'main_fund',
          status: 'active',
          currency: 'USD',
        },
        {
          id: 8,
          fundId: 1,
          vehicleSlug: 'sidecar',
          vehicleType: 'sidecar',
          status: 'active',
          currency: 'USD',
        },
      ],
    });
    const blank = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow()]),
      sidecar
    );
    expect(blank.response.rows[0]?.status).toBe('invalid');
    expect(blank.response.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UNSUPPORTED_VEHICLE_SCOPE', column: 'vehicle_slug' }),
      ])
    );

    const explicit = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, [ledgerRow({ vehicle_slug: 'main' })]),
      new FakePreviewDb({ vehicles: sidecar.state.vehicles })
    );
    expect(explicit.response.rows[0]?.status).toBe('valid');
  });

  it('bounds the flat issue list for a maximum-size malformed file and still returns a blocked preview', async () => {
    const rows = Array.from({ length: ACTUALS_MAX_ROWS }, (_, index) =>
      ledgerRow({
        amount: 'abc',
        currency: 'EUR',
        effective_date: '2026/01/01',
        external_ref: `r${index}`,
      })
    );
    const { response } = await preview(
      ACTUALS_LEDGER_TEMPLATE_VERSION,
      csv(ACTUALS_LEDGER_TEMPLATE_HEADER, rows)
    );
    expect(response.rowCounts.invalid).toBe(ACTUALS_MAX_ROWS);
    expect(response.canPublish).toBe(false);
    expect(response.issues).toHaveLength(ACTUALS_PREVIEW_MAX_ISSUES);
    expect(response.rows[ACTUALS_MAX_ROWS - 1]?.issues.length).toBeGreaterThanOrEqual(3);
    const total = response.rows.reduce((sum, row) => sum + row.issues.length, 0);
    expect(total).toBeGreaterThan(ACTUALS_PREVIEW_MAX_ISSUES);
  });
});
