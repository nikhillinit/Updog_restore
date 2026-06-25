import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canonicalSha256 } from '../../../shared/lib/canonical-hash';

const { buildRoundsToModelEvidence, getFundMoicRankingSources } = vi.hoisted(() => ({
  buildRoundsToModelEvidence: vi.fn(),
  getFundMoicRankingSources: vi.fn(),
}));

vi.mock('../../../server/services/fund-moic-ranking-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../server/services/fund-moic-ranking-service')>();

  return {
    ...actual,
    getFundMoicRankingSources,
  };
});

vi.mock('../../../server/services/rounds-to-model-evidence-service', () => ({
  buildRoundsToModelEvidence,
}));

import { createMoicActionabilityResolver } from '../../../server/services/fund-calculation-mode-service';

type ReconciliationRow = {
  id: number;
  requestedAt: Date;
  requested_at: Date;
  status: 'completed';
  candidateInputHash: string;
  candidate_input_hash: string;
  evidenceInputHash: string;
  evidence_input_hash: string;
  assumptionsHash: string;
  assumptions_hash: string;
};

type MoicActionabilityResult = {
  sourceFingerprintMatches?: unknown;
  actionability?: unknown;
  actionabilityStatus?: unknown;
  status?: unknown;
  sourceFingerprint?: {
    roundEvidenceAssumptionsHash?: unknown;
    fingerprintHash?: unknown;
  };
};

type ResolveByParams = (input: { fundId: number }) => Promise<MoicActionabilityResult>;
type ResolveById = (fundId: number) => Promise<MoicActionabilityResult>;

const now = new Date('2026-06-25T09:01:17.440Z');
const moicSourceInputHash = 'current-moic-source-input-hash';
const coverage = {
  activeRoundCount: 2,
  activeOverrideCount: 1,
  warningsByCode: {},
};
const evidenceInputHash = canonicalSha256(coverage);
const assumptionsHash = canonicalSha256({
  policyVersion: 'h9-policy-v1',
  generatedAt: now.toISOString(),
});

const sourceBundle = {
  moicSourceInputHash,
  moicInputSummary: {
    sourceVersion: 'moic-exit-probability-v1',
    explicitExitProbabilityCount: 1,
    defaultedExitProbabilityCount: 0,
    activationBlockingDefaultedExitProbabilityCount: 0,
    explicitReserveExitMultipleCount: 1,
    defaultedReserveExitMultipleCount: 0,
    activationBlockingDefaultedReserveExitMultipleCount: 0,
  },
  legacy: { rankings: [] },
  candidate: { rankings: [] },
};

function reconciliationRow(overrides: Partial<ReconciliationRow> = {}): ReconciliationRow {
  const candidateInputHash = overrides.candidateInputHash ?? moicSourceInputHash;
  const rowEvidenceInputHash = overrides.evidenceInputHash ?? evidenceInputHash;
  const rowAssumptionsHash = overrides.assumptionsHash ?? assumptionsHash;

  return {
    id: 17,
    requestedAt: now,
    requested_at: now,
    status: 'completed',
    candidateInputHash,
    candidate_input_hash: candidateInputHash,
    evidenceInputHash: rowEvidenceInputHash,
    evidence_input_hash: rowEvidenceInputHash,
    assumptionsHash: rowAssumptionsHash,
    assumptions_hash: rowAssumptionsHash,
    ...overrides,
  };
}

function makeDatabase(rows: ReconciliationRow[]) {
  const findFirst = vi.fn(async () => rows[0] ?? null);
  const limit = vi.fn(async () => rows);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ limit, orderBy }));
  const from = vi.fn(() => ({ limit, orderBy, where }));
  const select = vi.fn(() => ({ from }));
  const execute = vi.fn(async () => ({ rows }));

  return {
    execute,
    query: {
      reconciliationRuns: {
        findFirst,
      },
    },
    select,
  };
}

function hasResolve(value: unknown): value is { resolve: ResolveByParams } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'resolve' in value &&
    typeof value.resolve === 'function'
  );
}

function hasResolveForFund(value: unknown): value is { resolveForFund: ResolveById } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'resolveForFund' in value &&
    typeof value.resolveForFund === 'function'
  );
}

async function resolveForFund(resolver: unknown, fundId: number): Promise<MoicActionabilityResult> {
  if (typeof resolver === 'function') {
    return (resolver as ResolveByParams)({ fundId });
  }
  if (hasResolveForFund(resolver)) {
    return resolver.resolveForFund(fundId);
  }
  if (hasResolve(resolver)) {
    return resolver.resolve({ fundId });
  }
  throw new Error('MOIC actionability resolver does not expose a fund resolver');
}

function actionabilityStatus(result: MoicActionabilityResult): unknown {
  return result.actionability ?? result.actionabilityStatus ?? result.status;
}

describe('fund MOIC actionability resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFundMoicRankingSources.mockResolvedValue(sourceBundle);
    buildRoundsToModelEvidence.mockResolvedValue({ coverage });
  });

  it('requires a database for the critical gate', () => {
    expect(() => createMoicActionabilityResolver({ now })).toThrow();
  });

  it('reports fresh when accepted candidate and evidence hashes match the current fingerprint', async () => {
    const database = makeDatabase([reconciliationRow()]);
    const resolver = createMoicActionabilityResolver({ database, now });

    const result = await resolveForFund(resolver, 7);

    expect(result.sourceFingerprintMatches).toBe(true);
  });

  it('reports stale when candidate hash matches but evidence hash differs', async () => {
    const database = makeDatabase([
      reconciliationRow({ evidenceInputHash: 'stale-round-evidence-input-hash' }),
    ]);
    const resolver = createMoicActionabilityResolver({ database, now });

    const result = await resolveForFund(resolver, 7);

    expect(result.sourceFingerprintMatches).toBe(false);
  });

  it('does not throw when no accepted reconciliation row exists', async () => {
    const database = makeDatabase([]);
    const resolver = createMoicActionabilityResolver({ database, now });

    const result = await resolveForFund(resolver, 7);

    expect(result.sourceFingerprintMatches).toBe(false);
    expect(actionabilityStatus(result)).toBe('non_actionable');
  });

  it('produces a now-independent fingerprint so cache keys and snapshot stamps stay stable', async () => {
    const database = makeDatabase([reconciliationRow()]);
    const early = await resolveForFund(
      createMoicActionabilityResolver({ database, now: new Date('2020-01-01T00:00:00.000Z') }),
      7
    );
    const late = await resolveForFund(
      createMoicActionabilityResolver({ database, now: new Date('2023-06-15T12:00:00.000Z') }),
      7
    );

    expect(early.sourceFingerprint?.roundEvidenceAssumptionsHash).toBe(
      late.sourceFingerprint?.roundEvidenceAssumptionsHash
    );
    expect(early.sourceFingerprint?.fingerprintHash).toBe(
      late.sourceFingerprint?.fingerprintHash
    );
  });
});
