import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import {
  reconciliationRuns,
  type InsertReconciliationRun,
  type ReconciliationRun,
} from '../../shared/schema';
import { assessMoicMateriality, MOIC_MATERIALITY_EPSILON } from './fund-moic-materiality';
import { FUND_MOIC_CALCULATION_KEY, getFundMoicRankingSources } from './fund-moic-ranking-service';
import { buildRoundsToModelEvidence } from './rounds-to-model-evidence-service';

const MOIC_RECONCILIATION_CONTRACT_VERSION = '2.1.0';

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
  candidateInputHash?: string;
  candidateMaterial?: boolean;
}

function runRef(
  row: Pick<ReconciliationRun, 'id' | 'requestedAt'> &
    Partial<Pick<ReconciliationRun, 'candidateInputHash' | 'candidateMaterial'>>
): MoicReconciliationRunRef {
  return {
    runId: String(row.id),
    createdAt: row.requestedAt.toISOString(),
    ...(row.candidateInputHash ? { candidateInputHash: row.candidateInputHash } : {}),
    ...(row.candidateMaterial !== undefined ? { candidateMaterial: row.candidateMaterial } : {}),
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

function requestHashFor(params: { fundId: number; moicSourceInputHash: string }): string {
  return canonicalSha256({
    kind: 'moic_reconciliation',
    fundId: params.fundId,
    calculationKey: FUND_MOIC_CALCULATION_KEY,
    contractVersion: MOIC_RECONCILIATION_CONTRACT_VERSION,
    moicSourceInputHash: params.moicSourceInputHash,
  });
}

async function loadReconciliationByIdempotencyKey(
  fundId: number,
  idempotencyKey: string,
  database: MoicReconciliationDatabase
): Promise<ReconciliationRun | undefined> {
  const [existing] = await database
    .select()
    .from(reconciliationRuns)
    .where(
      and(
        eq(reconciliationRuns.fundId, fundId),
        eq(reconciliationRuns.idempotencyKey, idempotencyKey)
      )
    )
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
  const sources = await getFundMoicRankingSources(params.fundId, database);
  const requestHash = requestHashFor({
    fundId: params.fundId,
    moicSourceInputHash: sources.moicSourceInputHash,
  });
  const existing = await loadReconciliationByIdempotencyKey(
    params.fundId,
    params.idempotencyKey,
    database
  );
  if (existing) {
    return replayOrConflict(existing, requestHash);
  }

  const legacy = sources.legacy;
  const candidate = sources.candidate;
  const materiality = assessMoicMateriality(legacy.rankings, candidate.rankings);
  const evidence = await buildRoundsToModelEvidence({ fundId: params.fundId, database });
  const legacyOutputHash = canonicalSha256(legacy.rankings);
  const candidateOutputHash = canonicalSha256(candidate.rankings);
  const roundEvidenceSummary = summarizeRoundEvidence(evidence.coverage);

  const insertValues: InsertReconciliationRun = {
    fundId: params.fundId,
    idempotencyKey: params.idempotencyKey,
    requestHash,
    requestedBy: params.requestedBy,
    status: 'completed',
    legacyInputHash: canonicalSha256({
      kind: 'fund_moic_legacy_source',
      fundId: params.fundId,
      sourceRecordCount: legacy.provenance.sourceRecordCount,
    }),
    candidateInputHash: sources.moicSourceInputHash,
    evidenceInputHash: canonicalSha256(evidence.coverage),
    assumptionsHash: canonicalSha256({
      epsilon: MOIC_MATERIALITY_EPSILON,
      contractVersion: MOIC_RECONCILIATION_CONTRACT_VERSION,
      calculationKey: FUND_MOIC_CALCULATION_KEY,
    }),
    legacyOutputHash,
    candidateOutputHash,
    candidateMaterial: materiality.candidateMaterial,
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
    .onConflictDoNothing({
      target: [reconciliationRuns.fundId, reconciliationRuns.idempotencyKey],
    })
    .returning();

  if (inserted) {
    return { run: runRef(inserted), replayed: false };
  }

  const replayed = await loadReconciliationByIdempotencyKey(
    params.fundId,
    params.idempotencyKey,
    database
  );
  if (!replayed) {
    throw new Error('Idempotency conflict did not return an existing MOIC reconciliation run');
  }
  return replayOrConflict(replayed, requestHash);
}
