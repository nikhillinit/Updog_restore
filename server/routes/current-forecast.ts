import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { toNumber } from '@shared/number';
import { requireAuth, requireFundAccess } from '../lib/auth/jwt.js';
import { FundScopeError } from '../lib/fund-scoped-ownership';
import { IdempotentCommandError } from '../lib/idempotent-command';
import { handleNumberParseError } from '../lib/number-parse-error';
import { createRouteLogger } from '../lib/route-logger.js';
import {
  CurrentPlanVersionServiceError,
  getCurrentPlanVersions,
  mintCurrentPlanVersion,
} from '../services/current-plan-version-service';
import {
  CurrentForecastV2ServiceError,
  runCurrentForecastV2,
} from '../services/current-forecast-v2-service';

const routeLog = createRouteLogger('current-forecast');
const router = Router();

const currentForecastReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const currentForecastWriteLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const MintCurrentPlanVersionBodySchema = z
  .object({
    asOfDate: z.string().date().optional(),
  })
  .strict();

const RunCurrentForecastV2BodySchema = z
  .object({
    currentPlanVersionId: z.string().optional(),
    financialFactsSnapshotId: z.string().optional(),
    clock: z.string().datetime().optional(),
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

function currentPlanVersionErrorStatus(error: CurrentPlanVersionServiceError): 409 | 422 {
  switch (error.code) {
    case 'NO_PUBLISHED_CONFIG':
    case 'CURRENT_PLAN_HEAD_CONFLICT':
      return 409;
    case 'NO_FACTS_SNAPSHOT':
    case 'PLAN_DERIVATION_INCOMPLETE':
    case 'OWNERSHIP_STRATEGY_UNSUPPORTED':
    case 'FEE_PROFILE_ABSENT':
      return 422;
  }
}

function currentForecastErrorStatus(error: CurrentForecastV2ServiceError): 409 | 422 {
  switch (error.code) {
    case 'NO_CURRENT_PLAN_VERSION':
    case 'CURRENT_FORECAST_BASIS_MISMATCH':
      return 409;
    case 'NO_FACTS_SNAPSHOT':
      return 422;
  }
}

function respondToTypedError(error: unknown, res: Response): boolean {
  if (error instanceof CurrentPlanVersionServiceError) {
    res.status(currentPlanVersionErrorStatus(error)).json({
      error: error.code,
      message: error.message,
      ...(error.missingFields === undefined
        ? {}
        : { details: { missingFields: error.missingFields } }),
    });
    return true;
  }
  if (error instanceof CurrentForecastV2ServiceError) {
    res.status(currentForecastErrorStatus(error)).json({
      error: error.code,
      message: error.message,
      ...(error.basisMismatchCode === undefined
        ? {}
        : { details: { basisMismatchCode: error.basisMismatchCode } }),
    });
    return true;
  }
  if (error instanceof FundScopeError) {
    res.status(404).json({
      error: error.code,
      message: error.message,
    });
    return true;
  }
  if (error instanceof IdempotentCommandError) {
    res.status(409).json({
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return true;
  }
  return false;
}

router.get(
  '/funds/:fundId/current-plan-versions',
  currentForecastReadLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    const versions = await getCurrentPlanVersions({ fundId });

    res.setHeader('Cache-Control', 'private, no-store');
    return res.json(versions);
  })
);

router.post(
  '/funds/:fundId/current-plan-versions',
  currentForecastWriteLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    const idempotencyKey = req.header('Idempotency-Key')?.trim();
    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'idempotency_key_required',
        message: 'Idempotency-Key header is required',
      });
    }

    const parsedBody = MintCurrentPlanVersionBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'invalid_current_plan_version_request',
        message: 'Current plan version request is invalid',
        details: parsedBody.error.format(),
      });
    }

    try {
      const version = await mintCurrentPlanVersion({
        fundId,
        idempotencyKey,
        actorId: actorId(req),
        ...(parsedBody.data.asOfDate === undefined ? {} : { asOfDate: parsedBody.data.asOfDate }),
      });
      return res.status(200).json(version);
    } catch (error) {
      if (respondToTypedError(error, res)) return;
      throw error;
    }
  })
);

router.post(
  '/funds/:fundId/current-forecast/runs',
  currentForecastWriteLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    const parsedBody = RunCurrentForecastV2BodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'invalid_current_forecast_request',
        message: 'Current forecast request is invalid',
        details: parsedBody.error.format(),
      });
    }

    try {
      const forecast = await runCurrentForecastV2({
        fundId,
        clock: parsedBody.data.clock ?? new Date().toISOString(),
        ...(parsedBody.data.currentPlanVersionId === undefined
          ? {}
          : { currentPlanVersionId: parsedBody.data.currentPlanVersionId }),
        ...(parsedBody.data.financialFactsSnapshotId === undefined
          ? {}
          : { financialFactsSnapshotId: parsedBody.data.financialFactsSnapshotId }),
      });
      return res.status(200).json(forecast);
    } catch (error) {
      if (respondToTypedError(error, res)) return;
      throw error;
    }
  })
);

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (handleNumberParseError(error, res, 'Invalid parameter')) return;
  if (res.headersSent) return next(error);

  routeLog.error('Current-forecast API error:', error);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Failed to process current-forecast request',
  });
});

export default router;
