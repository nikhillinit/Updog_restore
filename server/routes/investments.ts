import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  InvestmentRoundCreateSchema,
  InvestmentRoundListResponseSchema,
  InvestmentRoundResponseSchema,
  type InvestmentRoundResponse,
} from '@shared/contracts/investments/investment-round.contract';
import { insertInvestmentSchema } from '@shared/schema';
import type { InvestmentRound as PersistedInvestmentRound } from '@shared/schema/investment-rounds';
import type { ApiError } from '@shared/types';
import { toNumber } from '@shared/number';
import { sendApiError } from '../lib/apiError';
import { handleNumberParseError } from '../lib/number-parse-error';
import { logger } from '../lib/logger.js';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { parseETag, rowVersionETag } from '../lib/http-preconditions';
import { firstString } from '../lib/request-values';
import {
  createRound,
  listRoundsForInvestment,
  loadRound,
} from '../services/investments/investment-round-service';
import { storage, UnsupportedStorageOperationError } from '../storage';

const router = Router();
const log = logger.child({ route: 'investments' });

router['get']('/investments', async (req: Request, res: Response) => {
  try {
    const fundIdQuery = req.query['fundId'];
    let fundId: number | undefined;

    if (fundIdQuery) {
      const parsedId = toNumber(fundIdQuery as string, 'fund ID');
      if (parsedId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID query',
          message: `Fund ID must be a positive integer, received: ${fundIdQuery}`,
        };
        return res.status(400).json(error);
      }
      fundId = parsedId;
    }

    if (fundId !== undefined && !(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

    const investments = await storage.getInvestments(fundId);
    return res.json(investments);
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid fund ID query')) {
      return;
    }

    const apiError: ApiError = {
      error: 'Database query failed',
      message: error instanceof Error ? error.message : 'Failed to fetch investments',
    };
    return res.status(500).json(apiError);
  }
});

router['get']('/investments/:id', async (req: Request, res: Response) => {
  try {
    const idParam = req.params['id'];
    const id = toNumber(idParam, 'ID');

    if (id <= 0) {
      const error: ApiError = {
        error: 'Invalid investment ID',
        message: `Investment ID must be a positive integer, received: ${idParam}`,
      };
      return res.status(400).json(error);
    }

    const investment = await storage.getInvestment(id);
    if (!investment) {
      const error: ApiError = {
        error: 'Investment not found',
        message: `No investment exists with ID: ${id}`,
      };
      return res.status(404).json(error);
    }
    return res.json(investment);
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid investment ID')) {
      return;
    }

    const apiError: ApiError = {
      error: 'Database query failed',
      message: error instanceof Error ? error.message : 'Failed to fetch investment',
    };
    return res.status(500).json(apiError);
  }
});

router.post('/investments', async (req: Request, res: Response) => {
  try {
    const result = insertInvestmentSchema.safeParse(req.body);
    if (!result.success) {
      const error: ApiError = {
        error: 'Invalid investment data',
        message: 'Investment validation failed',
        details: { validationErrors: result.error.issues },
      };
      return res.status(400).json(error);
    }

    if (
      typeof result.data.fundId === 'number' &&
      !(await enforceProvidedFundScope(req, res, result.data.fundId))
    ) {
      return;
    }

    const investment = await storage.createInvestment(result.data);
    return res.status(201).json(investment);
  } catch (error) {
    const apiError: ApiError = {
      error: 'Database operation failed',
      message: error instanceof Error ? error.message : 'Failed to create investment',
    };
    return res.status(500).json(apiError);
  }
});

async function handleUnsupportedScenarioWrite<T>(
  req: Request,
  res: Response,
  operation: 'addInvestmentRound' | 'addPerformanceCase',
  executor: () => Promise<T>
): Promise<Response<T | ApiError>> {
  try {
    const result = await executor();
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof UnsupportedStorageOperationError) {
      log.warn({ operation, investmentId: req.params['id'] }, 'Rejected unsupported storage write');
      sendApiError(res, 501, {
        error: 'Storage operation is not supported for this route',
        code: error.code,
      });
      return res as Response<T | ApiError>;
    }

    const apiError: ApiError = {
      error: 'Database operation failed',
      message: error instanceof Error ? error.message : `Failed to ${operation}`,
    };
    return res.status(500).json(apiError);
  }
}

function numericIdentity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

// Best-effort creator id. JWT subs are not guaranteed numeric and created_by is a
// nullable users.id FK, so an unresolved identity stores NULL (never 401).
// enforceProvidedFundScope populates req.user from a verified token.
function resolveActorId(req: Request): number | null {
  return numericIdentity(req.user?.id) ?? numericIdentity(req.user?.sub) ?? null;
}

function generatedRowEtag(xmin: string): string {
  const etag = rowVersionETag(xmin);
  if (!parseETag(etag)) {
    throw new Error('Generated empty investment round ETag');
  }
  return etag;
}

function toRoundResponse(row: PersistedInvestmentRound, xmin: string): InvestmentRoundResponse {
  return InvestmentRoundResponseSchema.parse({
    id: row.id,
    investmentId: row.investmentId,
    fundId: row.fundId,
    roundName: row.roundName,
    securityType: row.securityType,
    roundDate: row.roundDate,
    currency: row.currency,
    investmentAmount: row.investmentAmount,
    roundSize: row.roundSize,
    preMoneyValuation: row.preMoneyValuation,
    supersedesRoundId: row.supersedesRoundId,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    updatedAt: (row.updatedAt ?? row.createdAt ?? new Date()).toISOString(),
    etag: generatedRowEtag(xmin),
  });
}

interface InvestmentRoundRouteScope {
  investmentId: number;
  fundId: number;
}

async function resolveInvestmentRoundRouteScope(
  req: Request,
  res: Response
): Promise<InvestmentRoundRouteScope | undefined> {
  const idParam = req.params['id'];
  const investmentId = toNumber(idParam, 'investment ID');

  if (investmentId <= 0) {
    const error: ApiError = {
      error: 'Invalid investment ID',
      message: `Investment ID must be a positive integer, received: ${idParam}`,
    };
    res.status(400).json(error);
    return undefined;
  }

  const investment = await storage.getInvestment(investmentId);
  if (!investment) {
    const error: ApiError = {
      error: 'Investment not found',
      message: `No investment exists with ID: ${investmentId}`,
    };
    res.status(404).json(error);
    return undefined;
  }

  if (investment.fundId == null) {
    res.status(400).json({
      error: 'invalid_investment_fund_scope',
      message: 'Cannot fund-scope a NULL-fund investment',
    });
    return undefined;
  }

  if (!(await enforceProvidedFundScope(req, res, investment.fundId))) {
    return undefined;
  }

  return { investmentId, fundId: investment.fundId };
}

router.post('/investments/:id/rounds', async (req: Request, res: Response) => {
  try {
    const scope = await resolveInvestmentRoundRouteScope(req, res);
    if (!scope) {
      return;
    }

    const idempotencyKey =
      firstString(req.headers['idempotency-key']) ?? firstString(req.headers['x-idempotency-key']);
    if (!idempotencyKey) {
      return res.status(428).json({
        error: 'precondition_required',
        message: 'Idempotency-Key header is required',
      });
    }

    const parsed = InvestmentRoundCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body', details: parsed.error.format() });
    }
    if (parsed.data.fundId !== scope.fundId) {
      return res.status(400).json({
        error: 'fundId mismatch',
        message: 'Body fundId must match the investment fundId',
      });
    }

    const result = await createRound({
      ...parsed.data,
      investmentId: scope.investmentId,
      fundId: scope.fundId,
      idempotencyKey,
      createdBy: resolveActorId(req),
    });

    if (result.kind === 'created') {
      return res.status(201).json(toRoundResponse(result.row, result.xmin));
    }
    if (result.kind === 'replayed') {
      return res.status(200).json(toRoundResponse(result.row, result.xmin));
    }
    if (result.kind === 'key_reused') {
      return res.status(409).json({ error: 'idempotency_key_reused' });
    }
    if (result.kind === 'already_superseded') {
      return res.status(409).json({ error: 'round_already_superseded' });
    }
    if (result.kind === 'supersede_target_missing') {
      return res.status(404).json({ error: 'supersede_target_missing' });
    }
    return res.status(400).json({ error: 'supersede_target_other_investment' });
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid investment ID')) {
      return;
    }

    const apiError: ApiError = {
      error: 'Database operation failed',
      message: error instanceof Error ? error.message : 'Failed to add investment round',
    };
    return res.status(500).json(apiError);
  }
});

router.get('/investments/:id/rounds', async (req: Request, res: Response) => {
  try {
    const scope = await resolveInvestmentRoundRouteScope(req, res);
    if (!scope) {
      return;
    }

    const rows = await listRoundsForInvestment(scope.investmentId);
    return res.status(200).json(
      InvestmentRoundListResponseSchema.parse({
        data: rows.map((row) => toRoundResponse(row.row, row.xmin)),
      })
    );
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid investment ID')) {
      return;
    }

    const apiError: ApiError = {
      error: 'Database operation failed',
      message: error instanceof Error ? error.message : 'Failed to list investment rounds',
    };
    return res.status(500).json(apiError);
  }
});

router.get('/investments/:id/rounds/:roundId', async (req: Request, res: Response) => {
  try {
    const scope = await resolveInvestmentRoundRouteScope(req, res);
    if (!scope) {
      return;
    }

    const roundIdParam = req.params['roundId'];
    const roundId = toNumber(roundIdParam, 'round ID');
    if (roundId <= 0) {
      const error: ApiError = {
        error: 'Invalid round ID',
        message: `Round ID must be a positive integer, received: ${roundIdParam}`,
      };
      return res.status(400).json(error);
    }

    const round = await loadRound(scope.investmentId, roundId);
    if (!round) {
      return res.status(404).json({ error: 'Investment round not found' });
    }
    return res.status(200).json(toRoundResponse(round.row, round.xmin));
  } catch (error) {
    if (
      handleNumberParseError(error, res, (parseError) =>
        parseError.message.includes('round ID') ? 'Invalid round ID' : 'Invalid investment ID'
      )
    ) {
      return;
    }

    const apiError: ApiError = {
      error: 'Database operation failed',
      message: error instanceof Error ? error.message : 'Failed to fetch investment round',
    };
    return res.status(500).json(apiError);
  }
});

router.post('/investments/:id/cases', async (req: Request, res: Response) => {
  try {
    const idParam = req.params['id'];
    const investmentId = toNumber(idParam, 'investment ID');

    if (investmentId <= 0) {
      const error: ApiError = {
        error: 'Invalid investment ID',
        message: `Investment ID must be a positive integer, received: ${idParam}`,
      };
      return res.status(400).json(error);
    }

    const body = req.body as Record<string, unknown> | null;
    if (!body || Object.keys(body).length === 0) {
      const error: ApiError = {
        error: 'Invalid case data',
        message: 'Request body cannot be empty',
      };
      return res.status(400).json(error);
    }

    return await handleUnsupportedScenarioWrite(req, res, 'addPerformanceCase', () =>
      storage.addPerformanceCase(investmentId, body)
    );
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid investment ID')) {
      return;
    }

    const apiError: ApiError = {
      error: 'Database operation failed',
      message: error instanceof Error ? error.message : 'Failed to add performance case',
    };
    return res.status(500).json(apiError);
  }
});

export default router;
