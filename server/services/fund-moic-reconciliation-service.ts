import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import {
  reconciliationRuns,
  type InsertReconciliationRun,
  type ReconciliationRun,
} from '../../shared/schema';
import {
  assessMoicMateriality,
  MOIC_MATERIALITY_EPSILON,
} from './fund-moic-materiality';
import { getFundMoicRankings } from './fund-moic-ranking-service';
import { buildRoundsToModelEvidence } from './rounds-to-model-evidence-service';

const MOIC_RECONCILIATION_CONTRACT_VERSION = '2.0.0';

type MoicReconciliationDatabase = typeof db;

type RoundEvidenceSummary = {
  activeRoundCount: number;
  activeOverrideCount: number;
  warningCodes: string[];
};

export class MoicReconciliationConflictError extends Error {
  readonly code = 'idempotency_conflict';

  constructor(message: string) {
    super(message);
    this.name = 'MoicReconciliationConflictError';
  }
}

export interface MoicReconciliationRunRef {
  runId: string;
  createdAt: string;
}

function runRef(row: Pick<ReconciliationRun, 'id' | 'requestedAt'>): MoicReconciliationRunRef {
  return {
    runId: String(row.id),
    createdAt: row.requestedAt.toISOString(),
  };
}

function summarizeRoundEvidence(coverage: {
  activeRoundCount: number;
  activeOverrideCount: number;
  warningsByCode: Record<string, number>;
}): RoundEvidenceSummary {
  return {
    activeRoundCount: coverage.activeRoundCount,
    activeOverrideCount: coverage.activeOverrideCount,
    warningCodes: Object.keys(coverage.warningsByCode).sort(),
  };
}

function requestHashFor(fundId: number): string {
  return canonicalSha256({
    kind: 'moic_reconciliation',
    fundId,
    contractVersion: MOIC_RECONCILIATION_CONTRACT_VERSION,
  });
}

async function loadReconciliationByIdempotencyKey(
  idempotencyKey: string,
  database: MoicReconciliationDatabase
): Promise<ReconciliationRun | undefined> {
  const [existing] = await database
    .select()
    .from(reconciliationRuns)
    .where(eq(reconciliationRuns.idempotencyKey, idempotencyKey))
    .limit(1);
  return existing;
}

function replayOrConflict(
  existing: ReconciliationRun,
  requestHash: string
): { run: MoicReconciliationRunRef; replayed: true } {
  if (existing.requestHash !== requestHash) {
    throw new MoicReconciliationConflictError('Idempotency-Key reused with a different request');
  }
  return { run: runRef(existing), replayed: true };
}

export async function getLatestCompletedMoicReconciliation(
  fundId: number,
  database: MoicReconciliationDatabase = db
): Promise<MoicReconciliationRunRef | null> {
  const [row] = await database
    .select()
    .from(reconciliationRuns)
    .where(and(eq(reconciliationRuns.fundId, fundId), eq(reconciliationRuns.status, 'completed')))
    .orderBy(desc(reconciliationRuns.requestedAt), desc(reconciliationRuns.id))
    .limit(1);

  return row ? runRef(row) : null;
}

export async function recordMoicReconciliation(params: {
  fundId: number;
  idempotencyKey: string;
  requestedBy: number | null;
  database?: MoicReconciliationDatabase;
}): Promise<{ run: MoicReconciliationRunRef; replayed: boolean }> {
  const database = params.database ?? db;
  const requestHash = requestHashFor(params.fundId);
  const existing = await loadReconciliationByIdempotencyKey(params.idempotencyKey, database);
  if (existing) {
    return replayOrConflict(existing, requestHash);
  }

  const legacy = await getFundMoicRankings(params.fundId);
  const candidate = legacy;
  const materiality = assessMoicMateriality(legacy.rankings, candidate.rankings);
  const evidence = await buildRoundsToModelEvidence({ fundId: params.fundId, database });
  const rankingsHash = canonicalSha256(legacy.rankings);
  const roundEvidenceSummary = summarizeRoundEvidence(evidence.coverage);

  const insertValues: InsertReconciliationRun = {
    fundId: params.fundId,
    idempotencyKey: params.idempotencyKey,
    requestHash,
    requestedBy: params.requestedBy,
    status: 'completed',
    legacyInputHash: rankingsHash,
    candidateInputHash: rankingsHash,
    evidenceInputHash: canonicalSha256(evidence.coverage),
    assumptionsHash: canonicalSha256({
      epsilon: MOIC_MATERIALITY_EPSILON,
      contractVersion: MOIC_RECONCILIATION_CONTRACT_VERSION,
    }),
    legacyOutputHash: rankingsHash,
    candidateOutputHash: rankingsHash,
    candidateMaterial: false,
    materialityEpsilon: MOIC_MATERIALITY_EPSILON,
    diffSummary: {
      comparedInvestmentCount: materiality.comparedInvestmentCount,
      rankChangeCount: materiality.rankChangeCount,
      reservesMoicValueChangeCount: materiality.reservesMoicValueChangeCount,
      materialChangeCount: materiality.materialChangeCount,
    },
    roundEvidenceSummary,
  };

  const [inserted] = await database
    .insert(reconciliationRuns)
    .values(insertValues)
    .onConflictDoNothing({ target: reconciliationRuns.idempotencyKey })
    .returning();

  if (inserted) {
    return { run: runRef(inserted), replayed: false };
  }

  const replayed = await loadReconciliationByIdempotencyKey(params.idempotencyKey, database);
  if (!replayed) {
    throw new Error('Idempotency conflict did not return an existing MOIC reconciliation run');
  }
  return replayOrConflict(replayed, requestHash);
}
