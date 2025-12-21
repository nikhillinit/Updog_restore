 
 
 
 
 
import { Router } from 'express';
import type { Request, Response } from 'express';
import { idem } from '../shared/idempotency-instance';

const router = Router();

router['get']('/api/operations/:key', async (req: Request, res: Response) => {
  const key = String(req.params.key);
  const rec = await idem['get'](key);
  if (!rec) return res["status"](404)["json"]({ code: 'NOT_FOUND', message: 'Unknown operation' });

  if (rec.status === 'succeeded') return res["status"](200)["json"](rec);
  if (rec.status === 'failed')    return res["status"](500)["json"](rec);
  // in-progress
  res['setHeader']('Retry-After', '2');
  return res["status"](202)["json"](rec);
});

export default router;
