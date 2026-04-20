import { Router } from 'express';
import type { Request, Response } from 'express';
import { insertPortfolioCompanySchema } from '@shared/schema';
import type { ApiError } from '@shared/types';
import { NumberParseError, toNumber } from '@shared/number';
import { ValidationError } from '../errors';
import { portfolioTimeMachineReadService } from '../services/portfolio-time-machine-read';
import { storage } from '../storage';

const router = Router();

function parseAsOfQuery(asOfQuery: string): Date {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(asOfQuery);
  if (monthMatch) {
    const year = Number.parseInt(monthMatch[1]!, 10);
    const monthIndex = Number.parseInt(monthMatch[2]!, 10) - 1;

    if (monthIndex < 0 || monthIndex > 11) {
      throw new ValidationError(`Invalid asOf query: ${asOfQuery}`);
    }

    return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  }

  const parsed = new Date(asOfQuery);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Invalid asOf query: ${asOfQuery}`);
  }

  return parsed;
}

router['get']('/portfolio-companies', async (req: Request, res: Response) => {
  try {
    const fundIdQuery = req.query['fundId'];
    const asOfQuery = req.query['asOf'];
    let fundId: number | undefined;
    let asOf: Date | undefined;

    if (fundIdQuery) {
      const parsedId = toNumber(fundIdQuery as string, 'fund ID');
      if (parsedId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID query',
          message: `Fund ID must be a positive integer, received: ${fundIdQuery}`,
        };
        return res['status'](400)['json'](error);
      }
      fundId = parsedId;
    }

    if (typeof asOfQuery === 'string') {
      if (!fundId) {
        const error: ApiError = {
          error: 'Invalid asOf query',
          message: 'asOf requires a positive fundId query parameter',
        };
        return res['status'](400)['json'](error);
      }

      asOf = parseAsOfQuery(asOfQuery);
    }

    const response = await portfolioTimeMachineReadService.listCompanies(fundId, {
      ...(asOf ? { asOf } : {}),
      ...(typeof asOfQuery === 'string' ? { requestedAsOf: asOfQuery } : {}),
    });
    return res['json'](response);
  } catch (error) {
    if (error instanceof NumberParseError) {
      const apiError: ApiError = {
        error: 'Invalid fund ID query',
        message: error.message,
      };
      return res['status'](400)['json'](apiError);
    }

    if (error instanceof ValidationError) {
      const apiError: ApiError = {
        error: 'Invalid asOf query',
        message: error.message,
      };
      return res['status'](400)['json'](apiError);
    }

    const apiError: ApiError = {
      error: 'Database query failed',
      message: error instanceof Error ? error.message : 'Failed to fetch portfolio companies',
    };
    return res['status'](500)['json'](apiError);
  }
});

router['get']('/portfolio-companies/:id', async (req: Request, res: Response) => {
  try {
    const idParam = req.params['id'];
    const id = toNumber(idParam, 'ID');

    if (id <= 0) {
      const error: ApiError = {
        error: 'Invalid company ID',
        message: `Company ID must be a positive integer, received: ${idParam}`,
      };
      return res['status'](400)['json'](error);
    }

    const company = await storage.getPortfolioCompany(id);
    if (!company) {
      const error: ApiError = {
        error: 'Company not found',
        message: `No portfolio company exists with ID: ${id}`,
      };
      return res['status'](404)['json'](error);
    }

    return res['json'](company);
  } catch (error) {
    if (error instanceof NumberParseError) {
      const apiError: ApiError = {
        error: 'Invalid company ID',
        message: error.message,
      };
      return res['status'](400)['json'](apiError);
    }

    const apiError: ApiError = {
      error: 'Database query failed',
      message: error instanceof Error ? error.message : 'Failed to fetch portfolio company',
    };
    return res['status'](500)['json'](apiError);
  }
});

router.post('/portfolio-companies', async (req: Request, res: Response) => {
  try {
    const result = insertPortfolioCompanySchema.safeParse(req.body);
    if (!result.success) {
      const error: ApiError = {
        error: 'Invalid company data',
        message: 'Portfolio company validation failed',
        details: { validationErrors: result.error.issues },
      };
      return res['status'](400)['json'](error);
    }

    const company = await storage.createPortfolioCompany(result.data);
    return res['status'](201)['json'](company);
  } catch (error) {
    const apiError: ApiError = {
      error: 'Database operation failed',
      message: error instanceof Error ? error.message : 'Failed to create portfolio company',
    };
    return res['status'](500)['json'](apiError);
  }
});

export default router;
