import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth, requireFundAccess, requireRole } from '../lib/auth/jwt.js';
import {
  FundMoicRankingsResponseV2Schema,
  type FundMoicRankingsResponseV2,
} from '../../shared/contracts/fund-moic-v2.contract.js';
import { FundIdParamSchema } from '../../shared/schemas/portfolio-route.js';
import { MOIC_MATERIALITY_EPSILON } from '../services/fund-moic-materiality.js';
import { getFundMoicRankings } from '../services/fund-moic-ranking-service.js';
import {
  getLatestCompletedMoicReconciliation,
  MoicReconciliationConflictError,
  recordMoicReconciliation,
} from '../services/fund-moic-reconciliation-service.js';
import { buildRoundsToModelEvidence } from '../services/rounds-to-model-evidence-service.js';

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

function numericIdentity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

function resolveActorId(req: Request): number | null {
  return numericIdentity(req.user?.id) ?? numericIdentity(req.user?.sub) ?? null;
}

function roundEvidenceSummary(coverage: {
  activeRoundCount: number;
  activeOverrideCount: number;
  warningsByCode: Record<string, number>;
}) {
  return {
    activeRoundCount: coverage.activeRoundCount,
    activeOverrideCount: coverage.activeOverrideCount,
    warningCodes: Object.keys(coverage.warningsByCode).sort(),
  };
}

router.get(
  '/funds/:fundId/moic/rankings',
  requireAuth(),
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) return;

    const contract = req.query.contract;
    if (contract === undefined || contract === 'v1') {
      const rankings = await getFundMoicRankings(fundId);
      return res.json(rankings);
    }

    if (contract !== 'v2') {
      return res.status(400).json({
        error: 'invalid_contract',
        message: 'contract must be v1 or v2',
      });
    }

    const [rankings, latestReconciliation, evidence] = await Promise.all([
      getFundMoicRankings(fundId),
      getLatestCompletedMoicReconciliation(fundId),
      buildRoundsToModelEvidence({ fundId }),
    ]);

    const response: FundMoicRankingsResponseV2 = {
      contractVersion: '2.0.0',
      fundId,
      rankings: rankings.rankings,
      provenance: { mode: 'legacy', warnings: [] },
      latestReconciliation,
      materiality: {
        status: latestReconciliation ? 'recorded' : 'not_run',
        candidateMaterial: false,
        epsilon: MOIC_MATERIALITY_EPSILON,
      },
      roundEvidenceSummary: roundEvidenceSummary(evidence.coverage),
      generatedAt: new Date().toISOString(),
    };

    return res.json(FundMoicRankingsResponseV2Schema.parse(response));
  })
);

router.post(
  '/admin/funds/:fundId/moic/reconciliations',
  requireAuth(),
  requireFundAccess,
  requireRole('admin'),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) return;

    const idempotencyKey = req.header('Idempotency-Key')?.trim();
    if (!idempotencyKey) {
      return res.status(428).json({
        error: 'idempotency_key_required',
        message: 'Idempotency-Key header is required',
      });
    }

    try {
      const { run, replayed } = await recordMoicReconciliation({
        fundId,
        idempotencyKey,
        requestedBy: resolveActorId(req),
      });
      return res.status(replayed ? 200 : 201).json({
        runId: run.runId,
        createdAt: run.createdAt,
        replayed,
      });
    } catch (error) {
      if (error instanceof MoicReconciliationConflictError) {
        return res.status(409).json({
          error: 'idempotency_conflict',
          message: error.message,
        });
      }
      throw error;
    }
  })
);

export default router;
export { router as fundMoicRouter };
