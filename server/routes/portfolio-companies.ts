import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { insertPortfolioCompanySchema } from '@shared/schema';
import { CompanySectorSchema, CompanyStageSchema } from '@shared/company-taxonomy';
import type { ApiError } from '@shared/types';
import { toNumber } from '@shared/number';
import { ValidationError } from '../errors';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { handleNumberParseError } from '../lib/number-parse-error';
import { portfolioTimeMachineReadService } from '../services/portfolio-time-machine-read';
import { storage } from '../storage';

const router = Router();

const portfolioCompaniesLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

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

router['get'](
  '/portfolio-companies',
  portfolioCompaniesLimiter,
  async (req: Request, res: Response) => {
    try {
      const fundIdQuery = req.query['fundId'];
      const asOfQuery = req.query['asOf'];
      let asOf: Date | undefined;

      if (fundIdQuery === undefined || fundIdQuery === '') {
        const error: ApiError = {
          error: 'fund_scope_required',
          message: 'A fundId query parameter is required to list portfolio companies',
        };
        return res.status(400).json(error);
      }

      const parsedId = toNumber(fundIdQuery as string, 'fund ID');
      if (parsedId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID query',
          message: `Fund ID must be a positive integer, received: ${fundIdQuery}`,
        };
        return res.status(400).json(error);
      }
      const fundId = parsedId;

      if (!(await enforceProvidedFundScope(req, res, fundId))) {
        return;
      }

      if (typeof asOfQuery === 'string') {
        asOf = parseAsOfQuery(asOfQuery);
      }

      const response = await portfolioTimeMachineReadService.listCompanies(fundId, {
        ...(asOf ? { asOf } : {}),
        ...(typeof asOfQuery === 'string' ? { requestedAsOf: asOfQuery } : {}),
      });
      return res.json(response);
    } catch (error) {
      if (handleNumberParseError(error, res, 'Invalid fund ID query')) {
        return;
      }

      if (error instanceof ValidationError) {
        const apiError: ApiError = {
          error: 'Invalid asOf query',
          message: error.message,
        };
        return res.status(400).json(apiError);
      }

      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch portfolio companies',
      };
      return res.status(500).json(apiError);
    }
  }
);

router['get'](
  '/portfolio-companies/:id',
  portfolioCompaniesLimiter,
  async (req: Request, res: Response) => {
    try {
      const idParam = req.params['id'];
      const fundIdQuery = req.query['fundId'];
      const id = toNumber(idParam, 'ID');

      if (id <= 0) {
        const error: ApiError = {
          error: 'Invalid company ID',
          message: `Company ID must be a positive integer, received: ${idParam}`,
        };
        return res.status(400).json(error);
      }

      if (fundIdQuery === undefined || fundIdQuery === '') {
        const error: ApiError = {
          error: 'fund_scope_required',
          message: 'A fundId query parameter is required to fetch portfolio company',
        };
        return res.status(400).json(error);
      }

      const parsedFundId = toNumber(fundIdQuery as string, 'fund ID');
      if (parsedFundId <= 0) {
        const error: ApiError = {
          error: 'Invalid fund ID query',
          message: `Fund ID must be a positive integer, received: ${fundIdQuery}`,
        };
        return res.status(400).json(error);
      }
      const fundId = parsedFundId;

      if (!(await enforceProvidedFundScope(req, res, fundId))) {
        return;
      }

      const company = await storage.getPortfolioCompany(id);
      if (!company || company.fundId !== fundId) {
        const error: ApiError = {
          error: 'Company not found',
          message: `No portfolio company exists for fund ${fundId} with ID: ${id}`,
        };
        return res.status(404).json(error);
      }

      return res.json(company);
    } catch (error) {
      if (
        handleNumberParseError(error, res, (parseError) =>
          parseError.message.toLowerCase().includes('fund id')
            ? 'Invalid fund ID query'
            : 'Invalid company ID'
        )
      ) {
        return;
      }

      const apiError: ApiError = {
        error: 'Database query failed',
        message: error instanceof Error ? error.message : 'Failed to fetch portfolio company',
      };
      return res.status(500).json(apiError);
    }
  }
);

router.post(
  '/portfolio-companies',
  portfolioCompaniesLimiter,
  async (req: Request, res: Response) => {
    try {
      const result = insertPortfolioCompanySchema.safeParse(req.body);
      if (!result.success) {
        const error: ApiError = {
          error: 'Invalid company data',
          message: 'Portfolio company validation failed',
          details: { validationErrors: result.error.issues },
        };
        return res.status(400).json(error);
      }

      const sectorIssues = CompanySectorSchema.safeParse(result.data['sector']).error?.issues ?? [];
      const stageIssues = CompanyStageSchema.safeParse(result.data['stage']).error?.issues ?? [];
      const currentStageIssues =
        result.data['currentStage'] == null
          ? []
          : (CompanyStageSchema.safeParse(result.data['currentStage']).error?.issues ?? []);
      const taxonomyIssues = [...sectorIssues, ...stageIssues, ...currentStageIssues];
      if (taxonomyIssues.length > 0) {
        const error: ApiError = {
          error: 'Invalid company data',
          message: 'Portfolio company validation failed',
          details: { validationErrors: taxonomyIssues },
        };
        return res.status(400).json(error);
      }

      if (
        typeof result.data['fundId'] === 'number' &&
        !(await enforceProvidedFundScope(req, res, result.data['fundId']))
      ) {
        return;
      }

      const company = await storage.createPortfolioCompany(result.data);
      return res.status(201).json(company);
    } catch (error) {
      const apiError: ApiError = {
        error: 'Database operation failed',
        message: error instanceof Error ? error.message : 'Failed to create portfolio company',
      };
      return res.status(500).json(apiError);
    }
  }
);

export default router;
