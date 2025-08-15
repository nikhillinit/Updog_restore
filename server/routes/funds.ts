import { Router } from 'express';
import { idempotency } from '../middleware/idempotency';
import { z } from 'zod';

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
      graduate: z.number().min(0).max(100),
      exit: z.number().min(0).max(100),
      months: z.number().int().min(1),
    })),
  }),
});

router.post('/funds', idempotency, async (req: Request, res: Response) => {
  const parsed = CreateFundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400);
    return res.json({ error: parsed.error.format() });
  }

  // TODO: persist fund with Drizzle
  const fundId = 'fund_' + Math.random().toString(36).slice(2);
  res.status(201);
  return res.json({ id: fundId });
});

export default router;