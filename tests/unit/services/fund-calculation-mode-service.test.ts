import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import {
  FundCalculationModeBlockedError,
  FundCalculationModeIdempotencyConflictError,
  FundCalculationModeInProgressError,
  FundCalculationModeVersionConflictError,
  resolveFundCalculationMode,
  updateFundMoicCalculationMode,
  type FundCalculationModePreview,
} from '../../../server/services/fund-calculation-mode-service';
import type { FundMoicRankingSources } from '../../../server/services/fund-moic-ranking-service';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const route = 'PUT /api/admin/funds/:fundId/calculation-modes/fund-moic-rankings';
const calculationKey = 'fund_moic_rankings_exit_probability';
const now = new Date('2026-06-24T12:00:00.000Z');
const oldShadow = new Date('2026-06-16T12:00:00.000Z');

function sourceBundle(overrides: Partial<FundMoicRankingSources> = {}): FundMoicRankingSources {
  return {
    legacy: {
      fundId: 7,
      provenance: {
        source: 'portfolio_companies',
        calculation: 'reserves_moic_rankings',
        metricBasis: 'planned_reserves',
        sourceRecordCount: 1,
      },
      generatedAt: now.toISOString(),
      rankings: [],
    },
    candidate: {
      fundId: 7,
      provenance: {
        source: 'portfolio_companies',
        calculation: 'reserves_moic_rankings',
        metricBasis: 'planned_reserves',
        sourceRecordCount: 1,
      },
      generatedAt: now.toISOString(),
      rankings: [],
    },
    moicInputSummary: {
      sourceVersion: 'moic-round-fmv-facts-v2',
      explicitExitProbabilityCount: 1,
      defaultedExitProbabilityCount: 0,
      activationBlockingDefaultedExitProbabilityCount: 0,
      explicitReserveExitMultipleCount: 1,
      defaultedReserveExitMultipleCount: 0,
      activationBlockingDefaultedReserveExitMultipleCount: 0,
    },
    moicSourceInputHash: 'source-hash-a',
    factsSource: {
      status: 'available' as const,
      response: {
        fundId: 7,
        asOfDate: '2026-07-13',
        facts: [],
        inputHash: 'f'.repeat(64),
        generatedAt: '2026-07-13T00:00:00.000Z',
      },
    },
    ...overrides,
  };
}

function modeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    configured_mode: 'shadow',
    kill_switch_active: false,
    shadow_started_at: oldShadow,
    last_reconciliation_run_id: 55,
    last_moic_source_input_hash: 'source-hash-a',
    last_candidate_output_hash: 'candidate-output-a',
    version: 1,
    ...overrides,
  };
}

function requestHashFor(params: {
  fundId: number;
  expectedVersion: number;
  configuredMode: 'off' | 'shadow' | 'on';
  killSwitchActive?: boolean | null;
  acceptedReconciliationRunId?: number | null;
}): string {
  return canonicalSha256({
    route,
    fundId: params.fundId,
    calculationKey,
    expectedVersion: params.expectedVersion,
    configuredMode: params.configuredMode,
    killSwitchActive: params.killSwitchActive ?? null,
    acceptedReconciliationRunId: params.acceptedReconciliationRunId ?? null,
  });
}

function makeDatabase(executeRows: unknown[][]) {
  const queue = [...executeRows];
  const tx = {
    execute: vi.fn(async () => ({ rows: queue.shift() ?? [] })),
  };
  const database = {
    execute: vi.fn(async () => ({ rows: queue.shift() ?? [] })),
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };

  return { database, tx };
}

const baseUpdate = {
  fundId: 7,
  expectedVersion: 1,
  configuredMode: 'on' as const,
  idempotencyKey: 'idem-1',
  actorId: 42,
  sources: sourceBundle(),
  now,
};

describe('fund calculation mode service', () => {
  it('resolves a missing mode row as virtual off/version 0 without writing', async () => {
    const { database } = makeDatabase([[]]);

    const resolved = await resolveFundCalculationMode({
      fundId: 7,
      database: database as never,
      sources: sourceBundle(),
      now,
    });

    expect(resolved).toMatchObject({
      calculationKey,
      configuredMode: 'off',
      effectiveMode: 'off',
      version: 0,
      residencyStatus: 'not_applicable',
      blockers: [],
    });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('creates a missing row with expectedVersion 0 when entering shadow with a current reconciliation', async () => {
    const { database, tx } = makeDatabase([
      [{ id: 100 }],
      [],
      [
        {
          id: 55,
          candidate_input_hash: 'source-hash-a',
          candidate_output_hash: 'candidate-output-a',
        },
      ],
      [
        modeRow({
          configured_mode: 'shadow',
          shadow_started_at: now,
          version: 1,
        }),
      ],
      [],
    ]);

    const result = await updateFundMoicCalculationMode({
      ...baseUpdate,
      expectedVersion: 0,
      configuredMode: 'shadow',
      acceptedReconciliationRunId: 55,
      database: database as never,
    });

    expect(result.response).toMatchObject({
      configuredMode: 'shadow',
      effectiveMode: 'shadow',
      version: 1,
      shadowStartedAt: now.toISOString(),
      residencyStatus: 'pending',
      currentSourceMatchesAccepted: true,
    });
    expect(result.replayed).toBe(false);
    expect(tx.execute).toHaveBeenCalledTimes(5);
  });

  it('rejects first write when expectedVersion is not 0', async () => {
    const { database } = makeDatabase([[{ id: 100 }], []]);

    await expect(
      updateFundMoicCalculationMode({
        ...baseUpdate,
        expectedVersion: 2,
        configuredMode: 'shadow',
        database: database as never,
      })
    ).rejects.toMatchObject({ code: 'stale_expected_version', actualVersion: 0 });
  });

  it('blocks on before the seven-day shadow residency passes', async () => {
    const { database } = makeDatabase([[{ id: 100 }], [modeRow({ shadow_started_at: now })]]);

    await expect(
      updateFundMoicCalculationMode({ ...baseUpdate, database: database as never })
    ).rejects.toMatchObject({
      blockers: ['shadow_residency_pending'],
    });
  });

  it('blocks on when candidate source data is incomplete', async () => {
    const { database } = makeDatabase([[{ id: 100 }], [modeRow()]]);

    await expect(
      updateFundMoicCalculationMode({
        ...baseUpdate,
        database: database as never,
        sources: sourceBundle({
          moicInputSummary: {
            ...sourceBundle().moicInputSummary,
            activationBlockingDefaultedExitProbabilityCount: 1,
          },
        }),
      })
    ).rejects.toMatchObject({
      blockers: ['exit_probability_source_incomplete'],
    });
  });

  it('blocks an on transition when the facts source is unavailable', async () => {
    const { database } = makeDatabase([
      [{ id: 100 }],
      [modeRow()],
      [modeRow({ configured_mode: 'on', version: 2 })],
      [],
    ]);

    await expect(
      updateFundMoicCalculationMode({
        ...baseUpdate,
        database: database as never,
        sources: Object.assign(sourceBundle(), {
          factsSource: { status: 'absent' as const },
        }),
      })
    ).rejects.toMatchObject({
      blockers: ['facts_unavailable'],
    });
  });

  it('transitions to on after residency, current source, and complete inputs', async () => {
    const { database } = makeDatabase([
      [{ id: 100 }],
      [modeRow()],
      [modeRow({ configured_mode: 'on', shadow_started_at: oldShadow, version: 2 })],
      [],
    ]);

    const result = await updateFundMoicCalculationMode({
      ...baseUpdate,
      database: database as never,
    });

    expect(result.response).toMatchObject({
      configuredMode: 'on',
      effectiveMode: 'on',
      version: 2,
      residencyStatus: 'eligible',
      blockers: [],
    });
  });

  it('rolls back from on to off with kill switch without requiring a fresh reconciliation', async () => {
    const { database } = makeDatabase([
      [{ id: 100 }],
      [modeRow({ configured_mode: 'on', version: 2 })],
      [modeRow({ configured_mode: 'off', kill_switch_active: true, version: 3 })],
      [],
    ]);

    const result = await updateFundMoicCalculationMode({
      ...baseUpdate,
      expectedVersion: 2,
      configuredMode: 'off',
      killSwitchActive: true,
      database: database as never,
    });

    expect(result.response).toMatchObject({
      configuredMode: 'off',
      effectiveMode: 'off',
      killSwitchActive: true,
      version: 3,
    });
    expect(result.replayed).toBe(false);
  });

  it('keeps configured on effective candidate after source drift while marking stale', async () => {
    const { database } = makeDatabase([
      [
        modeRow({
          configured_mode: 'on',
          last_moic_source_input_hash: 'old-source-hash',
          version: 2,
        }),
      ],
    ]);

    const resolved = await resolveFundCalculationMode({
      fundId: 7,
      database: database as never,
      sources: sourceBundle(),
      now,
    });

    expect(resolved).toMatchObject({
      configuredMode: 'on',
      effectiveMode: 'on',
      currentSourceMatchesAccepted: false,
      unreconciledEditsPresent: true,
    });
    expect(resolved.blockers).toContain('current_source_changed');
  });

  it('resets shadow residency only when a shadow-mode accepted source hash changes', async () => {
    const { database } = makeDatabase([
      [{ id: 100 }],
      [modeRow({ last_moic_source_input_hash: 'old-source-hash' })],
      [
        {
          id: 56,
          candidate_input_hash: 'source-hash-a',
          candidate_output_hash: 'candidate-output-b',
        },
      ],
      [
        modeRow({
          last_reconciliation_run_id: 56,
          last_candidate_output_hash: 'candidate-output-b',
          shadow_started_at: now,
          version: 2,
        }),
      ],
      [],
    ]);

    const result = await updateFundMoicCalculationMode({
      ...baseUpdate,
      configuredMode: 'shadow',
      acceptedReconciliationRunId: 56,
      database: database as never,
    });

    expect(result.response.shadowStartedAt).toBe(now.toISOString());
    expect(result.response.version).toBe(2);
  });

  it('replays a completed mode idempotency ledger response', async () => {
    const response: FundCalculationModePreview = {
      calculationKey,
      configuredMode: 'shadow',
      effectiveMode: 'shadow',
      killSwitchActive: false,
      shadowStartedAt: now.toISOString(),
      eligibleAt: new Date('2026-07-01T12:00:00.000Z').toISOString(),
      residencyDaysRequired: 7,
      residencyStatus: 'pending',
      currentSourceMatchesAccepted: true,
      unreconciledEditsPresent: false,
      blockers: ['shadow_residency_pending'],
      version: 1,
    };
    const { database, tx } = makeDatabase([
      [],
      [
        {
          request_hash: requestHashFor({
            fundId: 7,
            expectedVersion: 0,
            configuredMode: 'shadow',
            acceptedReconciliationRunId: 55,
          }),
          response_body: response,
          status: 'completed',
        },
      ],
    ]);

    const result = await updateFundMoicCalculationMode({
      ...baseUpdate,
      expectedVersion: 0,
      configuredMode: 'shadow',
      acceptedReconciliationRunId: 55,
      database: database as never,
    });

    expect(result).toEqual({ response, replayed: true });
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it('conflicts or returns in-progress for non-winning idempotency claims', async () => {
    const conflict = makeDatabase([
      [],
      [
        {
          request_hash: requestHashFor({
            fundId: 7,
            expectedVersion: 1,
            configuredMode: 'shadow',
          }),
          response_body: null,
          status: 'completed',
        },
      ],
    ]);
    await expect(
      updateFundMoicCalculationMode({ ...baseUpdate, database: conflict.database as never })
    ).rejects.toBeInstanceOf(FundCalculationModeIdempotencyConflictError);

    const pending = makeDatabase([
      [],
      [
        {
          request_hash: requestHashFor({
            fundId: 7,
            expectedVersion: 1,
            configuredMode: 'on',
          }),
          response_body: null,
          status: 'pending',
        },
      ],
    ]);
    await expect(
      updateFundMoicCalculationMode({ ...baseUpdate, database: pending.database as never })
    ).rejects.toBeInstanceOf(FundCalculationModeInProgressError);
  });

  it('uses claim-first idempotency and row-level locking in the SQL path', async () => {
    const source = await readFile(
      path.join(repoRoot, 'server/services/fund-calculation-mode-service.ts'),
      'utf8'
    );

    expect(source).toContain('ON CONFLICT (fund_id, calculation_key, idempotency_key) DO NOTHING');
    expect(source).toContain('RETURNING id');
    expect(source).toContain('FOR UPDATE');
  });

  it('throws typed errors for version and activation failures', () => {
    expect(new FundCalculationModeVersionConflictError(1, 2).code).toBe('stale_expected_version');
    expect(new FundCalculationModeBlockedError(['kill_switch_active']).blockers).toEqual([
      'kill_switch_active',
    ]);
  });
});
