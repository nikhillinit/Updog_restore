import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CanaryResidueCapExceededError } from '../../../server/services/canary-residue-service';
import {
  CanaryRunTransitionConflictError,
  CanaryResiduePreflightError,
  CANARY_TERMINAL_SOURCE_STATUSES,
  preflightCanaryCreation,
  readCanaryRuntimePolicy,
  reconcileReleaseCanaryRun,
  transitionReleaseCanaryRun,
} from '../../../server/services/canary-residue-service';

const CAP_ENV = [
  'RELEASE_CANARY_MAX_PORTFOLIO_COMPANY_RESIDUE',
  'RELEASE_CANARY_MAX_FUND_RESIDUE',
  'RELEASE_CANARY_MAX_FUND_CONFIG_RESIDUE',
  'RELEASE_CANARY_MAX_FUND_EVENT_RESIDUE',
  'RELEASE_CANARY_MAX_NOTIFICATION_RESIDUE',
  'RELEASE_CANARY_MAX_TOTAL_RESIDUE',
] as const;

function stubValidPolicy(value = '100') {
  for (const name of CAP_ENV) vi.stubEnv(name, value);
  vi.stubEnv('RELEASE_CANARY_TTL_HOURS', '24');
}

afterEach(() => {
  vi.unstubAllEnvs();
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

  it('rejects a projected canary fund when approved residue cap would be exceeded', async () => {
    stubValidPolicy();
    vi.stubEnv('RELEASE_CANARY_MAX_FUND_RESIDUE', '0');
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ portfolioCompany: 0, fund: 0, fundConfig: 0, fundEvent: 0, notification: 0 }],
        rowCount: 1,
      });

    await expect(preflightCanaryCreation({ execute })).rejects.toMatchObject({
      field: 'fund',
      current: 0,
      projected: 1,
      limit: 0,
    } satisfies Partial<CanaryResidueCapExceededError>);
  });

  it('reconciles exact dedicated counts for one release run', async () => {
    stubValidPolicy();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ portfolioCompany: 2, fund: 1, fundConfig: 1, fundEvent: 3, notification: 4 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(reconcileReleaseCanaryRun('run-1', { execute })).resolves.toEqual({
      portfolioCompany: 2,
      fund: 1,
      fundConfig: 1,
      fundEvent: 3,
      notification: 4,
      total: 11,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not provide code defaults for runtime policy values', () => {
    stubValidPolicy('7');
    expect(readCanaryRuntimePolicy()).toEqual({
      portfolioCompany: 7,
      fund: 7,
      fundConfig: 7,
      fundEvent: 7,
      notification: 7,
      total: 7,
      ttlHours: 24,
    });
  });

  it('reconciles before atomically terminalizing a run', async () => {
    stubValidPolicy();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            status: 'created',
            version: 1,
            portfolio_company_residue_count: 0,
            fund_residue_count: 0,
            fund_config_residue_count: 0,
            fund_event_residue_count: 0,
            notification_residue_count: 0,
            total_residue_count: 0,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ portfolioCompany: 1, fund: 1, fundConfig: 1, fundEvent: 1, notification: 0 }],
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

  it('replays the same terminal transition as an idempotent no-op', async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          status: 'completed',
          version: 2,
          portfolio_company_residue_count: 1,
          fund_residue_count: 1,
          fund_config_residue_count: 1,
          fund_event_residue_count: 1,
          notification_residue_count: 0,
          total_residue_count: 4,
        },
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
      portfolioCompany: 1,
      fund: 1,
      fundConfig: 1,
      fundEvent: 1,
      notification: 0,
      total: 4,
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it('rejects a conflicting terminal transition', async () => {
    const execute = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          status: 'completed',
          version: 2,
          portfolio_company_residue_count: 0,
          fund_residue_count: 1,
          fund_config_residue_count: 1,
          fund_event_residue_count: 1,
          notification_residue_count: 0,
          total_residue_count: 3,
        },
      ],
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
      rows: [
        {
          status: 'running',
          version: 4,
          portfolio_company_residue_count: 0,
          fund_residue_count: 1,
          fund_config_residue_count: 1,
          fund_event_residue_count: 1,
          notification_residue_count: 0,
          total_residue_count: 3,
        },
      ],
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
      rows: [
        {
          status: 'purged',
          version: 3,
          portfolio_company_residue_count: 0,
          fund_residue_count: 0,
          fund_config_residue_count: 0,
          fund_event_residue_count: 0,
          notification_residue_count: 0,
          total_residue_count: 0,
        },
      ],
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
