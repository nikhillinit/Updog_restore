import type { Request, Response, NextFunction } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { getRequestDatabaseScope } from '../db/request-context';
import { fundConfigs, funds, fundWorkflowCommands, userFundGrants } from '@shared/schema';
import type { FundConfig } from '@shared/schema/fund';
import { canonicalSha256 } from '@shared/lib/canonical-hash';
import {
  FUND_WORKFLOW_CONTRACT_VERSION,
  FundDraftETagSchema,
  FundWorkflowKeySchema,
  type FundWorkflowOperation,
} from '@shared/contracts/fund-workflow-v1.contract';
import { strongETag } from '../lib/http-preconditions';
import { sendApiError } from '../lib/apiError';
import { sendIdempotentCommandLockError } from '../lib/idempotent-command';
import { CanaryResiduePreflightError, checkCanaryWorkflowResidue } from './canary-residue-service';

export class FundWorkflowError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly current?: string
  ) {
    super(message);
  }
}

export function fundWorkflowWritesAllowed(_req: Request, res: Response, next: NextFunction) {
  if (
    process.env['FUND_WORKFLOW_WRITES_PAUSED'] === 'true' ||
    process.env['FUND_WORKFLOW_WRITES_PAUSED'] === '1'
  ) {
    res.setHeader('Retry-After', '30');
    return sendApiError(res, 503, {
      error: 'Fund workflow writes are paused',
      code: 'FUND_WORKFLOW_WRITES_PAUSED',
    });
  }
  return next();
}

function singleHeader(req: Request, name: string): string | undefined {
  let count = 0;
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i]?.toLowerCase() === name) count++;
  }
  const value = req.headers[name];
  return count > 1 || Array.isArray(value) ? '' : value;
}

export function fundWorkflowHeaders(req: Request, needsRevision: boolean) {
  const rawKey = singleHeader(req, 'idempotency-key');
  if (rawKey === undefined)
    throw new FundWorkflowError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key is required');
  const key = FundWorkflowKeySchema.safeParse(rawKey);
  if (!key.success)
    throw new FundWorkflowError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be one UUID');
  const rawRevision = singleHeader(req, 'if-match');
  if (needsRevision && rawRevision === undefined)
    throw new FundWorkflowError(428, 'PRECONDITION_REQUIRED', 'If-Match is required');
  if (rawRevision !== undefined && !FundDraftETagSchema.safeParse(rawRevision).success) {
    throw new FundWorkflowError(400, 'INVALID_IF_MATCH', 'If-Match must be one strong draft ETag');
  }
  return { key: key.data, expectedRevision: rawRevision ?? null };
}

export function draftETag(draft: FundConfig): string {
  return strongETag({
    fundId: draft.fundId,
    configId: draft.id,
    configVersion: draft.version,
    draftRevision: String(draft.draftRevision),
  });
}

// Explicit wire projection: the internal bigint must never enter JSON responses.
export function draftResponse(draft: FundConfig) {
  return {
    id: draft.id,
    fundId: draft.fundId,
    version: draft.version,
    config: draft.config,
    isDraft: draft.isDraft,
    isPublished: draft.isPublished,
    publishedAt: draft.publishedAt,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

interface WorkflowResult {
  status: number;
  body: Record<string, unknown>;
  etag: string;
  fundId: number;
  configId: number;
  runId?: number | null;
}

/** Participates only in the authenticated request's physical transaction. */
export async function executeFundWorkflowCommand(
  command: {
    actorId: number;
    operation: FundWorkflowOperation;
    key: string;
    targetFundId: number | null;
    expectedRevision: string | null;
    body: unknown;
    unrestricted: boolean;
  },
  execute: (draft: FundConfig | undefined) => Promise<WorkflowResult>
): Promise<WorkflowResult & { replayed: boolean }> {
  if (!getRequestDatabaseScope())
    throw new Error('Fund workflow requires a verified database context');
  const hash = canonicalSha256({
    operation: command.operation,
    target: command.targetFundId,
    expectedRevision: command.expectedRevision,
    body: command.body,
  });
  const lockHash = canonicalSha256([
    FUND_WORKFLOW_CONTRACT_VERSION,
    command.actorId,
    command.operation,
    command.key,
  ]);
  const lock = BigInt.asIntN(64, BigInt(`0x${lockHash.slice(0, 16)}`)).toString();
  await db.execute(sql`SET LOCAL lock_timeout = '2s'`);
  await db.execute(sql`SELECT pg_advisory_xact_lock(${lock}::bigint)`);
  const [receipt] = await db
    .select()
    .from(fundWorkflowCommands)
    .where(
      and(
        eq(fundWorkflowCommands.actorUserId, command.actorId),
        eq(fundWorkflowCommands.operation, command.operation),
        eq(fundWorkflowCommands.idempotencyKey, command.key)
      )
    )
    .limit(1);
  if (receipt) {
    // A lost create response may leave the caller's token without the new ID.
    // Its durable creator grant permits recovery; a revoked grant does not.
    if (!command.unrestricted) {
      const [grant] = await db
        .select()
        .from(userFundGrants)
        .where(
          and(eq(userFundGrants.userId, command.actorId), eq(userFundGrants.fundId, receipt.fundId))
        )
        .limit(1);
      if (!grant) throw new FundWorkflowError(403, 'FUND_ACCESS_DENIED', 'Fund access denied');
    }
    if (
      receipt.requestHash !== hash ||
      receipt.contractVersion !== FUND_WORKFLOW_CONTRACT_VERSION
    ) {
      throw new FundWorkflowError(
        409,
        'IDEMPOTENCY_KEY_REUSE',
        'This key belongs to a different command'
      );
    }
    return {
      status: receipt.responseStatus,
      body: receipt.responseBody,
      etag: receipt.resultEtag,
      fundId: receipt.fundId,
      configId: receipt.configId,
      runId: receipt.runId,
      replayed: true,
    };
  }
  let draft: FundConfig | undefined;
  if (command.targetFundId !== null) {
    const [target] = await db
      .select({ canaryRunId: funds.canaryRunId })
      .from(funds)
      .where(eq(funds.id, command.targetFundId));
    if (target?.canaryRunId) {
      // Same serialization as creation, always before the fund/config locks.
      await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('release_canary_creation'))`);
    }
    const [fund] = await db
      .select()
      .from(funds)
      .where(eq(funds.id, command.targetFundId))
      .for('update');
    if (!fund) throw new FundWorkflowError(404, 'FUND_NOT_FOUND', 'Fund not found');
    [draft] = await db
      .select()
      .from(fundConfigs)
      .where(and(eq(fundConfigs.fundId, command.targetFundId), eq(fundConfigs.isDraft, true)))
      .for('update');
    if (!draft)
      throw new FundWorkflowError(409, 'NO_ACTIVE_DRAFT', 'No active draft exists for this fund');
    const current = draftETag(draft);
    if (command.expectedRevision !== current) {
      throw new FundWorkflowError(
        412,
        'PRECONDITION_FAILED',
        'A newer draft is available',
        current
      );
    }
  }
  const result = await execute(draft);
  // Persist precisely the allowlisted business DTO; credentials are renewed by
  // routes for each request, including replay, and never enter this receipt.
  const body = JSON.parse(JSON.stringify(result.body)) as Record<string, unknown>;
  await db.insert(fundWorkflowCommands).values({
    actorUserId: command.actorId,
    operation: command.operation,
    idempotencyKey: command.key,
    requestHash: hash,
    contractVersion: FUND_WORKFLOW_CONTRACT_VERSION,
    responseStatus: result.status,
    responseBody: body,
    resultEtag: result.etag,
    fundId: result.fundId,
    configId: result.configId,
    runId: result.runId ?? null,
  });
  const [fund] = await db
    .select({ canaryRunId: funds.canaryRunId })
    .from(funds)
    .where(eq(funds.id, result.fundId));
  if (fund?.canaryRunId) await checkCanaryWorkflowResidue(db, fund.canaryRunId);
  return { ...result, body, replayed: false };
}

export function setFundWorkflowResponseHeaders(
  res: Response,
  result: WorkflowResult & { replayed: boolean }
) {
  res.setHeader('ETag', result.etag);
  res.setHeader('Cache-Control', 'no-store');
  if (result.replayed) res.setHeader('Idempotency-Replay', 'true');
}

export function sendFundWorkflowError(res: Response, error: unknown): boolean {
  if (error instanceof CanaryResiduePreflightError) {
    sendApiError(res, 503, {
      error: 'Release canary residue capacity is unavailable',
      code: 'CANARY_RESIDUE_CAPACITY_UNAVAILABLE',
    });
    return true;
  }
  if (error instanceof FundWorkflowError) {
    if (error.current) res.setHeader('ETag', error.current);
    sendApiError(res, error.status, {
      error: error.message,
      code: error.code,
      ...(error.current ? { details: { current: error.current } } : {}),
    });
    return true;
  }
  return sendIdempotentCommandLockError(res, error);
}
