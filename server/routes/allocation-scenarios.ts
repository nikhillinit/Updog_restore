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

interface HttpError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
  conflicts?: Array<{ company_id: number; expected_version: number; actual_version: number }>;
}

const router = Router();

function routeHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const FundIdParamSchema = z.object({
  fundId: z.string().regex(/^\d+$/).transform(Number),
});

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

function parseFundId(req: Request, res: Response): number | null {
  const result = FundIdParamSchema.safeParse(req.params);
  if (!result.success) {
    res.status(400).json({
      error: 'invalid_fund_id',
      message: 'Fund ID must be a positive integer',
      details: result.error.format(),
    });
    return null;
  }

  return result.data.fundId;
}

function parseScenarioId(req: Request, res: Response): string | null {
  const result = ScenarioIdParamSchema.safeParse(req.params);
  if (!result.success) {
    res.status(400).json({
      error: 'invalid_scenario_id',
      message: 'Scenario ID must be a UUID',
      details: result.error.format(),
    });
    return null;
  }

  return result.data.scenarioId;
}

function parseDecisionId(req: Request, res: Response): string | null {
  const result = DecisionIdParamSchema.safeParse(req.params);
  if (!result.success) {
    res.status(400).json({
      error: 'invalid_decision_id',
      message: 'Decision ID must be a UUID',
      details: result.error.format(),
    });
    return null;
  }

  return result.data.decisionId;
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

function normalizeReserveIcCreatePayload(
  fundId: number,
  scenarioId: string,
  payload: z.infer<typeof CreateReserveIcDecisionV1Schema>,
  actor: ReturnType<typeof parseActor>
) {
  if (payload.fundId !== fundId) {
    throw Object.assign(new Error('Decision fundId must match the route fundId'), {
      statusCode: 400,
      code: 'invalid_decision_fund',
    });
  }

  if (
    payload.provenance.sourceScenarioId !== null &&
    payload.provenance.sourceScenarioId !== scenarioId
  ) {
    throw Object.assign(new Error('Decision provenance sourceScenarioId must match the route scenario'), {
      statusCode: 400,
      code: 'invalid_decision_provenance',
    });
  }

  const needsDecisionAudit =
    payload.decisionStatus === 'approved' || payload.decisionStatus === 'rejected';

  return {
    ...payload,
    decidedByUserId:
      payload.decidedByUserId ?? (needsDecisionAudit ? actor.user_id ?? null : null),
    decidedByLabel:
      payload.decidedByLabel ?? (needsDecisionAudit ? actor.label ?? null : null),
    decidedAt: payload.decidedAt ?? (needsDecisionAudit ? new Date().toISOString() : null),
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
  if (
    payload.provenance?.sourceScenarioId !== undefined &&
    payload.provenance.sourceScenarioId !== null &&
    payload.provenance.sourceScenarioId !== scenarioId
  ) {
    throw Object.assign(new Error('Decision provenance sourceScenarioId must match the route scenario'), {
      statusCode: 400,
      code: 'invalid_decision_provenance',
    });
  }

  const nextStatus = payload.decisionStatus;
  const needsDecisionAudit = nextStatus === 'approved' || nextStatus === 'rejected';

  return {
    ...payload,
    decidedByUserId:
      payload.decidedByUserId ?? (needsDecisionAudit ? actor.user_id ?? null : undefined),
    decidedByLabel:
      payload.decidedByLabel ?? (needsDecisionAudit ? actor.label ?? null : undefined),
    decidedAt:
      payload.decidedAt ?? (needsDecisionAudit ? new Date().toISOString() : undefined),
    provenance:
      payload.provenance !== undefined
        ? {
            ...payload.provenance,
            sourceScenarioId: scenarioId,
          }
        : payload.provenance,
  };
}

router.get(
  '/funds/:fundId/allocation-scenarios',
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const scenarios = await listAllocationScenarios(fundId);
    res.status(200).json({ scenarios });
  })
);

router.get(
  '/funds/:fundId/allocation-scenarios/:scenarioId',
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const scenarioId = parseScenarioId(req, res);
    if (scenarioId === null) {
      return;
    }

    const scenario = await getAllocationScenario(fundId, scenarioId);
    res.status(200).json(scenario);
  })
);

router.get(
  '/funds/:fundId/allocation-scenarios/:scenarioId/decisions',
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const scenarioId = parseScenarioId(req, res);
    if (scenarioId === null) {
      return;
    }

    const decisions = await listReserveIcDecisions(fundId, scenarioId);
    res.status(200).json({ decisions });
  })
);

router.get(
  '/funds/:fundId/allocation-scenarios/:scenarioId/apply-preview',
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const scenarioId = parseScenarioId(req, res);
    if (scenarioId === null) {
      return;
    }

    const preview = await getAllocationScenarioApplyPreview(fundId, scenarioId);
    res.status(200).json(preview);
  })
);

router.post(
  '/funds/:fundId/allocation-scenarios',
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const body = CreateAllocationScenarioSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid allocation scenario payload',
        details: body.error.format(),
      });
    }

    const scenario = await createAllocationScenario(fundId, body.data);
    return res.status(201).json(scenario);
  })
);

router.post(
  '/funds/:fundId/allocation-scenarios/:scenarioId/decisions',
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const scenarioId = parseScenarioId(req, res);
    if (scenarioId === null) {
      return;
    }

    const body = CreateReserveIcDecisionV1Schema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid Reserve IC decision payload',
        details: body.error.format(),
      });
    }

    const decision = await createReserveIcDecision(
      fundId,
      scenarioId,
      normalizeReserveIcCreatePayload(fundId, scenarioId, body.data, parseActor(req))
    );
    return res.status(201).json(decision);
  })
);

router.patch(
  '/funds/:fundId/allocation-scenarios/:scenarioId',
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const scenarioId = parseScenarioId(req, res);
    if (scenarioId === null) {
      return;
    }

    const body = UpdateAllocationScenarioSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid allocation scenario payload',
        details: body.error.format(),
      });
    }

    const scenario = await updateAllocationScenario(fundId, scenarioId, body.data);
    return res.status(200).json(scenario);
  })
);

router.patch(
  '/funds/:fundId/allocation-scenarios/:scenarioId/decisions/:decisionId',
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const scenarioId = parseScenarioId(req, res);
    if (scenarioId === null) {
      return;
    }

    const decisionId = parseDecisionId(req, res);
    if (decisionId === null) {
      return;
    }

    const body = UpdateReserveIcDecisionV1Schema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid Reserve IC decision payload',
        details: body.error.format(),
      });
    }

    const decision = await updateReserveIcDecision(
      fundId,
      scenarioId,
      decisionId,
      normalizeReserveIcUpdatePayload(scenarioId, body.data, parseActor(req))
    );
    return res.status(200).json(decision);
  })
);

router.post(
  '/funds/:fundId/allocation-scenarios/:scenarioId/sync',
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const scenarioId = parseScenarioId(req, res);
    if (scenarioId === null) {
      return;
    }

    const body = SyncAllocationScenarioSchema.safeParse(req.body ?? {});
    if (!body.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid allocation scenario action payload',
        details: body.error.format(),
      });
    }

    const result = await syncAllocationScenario(fundId, scenarioId, {
      ...body.data,
      actor: parseActor(req),
    });
    return res.status(200).json(result);
  })
);

router.post(
  '/funds/:fundId/allocation-scenarios/:scenarioId/apply',
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) {
      return;
    }

    const scenarioId = parseScenarioId(req, res);
    if (scenarioId === null) {
      return;
    }

    const body = ApplyAllocationScenarioSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        error: 'invalid_request_body',
        message: 'Invalid allocation scenario action payload',
        details: body.error.format(),
      });
    }

    const result = await applyAllocationScenario(fundId, scenarioId, {
      ...body.data,
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
    error:
      error.statusCode === 400
        ? 'invalid_request'
        : error.statusCode === 404
          ? 'not_found'
          : 'internal_error',
    ...(error.code ? { code: error.code } : {}),
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
  });
});

export default router;
