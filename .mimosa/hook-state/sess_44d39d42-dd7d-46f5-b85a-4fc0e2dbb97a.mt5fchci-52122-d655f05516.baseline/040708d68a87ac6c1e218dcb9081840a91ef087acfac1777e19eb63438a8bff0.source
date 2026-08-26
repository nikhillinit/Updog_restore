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
  // The claim-last rewrite executes statements directly on the database
  // handle (no callback transaction), so the double exposes execute there.
  const database = {
    execute: vi.fn(async (query: SQL) => {
      executed.push(dialect.sqlToQuery(query));
      return { rows: queue.shift() ?? [] };
    }),
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
      // 1: read-only mode-row preflight (row absent, expectedVersion 0)
      [],
      // 2: loadCompletedAccepted for run 55
      [
        {
          id: 55,
          candidate_input_hash: 'source-hash-a',
          candidate_output_hash: 'candidate-output-a',
        },
      ],
      // 3: the single claim-last CTE statement
      [
        {
          mode_exists: false,
          actual_version: null,
          existing_request_id: null,
          mode_write_id: 1,
          claim_id: 100,
        },
      ],
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
    // The claim-last CTE statement carries the golden request hash and the
    // idempotency key verbatim.
    expect(executed[2]?.params).toContain(GOLDEN_REQUEST_HASH);
    expect(executed[2]?.params).toContain('golden-idempotency-key');
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
