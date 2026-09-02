/**
 * Task 13 activation-ready gate assertions (PLAN_61, falsifiable per 13.2).
 *
 * This file pins the retired global flag posture: the flag is absent from the
 * registry after the mode/reference controls landed (the client reacts to the
 * dual-forecast response shape only). The remaining gate items are pinned
 * elsewhere and deliberately not duplicated here:
 * - held-state map + kill switch on both sides of cutover:
 *   tests/unit/services/current-forecast-calc-mode-resolver.test.ts
 * - PMC never invoked post-cutover at the consumer level:
 *   tests/unit/services/metrics-aggregator-dual-forecast.test.ts
 * - replay corpus green per the three D1 criteria:
 *   tests/unit/services/current-forecast-shadow-service.test.ts
 *
 * Actual flag and mode VALUES stay unchanged - this suite only proves the
 * dormant posture is what the plan says it is.
 */
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  verifyGreenCandidateWithLedger,
  verifyNoManualRecomputeSinceShadowStart,
} from '../../../server/services/current-forecast-reference-service';

type FlagEntry = {
  default: boolean;
  description: string;
  owner: string;
  risk: string;
  exposeToClient: boolean;
  environments: Record<string, boolean>;
  dependencies: unknown[];
};

async function loadRegistry(): Promise<Record<string, FlagEntry>> {
  // The shared node setup mocks fs; go through the real module for this scan.
  const { readFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');
  const raw = readFileSync(join(process.cwd(), 'flags', 'registry.yaml'), 'utf8');
  // Registry shape: { schema_version, flags: { <name>: entry }, deprecated }.
  return (parse(raw) as { flags: Record<string, FlagEntry> }).flags;
}

const gateReference = {
  id: 42,
  fundId: 7,
  calculationKey: 'current_forecast' as const,
  fundSnapshotId: 11,
  currentPlanVersionId: 21,
  financialFactsSnapshotId: 31,
  inputHash: 'a'.repeat(64),
  resultHash: 'b'.repeat(64),
  assumptionsHash: 'c'.repeat(64),
  engineVersion: 'current-forecast-v2-engine/1.0.0' as const,
  methodologyVersion: 'cohort-projection-v2/1.0.0' as const,
  candidate: true,
  supersededByReferenceId: null,
  reason: null,
  createdBy: null,
  createdAt: '2026-07-20T00:00:00.000Z',
};

type DecisiveObservation = {
  substrate_state: 'failed' | 'available';
  reconciliation_status: 'match' | 'mismatch';
};

function gateExecutor(latestDecisive: DecisiveObservation | undefined) {
  const rows: unknown[][] = [
    [{ id: gateReference.fundSnapshotId }],
    [{ reconciliation_status: 'match' }],
    latestDecisive === undefined ? [] : [latestDecisive],
  ];
  return {
    execute: vi.fn(async () => ({ rows: rows.shift() ?? [] })),
  };
}

async function gateBlockers(latestDecisive: DecisiveObservation | undefined) {
  return verifyGreenCandidateWithLedger({
    executor: gateExecutor(latestDecisive),
    fundId: gateReference.fundId,
    reference: gateReference,
  });
}

describe('current-forecast activation gate: flag posture', () => {
  it('enable_current_forecast_v2 is retired from the registry', async () => {
    const registry = await loadRegistry();
    expect(registry['enable_current_forecast_v2']).toBeUndefined();
  });
});

describe('current-forecast activation gate: latest decisive observation', () => {
  it('failure followed by a later success on a new basis unblocks', async () => {
    await expect(
      gateBlockers({ substrate_state: 'failed', reconciliation_status: 'mismatch' })
    ).resolves.toContain('unexplained_divergence_present');
    await expect(
      gateBlockers({ substrate_state: 'available', reconciliation_status: 'match' })
    ).resolves.not.toContain('unexplained_divergence_present');
  });

  it('success, failure, success leaves gate unblocked', async () => {
    const observations: DecisiveObservation[] = [
      { substrate_state: 'available', reconciliation_status: 'match' },
      { substrate_state: 'failed', reconciliation_status: 'mismatch' },
      { substrate_state: 'available', reconciliation_status: 'match' },
    ];
    const blockers = [];
    for (const observation of observations) blockers.push(await gateBlockers(observation));

    expect(blockers[1]).toContain('unexplained_divergence_present');
    expect(blockers[2]).not.toContain('unexplained_divergence_present');
  });

  it('failure, success, duplicate failure stays unblocked because duplicate failure is not latest', async () => {
    await gateBlockers({ substrate_state: 'failed', reconciliation_status: 'mismatch' });
    await gateBlockers({ substrate_state: 'available', reconciliation_status: 'match' });
    await expect(
      gateBlockers({ substrate_state: 'available', reconciliation_status: 'match' })
    ).resolves.not.toContain('unexplained_divergence_present');
  });

  it('success followed by unavailable stays unblocked', async () => {
    await gateBlockers({ substrate_state: 'available', reconciliation_status: 'match' });
    await expect(
      gateBlockers({ substrate_state: 'available', reconciliation_status: 'match' })
    ).resolves.not.toContain('unexplained_divergence_present');
  });

  it('failure followed by unavailable stays blocked', async () => {
    await gateBlockers({ substrate_state: 'failed', reconciliation_status: 'mismatch' });
    await expect(
      gateBlockers({ substrate_state: 'failed', reconciliation_status: 'mismatch' })
    ).resolves.toContain('unexplained_divergence_present');
  });

  it('latest available mismatch blocks', async () => {
    await expect(
      gateBlockers({ substrate_state: 'available', reconciliation_status: 'mismatch' })
    ).resolves.toContain('unexplained_divergence_present');
  });
});

// F_1.11.0 P0b item 4: the Phase 4 manual-run prohibition at the latch.
const MANUAL_BLOCKER = 'manual_recompute_since_shadow_start';
const SHADOW_START = '2026-08-01T00:00:00.000Z';
const BEFORE_START = '2026-07-15T00:00:00.000Z';
const AFTER_START = '2026-08-02T00:00:00.000Z';

type ManualLedgerRow = {
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  started_at: string;
  finalized_at: string | null;
};

function manualRow(overrides: Partial<ManualLedgerRow> = {}): ManualLedgerRow {
  return {
    status: 'completed',
    started_at: BEFORE_START,
    finalized_at: null,
    ...overrides,
  };
}

async function manualBlockers(
  rows: ManualLedgerRow[],
  shadowStartedAt: string | null = SHADOW_START
) {
  const shadowStart = shadowStartedAt === null ? null : new Date(shadowStartedAt).getTime();
  const contaminated = rows.some(
    (row) =>
      shadowStart === null ||
      row.status === 'pending' ||
      new Date(row.started_at).getTime() >= shadowStart ||
      (row.finalized_at !== null && new Date(row.finalized_at).getTime() >= shadowStart)
  );
  return verifyNoManualRecomputeSinceShadowStart({
    executor: { execute: vi.fn(async (_query: unknown) => ({ rows: [{ contaminated }] })) },
    fundId: gateReference.fundId,
  });
}

describe('current-forecast activation gate: manual recompute since shadow start', () => {
  it('no command rows leaves the gate unblocked', async () => {
    await expect(manualBlockers([])).resolves.toEqual([]);
  });

  it('a command that was terminal before shadow start does not block', async () => {
    await expect(manualBlockers([manualRow({ finalized_at: BEFORE_START })])).resolves.toEqual([]);
  });

  it.each(['pending', 'completed', 'failed', 'skipped'] as const)(
    'a %s attempt at or after shadow start blocks',
    async (status) => {
      await expect(
        manualBlockers([manualRow({ status, started_at: AFTER_START })])
      ).resolves.toEqual([MANUAL_BLOCKER]);
    }
  );

  it('a pre-transition terminal command finalized after start blocks', async () => {
    await expect(manualBlockers([manualRow({ finalized_at: AFTER_START })])).resolves.toEqual([
      MANUAL_BLOCKER,
    ]);
  });

  it('a pre-transition pending command blocks', async () => {
    await expect(manualBlockers([manualRow({ status: 'pending' })])).resolves.toEqual([
      MANUAL_BLOCKER,
    ]);
  });

  it('a same-key replay of an older terminal command adds no rows and does not block', async () => {
    const ledger = [manualRow({ finalized_at: BEFORE_START })];
    await expect(manualBlockers(ledger)).resolves.toEqual([]);
  });

  it('a fresh authorized shadow transition establishes a new interval', async () => {
    const ledger = [manualRow({ started_at: AFTER_START })];
    await expect(manualBlockers(ledger, SHADOW_START)).resolves.toEqual([MANUAL_BLOCKER]);
    await expect(manualBlockers(ledger, '2026-08-10T00:00:00.000Z')).resolves.toEqual([]);
  });

  it('fails closed when no shadow interval is recorded', async () => {
    await expect(manualBlockers([], null)).resolves.toEqual([]);
    await expect(manualBlockers([manualRow()], null)).resolves.toEqual([MANUAL_BLOCKER]);
  });
});
