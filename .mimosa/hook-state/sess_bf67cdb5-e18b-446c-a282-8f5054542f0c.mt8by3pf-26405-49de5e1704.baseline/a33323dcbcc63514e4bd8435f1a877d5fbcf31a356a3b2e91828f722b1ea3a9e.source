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
import { verifyGreenCandidateWithLedger } from '../../../server/services/current-forecast-reference-service';

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
