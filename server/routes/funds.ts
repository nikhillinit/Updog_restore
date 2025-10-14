/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
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

const router = Router();

const CreateFundSchema = z.object({
  basics: z.object({
    name: z.string().min(1),
    size: z.number().positive(),
    modelVersion: z.literal('reserves-ev1'),
  }),
  strategy: z.object({
    stages: z.array(z.object({
      name: z.string().min(1),
      graduate: percent100(),
      exit: percent100(),
      months: positiveInt(),
    })),
  }),
});

// Local fund calculation DTO for this endpoint
const FundCalculationDTO = z.object({
  fundSize: z.coerce.number().positive().int().default(100_000_000)
});
type FundCalculationDTO = z.infer<typeof FundCalculationDTO>;

router.post('/funds', idempotency, async (req: Request, res: Response) => {
  const parsed = CreateFundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400);
    return res.json({ error: parsed.error.format() });
  }

  // TODO: persist fund with Drizzle
  const fundId = `fund_${  Math.random().toString(36).slice(2)}`;
  res.status(201);
  return res.json({ id: fundId });
});

router.post('/api/funds/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = FundCalculationDTO.parse(req.body as FundCalculationDTO);
    const idemHeader = String(req["header"]('Idempotency-Key') || '');
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
      return res.status(201).json(result);
    }

    // === joined path (memory store cannot share promise across processes) ===
    // Avoid unhandled rejection by detaching:
    promise.catch(() => void 0);
    res['setHeader']('Idempotency-Status', 'joined');
    res['setHeader']('Retry-After', '2');
    res['setHeader']('Location', `/api/operations/${encodeURIComponent(key)}`);
    endTimer();
    return res.status(202).json({ status: 'in-progress', key });
  } catch (err) {
    next(err);
  }
});

export default router;
