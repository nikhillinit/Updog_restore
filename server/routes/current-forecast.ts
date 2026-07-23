import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { toNumber } from '@shared/number';
import { requireAuth, requireFundAccess, requireRole } from '../lib/auth/jwt.js';
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
import {
  FundCalculationModeBlockedError,
  FundCalculationModeIdempotencyConflictError,
  FundCalculationModeInProgressError,
  FundCalculationModeVersionConflictError,
  updateCurrentForecastCalculationMode,
} from '../services/fund-calculation-mode-service';
import {
  CurrentForecastActivationBlockedError,
  CurrentForecastReferenceError,
  activateCurrentForecast,
  createRollbackCurrentForecastReference,
} from '../services/current-forecast-reference-service';

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

const CurrentForecastModeUpdateBodySchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    configuredMode: z.enum(['off', 'shadow', 'on']),
    killSwitchActive: z.boolean().optional(),
  })
  .strict();

const CurrentForecastReferenceBodySchema = z
  .object({
    sourceReferenceId: z.number().int().positive(),
    reason: z.string().min(1),
  })
  .strict();

const CurrentForecastActivateBodySchema = z
  .object({
    referenceId: z.number().int().positive(),
    expectedVersion: z.number().int().nonnegative(),
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

router.put(
  '/admin/funds/:fundId/calculation-modes/current-forecast',
  currentForecastWriteLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  requireRole('admin'),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    const idempotencyKey = req.header('Idempotency-Key')?.trim();
    if (!idempotencyKey) {
      return res.status(428).json({
        error: 'idempotency_key_required',
        message: 'Idempotency-Key header is required',
      });
    }

    const parsedBody = CurrentForecastModeUpdateBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'invalid_mode_update',
        message: 'Current forecast calculation mode update payload is invalid',
        details: parsedBody.error.format(),
      });
    }

    // R22 refusal (13.1-svc): off|shadow -> on never goes through the mode
    // route; only the activation command writes `on`, atomically with the
    // activation event (activated_at + cutover_reference_id + candidate flip).
    if (parsedBody.data.configuredMode === 'on') {
      return res.status(409).json({
        error: 'activation_command_required',
        message:
          'current-forecast cannot be set to on via the mode route; the activation command writes the cutover event atomically',
      });
    }

    try {
      const params: Parameters<typeof updateCurrentForecastCalculationMode>[0] = {
        fundId,
        expectedVersion: parsedBody.data.expectedVersion,
        configuredMode: parsedBody.data.configuredMode,
        idempotencyKey,
        actorId: actorId(req),
        ...(parsedBody.data.killSwitchActive !== undefined && {
          killSwitchActive: parsedBody.data.killSwitchActive,
        }),
      };
      const result = await updateCurrentForecastCalculationMode(params);
      return res.status(200).json({ ...result.response, replayed: result.replayed });
    } catch (error) {
      if (error instanceof FundCalculationModeVersionConflictError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
          expectedVersion: error.expectedVersion,
          actualVersion: error.actualVersion,
        });
      }
      if (error instanceof FundCalculationModeBlockedError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
          blockers: error.blockers,
        });
      }
      if (
        error instanceof FundCalculationModeIdempotencyConflictError ||
        error instanceof FundCalculationModeInProgressError
      ) {
        return res.status(409).json({ error: error.code, message: error.message });
      }
      throw error;
    }
  })
);

router.post(
  '/admin/funds/:fundId/current-forecast/references',
  currentForecastWriteLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  requireRole('admin'),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    const idempotencyKey = req.header('Idempotency-Key')?.trim();
    if (!idempotencyKey) {
      return res.status(428).json({
        error: 'idempotency_key_required',
        message: 'Idempotency-Key header is required',
      });
    }

    const parsedBody = CurrentForecastReferenceBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'invalid_reference_request',
        message: 'Current forecast reference request is invalid',
        details: parsedBody.error.format(),
      });
    }

    try {
      const result = await createRollbackCurrentForecastReference({
        fundId,
        sourceReferenceId: parsedBody.data.sourceReferenceId,
        reason: parsedBody.data.reason,
        idempotencyKey,
        createdBy: actorId(req),
      });
      return res.status(200).json({ reference: result.row, replayed: result.replayed });
    } catch (error) {
      if (error instanceof CurrentForecastReferenceError) {
        return res.status(error.status).json({ error: error.code, message: error.message });
      }
      if (respondToTypedError(error, res)) return;
      throw error;
    }
  })
);

// DORMANT (PLAN_61 Task 13.1-svc): shipped unused; executed only by Task 23.
router.post(
  '/admin/funds/:fundId/current-forecast/activate',
  currentForecastWriteLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  requireRole('admin'),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    const idempotencyKey = req.header('Idempotency-Key')?.trim();
    if (!idempotencyKey) {
      return res.status(428).json({
        error: 'idempotency_key_required',
        message: 'Idempotency-Key header is required',
      });
    }

    const parsedBody = CurrentForecastActivateBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'invalid_activation_request',
        message: 'Current forecast activation request is invalid',
        details: parsedBody.error.format(),
      });
    }

    try {
      const result = await activateCurrentForecast({
        fundId,
        referenceId: parsedBody.data.referenceId,
        expectedVersion: parsedBody.data.expectedVersion,
        idempotencyKey,
        actorId: actorId(req),
      });
      return res.status(200).json({ ...result.response, replayed: result.replayed });
    } catch (error) {
      if (error instanceof FundCalculationModeVersionConflictError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
          expectedVersion: error.expectedVersion,
          actualVersion: error.actualVersion,
        });
      }
      if (error instanceof CurrentForecastActivationBlockedError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
          blockers: error.blockers,
        });
      }
      if (error instanceof CurrentForecastReferenceError) {
        return res.status(error.status).json({ error: error.code, message: error.message });
      }
      if (
        error instanceof FundCalculationModeIdempotencyConflictError ||
        error instanceof FundCalculationModeInProgressError
      ) {
        return res.status(409).json({ error: error.code, message: error.message });
      }
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
