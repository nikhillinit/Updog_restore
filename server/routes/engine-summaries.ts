import { Router } from 'express';
import type { Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateReserveSummary } from '@shared/core/reserves/ReserveEngine';
import { generatePacingSummary } from '@shared/core/pacing/PacingEngine';
import { toNumber } from '@shared/number';
import type {
  ApiError,
  ReserveCompanyInput,
  ReserveSummary,
  PacingInput,
  PacingSummary,
} from '@shared/types';
import { handleNumberParseError } from '../lib/number-parse-error';
import { logger } from '../lib/logger.js';

const router = Router();
const log = logger.child({ route: 'engine-summaries' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface PortfolioFixtureCompany {
  invested?: number;
  ownership?: number;
  stage?: string;
  sector?: string;
}

interface PortfolioFixtureData {
  companies: PortfolioFixtureCompany[];
}

function loadReserveFixturePortfolio(): ReserveCompanyInput[] {
  const portfolioPath = join(__dirname, '../../tests/fixtures/portfolio.json');
  const rawData: unknown = JSON.parse(readFileSync(portfolioPath, 'utf-8'));

  if (
    !rawData ||
    typeof rawData !== 'object' ||
    !('companies' in rawData) ||
    !Array.isArray((rawData as PortfolioFixtureData).companies)
  ) {
    throw new Error('Invalid portfolio fixture format');
  }

  return (rawData as PortfolioFixtureData).companies.map((company, index) => ({
    id: index + 1,
    invested: typeof company.invested === 'number' ? company.invested : 500000,
    ownership: typeof company.ownership === 'number' ? company.ownership : null,
    stage: typeof company.stage === 'string' ? company.stage : 'Series A',
    sector: typeof company.sector === 'string' ? company.sector : 'Tech',
  }));
}

// NOT fund-scoped (Slice 1 verdict). loadReserveFixturePortfolio() reads a static
// fixture (tests/fixtures/portfolio.json) identical for every fundId, and
// generateReserveSummary -> ReserveEngine is pure compute over that portfolio; fundId
// is used only as an output label. No stored per-fund data is read, so there is no
// cross-fund disclosure and no existence oracle (any positive int returns 200). Same
// class as the /cohorts/analysis verdict below. If ever wired to real per-fund data,
// guard with enforceProvidedFundScope and drop the fixture load.
router['get']('/reserves/:fundId', async (req: Request, res: Response) => {
  try {
    const fundIdParam = req.params['fundId'];
    const fundId = toNumber(fundIdParam, 'fund ID');

    if (fundId <= 0) {
      const error: ApiError = {
        error: 'Invalid fund ID',
        message: `Fund ID must be a positive integer, received: ${fundIdParam}`,
      };
      return res.status(400).json(error);
    }

    const portfolio = loadReserveFixturePortfolio();
    const summary: ReserveSummary = generateReserveSummary(fundId, portfolio);
    return res.json(summary);
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid fund ID')) {
      return;
    }

    if (error instanceof Error && error.message === 'Invalid portfolio fixture format') {
      const apiError: ApiError = {
        error: 'Portfolio data unavailable',
        message: 'Could not load portfolio fixture data',
      };
      return res.status(500).json(apiError);
    }

    log.error(
      {
        err: error,
        fundId: req.params['fundId'],
      },
      'Reserve summary request failed'
    );

    const apiError: ApiError = {
      error: 'Reserve engine processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: { fundId: req.params['fundId'] },
    };
    return res.status(500).json(apiError);
  }
});

router['get']('/pacing/summary', async (req: Request, res: Response) => {
  try {
    const fundSizeParam = req.query['fundSize'] as string;
    const quarterParam = req.query['deploymentQuarter'] as string;
    const marketConditionParam = req.query['marketCondition'] as string;

    const pacingInput: PacingInput = {
      fundSize: fundSizeParam ? toNumber(fundSizeParam, 'fund size') : 50000000,
      deploymentQuarter: quarterParam ? toNumber(quarterParam, 'deployment quarter') : 1,
      marketCondition: (marketConditionParam as 'bull' | 'bear' | 'neutral') || 'neutral',
    };

    if (!['bull', 'bear', 'neutral'].includes(pacingInput.marketCondition)) {
      const error: ApiError = {
        error: 'Invalid market condition',
        message: `Market condition must be 'bull', 'bear', or 'neutral', received: ${marketConditionParam}`,
      };
      return res.status(400).json(error);
    }

    const summary: PacingSummary = generatePacingSummary(pacingInput);
    return res.json(summary);
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid pacing query')) {
      return;
    }

    log.error(
      {
        err: error,
        query: req.query,
      },
      'Pacing summary request failed'
    );

    const apiError: ApiError = {
      error: 'Pacing engine processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: { query: req.query as Record<string, unknown> },
    };
    return res.status(500).json(apiError);
  }
});

export default router;
