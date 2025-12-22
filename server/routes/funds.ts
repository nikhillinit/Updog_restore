/* eslint-disable @typescript-eslint/no-explicit-any */




import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { idempotency } from '../middleware/idempotency';
import { z } from 'zod';
import { positiveInt, percent100 } from '@shared/schema-helpers';
import { hashPayload } from '../lib/hash';
import { idem } from '../shared/idempotency-instance';
import { getOrStart } from '../lib/inflight-server';
import { EnhancedFundModel } from '../core/enhanced-fund-model';
import { calcDurationMs } from '../metrics';
import { storage } from '../storage';

const router = Router();

// Schema for creating a fund with full configuration
const CreateFundSchema = z.object({
  // Basic fund information
  name: z.string().min(1, 'Fund name is required'),
  size: z.number().positive('Fund size must be positive'),
  managementFee: z.number().min(0).max(0.1).default(0.02), // 0-10%, default 2%
  carryPercentage: z.number().min(0).max(0.5).default(0.20), // 0-50%, default 20%
  vintageYear: z.number().int().min(2000).max(2100).default(() => new Date().getFullYear()),

  // Optional: Legacy wizard format support
  basics: z.object({
    name: z.string().min(1),
    size: z.number().positive(),
    modelVersion: z.literal('reserves-ev1').optional(),
  }).optional(),
  strategy: z.object({
    stages: z.array(z.object({
      name: z.string().min(1),
      graduate: percent100(),
      exit: percent100(),
      months: positiveInt(),
    })),
  }).optional(),
});

// Local fund calculation DTO for this endpoint
const FundCalculationDTO = z.object({
  fundSize: z.coerce.number().positive().int().default(100_000_000)
});
type FundCalculationDTO = z.infer<typeof FundCalculationDTO>;

router["post"]('/funds', idempotency, async (req: Request, res: Response) => {
  const parsed = CreateFundSchema.safeParse(req.body);
  if (!parsed.success) {
    res["status"](400);
    return res["json"]({ error: parsed.error.format() });
  }

  try {
    // Extract fund data - support both direct and legacy wizard formats
    const data = parsed.data;
    const fundData = {
      name: data.name || data.basics?.name || '',
      size: data.size || data.basics?.size || 0,
      managementFee: data.managementFee ?? 0.02,
      carryPercentage: data.carryPercentage ?? 0.20,
      vintageYear: data.vintageYear ?? new Date().getFullYear(),
    };

    // Persist fund using storage abstraction (DatabaseStorage or MemStorage)
    const fund = await storage.createFund(fundData);

    res["status"](201);
    return res["json"]({
      success: true,
      data: {
        id: fund.id,
        name: fund.name,
        size: fund.size,
        managementFee: fund.managementFee,
        carryPercentage: fund.carryPercentage,
        vintageYear: fund.vintageYear,
        status: fund.status,
        createdAt: fund.createdAt,
      },
      message: 'Fund created successfully',
    });
  } catch (error) {
    console.error('Fund creation error:', error);
    res["status"](500);
    return res["json"]({
      error: 'Failed to create fund',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router["post"]('/api/funds/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = FundCalculationDTO.parse(req.body as FundCalculationDTO);
    const idemHeader = String(req.header('Idempotency-Key') || '');
    const key = idemHeader || `calc:${hashPayload(dto)}`;

    const endTimer = calcDurationMs.startTimer();
    const { status, promise } = await getOrStart(idem, key, async (_signal: any) => {
      const model = new EnhancedFundModel(dto);
      const out = await model.calculate();
      return out;
    }, 60_000);

    if (status === 'created') {
      res['setHeader']('Idempotency-Status', 'created');
      const result = await promise;
      endTimer();
      return res["status"](201)["json"](result);
    }

    // === joined path (memory store cannot share promise across processes) ===
    // Avoid unhandled rejection by detaching:
    promise.catch(() => void 0);
    res['setHeader']('Idempotency-Status', 'joined');
    res['setHeader']('Retry-After', '2');
    res['setHeader']('Location', `/api/operations/${encodeURIComponent(key)}`);
    endTimer();
    return res["status"](202)["json"]({ status: 'in-progress', key });
  } catch (err) {
    next(err);
  }
});

export default router;
