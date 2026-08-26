import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import {
  PlanningFmvOverrideCreateRequestSchema,
  PlanningFmvOverrideLatestQuerySchema,
} from '@shared/contracts/lp-reporting';
import { parseFundIdParam } from '@shared/number';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { requireAuth } from '../lib/auth/jwt';
import { firstString } from '../lib/request-values';
import { sendBodyValidationError } from '../lib/validation-response';
import {
  createPlanningFmvOverride,
  listLatestPlanningFmvOverrides,
  PlanningFmvOverrideError,
} from '../services/lp-reporting/planning-fmv-override-service';

const router = Router();

function routeHandler(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function parseRouteFundId(req: Request, res: Response): number | null {
  const fundId = parseFundIdParam(firstString(req.params['fundId']));
  if (fundId === null) {
    res.status(400).json({
      error: 'invalid_fund_id',
      message: 'Fund ID must be a positive integer',
    });
    return null;
  }
  return fundId;
}

function requirePlanningFmvFundAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const fundId = parseRouteFundId(req, res);
    if (fundId === null) {
      return;
    }

    void Promise.resolve(enforceProvidedFundScope(req, res, fundId))
      .then((allowed) => {
        if (allowed) {
          next();
        }
      })
      .catch(next);
  } catch (error) {
    next(error);
  }
}

function parseActorUserId(req: Request): number | null {
  const rawUserId = req.user?.id;
  if (typeof rawUserId === 'number' && Number.isSafeInteger(rawUserId) && rawUserId > 0) {
    return rawUserId;
  }
  if (typeof rawUserId === 'string' && /^[1-9]\d*$/.test(rawUserId)) {
    const parsed = Number(rawUserId);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export function enforcePlanningFmvApprovalAuthority(req: Request, res: Response): boolean {
  const role = req.user?.role;
  const roles = req.user?.roles ?? [];
  if (role === 'admin' || roles.includes('admin')) {
    return true;
  }

  res.status(403).json({
    error: 'planning_fmv_approval_forbidden',
    code: 'planning_fmv_approval_forbidden',
    message: 'Planning FMV overrides require admin approval authority.',
  });
  return false;
}

function idempotencyKeyFrom(req: Request): string | null {
  const headerValue = firstString(req.headers['idempotency-key']);
  const trimmed = headerValue?.trim();
  return trimmed ? trimmed : null;
}

router.post(
  '/funds/:fundId/planning/fmv-overrides',
  requireAuth(),
  requirePlanningFmvFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseRouteFundId(req, res);
    if (fundId === null) {
      return;
    }
    if (!enforcePlanningFmvApprovalAuthority(req, res)) {
      return;
    }

    const idempotencyKey = idempotencyKeyFrom(req);
    if (idempotencyKey === null) {
      res.status(428).json({
        error: 'planning_fmv_idempotency_key_required',
        code: 'planning_fmv_idempotency_key_required',
        message: 'Idempotency-Key header is required for Planning FMV overrides.',
      });
      return;
    }

    const parsed = PlanningFmvOverrideCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendBodyValidationError(res, parsed.error, 'Invalid Planning FMV override payload');
      return;
    }

    const result = await createPlanningFmvOverride({
      fundId,
      idempotencyKey,
      actor: { userId: parseActorUserId(req) },
      body: parsed.data,
    });
    res.status(result.replayed ? 200 : 201).json(result);
  })
);

router.get(
  '/funds/:fundId/planning/fmv-overrides/latest',
  requireAuth(),
  requirePlanningFmvFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseRouteFundId(req, res);
    if (fundId === null) {
      return;
    }

    const parsed = PlanningFmvOverrideLatestQuerySchema.safeParse({
      asOfDate: firstString(req.query['asOfDate']),
    });
    if (!parsed.success) {
      sendBodyValidationError(res, parsed.error, 'Invalid Planning FMV override query');
      return;
    }

    const asOfDate = parsed.data.asOfDate ?? new Date().toISOString().slice(0, 10);
    const result = await listLatestPlanningFmvOverrides(fundId, asOfDate);
    res.status(200).json(result);
  })
);

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof PlanningFmvOverrideError) {
    res.status(error.status).json({
      error: error.code,
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
    return;
  }
  next(error);
});

export default router;
