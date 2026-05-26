import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ArchiveFundScenarioSetV1Schema,
  CreateFundScenarioSetV1Schema,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { FundIdParamSchema } from '@shared/schemas/portfolio-route';
import { requireAuth, requireFundAccess } from '../lib/auth/jwt';
import { firstString } from '../lib/request-values.js';
import { sendBodyValidationError } from '../lib/validation-response.js';
import {
  archiveFundScenarioSet,
  getFundScenarioSet,
  listFundScenarioSets,
} from '../services/fund-scenario-set-service.js';
import { createFundScenarioSet } from '../services/fund-scenario-set-create-service.js';

interface HttpError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

const router = Router();

const ScenarioSetIdParamSchema = z.object({
  scenarioSetId: z.string().uuid(),
});

function routeHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function parseFundId(req: Request, res: Response): number | null {
  const parsed = FundIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_fund_id',
      message: 'Fund ID must be a positive integer',
    });
    return null;
  }

  return parsed.data.fundId;
}

function parseScenarioSetId(req: Request, res: Response): string | null {
  const parsed = ScenarioSetIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_scenario_set_id',
      message: 'Scenario set ID must be a UUID',
    });
    return null;
  }

  return parsed.data.scenarioSetId;
}

function parseNumericUserId(rawUserId: string | number | undefined): number | null {
  if (typeof rawUserId === 'number' && Number.isSafeInteger(rawUserId) && rawUserId > 0) {
    return rawUserId;
  }

  if (typeof rawUserId === 'string' && /^\d+$/.test(rawUserId)) {
    const parsed = Number(rawUserId);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseActor(req: Request) {
  const rawUserId = req.user?.id as string | number | undefined;
  const label =
    req.user?.email?.trim() ||
    req.user?.name?.trim() ||
    req.user?.sub?.trim() ||
    (typeof rawUserId === 'string' ? rawUserId.trim() : null) ||
    null;

  return {
    userId: parseNumericUserId(rawUserId),
    label,
  };
}

function getIdempotencyKey(req: Request): string | null {
  const headerValue =
    firstString(req.headers['idempotency-key']) ?? firstString(req.headers['x-idempotency-key']);
  const trimmed = headerValue?.trim();
  return trimmed ? trimmed : null;
}

function statusForError(statusCode?: number, code?: string) {
  if (code === 'idempotency_key_reused') {
    return code;
  }

  switch (statusCode) {
    case 400:
      return 'invalid_request';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'unprocessable_entity';
    default:
      return 'internal_error';
  }
}

router.get(
  '/funds/:fundId/scenario-sets',
  requireAuth(),
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const includeArchived = req.query['includeArchived'] === 'true';
    const scenarioSets = await listFundScenarioSets(fundId, { includeArchived });
    return res.status(200).json({ scenarioSets });
  })
);

router.get(
  '/funds/:fundId/scenario-sets/:scenarioSetId',
  requireAuth(),
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    const scenarioSetId = parseScenarioSetId(req, res);
    if (fundId === null || scenarioSetId === null) {
      return;
    }

    const scenarioSet = await getFundScenarioSet(fundId, scenarioSetId);
    return res.status(200).json(scenarioSet);
  })
);

router.post(
  '/funds/:fundId/scenario-sets',
  requireAuth(),
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const parsed = CreateFundScenarioSetV1Schema.safeParse(req.body);
    if (!parsed.success) {
      sendBodyValidationError(res, parsed.error, 'Invalid fund scenario set payload');
      return;
    }

    const scenarioSet = await createFundScenarioSet(fundId, parsed.data, parseActor(req), {
      idempotencyKey: getIdempotencyKey(req),
    });
    return res.status(201).json(scenarioSet);
  })
);

router.post(
  '/funds/:fundId/scenario-sets/:scenarioSetId/archive',
  requireAuth(),
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    const scenarioSetId = parseScenarioSetId(req, res);
    if (fundId === null || scenarioSetId === null) {
      return;
    }

    const parsed = ArchiveFundScenarioSetV1Schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendBodyValidationError(res, parsed.error, 'Invalid fund scenario set archive payload');
      return;
    }

    const scenarioSet = await archiveFundScenarioSet(
      fundId,
      scenarioSetId,
      parseActor(req),
      parsed.data
    );
    return res.status(200).json(scenarioSet);
  })
);

router.use((error: HttpError, _req: Request, res: Response, _next: unknown) => {
  res.status(error.statusCode ?? 500).json({
    error: statusForError(error.statusCode, error.code),
    ...(error.code ? { code: error.code } : {}),
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
  });
});

export default router;
