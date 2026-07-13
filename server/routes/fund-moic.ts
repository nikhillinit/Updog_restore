import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Decimal from '../../shared/lib/decimal-config.js';
import { requireAuth, requireFundAccess, requireRole } from '../lib/auth/jwt.js';
import {
  FundMoicRankingsResponseV2Schema,
  type FundMoicRankingsResponseV2,
} from '../../shared/contracts/fund-moic-v2.contract.js';
import { logger } from '../lib/logger.js';
import { FundIdParamSchema } from '../../shared/schemas/portfolio-route.js';
import {
  assessMoicMateriality,
  MOIC_MATERIALITY_EPSILON,
} from '../services/fund-moic-materiality.js';
import {
  getFundMoicRankingSources,
  summarizeMoicActualsProvenance,
} from '../services/fund-moic-ranking-service.js';
import { buildFundCompanyActualsFacts } from '../services/fund-actuals/fund-company-actuals-facts-service.js';
import {
  getLatestCompletedMoicReconciliation,
  MoicReconciliationConflictError,
  recordMoicReconciliation,
} from '../services/fund-moic-reconciliation-service.js';
import {
  FundMoicInputIdempotencyConflictError,
  FundMoicInputInProgressError,
  FundMoicInputNotFoundError,
  FundMoicInputVersionConflictError,
  updateFundMoicInputs,
} from '../services/fund-moic-input-service.js';
import {
  FundCalculationModeBlockedError,
  FundCalculationModeIdempotencyConflictError,
  FundCalculationModeInProgressError,
  FundCalculationModeVersionConflictError,
  resolveMoicActionability,
  resolveFundCalculationMode,
  updateFundMoicCalculationMode,
} from '../services/fund-calculation-mode-service.js';
import { invalidateH9Artifacts } from '../services/h9-artifact-invalidation-service';
import { buildRoundsToModelEvidence } from '../services/rounds-to-model-evidence-service.js';
import { FEATURES } from '../config/features.js';
import { calculateMarginalReserveMoic } from '../../shared/core/moic/MarginalReserveMoic.js';
import {
  MarginalReserveRankingsResponseV1Schema,
  type MarginalReserveMoicResultV1,
} from '../../shared/contracts/marginal-reserve-moic-v1.contract.js';
import { buildMarginalReserveMoicInputs } from '../services/moic/marginal-reserve-moic-input-service.js';

const router = Router();

const ConfiguredModeSchema = z.enum(['off', 'shadow', 'on']);
const MoicInputUpdateBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    exitProbability: z.number().min(0).max(1).nullable(),
    exitMoicBps: z.number().int().nonnegative().nullable(),
  })
  .strict();
const ModeUpdateBodySchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    configuredMode: ConfiguredModeSchema,
    killSwitchActive: z.boolean().optional(),
    acceptedReconciliationRunId: z.number().int().positive().nullable().optional(),
  })
  .strict();
const MarginalRankingsQuerySchema = z
  .object({
    asOfDate: z.string().date(),
  })
  .strict();

const MARGINAL_STATUS_ORDER: Readonly<Record<MarginalReserveMoicResultV1['status'], number>> = {
  actionable: 0,
  indicative: 1,
  unavailable: 2,
};

function sortMarginalRankings(
  rankings: MarginalReserveMoicResultV1[]
): MarginalReserveMoicResultV1[] {
  return [...rankings].sort((left, right) => {
    const statusOrder = MARGINAL_STATUS_ORDER[left.status] - MARGINAL_STATUS_ORDER[right.status];
    if (statusOrder !== 0) return statusOrder;
    if (left.marginalMoic === null && right.marginalMoic !== null) return 1;
    if (left.marginalMoic !== null && right.marginalMoic === null) return -1;
    if (left.marginalMoic !== null && right.marginalMoic !== null) {
      const moicOrder = new Decimal(right.marginalMoic).comparedTo(left.marginalMoic);
      if (moicOrder !== 0) return moicOrder;
    }
    return left.companyId - right.companyId;
  });
}

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

function positiveIntegerParam(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
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
  '/funds/:fundId/moic/marginal-rankings',
  requireAuth(),
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) return;

    if (!FEATURES.marginalReserveMoic) {
      return res.status(404).json({ error: 'not_found' });
    }

    const parsedQuery = MarginalRankingsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: 'invalid_as_of_date',
        message: 'asOfDate must be provided as YYYY-MM-DD',
      });
    }

    const inputs = await buildMarginalReserveMoicInputs({
      fundId,
      asOfDate: parsedQuery.data.asOfDate,
    });
    const rankings = sortMarginalRankings(inputs.ready.map(calculateMarginalReserveMoic));
    return res.json(
      MarginalReserveRankingsResponseV1Schema.parse({
        contractVersion: 'marginal-reserve-rankings-v1',
        fundId,
        asOfDate: parsedQuery.data.asOfDate,
        factsInputHash: inputs.factsInputHash,
        assumptionsHash: inputs.assumptionsHash,
        rankings,
        unavailable: [...inputs.unavailable].sort(
          (left, right) => left.companyId - right.companyId
        ),
      })
    );
  })
);

router.get(
  '/funds/:fundId/moic/rankings',
  requireAuth(),
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) return;

    const contract = req.query['contract'];
    if (contract === undefined || contract === 'v1') {
      const sources = await getFundMoicRankingSources(fundId);
      const modePreview = await resolveFundCalculationMode({ fundId, sources });
      const actionability = await resolveMoicActionability({ fundId, sources });
      const rankings =
        modePreview.effectiveMode === 'on' && actionability.actionability === 'actionable'
          ? sources.candidate
          : sources.legacy;
      return res.json(rankings);
    }

    if (contract !== 'v2') {
      return res.status(400).json({
        error: 'invalid_contract',
        message: 'contract must be v1 or v2',
      });
    }

    const [sources, latestReconciliation, evidence] = await Promise.all([
      getFundMoicRankingSources(fundId),
      getLatestCompletedMoicReconciliation(fundId),
      buildRoundsToModelEvidence({ fundId }),
    ]);
    // TODO(perf): this loads the full company-actuals facts corpus (~6 queries + hash in
    // fund-company-actuals-facts-service) only to tally trustState counts; per-company facts
    // are not used in ranking values. MOIC analysis is a low-frequency GP page today, so ship
    // as-is, but memoize per (fundId, asOfDate) or expose a count-only facts helper if this page
    // becomes polled or the corpus grows. Tracked as a separate low-priority GitHub perf issue.
    const actualsAsOfDate = new Date().toISOString().slice(0, 10);
    const sourceCompanyCount = sources.legacy.provenance.sourceRecordCount;
    let actualsProvenanceSummary: ReturnType<typeof summarizeMoicActualsProvenance>;

    try {
      const actualsFacts = await buildFundCompanyActualsFacts({
        fundId,
        asOfDate: actualsAsOfDate,
      });
      actualsProvenanceSummary = summarizeMoicActualsProvenance({
        factsStatus: 'available',
        factsInputHash: actualsFacts.inputHash,
        trustStates: actualsFacts.facts.map((fact) => fact.provenance.trustState),
        defaultedEconomicInputCount:
          sources.moicInputSummary.defaultedExitProbabilityCount +
          sources.moicInputSummary.defaultedReserveExitMultipleCount,
      });
    } catch (error) {
      // Disclosed to the client via warnings, but not silent server-side: operators need the reason.
      logger.warn(
        {
          fundId,
          asOfDate: actualsAsOfDate,
          error: error instanceof Error ? error.message : String(error),
        },
        'fund-moic v2 actuals facts load failed; returning UNAVAILABLE provenance summary'
      );
      actualsProvenanceSummary = summarizeMoicActualsProvenance({
        factsStatus: 'failed',
        factsInputHash: null,
        trustStates: Array.from({ length: sourceCompanyCount }, () => 'UNAVAILABLE'),
        defaultedEconomicInputCount:
          sources.moicInputSummary.defaultedExitProbabilityCount +
          sources.moicInputSummary.defaultedReserveExitMultipleCount,
        warnings: ['actuals_facts_failed'],
      });
    }

    const modePreview = await resolveFundCalculationMode({ fundId, sources });
    const actionability = await resolveMoicActionability({ fundId, sources, evidence });
    const usingCandidateRankings =
      modePreview.effectiveMode === 'on' && actionability.actionability === 'actionable';
    const rankings = usingCandidateRankings ? sources.candidate : sources.legacy;
    const materiality = assessMoicMateriality(sources.legacy.rankings, sources.candidate.rankings);
    const latestCurrentMatches =
      latestReconciliation?.candidateInputHash === sources.moicSourceInputHash;
    const latestSourceFingerprintMatches = latestReconciliation
      ? actionability.sourceFingerprintMatches
      : false;

    const response: FundMoicRankingsResponseV2 = {
      contractVersion: '2.1.0',
      fundId,
      rankings: rankings.rankings,
      provenance: {
        mode: usingCandidateRankings ? 'candidate' : 'legacy',
        warnings: modePreview.blockers,
      },
      latestReconciliation: latestReconciliation
        ? {
            runId: latestReconciliation.runId,
            createdAt: latestReconciliation.createdAt,
            currentInputMatches: latestCurrentMatches,
            sourceFingerprintMatches: latestSourceFingerprintMatches,
          }
        : null,
      materiality: {
        status: latestReconciliation
          ? latestSourceFingerprintMatches
            ? 'recorded'
            : 'stale'
          : 'not_run',
        candidateMaterial: materiality.candidateMaterial,
        epsilon: MOIC_MATERIALITY_EPSILON,
      },
      modePreview,
      moicInputSummary: sources.moicInputSummary,
      actualsProvenanceSummary,
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
      if (!replayed) {
        await invalidateH9Artifacts(fundId);
      }
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

router.put(
  '/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId',
  requireAuth(),
  requireFundAccess,
  requireRole('admin'),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) return;

    const companyId = positiveIntegerParam(req.params['companyId']);
    if (companyId === null) {
      return res.status(400).json({
        error: 'invalid_company_id',
        message: 'Company ID must be a positive integer',
      });
    }

    const idempotencyKey = req.header('Idempotency-Key')?.trim();
    if (!idempotencyKey) {
      return res.status(428).json({
        error: 'idempotency_key_required',
        message: 'Idempotency-Key header is required',
      });
    }

    const parsedBody = MoicInputUpdateBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'invalid_moic_input_update',
        message: 'MOIC input update payload is invalid',
        details: parsedBody.error.format(),
      });
    }

    try {
      const result = await updateFundMoicInputs({
        fundId,
        companyId,
        expectedVersion: parsedBody.data.expectedVersion,
        exitProbability: parsedBody.data.exitProbability,
        exitMoicBps: parsedBody.data.exitMoicBps,
        idempotencyKey,
        actorId: resolveActorId(req),
      });

      return res.status(200).json({
        ...result.response,
        replayed: result.replayed,
      });
    } catch (error) {
      if (error instanceof FundMoicInputNotFoundError) {
        return res.status(404).json({
          error: error.code,
          message: error.message,
        });
      }
      if (error instanceof FundMoicInputVersionConflictError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
          expectedVersion: error.expectedVersion,
          actualVersion: error.actualVersion,
        });
      }
      if (error instanceof FundMoicInputIdempotencyConflictError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
        });
      }
      if (error instanceof FundMoicInputInProgressError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  })
);

router.put(
  '/admin/funds/:fundId/calculation-modes/fund-moic-rankings',
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

    const parsedBody = ModeUpdateBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'invalid_mode_update',
        message: 'MOIC calculation mode update payload is invalid',
        details: parsedBody.error.format(),
      });
    }

    try {
      const modeUpdateParams: Parameters<typeof updateFundMoicCalculationMode>[0] = {
        fundId,
        expectedVersion: parsedBody.data.expectedVersion,
        configuredMode: parsedBody.data.configuredMode,
        idempotencyKey,
        actorId: resolveActorId(req),
      };
      if (parsedBody.data.killSwitchActive !== undefined) {
        modeUpdateParams.killSwitchActive = parsedBody.data.killSwitchActive;
      }
      if (parsedBody.data.acceptedReconciliationRunId !== undefined) {
        modeUpdateParams.acceptedReconciliationRunId = parsedBody.data.acceptedReconciliationRunId;
      }

      const result = await updateFundMoicCalculationMode(modeUpdateParams);

      return res.status(200).json({
        ...result.response,
        replayed: result.replayed,
      });
    } catch (error) {
      if (error instanceof FundCalculationModeVersionConflictError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
          expectedVersion: error.expectedVersion,
          actualVersion: error.actualVersion,
        });
      }
      if (error instanceof FundCalculationModeBlockedError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
          blockers: error.blockers,
        });
      }
      if (error instanceof FundCalculationModeIdempotencyConflictError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
        });
      }
      if (error instanceof FundCalculationModeInProgressError) {
        return res.status(409).json({
          error: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  })
);

export default router;
export { router as fundMoicRouter };
