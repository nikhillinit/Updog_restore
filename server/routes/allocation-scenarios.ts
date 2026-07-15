import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { NextFunction } from 'express';
import {
  applyAllocationScenario,
  createAllocationScenario,
  createReserveIcDecision,
  getAllocationScenario,
  getAllocationScenarioApplyPreview,
  listAllocationScenarios,
  listReserveIcDecisions,
  syncAllocationScenario,
  updateReserveIcDecision,
  updateAllocationScenario,
} from '../services/allocation-scenario-service.js';
import {
  CreateReserveIcDecisionV1Schema,
  UpdateReserveIcDecisionV1Schema,
} from '@shared/contracts/reserve-ic-decision-v1.contract';
import { FundIdParamSchema } from '@shared/schemas/portfolio-route';
import { sendBodyValidationError } from '../lib/validation-response.js';
import { parseFundIdParam } from '@shared/number';
import { firstString } from '../lib/request-values';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { requireWriteRole } from '../lib/auth/jwt.js';

const WRITE_CONFIG_ROLES = ['partner', 'admin'] as const;
const WRITE_SCENARIO_ROLES = ['partner', 'admin', 'analyst'] as const;

interface HttpError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
  conflicts?: Array<{ company_id: number; expected_version: number; actual_version: number }>;
}

interface ValidationFailure {
  error: string;
  message: string;
}

interface FundRouteContext {
  fundId: number;
}

interface ScenarioRouteContext extends FundRouteContext {
  scenarioId: string;
}

interface DecisionRouteContext extends ScenarioRouteContext {
  decisionId: string;
}

interface DecisionAuditFields {
  decidedByUserId: number | null | undefined;
  decidedByLabel: string | null | undefined;
  decidedAt: string | null | undefined;
}

const router = Router();

// Fund-scope guard: every route on this router is keyed on :fundId and reads or
// writes stored per-fund data. Enforce fund scope once, at the param boundary,
// before any handler runs. The canonical parse (parseFundIdParam) runs here, so
// handlers never observe a non-canonical fundId. enforceProvidedFundScope
// re-verifies the bearer token and writes its own 401/403; it is used instead of
// requireFundAccess, which fails open on the registerRoutes surface (global auth
// sets req.context, not req.user).
router.param('fundId', async (req: Request, res: Response, next: NextFunction, value: string) => {
  try {
    const fundId = parseFundIdParam(firstString(value));
    if (fundId === null) {
      res.status(400).json({
        error: 'invalid_fund_id',
        message: 'Fund ID must be a positive integer',
      });
      return;
    }
    if (await enforceProvidedFundScope(req, res, fundId)) {
      next();
    }
    // on deny, enforceProvidedFundScope already wrote 401/403
  } catch (error) {
    next(error);
  }
});

function routeHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const ScenarioIdParamSchema = z.object({
  scenarioId: z.string().uuid(),
});

const DecisionIdParamSchema = z.object({
  decisionId: z.string().uuid(),
});

const AllocationScenarioSnapshotItemSchema = z.object({
  company_id: z.number().int().positive(),
  planned_reserves_cents: z.number().int().min(0),
  allocation_cap_cents: z.number().int().min(0).nullable(),
  allocation_reason: z.string().max(1000).nullable(),
});

const CreateAllocationScenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    notes: z.string().max(4000).nullable().optional(),
    source_allocation_version: z.number().int().min(1).nullable().optional(),
    snapshot_items: z.array(AllocationScenarioSnapshotItemSchema).min(1).max(500),
  })
  .refine(
    (value) =>
      value.snapshot_items.every((item) => {
        if (item.allocation_cap_cents === null) {
          return true;
        }

        return item.allocation_cap_cents >= item.planned_reserves_cents;
      }),
    {
      message: 'allocation_cap_cents must be >= planned_reserves_cents when set',
      path: ['snapshot_items'],
    }
  );

const UpdateAllocationScenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    notes: z.string().max(4000).nullable().optional(),
    source_allocation_version: z.number().int().min(1).nullable().optional(),
    snapshot_items: z.array(AllocationScenarioSnapshotItemSchema).min(1).max(500).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field must be provided',
  })
  .refine(
    (value) =>
      value.snapshot_items === undefined ||
      value.snapshot_items.every((item) => {
        if (item.allocation_cap_cents === null) {
          return true;
        }

        return item.allocation_cap_cents >= item.planned_reserves_cents;
      }),
    {
      message: 'allocation_cap_cents must be >= planned_reserves_cents when set',
      path: ['snapshot_items'],
    }
  );

const SyncAllocationScenarioSchema = z.object({
  note: z.string().max(4000).nullable().optional(),
});

const ApplyAllocationScenarioSchema = SyncAllocationScenarioSchema.extend({
  preview_token: z.string().regex(/^[a-f0-9]{64}$/),
});

function parseWithSchema<T>(
  res: Response,
  result: z.SafeParseReturnType<unknown, T>,
  validationFailure: ValidationFailure
): T | null {
  if (!result.success) {
    res.status(400).json({
      error: validationFailure.error,
      message: validationFailure.message,
      details: result.error.format(),
    });
    return null;
  }

  return result.data;
}

function parseFundRoute(req: Request, res: Response): FundRouteContext | null {
  const params = parseWithSchema(res, FundIdParamSchema.safeParse(req.params), {
    error: 'invalid_fund_id',
    message: 'Fund ID must be a positive integer',
  });
  if (!params) {
    return null;
  }

  return {
    fundId: params.fundId,
  };
}

function parseScenarioRoute(req: Request, res: Response): ScenarioRouteContext | null {
  const fundRoute = parseFundRoute(req, res);
  if (!fundRoute) {
    return null;
  }

  const params = parseWithSchema(res, ScenarioIdParamSchema.safeParse(req.params), {
    error: 'invalid_scenario_id',
    message: 'Scenario ID must be a UUID',
  });
  if (!params) {
    return null;
  }

  return {
    ...fundRoute,
    scenarioId: params.scenarioId,
  };
}

function parseDecisionRoute(req: Request, res: Response): DecisionRouteContext | null {
  const scenarioRoute = parseScenarioRoute(req, res);
  if (!scenarioRoute) {
    return null;
  }

  const params = parseWithSchema(res, DecisionIdParamSchema.safeParse(req.params), {
    error: 'invalid_decision_id',
    message: 'Decision ID must be a UUID',
  });
  if (!params) {
    return null;
  }

  return {
    ...scenarioRoute,
    decisionId: params.decisionId,
  };
}

function parseBody<TOutput>(
  res: Response,
  schema: z.ZodType<TOutput, z.ZodTypeDef, unknown>,
  payload: unknown,
  message: string
): TOutput | null {
  const body = schema.safeParse(payload);
  if (!body.success) {
    sendBodyValidationError(res, body.error, message);
    return null;
  }

  return body.data;
}

function parseActor(req: Request) {
  const rawUserId = req.user?.id as string | number | undefined;
  let user_id: number | null = null;

  if (typeof rawUserId === 'number' && Number.isSafeInteger(rawUserId) && rawUserId > 0) {
    user_id = rawUserId;
  } else if (typeof rawUserId === 'string' && /^\d+$/.test(rawUserId)) {
    const parsed = Number(rawUserId);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      user_id = parsed;
    }
  }

  const label =
    req.user?.email?.trim() ||
    req.user?.name?.trim() ||
    req.user?.sub?.trim() ||
    (typeof rawUserId === 'string' ? rawUserId.trim() : null) ||
    null;

  return {
    user_id,
    label,
  };
}

function assertDecisionFundMatchesRoute(fundId: number, decisionFundId: number) {
  if (decisionFundId !== fundId) {
    throw Object.assign(new Error('Decision fundId must match the route fundId'), {
      statusCode: 400,
      code: 'invalid_decision_fund',
    });
  }
}

function assertDecisionProvenanceMatchesScenario(
  scenarioId: string,
  sourceScenarioId: string | null | undefined
) {
  if (
    sourceScenarioId === undefined ||
    sourceScenarioId === null ||
    sourceScenarioId === scenarioId
  ) {
    return;
  }

  throw Object.assign(
    new Error('Decision provenance sourceScenarioId must match the route scenario'),
    {
      statusCode: 400,
      code: 'invalid_decision_provenance',
    }
  );
}

function getDecisionAuditDefaults(
  actor: ReturnType<typeof parseActor>,
  needsDecisionAudit: boolean,
  emptyValue: null | undefined
): DecisionAuditFields {
  if (!needsDecisionAudit) {
    return {
      decidedByUserId: emptyValue,
      decidedByLabel: emptyValue,
      decidedAt: emptyValue,
    };
  }

  return {
    decidedByUserId: actor.user_id ?? emptyValue,
    decidedByLabel: actor.label ?? emptyValue,
    decidedAt: new Date().toISOString(),
  };
}

function mergeDecisionAuditFields<T extends Partial<DecisionAuditFields>>(
  payload: T,
  defaults: DecisionAuditFields
) {
  return {
    decidedByUserId: payload.decidedByUserId ?? defaults.decidedByUserId,
    decidedByLabel: payload.decidedByLabel ?? defaults.decidedByLabel,
    decidedAt: payload.decidedAt ?? defaults.decidedAt,
  };
}

function normalizeReserveIcCreatePayload(
  fundId: number,
  scenarioId: string,
  payload: z.infer<typeof CreateReserveIcDecisionV1Schema>,
  actor: ReturnType<typeof parseActor>
) {
  assertDecisionFundMatchesRoute(fundId, payload.fundId);
  assertDecisionProvenanceMatchesScenario(scenarioId, payload.provenance.sourceScenarioId);

  const auditFields = mergeDecisionAuditFields(
    payload,
    getDecisionAuditDefaults(
      actor,
      payload.decisionStatus === 'approved' || payload.decisionStatus === 'rejected',
      null
    )
  );

  return {
    ...payload,
    ...auditFields,
    provenance: {
      ...payload.provenance,
      sourceScenarioId: scenarioId,
    },
  };
}

function normalizeReserveIcUpdatePayload(
  scenarioId: string,
  payload: z.infer<typeof UpdateReserveIcDecisionV1Schema>,
  actor: ReturnType<typeof parseActor>
) {
  assertDecisionProvenanceMatchesScenario(scenarioId, payload.provenance?.sourceScenarioId);

  const auditFields = mergeDecisionAuditFields(
    payload,
    getDecisionAuditDefaults(
      actor,
      payload.decisionStatus === 'approved' || payload.decisionStatus === 'rejected',
      undefined
    )
  );

  return {
    ...payload,
    ...auditFields,
    provenance:
      payload.provenance !== undefined
        ? {
            ...payload.provenance,
            sourceScenarioId: scenarioId,
          }
        : payload.provenance,
  };
}

function getErrorKey(statusCode?: number) {
  switch (statusCode) {
    case 400:
      return 'invalid_request';
    case 404:
      return 'not_found';
    default:
      return 'internal_error';
  }
}

router.get(
  '/funds/:fundId/allocation-scenarios',
  routeHandler(async (req: Request, res: Response) => {
    const route = parseFundRoute(req, res);
    if (!route) {
      return;
    }

    const scenarios = await listAllocationScenarios(route.fundId);
    res.status(200).json({ scenarios });
  })
);

router.get(
  '/funds/:fundId/allocation-scenarios/:scenarioId',
  routeHandler(async (req: Request, res: Response) => {
    const route = parseScenarioRoute(req, res);
    if (!route) {
      return;
    }

    const scenario = await getAllocationScenario(route.fundId, route.scenarioId);
    res.status(200).json(scenario);
  })
);

router.get(
  '/funds/:fundId/allocation-scenarios/:scenarioId/decisions',
  routeHandler(async (req: Request, res: Response) => {
    const route = parseScenarioRoute(req, res);
    if (!route) {
      return;
    }

    const decisions = await listReserveIcDecisions(route.fundId, route.scenarioId);
    res.status(200).json({ decisions });
  })
);

router.get(
  '/funds/:fundId/allocation-scenarios/:scenarioId/apply-preview',
  routeHandler(async (req: Request, res: Response) => {
    const route = parseScenarioRoute(req, res);
    if (!route) {
      return;
    }

    const preview = await getAllocationScenarioApplyPreview(route.fundId, route.scenarioId);
    res.status(200).json(preview);
  })
);

router.post(
  '/funds/:fundId/allocation-scenarios',
  requireWriteRole(WRITE_SCENARIO_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const route = parseFundRoute(req, res);
    if (!route) {
      return;
    }

    const body = parseBody(
      res,
      CreateAllocationScenarioSchema,
      req.body,
      'Invalid allocation scenario payload'
    );
    if (!body) {
      return;
    }

    const scenario = await createAllocationScenario(route.fundId, body);
    return res.status(201).json(scenario);
  })
);

router.post(
  '/funds/:fundId/allocation-scenarios/:scenarioId/decisions',
  requireWriteRole(WRITE_CONFIG_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const route = parseScenarioRoute(req, res);
    if (!route) {
      return;
    }

    const body = parseBody(
      res,
      CreateReserveIcDecisionV1Schema,
      req.body,
      'Invalid Reserve IC decision payload'
    );
    if (!body) {
      return;
    }

    const decision = await createReserveIcDecision(
      route.fundId,
      route.scenarioId,
      normalizeReserveIcCreatePayload(route.fundId, route.scenarioId, body, parseActor(req))
    );
    return res.status(201).json(decision);
  })
);

router.patch(
  '/funds/:fundId/allocation-scenarios/:scenarioId',
  requireWriteRole(WRITE_SCENARIO_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const route = parseScenarioRoute(req, res);
    if (!route) {
      return;
    }

    const body = parseBody(
      res,
      UpdateAllocationScenarioSchema,
      req.body,
      'Invalid allocation scenario payload'
    );
    if (!body) {
      return;
    }

    const scenario = await updateAllocationScenario(route.fundId, route.scenarioId, body);
    return res.status(200).json(scenario);
  })
);

router.patch(
  '/funds/:fundId/allocation-scenarios/:scenarioId/decisions/:decisionId',
  requireWriteRole(WRITE_CONFIG_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const route = parseDecisionRoute(req, res);
    if (!route) {
      return;
    }

    const body = parseBody(
      res,
      UpdateReserveIcDecisionV1Schema,
      req.body,
      'Invalid Reserve IC decision payload'
    );
    if (!body) {
      return;
    }

    const decision = await updateReserveIcDecision(
      route.fundId,
      route.scenarioId,
      route.decisionId,
      normalizeReserveIcUpdatePayload(route.scenarioId, body, parseActor(req))
    );
    return res.status(200).json(decision);
  })
);

router.post(
  '/funds/:fundId/allocation-scenarios/:scenarioId/sync',
  requireWriteRole(WRITE_SCENARIO_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const route = parseScenarioRoute(req, res);
    if (!route) {
      return;
    }

    const body = parseBody(
      res,
      SyncAllocationScenarioSchema,
      req.body ?? {},
      'Invalid allocation scenario action payload'
    );
    if (!body) {
      return;
    }

    const result = await syncAllocationScenario(route.fundId, route.scenarioId, {
      ...body,
      actor: parseActor(req),
    });
    return res.status(200).json(result);
  })
);

router.post(
  '/funds/:fundId/allocation-scenarios/:scenarioId/apply',
  requireWriteRole(WRITE_CONFIG_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const route = parseScenarioRoute(req, res);
    if (!route) {
      return;
    }

    const body = parseBody(
      res,
      ApplyAllocationScenarioSchema,
      req.body,
      'Invalid allocation scenario action payload'
    );
    if (!body) {
      return;
    }

    const result = await applyAllocationScenario(route.fundId, route.scenarioId, {
      ...body,
      actor: parseActor(req),
    });
    return res.status(200).json(result);
  })
);

router.use((error: HttpError, _req: Request, res: Response, _next: unknown) => {
  if (error.statusCode === 409) {
    return res.status(409).json({
      error: 'conflict',
      code: error.code ?? 'conflict',
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      ...(error.conflicts ? { conflicts: error.conflicts } : {}),
    });
  }

  res.status(error.statusCode ?? 500).json({
    error: getErrorKey(error.statusCode),
    ...(error.code ? { code: error.code } : {}),
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
  });
});

export default router;
