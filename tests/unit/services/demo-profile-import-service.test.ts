import { describe, expect, it, vi } from 'vitest';

import {
  commitDemoProfileImportWithStore,
  DrizzleDemoProfileImportStore,
  rollbackDemoProfileImportWithStore,
  runDemoProfileDryRun,
  type DemoProfileFundRecord,
  type DemoProfileImportLedgerRecord,
  type DemoProfileImportLedgerScope,
  type DemoProfileImportStore,
} from '../../../server/services/demo-profile-import-service';
import {
  DemoProfileTargetTables,
  type DemoProfileBacktestResultRow,
  type DemoProfileDealOpportunityRow,
  type DemoProfileFundBaselineRow,
  type DemoProfileFundMetricRow,
  type DemoProfileInvestmentLotRow,
  type DemoProfileInvestmentRow,
  type DemoProfilePacingHistoryRow,
  type DemoProfilePortfolioCompanyRow,
  type DemoProfileTargetTable,
  type DemoProfileVarianceReportRow,
} from '@shared/contracts/demo-profile-import.contract';
import { users } from '@shared/schema';
import { buildDemoProfileImportBundle } from '../../fixtures/demo-profile-import-fixture';

const TARGET_ORDER: DemoProfileTargetTable[] = [
  'portfoliocompanies',
  'investments',
  'investment_lots',
  'deal_opportunities',
  'fund_metrics',
  'pacing_history',
  'fund_baselines',
  'variance_reports',
  'backtest_results',
];

class FakeDemoProfileImportStore implements DemoProfileImportStore {
  readonly ledger = new Map<string, DemoProfileImportLedgerRecord>();
  readonly targets = new Map<string, number>();
  readonly insertOrder: DemoProfileTargetTable[] = [];
  readonly deleteOrder: DemoProfileTargetTable[] = [];
  systemActorEnsured = false;
  activeDefaultBaseline = false;
  activeDefaultBaselineId: string | null = null;
  restoredDefaultBaselineId: string | null = null;
  deactivateDefaultCalls = 0;
  fund: DemoProfileFundRecord | null = { id: 77, name: 'Sanitized Demo Fund' };
  private nextIntegerId = 1;
  private nextUuidId = 1;

  async getFund(): Promise<DemoProfileFundRecord | null> {
    return this.fund;
  }

  async ensureSystemActor(): Promise<void> {
    this.systemActorEnsured = true;
  }

  async getLedgerRow(
    scope: DemoProfileImportLedgerScope
  ): Promise<DemoProfileImportLedgerRecord | null> {
    return this.ledger.get(this.ledgerKey(scope)) ?? null;
  }

  async listLedgerRows(
    fundId: number,
    datasetId: string
  ): Promise<DemoProfileImportLedgerRecord[]> {
    return Array.from(this.ledger.values()).filter(
      (row) => row.fundId === fundId && row.datasetId === datasetId
    );
  }

  async insertLedgerRow(row: DemoProfileImportLedgerRecord): Promise<void> {
    this.ledger.set(this.ledgerKey(row), row);
  }

  async deleteLedgerRowsForDataset(fundId: number, datasetId: string): Promise<void> {
    for (const row of Array.from(this.ledger.values())) {
      if (row.fundId === fundId && row.datasetId === datasetId) {
        this.ledger.delete(this.ledgerKey(row));
      }
    }
  }

  async targetExists(row: DemoProfileImportLedgerRecord): Promise<boolean> {
    return this.targets.get(this.targetKey(row.targetTable, row.targetIdText)) === row.fundId;
  }

  async getActiveDefaultBaselineId(): Promise<string | null> {
    return this.activeDefaultBaselineId;
  }

  async deactivateActiveDefaultBaselines(): Promise<void> {
    this.activeDefaultBaseline = false;
    this.activeDefaultBaselineId = null;
    this.deactivateDefaultCalls += 1;
  }

  async restoreDefaultBaseline(_fundId: number, baselineId: string): Promise<void> {
    this.restoredDefaultBaselineId = baselineId;
    this.activeDefaultBaseline = true;
    this.activeDefaultBaselineId = baselineId;
  }

  async insertPortfolioCompany(
    fundId: number,
    _row: DemoProfilePortfolioCompanyRow
  ): Promise<number> {
    return this.insertInteger('portfoliocompanies', fundId);
  }

  async insertInvestment(
    fundId: number,
    _row: DemoProfileInvestmentRow,
    _companyId: number
  ): Promise<number> {
    return this.insertInteger('investments', fundId);
  }

  async insertInvestmentLot(
    _row: DemoProfileInvestmentLotRow,
    investmentId: number
  ): Promise<string> {
    const fundId = this.targets.get(this.targetKey('investments', String(investmentId)));
    if (fundId === undefined) {
      throw new Error('missing parent investment');
    }
    return this.insertUuid('investment_lots', fundId);
  }

  async insertDealOpportunity(
    fundId: number,
    _row: DemoProfileDealOpportunityRow
  ): Promise<number> {
    return this.insertInteger('deal_opportunities', fundId);
  }

  async insertFundMetric(fundId: number, _row: DemoProfileFundMetricRow): Promise<number> {
    return this.insertInteger('fund_metrics', fundId);
  }

  async insertPacingHistory(fundId: number, _row: DemoProfilePacingHistoryRow): Promise<number> {
    return this.insertInteger('pacing_history', fundId);
  }

  async insertFundBaseline(fundId: number, row: DemoProfileFundBaselineRow): Promise<string> {
    if (row.isDefault) {
      this.activeDefaultBaseline = true;
      this.activeDefaultBaselineId = this.peekNextUuid();
    }
    return this.insertUuid('fund_baselines', fundId);
  }

  async insertVarianceReport(
    fundId: number,
    _row: DemoProfileVarianceReportRow,
    _baselineId: string
  ): Promise<string> {
    return this.insertUuid('variance_reports', fundId);
  }

  async insertBacktestResult(
    fundId: number,
    _row: DemoProfileBacktestResultRow,
    _baselineId: string | undefined
  ): Promise<string> {
    return this.insertUuid('backtest_results', fundId);
  }

  async deleteTargets(
    fundId: number,
    targetTable: DemoProfileTargetTable,
    targetIdTexts: string[]
  ): Promise<number> {
    this.deleteOrder.push(targetTable);
    let deleted = 0;
    for (const id of targetIdTexts) {
      if (this.targets.get(this.targetKey(targetTable, id)) === fundId) {
        this.targets.delete(this.targetKey(targetTable, id));
        deleted += 1;
      }
    }
    return deleted;
  }

  private insertInteger(table: DemoProfileTargetTable, fundId: number): number {
    const id = this.nextIntegerId;
    this.nextIntegerId += 1;
    this.insertOrder.push(table);
    this.targets.set(this.targetKey(table, String(id)), fundId);
    return id;
  }

  private insertUuid(table: DemoProfileTargetTable, fundId: number): string {
    const id = this.peekNextUuid();
    this.nextUuidId += 1;
    this.insertOrder.push(table);
    this.targets.set(this.targetKey(table, id), fundId);
    return id;
  }

  private peekNextUuid(): string {
    const suffix = String(this.nextUuidId).padStart(12, '0');
    return `00000000-0000-4000-8000-${suffix}`;
  }

  private ledgerKey(scope: DemoProfileImportLedgerScope): string {
    return `${scope.fundId}:${scope.datasetId}:${scope.targetTable}:${scope.sourceKey}`;
  }

  private targetKey(table: DemoProfileTargetTable, id: string): string {
    return `${table}:${id}`;
  }
}

class DefaultBaselineUniqueViolationStore extends FakeDemoProfileImportStore {
  override async insertFundBaseline(): Promise<string> {
    throw Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint: 'fund_baselines_default_unique',
    });
  }
}

describe('demo profile import service', () => {
  it('produces deterministic dry-run previews with exact section counts', () => {
    const bundle = buildDemoProfileImportBundle();
    const first = runDemoProfileDryRun(bundle);
    const second = runDemoProfileDryRun(buildDemoProfileImportBundle());

    expect(first.previewHash).toBe(
      '0798bbcc546ada2a54cde944f6104eb3b34245280f76304e8a3c4a947b4d1bd7'
    );
    expect(first.previewHash).toBe(second.previewHash);
    for (const count of Object.values(first.counts)) {
      expect(count).toBe(1);
    }
    expect(first.rows).toHaveLength(9);
    expect(first.rows.map((row) => row.targetTable)).toEqual(TARGET_ORDER);
  });

  it('commits rows in dependency order and replays identical imports as skips', async () => {
    const bundle = buildDemoProfileImportBundle();
    const preview = runDemoProfileDryRun(bundle);
    const store = new FakeDemoProfileImportStore();

    const summary = await commitDemoProfileImportWithStore(store, {
      fundId: 77,
      bundle,
      previewHash: preview.previewHash,
    });

    expect(store.systemActorEnsured).toBe(true);
    expect(store.insertOrder).toEqual(TARGET_ORDER);
    expect(store.ledger.size).toBe(DemoProfileTargetTables.length);
    for (const table of DemoProfileTargetTables) {
      expect(summary.inserted[table]).toBe(1);
      expect(summary.skipped[table]).toBe(0);
    }
    const targetCountAfterFirstCommit = store.targets.size;

    const replay = await commitDemoProfileImportWithStore(store, {
      fundId: 77,
      bundle: buildDemoProfileImportBundle(),
      previewHash: preview.previewHash,
    });

    for (const table of DemoProfileTargetTables) {
      expect(replay.inserted[table]).toBe(0);
      expect(replay.skipped[table]).toBe(1);
    }
    expect(store.insertOrder).toHaveLength(TARGET_ORDER.length);
    expect(store.ledger.size).toBe(DemoProfileTargetTables.length);
    expect(store.targets.size).toBe(targetCountAfterFirstCommit);
  });

  it('rejects same source key with changed source hash', async () => {
    const bundle = buildDemoProfileImportBundle();
    const preview = runDemoProfileDryRun(bundle);
    const store = new FakeDemoProfileImportStore();

    await commitDemoProfileImportWithStore(store, {
      fundId: 77,
      bundle,
      previewHash: preview.previewHash,
    });

    const changed = buildDemoProfileImportBundle();
    changed.sections.portfolioCompanies[0]!.name = 'Company Alpha Updated';
    const changedPreview = runDemoProfileDryRun(changed);
    const ledgerSizeBeforeReplay = store.ledger.size;
    const insertOrderLengthBeforeReplay = store.insertOrder.length;

    await expect(
      commitDemoProfileImportWithStore(store, {
        fundId: 77,
        bundle: changed,
        previewHash: changedPreview.previewHash,
      })
    ).rejects.toMatchObject({ status: 409, code: 'SOURCE_HASH_MISMATCH' });
    expect(store.ledger.size).toBe(ledgerSizeBeforeReplay);
    expect(store.insertOrder).toHaveLength(insertOrderLengthBeforeReplay);
  });

  it('rejects idempotent replay when the existing ledger target is missing', async () => {
    const bundle = buildDemoProfileImportBundle();
    const preview = runDemoProfileDryRun(bundle);
    const store = new FakeDemoProfileImportStore();

    await commitDemoProfileImportWithStore(store, {
      fundId: 77,
      bundle,
      previewHash: preview.previewHash,
    });

    const firstLedgerRow = Array.from(store.ledger.values())[0]!;
    store.targets.delete(`${firstLedgerRow.targetTable}:${firstLedgerRow.targetIdText}`);

    await expect(
      commitDemoProfileImportWithStore(store, {
        fundId: 77,
        bundle,
        previewHash: preview.previewHash,
      })
    ).rejects.toMatchObject({ status: 409, code: 'LEDGER_TARGET_MISSING' });
  });

  it('blocks Test Fund I and default baseline replacement unless explicit flags are set', async () => {
    const testFundStore = new FakeDemoProfileImportStore();
    testFundStore.fund = { id: 1, name: 'Test Fund I' };
    const bundle = buildDemoProfileImportBundle();
    const preview = runDemoProfileDryRun(bundle);

    await expect(
      commitDemoProfileImportWithStore(testFundStore, {
        fundId: 1,
        bundle,
        previewHash: preview.previewHash,
      })
    ).rejects.toMatchObject({ code: 'TEST_FUND_I_IMPORT_BLOCKED' });

    const defaultBundle = buildDemoProfileImportBundle();
    defaultBundle.sections.fundBaselines[0]!.isDefault = true;
    const defaultPreview = runDemoProfileDryRun(defaultBundle);
    const conflictStore = new FakeDemoProfileImportStore();
    conflictStore.activeDefaultBaseline = true;
    conflictStore.activeDefaultBaselineId = '00000000-0000-4000-8000-999999999999';

    await expect(
      commitDemoProfileImportWithStore(conflictStore, {
        fundId: 77,
        bundle: defaultBundle,
        previewHash: defaultPreview.previewHash,
      })
    ).rejects.toMatchObject({ code: 'DEFAULT_BASELINE_CONFLICT' });

    const replaceStore = new FakeDemoProfileImportStore();
    replaceStore.activeDefaultBaseline = true;
    replaceStore.activeDefaultBaselineId = '00000000-0000-4000-8000-999999999999';
    await commitDemoProfileImportWithStore(
      replaceStore,
      {
        fundId: 77,
        bundle: defaultBundle,
        previewHash: defaultPreview.previewHash,
      },
      { allowDefaultBaselineReplace: true }
    );
    expect(replaceStore.deactivateDefaultCalls).toBe(1);

    const replay = await commitDemoProfileImportWithStore(replaceStore, {
      fundId: 77,
      bundle: defaultBundle,
      previewHash: defaultPreview.previewHash,
    });
    expect(replay.skipped.fund_baselines).toBe(1);
    expect(replaceStore.deactivateDefaultCalls).toBe(1);
  });

  it('maps concurrent default baseline unique races to the import conflict contract', async () => {
    const bundle = buildDemoProfileImportBundle();
    bundle.sections.fundBaselines[0]!.isDefault = true;
    const preview = runDemoProfileDryRun(bundle);
    const store = new DefaultBaselineUniqueViolationStore();

    await expect(
      commitDemoProfileImportWithStore(store, {
        fundId: 77,
        bundle,
        previewHash: preview.previewHash,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'DEFAULT_BASELINE_CONFLICT',
    });
  });

  it('ensures the system actor exists without overwriting an existing row', async () => {
    const onConflictDoNothing = vi.fn();
    const onConflictDoUpdate = vi.fn();
    const values = vi.fn(() => ({ onConflictDoNothing, onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const store = new DrizzleDemoProfileImportStore({ insert } as never);

    await store.ensureSystemActor();

    expect(insert).toHaveBeenCalledWith(users);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 999999,
        username: 'system',
      })
    );
    expect(onConflictDoNothing).toHaveBeenCalledWith({ target: users.id });
    expect(onConflictDoUpdate).not.toHaveBeenCalled();
  });

  it('rolls back only ledger-scoped targets in reverse dependency order', async () => {
    const bundle = buildDemoProfileImportBundle();
    const preview = runDemoProfileDryRun(bundle);
    const store = new FakeDemoProfileImportStore();

    await commitDemoProfileImportWithStore(store, {
      fundId: 77,
      bundle,
      previewHash: preview.previewHash,
    });

    const rollback = await rollbackDemoProfileImportWithStore(store, {
      fundId: 77,
      datasetId: bundle.datasetId,
    });

    expect(rollback.deleted.backtest_results).toBe(1);
    expect(store.deleteOrder).toEqual([...TARGET_ORDER].reverse());
    expect(store.ledger.size).toBe(0);
  });

  it('restores a default baseline demoted by replacement rollback', async () => {
    const bundle = buildDemoProfileImportBundle();
    bundle.sections.fundBaselines[0]!.isDefault = true;
    const preview = runDemoProfileDryRun(bundle);
    const store = new FakeDemoProfileImportStore();
    const previousDefaultId = '00000000-0000-4000-8000-999999999999';
    store.activeDefaultBaseline = true;
    store.activeDefaultBaselineId = previousDefaultId;
    store.targets.set(`fund_baselines:${previousDefaultId}`, 77);

    await commitDemoProfileImportWithStore(
      store,
      {
        fundId: 77,
        bundle,
        previewHash: preview.previewHash,
      },
      { allowDefaultBaselineReplace: true }
    );

    await rollbackDemoProfileImportWithStore(store, {
      fundId: 77,
      datasetId: bundle.datasetId,
    });

    expect(store.restoredDefaultBaselineId).toBe(previousDefaultId);
    expect(store.ledger.size).toBe(0);
  });
});
