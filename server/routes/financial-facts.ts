import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import {
  FINANCIAL_FACTS_POLICY_VERSION,
  FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
  PersistedFinancialFactsSnapshotV1Schema,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import { toNumber } from '@shared/number';
import type { FinancialFactsSnapshot } from '@shared/schema/financial-facts-snapshots';
import { requireAuth, requireFundAccess, requireRole } from '../lib/auth/jwt.js';
import { FundScopeError, FundScopeKindNotImplementedError } from '../lib/fund-scoped-ownership';
import { IdempotentCommandError } from '../lib/idempotent-command';
import { handleNumberParseError } from '../lib/number-parse-error';
import { createRouteLogger } from '../lib/route-logger.js';
import {
  buildFinancialFactsSnapshot,
  FinancialFactsSnapshotServiceError,
  getLatestFinancialFactsSnapshot,
} from '../services/financial-facts-snapshot-service';
import { OpeningAccountingStateArtifactError } from '../services/financial-facts/opening-accounting-state-artifact';
import { triggerCurrentForecastShadowForFacts } from '../services/current-forecast-shadow-trigger';

const routeLog = createRouteLogger('financial-facts');
const router = Router();

const financialFactsReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const financialFactsWriteLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const CreateFinancialFactsSnapshotBodySchema = z
  .object({
    asOfDate: z.string().date(),
    vehicleIds: z.array(z.number().int().positive()).optional(),
    knowledgeCutoff: z.string().datetime().optional(),
    openingAccountingStateArtifactId: z.number().int().positive().optional(),
  })
  .strict();

function validateFundIdParam(req: Request, res: Response, next: NextFunction) {
  try {
    toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    next();
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid parameter')) return;
    throw error;
  }
}

function routeHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function actorId(req: Request): number {
  return toNumber(req.user?.id ?? req.user?.sub, 'actorId', { integer: true, min: 1 });
}

function snapshotResponse(row: FinancialFactsSnapshot) {
  const persisted = {
    policyVersion: row.policyVersion,
    payloadSchemaId: row.payloadSchemaId,
    fundId: row.fundId,
    asOfDate: row.asOfDate,
    knowledgeCutoff: row.knowledgeCutoff.toISOString(),
    vehicleScope: row.vehicleScope,
    vehicleIds: row.vehicleIds,
    selectionSetHash: row.selectionSetHash,
    sourceFactsInputHash: row.sourceFactsInputHash,
    snapshotInputHash: row.snapshotInputHash,
    consumerEvaluations: row.consumerEvaluations,
    payload: row.payload,
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
  };
  PersistedFinancialFactsSnapshotV1Schema.parse(persisted);

  return PersistedFinancialFactsSnapshotV1Schema.parse({
    ...persisted,
    ...(row.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_1_0 ||
    row.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_2_0 ||
    row.policyVersion === FINANCIAL_FACTS_POLICY_VERSION_1_3_0
      ? { payloadSchemaId: row.payloadSchemaId }
      : { payloadSchemaId: undefined }),
  });
}

router.get(
  '/funds/:fundId/financial-facts/latest',
  financialFactsReadLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    const latest = await getLatestFinancialFactsSnapshot({ fundId });

    if (!latest) {
      return res.status(404).json({
        error: 'financial_facts_snapshot_not_found',
        message: `No accepted financial-facts snapshot exists for fund ${fundId}.`,
        details: { fundId },
      });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.json(snapshotResponse(latest));
  })
);

router.post(
  '/admin/funds/:fundId/financial-facts/snapshots',
  financialFactsWriteLimiter,
  requireAuth(),
  requireFundAccess,
  requireRole('admin'),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    const triggerId = req.header('Idempotency-Key')?.trim();
    if (!triggerId) {
      return res.status(400).json({
        error: 'idempotency_key_required',
        message: 'Idempotency-Key header is required',
      });
    }

    const parsedBody = CreateFinancialFactsSnapshotBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'invalid_financial_facts_snapshot_request',
        message: 'Financial-facts snapshot request is invalid',
        details: parsedBody.error.format(),
      });
    }

    try {
      const snapshot = await buildFinancialFactsSnapshot({
        fundId,
        asOfDate: parsedBody.data.asOfDate,
        actorId: actorId(req),
        idempotencyKey: `facts:${fundId}:${parsedBody.data.asOfDate}:${FINANCIAL_FACTS_POLICY_VERSION}:${triggerId}`,
        ...(parsedBody.data.vehicleIds === undefined
          ? {}
          : { vehicleIds: parsedBody.data.vehicleIds }),
        ...(parsedBody.data.knowledgeCutoff === undefined
          ? {}
          : { knowledgeCutoff: parsedBody.data.knowledgeCutoff }),
        ...(parsedBody.data.openingAccountingStateArtifactId === undefined
          ? {}
          : {
              openingAccountingStateArtifactId: parsedBody.data.openingAccountingStateArtifactId,
            }),
      });
      try {
        await triggerCurrentForecastShadowForFacts({ fundId, snapshot });
      } catch (error) {
        // Shadow is observational; a trigger implementation or persistence
        // failure must never turn a committed facts snapshot into an API error.
        routeLog.error({ err: error, fundId }, 'Current-forecast shadow trigger failed');
      }
      return res.status(200).json(snapshot);
    } catch (error) {
      if (
        error instanceof FinancialFactsSnapshotServiceError ||
        error instanceof OpeningAccountingStateArtifactError ||
        error instanceof IdempotentCommandError ||
        error instanceof FundScopeError ||
        error instanceof FundScopeKindNotImplementedError
      ) {
        return res.status(error.status).json({
          error: error.code,
          message: error.message,
          ...('details' in error && error.details !== undefined ? { details: error.details } : {}),
        });
      }
      throw error;
    }
  })
);

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (handleNumberParseError(error, res, 'Invalid parameter')) return;
  if (res.headersSent) return next(error);

  routeLog.error('Financial-facts API error:', error);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Failed to process financial-facts request',
  });
});

export default router;
