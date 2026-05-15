import { Router } from 'express';
import type { Request, Response } from 'express';
import { insertInvestmentSchema } from '@shared/schema';
import type { ApiError } from '@shared/types';
import { NumberParseError, toNumber } from '@shared/number';
import { sendApiError } from '../lib/apiError';
import { logger } from '../lib/logger.js';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
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
    if (error instanceof NumberParseError) {
      const apiError: ApiError = {
        error: 'Invalid fund ID query',
        message: error.message,
      };
      return res.status(400).json(apiError);
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
    if (error instanceof NumberParseError) {
      const apiError: ApiError = {
        error: 'Invalid investment ID',
        message: error.message,
      };
      return res.status(400).json(apiError);
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

router.post('/investments/:id/rounds', async (req: Request, res: Response) => {
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
        error: 'Invalid round data',
        message: 'Request body cannot be empty',
      };
      return res.status(400).json(error);
    }

    return await handleUnsupportedScenarioWrite(req, res, 'addInvestmentRound', () =>
      storage.addInvestmentRound(investmentId, body)
    );
  } catch (error) {
    if (error instanceof NumberParseError) {
      const apiError: ApiError = {
        error: 'Invalid investment ID',
        message: error.message,
      };
      return res.status(400).json(apiError);
    }

    const apiError: ApiError = {
      error: 'Database operation failed',
      message: error instanceof Error ? error.message : 'Failed to add investment round',
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
    if (error instanceof NumberParseError) {
      const apiError: ApiError = {
        error: 'Invalid investment ID',
        message: error.message,
      };
      return res.status(400).json(apiError);
    }

    const apiError: ApiError = {
      error: 'Database operation failed',
      message: error instanceof Error ? error.message : 'Failed to add performance case',
    };
    return res.status(500).json(apiError);
  }
});

export default router;
