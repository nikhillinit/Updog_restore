import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async.js';
import {
  createAllocationScenario,
  getAllocationScenario,
  listAllocationScenarios,
  updateAllocationScenario,
} from '../services/allocation-scenario-service.js';

interface HttpError extends Error {
  statusCode?: number;
}

const router = Router();

const FundIdParamSchema = z.object({
  fundId: z.string().regex(/^\d+$/).transform(Number),
});

const ScenarioIdParamSchema = z.object({
  scenarioId: z.string().uuid(),
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

router.get(
  '/funds/:fundId/allocation-scenarios',
  asyncHandler(async (req: Request, res: Response) => {
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
  asyncHandler(async (req: Request, res: Response) => {
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

router.post(
  '/funds/:fundId/allocation-scenarios',
  asyncHandler(async (req: Request, res: Response) => {
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

router.patch(
  '/funds/:fundId/allocation-scenarios/:scenarioId',
  asyncHandler(async (req: Request, res: Response) => {
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

router.use((error: HttpError, _req: Request, res: Response, _next: unknown) => {
  res.status(error.statusCode ?? 500).json({
    error: error.statusCode === 404 ? 'not_found' : 'internal_error',
    message: error.message,
  });
});

export default router;
