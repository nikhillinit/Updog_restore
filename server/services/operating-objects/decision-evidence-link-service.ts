/**
 * Decision-sourced evidence links.
 *
 * Links are immutable, fund-scoped, and idempotent. The actor is stored for
 * provenance but is intentionally excluded from the request-hash preimage.
 *
 * @module server/services/operating-objects/decision-evidence-link-service
 */

import { and, asc, eq } from 'drizzle-orm';

import {
  DECISION_EVIDENCE_LINK_CONTRACT_VERSION,
  DecisionEvidenceLinkCreateRequestSchema,
  DecisionEvidenceLinkV1Schema,
  type DecisionEvidenceLinkCommandPreimage,
  type DecisionEvidenceLinkCreateRequest,
  type DecisionEvidenceLinkV1,
  type DecisionEvidenceTarget,
} from '@shared/contracts/operating-objects/decision.contract';
import {
  decisionEvidenceLinks,
  operatingDecisions,
  type DecisionEvidenceLink,
} from '@shared/schema/operating-objects';

import { db } from '../../db';
import {
  FundScopeError,
  assertOwnedByFund,
  type FundScopedOwnershipDatabase,
} from '../../lib/fund-scoped-ownership';
import { IdempotentCommandError, runIdempotentCommand } from '../../lib/idempotent-command';

type DecisionEvidenceDatabase = typeof db;

export type DecisionEvidenceLinkRecord = DecisionEvidenceLink;

export class DecisionEvidenceLinkServiceError extends Error {
  readonly status: number;

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'DecisionEvidenceLinkServiceError';
    this.status = statusCode;
  }
}

export interface CreateDecisionEvidenceLinkInput extends DecisionEvidenceLinkCreateRequest {
  fundId: number;
  decisionId: number;
  actorId: number | null;
  idempotencyKey: string;
}

export interface CreateDecisionEvidenceLinkResult {
  evidenceLink: DecisionEvidenceLinkV1;
  replayed: boolean;
}

export interface DecisionEvidenceLinkPorts {
  assertDecisionOwned(fundId: number, decisionId: number): Promise<void>;
  assertTargetOwned(fundId: number, target: DecisionEvidenceTarget): Promise<void>;
  createIdempotent(input: {
    fundId: number;
    decisionId: number;
    target: DecisionEvidenceTarget;
    actorId: number | null;
    idempotencyKey: string;
    preimage: DecisionEvidenceLinkCommandPreimage;
  }): Promise<{ row: DecisionEvidenceLinkRecord; replayed: boolean }>;
}

function targetFromRow(row: DecisionEvidenceLinkRecord): DecisionEvidenceTarget {
  if (row.targetKind === 'analysis_reference' && row.analysisReferenceId !== null) {
    return { kind: 'analysis_reference', id: row.analysisReferenceId };
  }
  if (row.targetKind === 'internal_economics_run' && row.economicsRunId !== null) {
    return { kind: 'internal_economics_run', id: row.economicsRunId };
  }
  throw new DecisionEvidenceLinkServiceError(
    500,
    'DECISION_EVIDENCE_LINK_CORRUPT',
    'Stored decision evidence target is inconsistent.'
  );
}

export function toDecisionEvidenceLinkContract(
  row: DecisionEvidenceLinkRecord
): DecisionEvidenceLinkV1 {
  return DecisionEvidenceLinkV1Schema.parse({
    contractVersion: DECISION_EVIDENCE_LINK_CONTRACT_VERSION,
    linkId: row.id,
    fundId: row.fundId,
    decisionId: row.decisionId,
    target: targetFromRow(row),
    createdAt: row.createdAt.toISOString(),
  });
}

async function assertDecisionOwnedByFund(
  database: DecisionEvidenceDatabase,
  fundId: number,
  decisionId: number
): Promise<void> {
  const [decision] = await database
    .select({ id: operatingDecisions.id })
    .from(operatingDecisions)
    .where(and(eq(operatingDecisions.id, decisionId), eq(operatingDecisions.fundId, fundId)))
    .limit(1);
  if (!decision) {
    throw new DecisionEvidenceLinkServiceError(404, 'DECISION_NOT_FOUND', 'Decision not found.');
  }
}

export async function listDecisionEvidenceLinks(
  fundId: number,
  decisionId: number,
  options: { database?: DecisionEvidenceDatabase } = {}
): Promise<DecisionEvidenceLinkV1[]> {
  const database = options.database ?? db;
  await assertDecisionOwnedByFund(database, fundId, decisionId);
  const rows = await database
    .select()
    .from(decisionEvidenceLinks)
    .where(
      and(
        eq(decisionEvidenceLinks.fundId, fundId),
        eq(decisionEvidenceLinks.decisionId, decisionId)
      )
    )
    .orderBy(asc(decisionEvidenceLinks.id))
    .limit(100);
  return rows.map(toDecisionEvidenceLinkContract);
}

export async function createDecisionEvidenceLinkWithPorts(
  ports: DecisionEvidenceLinkPorts,
  input: CreateDecisionEvidenceLinkInput
): Promise<CreateDecisionEvidenceLinkResult> {
  const request = DecisionEvidenceLinkCreateRequestSchema.parse({ target: input.target });
  await ports.assertDecisionOwned(input.fundId, input.decisionId);
  await ports.assertTargetOwned(input.fundId, request.target);

  const preimage: DecisionEvidenceLinkCommandPreimage = {
    commandKind: 'create_decision_evidence_link',
    contractVersion: DECISION_EVIDENCE_LINK_CONTRACT_VERSION,
    fundId: input.fundId,
    decisionId: input.decisionId,
    target: request.target,
  };
  const result = await ports.createIdempotent({ ...input, target: request.target, preimage });
  return {
    evidenceLink: toDecisionEvidenceLinkContract(result.row),
    replayed: result.replayed,
  };
}

function createDecisionEvidenceLinkPorts(
  database: DecisionEvidenceDatabase
): DecisionEvidenceLinkPorts {
  return {
    async assertDecisionOwned(fundId, decisionId) {
      await assertDecisionOwnedByFund(database, fundId, decisionId);
    },

    async assertTargetOwned(fundId, target) {
      try {
        await assertOwnedByFund({
          db: database as unknown as FundScopedOwnershipDatabase,
          fundId,
          ref:
            target.kind === 'analysis_reference'
              ? { kind: 'analysis_reference', id: target.id }
              : { kind: 'lp_economics_run', id: target.id },
        });
      } catch (error) {
        if (error instanceof FundScopeError) {
          throw new DecisionEvidenceLinkServiceError(
            404,
            'EVIDENCE_TARGET_NOT_FOUND',
            'Evidence target not found.'
          );
        }
        throw error;
      }
    },

    async createIdempotent(input) {
      const loadExisting = async () => {
        const [existing] = await database
          .select()
          .from(decisionEvidenceLinks)
          .where(
            and(
              eq(decisionEvidenceLinks.fundId, input.fundId),
              eq(decisionEvidenceLinks.decisionId, input.decisionId),
              eq(decisionEvidenceLinks.idempotencyKey, input.idempotencyKey)
            )
          )
          .limit(1);
        if (!existing) return null;
        if (existing.requestHash === null) {
          throw new IdempotentCommandError(
            500,
            'DECISION_EVIDENCE_LINK_IDEMPOTENCY_CORRUPT',
            'Decision evidence idempotency row is missing its request hash.'
          );
        }
        return { row: existing, requestHash: existing.requestHash };
      };

      return runIdempotentCommand<DecisionEvidenceLinkRecord>({
        db: database,
        fundId: input.fundId,
        idempotencyKey: input.idempotencyKey,
        contractVersion: DECISION_EVIDENCE_LINK_CONTRACT_VERSION,
        request: input.preimage,
        loadExisting,
        insert: async (requestHash) => {
          const [inserted] = await database
            .insert(decisionEvidenceLinks)
            .values({
              fundId: input.fundId,
              decisionId: input.decisionId,
              targetKind: input.target.kind,
              analysisReferenceId:
                input.target.kind === 'analysis_reference' ? input.target.id : null,
              economicsRunId:
                input.target.kind === 'internal_economics_run' ? input.target.id : null,
              idempotencyKey: input.idempotencyKey,
              requestHash,
              createdBy: input.actorId,
            })
            .onConflictDoNothing({
              target: [
                decisionEvidenceLinks.fundId,
                decisionEvidenceLinks.decisionId,
                decisionEvidenceLinks.idempotencyKey,
              ],
            })
            .returning();
          return inserted ?? null;
        },
      });
    },
  };
}

export async function createDecisionEvidenceLink(
  input: CreateDecisionEvidenceLinkInput,
  options: { database?: DecisionEvidenceDatabase } = {}
): Promise<CreateDecisionEvidenceLinkResult> {
  const database = options.database ?? db;
  return database.transaction(async (transaction) =>
    createDecisionEvidenceLinkWithPorts(
      createDecisionEvidenceLinkPorts(transaction as unknown as DecisionEvidenceDatabase),
      input
    )
  );
}
