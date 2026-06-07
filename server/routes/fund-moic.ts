import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth, requireFundAccess } from '../lib/auth/jwt.js';
import { FundIdParamSchema } from '../../shared/schemas/portfolio-route.js';
import { getFundMoicRankings } from '../services/fund-moic-ranking-service.js';

const router = Router();

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

router.get(
  '/funds/:fundId/moic/rankings',
  requireAuth(),
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) return;

    const rankings = await getFundMoicRankings(fundId);
    return res.json(rankings);
  })
);

export default router;
export { router as fundMoicRouter };
