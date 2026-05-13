import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import {
  buildExpectedDemoProfileFacts,
  runVerifyDemoProfileCli,
  verifyDemoProfileStorageWithStore,
} from '../../../scripts/verify-demo-profile';
import {
  runDemoProfileDryRun,
  type DemoProfileImportStore,
} from '../../../server/services/demo-profile-import-service';
import type { DemoProfileImportLedgerRecord } from '../../../server/services/demo-profile-import-service';
import { buildDemoProfileImportBundle } from '../../fixtures/demo-profile-import-fixture';

function encodedBundle(): string {
  return Buffer.from(JSON.stringify(buildDemoProfileImportBundle()), 'utf8').toString('base64');
}

function uuidFor(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function buildLedgerRows(fundId: number): DemoProfileImportLedgerRecord[] {
  const bundle = buildDemoProfileImportBundle();
  const preview = runDemoProfileDryRun(bundle);
  return preview.rows.map((row, index) => ({
    fundId,
    datasetId: bundle.datasetId,
    targetTable: row.targetTable,
    sourceKey: row.sourceKey,
    sourceHash: row.sourceHash,
    targetPkType: row.targetPkType,
    targetIdText: row.targetPkType === 'uuid' ? uuidFor(index + 1) : String(index + 1),
  }));
}

function buildStore(rows: DemoProfileImportLedgerRecord[], missingSourceKey?: string) {
  const store = {
    async getFund() {
      return { id: 77, name: 'Verifier Fund' };
    },
    async ensureSystemActor() {
      return undefined;
    },
    async getLedgerRow() {
      return null;
    },
    async listLedgerRows() {
      return rows;
    },
    async insertLedgerRow() {
      return undefined;
    },
    async deleteLedgerRowsForDataset() {
      return undefined;
    },
    async targetExists(row: DemoProfileImportLedgerRecord) {
      return row.sourceKey !== missingSourceKey;
    },
    async getActiveDefaultBaselineId() {
      return null;
    },
    async deactivateActiveDefaultBaselines() {
      return undefined;
    },
    async restoreDefaultBaseline() {
      return undefined;
    },
    async insertPortfolioCompany() {
      return 1;
    },
    async insertInvestment() {
      return 1;
    },
    async insertInvestmentLot() {
      return uuidFor(1);
    },
    async insertDealOpportunity() {
      return 1;
    },
    async insertFundMetric() {
      return 1;
    },
    async insertPacingHistory() {
      return 1;
    },
    async insertFundBaseline() {
      return uuidFor(2);
    },
    async insertVarianceReport() {
      return uuidFor(3);
    },
    async insertBacktestResult() {
      return uuidFor(4);
    },
    async deleteTargets() {
      return 0;
    },
  };

  return store as DemoProfileImportStore;
}

describe('verify-demo-profile helpers', () => {
  it('derives expected fund facts from the sanitized bundle', () => {
    const facts = buildExpectedDemoProfileFacts(buildDemoProfileImportBundle());

    expect(facts.totalInvested).toBe(1_000_000);
    expect(facts.currentNav).toBe(4_500_000);
    expect(facts.activeCompanies).toBe(1);
    expect(facts.countsByTable.portfoliocompanies).toBe(1);
    expect(facts.countsByTable.backtest_results).toBe(1);
  });

  it('derives invested capital from company amounts when investment rows are absent', () => {
    const bundle = buildDemoProfileImportBundle();
    const facts = buildExpectedDemoProfileFacts({
      ...bundle,
      sections: {
        ...bundle.sections,
        investments: [],
        investmentLots: [],
      },
    });

    expect(facts.totalInvested).toBe(1_000_000);
  });

  it('passes storage verification when every ledger target exists', async () => {
    const bundle = buildDemoProfileImportBundle();
    const result = await verifyDemoProfileStorageWithStore(buildStore(buildLedgerRows(77)), {
      fundId: 77,
      bundle,
    });

    expect(result.issues).toEqual([]);
    expect(result.storage.ledgerRows).toBe(9);
  });

  it('reports missing ledger targets and count mismatches', async () => {
    const bundle = buildDemoProfileImportBundle();
    const rows = buildLedgerRows(77).slice(1);
    const result = await verifyDemoProfileStorageWithStore(buildStore(rows, rows[0]!.sourceKey), {
      fundId: 77,
      bundle,
    });

    expect(result.issues.map((issue) => issue.code)).toContain('LEDGER_COUNT_MISMATCH');
    expect(result.issues.map((issue) => issue.code)).toContain('LEDGER_TARGETS_MISSING');
  });

  it('rejects an invalid expected fund size before verification', async () => {
    const result = await runVerifyDemoProfileCli(
      [
        '--fund-id',
        '77',
        '--env-payload',
        'DEMO_PROFILE_PAYLOAD_B64',
        '--expected-fund-size',
        'not-a-number',
      ],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'test',
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('INVALID_CLI_ARGUMENTS');
    expect(result.stderr).toContain('--expected-fund-size must be a positive number');
  });

  it('refuses CLI verification in test mock database mode', async () => {
    const result = await runVerifyDemoProfileCli(
      ['--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64'],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'test',
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('DEMO_PROFILE_IMPORT_TEST_STORAGE');
  });

  it('refuses CLI verification when no persistent database is configured', async () => {
    const result = await runVerifyDemoProfileCli(
      ['--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64'],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'development',
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('DEMO_PROFILE_IMPORT_DATABASE_REQUIRED');
  });

  it('refuses CLI verification in explicit memory storage mode', async () => {
    const result = await runVerifyDemoProfileCli(
      ['--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64', '--require-api'],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'development',
        ALLOW_MEMORY_STORAGE: '1',
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('DEMO_PROFILE_IMPORT_MEMORY_STORAGE');
  });

  it('refuses professional demo verification when API origins disagree', async () => {
    const result = await runVerifyDemoProfileCli(
      ['--fund-id', '77', '--env-payload', 'DEMO_PROFILE_PAYLOAD_B64', '--require-api'],
      {
        DEMO_PROFILE_PAYLOAD_B64: encodedBundle(),
        NODE_ENV: 'development',
        PROFESSIONAL_DEMO_MODE: 'professional-demo-local-postgres',
        DATABASE_URL: 'postgresql://example:example@localhost:5432/updog',
        BASE_URL: 'http://localhost:5000',
        CLIENT_URL: 'http://localhost:5173',
      }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('DEMO_PROFILE_PROFESSIONAL_RUNTIME_INVALID');
    expect(result.stderr).toContain('CLIENT_URL must match BASE_URL');
  });
});
