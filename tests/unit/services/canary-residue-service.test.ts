import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CanaryResidueCapExceededError } from '../../../server/services/canary-residue-service';
import {
  CanaryActiveRunError,
  CanaryRunTransitionConflictError,
  CanaryResiduePreflightError,
  CANARY_RESIDUE_GROUP_TABLES,
  CANARY_RESIDUE_GROUPS,
  CANARY_TERMINAL_SOURCE_STATUSES,
  RELEASE_CANARY_RESERVED_RESIDUE,
  preflightCanaryCreation,
  readCanaryRuntimePolicy,
  reconcileReleaseCanaryRun,
  transitionReleaseCanaryRun,
  type CanaryResidueCounts,
} from '../../../server/services/canary-residue-service';

const GROUP_CAP_ENV = {
  portfolioCompany: 'RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE',
  fund: 'RELEASE_CANARY_MAX_FUND_RESIDUE',
  fundConfig: 'RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE',
  fundEvent: 'RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE',
  notification: 'RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE',
  grant: 'RELEASE_CANARY_MAX_GRANT_RESIDUE',
  calculation: 'RELEASE_CANARY_MAX_CALCULATION_RESIDUE',
  mutationReceipt: 'RELEASE_CANARY_MAX_MUTATION_RECEIPT_RESIDUE',
  scenario: 'RELEASE_CANARY_MAX_SCENARIO_RESIDUE',
  reporting: 'RELEASE_CANARY_MAX_REPORTING_RESIDUE',
} as const;

/** Production policy: three retained-run budgets of the reserved 33-row vector. */
const POLICY_CAPS = {
  portfolioCompany: 3,
  fund: 3,
  fundConfig: 3,
  fundEvent: 12,
  notification: 0,
  grant: 3,
  calculation: 36,
  mutationReceipt: 6,
  scenario: 21,
  reporting: 33,
  total: 120,
} as const;

function stubValidPolicy(caps: Record<string, number> = POLICY_CAPS) {
  for (const [group, envName] of Object.entries(GROUP_CAP_ENV)) {
    vi.stubEnv(envName, String(caps[group as keyof typeof caps] ?? 0));
  }
  vi.stubEnv('RELEASE_CANARY_MAX_TOTAL_RESIDUE', String(caps['total'] ?? 0));
  vi.stubEnv('RELEASE_CANARY_TTL_HOURS', '24');
}

function zeroGroupRow(): Record<string, number> {
  return Object.fromEntries(CANARY_RESIDUE_GROUPS.map((group) => [group, 0]));
}

function zeroCounts(): CanaryResidueCounts {
  return { ...zeroGroupRow(), total: 0 } as CanaryResidueCounts;
}

function terminalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'created',
    version: 1,
    portfolio_company_residue_count: 0,
    fund_residue_count: 0,
    fund_config_residue_count: 0,
    fund_event_residue_count: 0,
    notification_residue_count: 0,
    grant_residue_count: 0,
    calculation_residue_count: 0,
    mutation_receipt_residue_count: 0,
    scenario_residue_count: 0,
    reporting_residue_count: 0,
    total_residue_count: 0,
    ...overrides,
  };
}

const NO_ACTIVE_RUNS = { rows: [], rowCount: 0 };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('canary residue group descriptor', () => {
  it('covers exactly the ten approved groups', () => {
    expect([...CANARY_RESIDUE_GROUPS]).toEqual([
      'portfolioCompany',
      'fund',
      'fundConfig',
      'fundEvent',
      'notification',
      'grant',
      'calculation',
      'mutationReceipt',
      'scenario',
      'reporting',
    ]);
  });

  it('maps every approved table into its group', () => {
    const tables = Object.values(CANARY_RESIDUE_GROUP_TABLES)
      .flat()
      .map((entry) => entry.table)
      .sort();
    expect(tables).toEqual(
      [
        'portfoliocompanies',
        'funds',
        'fundconfigs',
        'fund_events',
        'capital_call_notification_outbox',
        'user_fund_grants',
        'calc_runs',
        'fund_snapshots',
        'pacing_history',
        'portfolio_company_update_receipts',
        'fund_scenario_calculation_commands',
        'fund_scenario_sets',
        'fund_scenario_variants',
        'fund_scenario_set_events',
        'fund_scenario_calculation_runs',
        'planning_fmv_override_requests',
        'valuation_marks',
        'reconciliation_runs',
        'lp_metric_runs',
        'evidence_records',
        'narrative_runs',
        'lp_report_packages',
        'lp_report_package_exports',
      ].sort()
    );
  });

  it('pins the reserved successful-run vector to exact 33 rows', () => {
    expect(RELEASE_CANARY_RESERVED_RESIDUE).toEqual({
      portfolioCompany: 1,
      fund: 1,
      fundConfig: 1,
      fundEvent: 4,
      notification: 0,
      grant: 1,
      calculation: 12,
      mutationReceipt: 2,
      scenario: 7,
      reporting: 11,
      total: 40,
    });
    expect(Object.isFrozen(RELEASE_CANARY_RESERVED_RESIDUE)).toBe(true);
  });
});

describe('canary residue fail-closed policy', () => {
  it('fails before querying or mutating when any required environment value is missing', async () => {
    stubValidPolicy();
    vi.unstubAllEnvs();
    const execute = vi.fn();

    await expect(preflightCanaryCreation({ execute })).rejects.toBeInstanceOf(
      CanaryResiduePreflightError
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(Object.keys(GROUP_CAP_ENV))(
    'fails closed when the %s cap variable is missing',
    async (group) => {
      stubValidPolicy();
      vi.stubEnv(GROUP_CAP_ENV[group as keyof typeof GROUP_CAP_ENV], '');
      const execute = vi.fn();

      await expect(preflightCanaryCreation({ execute })).rejects.toBeInstanceOf(
        CanaryResiduePreflightError
      );
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it('rejects an inconsistent policy whose total does not equal the group cap sum', () => {
    stubValidPolicy({ ...POLICY_CAPS, total: 98 });

    expect(() => readCanaryRuntimePolicy()).toThrowError(
      /must equal the sum of the ten group caps/
    );
  });

  it('reads a consistent ten-group policy without code defaults', () => {
    stubValidPolicy();
    expect(readCanaryRuntimePolicy()).toEqual({ ...POLICY_CAPS, ttlHours: 24 });
  });

  it('reserves the full 33-row vector and rejects when a group cap would be exceeded', async () => {
    stubValidPolicy({ ...POLICY_CAPS, scenario: 6, total: 105 });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce(NO_ACTIVE_RUNS)
      .mockResolvedValueOnce({ rows: [zeroGroupRow()], rowCount: 1 });

    await expect(preflightCanaryCreation({ execute })).rejects.toMatchObject({
      field: 'scenario',
      current: 0,
      projected: 7,
      limit: 6,
    } satisfies Partial<CanaryResidueCapExceededError>);
  });

  it('rejects when current residue plus the reserved total exceeds the total cap', async () => {
    stubValidPolicy();
    const currentRow = { ...zeroGroupRow(), reporting: 30, calculation: 15, scenario: 21, fundEvent: 1 };
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce(NO_ACTIVE_RUNS)
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 });

    await expect(preflightCanaryCreation({ execute })).rejects.toBeInstanceOf(
      CanaryResiduePreflightError
    );
  });

  it('accepts a projection that exactly reaches every cap', async () => {
    stubValidPolicy({ ...RELEASE_CANARY_RESERVED_RESIDUE });
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce(NO_ACTIVE_RUNS)
      .mockResolvedValueOnce({ rows: [zeroGroupRow()], rowCount: 1 });

    await expect(preflightCanaryCreation({ execute })).resolves.toEqual(zeroCounts());
  });

  it('rejects creation while another canary run is active', async () => {
    stubValidPolicy();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: 'run-active', status: 'running', expired: false }],
        rowCount: 1,
      });

    await expect(preflightCanaryCreation({ execute })).rejects.toMatchObject({
      name: 'CanaryActiveRunError',
      runId: 'run-active',
      runStatus: 'running',
      expired: false,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('treats an expired nonterminal run as a TTL failure requiring reconciliation, not a bypass', async () => {
    stubValidPolicy();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: 'run-stale', status: 'created', expired: true }],
        rowCount: 1,
      });

    const failure = await preflightCanaryCreation({ execute }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CanaryActiveRunError);
    expect(failure).toMatchObject({ runId: 'run-stale', expired: true });
    expect((failure as Error).message).toContain('requires reconciliation');
  });

  it('reconciles exact dedicated counts for one release run across all ten groups', async () => {
    stubValidPolicy();
    const countsRow = {
      portfolioCompany: 1,
      fund: 1,
      fundConfig: 1,
      fundEvent: 4,
      notification: 0,
      grant: 1,
      calculation: 12,
      mutationReceipt: 2,
      scenario: 7,
      reporting: 11,
    };
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [countsRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(reconcileReleaseCanaryRun('run-1', 1, { execute })).resolves.toEqual({
      ...countsRow,
      total: 40,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('reconciles before atomically terminalizing a run', async () => {
    stubValidPolicy();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [terminalRow()], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ ...zeroGroupRow(), fund: 1, fundConfig: 1, fundEvent: 1, grant: 1 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const database = {
      transaction: vi.fn(async (callback: (tx: { execute: typeof execute }) => unknown) =>
        callback({ execute })
      ),
    };

    await expect(
      transitionReleaseCanaryRun(
        'run-1',
        'completed',
        1,
        CANARY_TERMINAL_SOURCE_STATUSES,
        database as never
      )
    ).resolves.toMatchObject({ total: 4 });
    expect(execute).toHaveBeenCalledTimes(4);
    expect(database.transaction).toHaveBeenCalledOnce();
  });

  it('replays the same terminal transition as an idempotent no-op with all groups', async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        terminalRow({
          status: 'completed',
          version: 2,
          fund_residue_count: 1,
          fund_config_residue_count: 1,
          fund_event_residue_count: 1,
          grant_residue_count: 1,
          total_residue_count: 4,
        }),
      ],
      rowCount: 1,
    });
    const database = {
      transaction: vi.fn(async (callback: (tx: { execute: typeof execute }) => unknown) =>
        callback({ execute })
      ),
    };

    await expect(
      transitionReleaseCanaryRun('run-1', 'completed', 1, ['created'], database as never)
    ).resolves.toEqual({
      ...zeroCounts(),
      fund: 1,
      fundConfig: 1,
      fundEvent: 1,
      grant: 1,
      total: 4,
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('rejects a conflicting terminal transition', async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [terminalRow({ status: 'completed', version: 2, total_residue_count: 3 })],
      rowCount: 1,
    });
    const database = {
      transaction: vi.fn(async (callback: (tx: { execute: typeof execute }) => unknown) =>
        callback({ execute })
      ),
    };

    await expect(
      transitionReleaseCanaryRun('run-1', 'failed', 2, ['running'], database as never)
    ).rejects.toBeInstanceOf(CanaryRunTransitionConflictError);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('rejects a stale expected version before reconciliation', async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [terminalRow({ status: 'running', version: 4 })],
      rowCount: 1,
    });
    const database = {
      transaction: vi.fn(async (callback: (tx: { execute: typeof execute }) => unknown) =>
        callback({ execute })
      ),
    };

    await expect(
      transitionReleaseCanaryRun('run-1', 'failed', 3, ['running'], database as never)
    ).rejects.toBeInstanceOf(CanaryRunTransitionConflictError);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('protects purged runs from terminal transitions', async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [terminalRow({ status: 'purged', version: 3 })],
      rowCount: 1,
    });
    const database = {
      transaction: vi.fn(async (callback: (tx: { execute: typeof execute }) => unknown) =>
        callback({ execute })
      ),
    };

    await expect(
      transitionReleaseCanaryRun('run-1', 'expired', 3, ['running'], database as never)
    ).rejects.toBeInstanceOf(CanaryRunTransitionConflictError);
    expect(execute).toHaveBeenCalledOnce();
  });
});
