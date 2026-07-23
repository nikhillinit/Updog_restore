import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { updateFundMoicCalculationMode } from '../../../server/services/fund-calculation-mode-service';
import type { FundMoicRankingSources } from '../../../server/services/fund-moic-ranking-service';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';

const ROUTE = 'PUT /api/admin/funds/:fundId/calculation-modes/fund-moic-rankings';
const CALCULATION_KEY = 'fund_moic_rankings_exit_probability';
const GOLDEN_REQUEST_HASH = '7ab56e0b229a66f10e55cd72ac7492c26c1b795924f6a95d8ba964389ddfdc5b';
const NOW = new Date('2026-06-24T12:00:00.000Z');
const dialect = new PgDialect();

function sourceBundle(): FundMoicRankingSources {
  return {
    legacy: {
      fundId: 7,
      provenance: {
        source: 'portfolio_companies',
        calculation: 'reserves_moic_rankings',
        metricBasis: 'planned_reserves',
        sourceRecordCount: 1,
      },
      generatedAt: NOW.toISOString(),
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
      generatedAt: NOW.toISOString(),
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
      status: 'available',
      response: {
        fundId: 7,
        asOfDate: '2026-07-13',
        facts: [],
        inputHash: 'f'.repeat(64),
        generatedAt: '2026-07-13T00:00:00.000Z',
      },
    },
  };
}

function makeDatabase(executeRows: unknown[][]) {
  const queue = [...executeRows];
  const executed: Array<{ sql: string; params: unknown[] }> = [];
  const tx = {
    execute: vi.fn(async (query: SQL) => {
      executed.push(dialect.sqlToQuery(query));
      return { rows: queue.shift() ?? [] };
    }),
  };
  const database = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };

  return { database, executed };
}

describe('fund calculation mode service MOIC golden contract', () => {
  it('preserves the request hash and response bytes for a representative shadow update', async () => {
    const requestPreimage = {
      route: ROUTE,
      fundId: 7,
      calculationKey: CALCULATION_KEY,
      expectedVersion: 0,
      configuredMode: 'shadow',
      killSwitchActive: null,
      acceptedReconciliationRunId: 55,
    } as const;
    const { database, executed } = makeDatabase([
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
        {
          id: 1,
          configured_mode: 'shadow',
          kill_switch_active: false,
          shadow_started_at: NOW,
          last_reconciliation_run_id: 55,
          last_moic_source_input_hash: 'source-hash-a',
          last_candidate_output_hash: 'candidate-output-a',
          version: 1,
        },
      ],
      [],
    ]);

    const result = await updateFundMoicCalculationMode({
      fundId: 7,
      expectedVersion: 0,
      configuredMode: 'shadow',
      acceptedReconciliationRunId: 55,
      idempotencyKey: 'golden-idempotency-key',
      actorId: 42,
      database: database as never,
      sources: sourceBundle(),
      now: NOW,
    });

    expect(canonicalSha256(requestPreimage)).toBe(GOLDEN_REQUEST_HASH);
    expect(executed[0]?.params).toEqual([
      7,
      CALCULATION_KEY,
      'golden-idempotency-key',
      GOLDEN_REQUEST_HASH,
      42,
    ]);
    expect(result.response).toEqual({
      calculationKey: CALCULATION_KEY,
      configuredMode: 'shadow',
      effectiveMode: 'shadow',
      killSwitchActive: false,
      shadowStartedAt: '2026-06-24T12:00:00.000Z',
      eligibleAt: '2026-07-01T12:00:00.000Z',
      residencyDaysRequired: 7,
      residencyStatus: 'pending',
      currentSourceMatchesAccepted: true,
      unreconciledEditsPresent: false,
      blockers: ['shadow_residency_pending'],
      version: 1,
    });
    expect(JSON.stringify(result.response)).toBe(
      '{"calculationKey":"fund_moic_rankings_exit_probability","configuredMode":"shadow","effectiveMode":"shadow","killSwitchActive":false,"shadowStartedAt":"2026-06-24T12:00:00.000Z","eligibleAt":"2026-07-01T12:00:00.000Z","residencyDaysRequired":7,"residencyStatus":"pending","currentSourceMatchesAccepted":true,"unreconciledEditsPresent":false,"blockers":["shadow_residency_pending"],"version":1}'
    );
  });
});
