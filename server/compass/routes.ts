/**
 * Compass - API Routes
 * RESTful endpoints for valuation sandbox
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import {
  calculateSandboxValuation,
} from './calculator';
import type {
  GetValuationContextResponse,
  SearchCompsRequest,
  SearchCompsResponse,
  CalculateValuationRequest,
  CalculateValuationResponse,
  SaveScenarioRequest,
  SaveScenarioResponse,
  GetPortfolioHeatmapRequest,
  GetPortfolioHeatmapResponse,
} from './types';

const router = Router();

/**
 * Health check for Compass service
 */
router["get"]('/health', (_req: Request, res: Response) => {
  res["json"]({
    service: 'compass',
    status: 'healthy',
    message: 'Valuation sandbox is operational',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/compass/portfolio-companies/:id/valuation-context
 * Fetch all data needed to initialize the calculator UI
 */
router["get"]('/portfolio-companies/:id/valuation-context', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // TODO: Fetch from database
    // const company = await db.query('SELECT * FROM compass.portfolio_company_metrics WHERE id = $1', [id]);
    // const suggestedComps = await db.query('SELECT * FROM compass.comparable_companies_cache WHERE sector = $1 LIMIT 10', [company.sector]);

    // Mock response for now
    const response: GetValuationContextResponse = {
      company: {
        id,
        name: 'Acme AI Inc',
        currentRevenue: 45000000,
        lastRound: {
          valuationUSD: 320000000,
          date: new Date('2024-01-15'),
          revenueAtRound: 28000000,
          impliedMultiple: 11.4,
        },
        sector: 'Enterprise SaaS',
        stage: 'Series B',
      },
      suggestedComps: [
        {
          id: 'pb_snowflake',
          name: 'Snowflake Inc',
          ticker: 'SNOW',
          evRevenueMultiple: 18.5,
          revenue: 2000000000,
          sector: 'Enterprise SaaS',
          isPublic: true,
        },
        {
          id: 'pb_datadog',
          name: 'Datadog Inc',
          ticker: 'DDOG',
          evRevenueMultiple: 15.2,
          revenue: 1800000000,
          sector: 'Infrastructure',
          isPublic: true,
        },
      ],
    };

    res["json"](response);
  } catch (error) {
    console.error('[Compass] Error fetching valuation context:', error);
    res["status"](500)["json"]({ error: 'Failed to fetch valuation context' });
  }
});

/**
 * GET /api/compass/comps/search
 * Search for comparable companies
 */
router["get"]('/comps/search', async (req: Request, res: Response) => {
  try {
    const { query, sector, stage, isPublic, limit = 20 } = req.query as unknown as SearchCompsRequest;

    // TODO: Implement database search with full-text search
    // const results = await db.query(`
    //   SELECT * FROM compass.comparable_companies_cache
    //   WHERE to_tsvector('english', company_name) @@ plainto_tsquery('english', $1)
    //   AND ($2::text IS NULL OR sector = $2)
    //   LIMIT $3
    // `, [query, sector, limit]);

    // Mock response
    const response: SearchCompsResponse = {
      results: [
        {
          id: 'pb_snowflake',
          name: 'Snowflake Inc',
          ticker: 'SNOW',
          evRevenueMultiple: 18.5,
          revenue: 2000000000,
          sector: 'Enterprise SaaS',
          isPublic: true,
        },
      ],
      totalCount: 1,
    };

    res["json"](response);
  } catch (error) {
    console.error('[Compass] Error searching comps:', error);
    res["status"](500)["json"]({ error: 'Failed to search comparable companies' });
  }
});

/**
 * GET /api/compass/comps/:id
 * Get full details for a specific comp
 */
router["get"]('/comps/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // TODO: Fetch from database
    // const comp = await db.query('SELECT * FROM compass.comparable_companies_cache WHERE id = $1 OR pitchbook_id = $1', [id]);

    // Mock response
    const comp = {
      id,
      name: 'Snowflake Inc',
      ticker: 'SNOW',
      evRevenueMultiple: 18.5,
      revenue: 2000000000,
      sector: 'Enterprise SaaS',
      isPublic: true,
      lastUpdated: new Date(),
    };

    res["json"](comp);
  } catch (error) {
    console.error('[Compass] Error fetching comp details:', error);
    res["status"](500)["json"]({ error: 'Failed to fetch comp details' });
  }
});

/**
 * POST /api/compass/calculate
 * Calculate sandbox valuation (client sends inputs, server returns result)
 */
router["post"]('/calculate', async (req: Request, res: Response) => {
  try {
    const { companyId, inputs, compIds } = req.body as CalculateValuationRequest;

    // Validate request
    if (!companyId || !inputs || !compIds) {
      return res["status"](400)["json"]({ error: 'Missing required fields: companyId, inputs, compIds' });
    }

    // TODO: Fetch company and comps from database
    // const company = await db.query('SELECT * FROM compass.portfolio_company_metrics WHERE id = $1', [companyId]);
    // const comps = await db.query('SELECT * FROM compass.comparable_companies_cache WHERE id = ANY($1)', [compIds]);

    // Mock data
    const company = {
      id: companyId,
      name: 'Acme AI Inc',
      currentRevenue: inputs.revenue,
      lastRound: {
        valuationUSD: 320000000,
        date: new Date('2024-01-15'),
        revenueAtRound: 28000000,
        impliedMultiple: 11.4,
      },
      sector: 'Enterprise SaaS',
      stage: 'Series B',
    };

    const comps = [
      {
        id: 'pb_snowflake',
        name: 'Snowflake Inc',
        ticker: 'SNOW',
        evRevenueMultiple: 18.5,
        revenue: 2000000000,
        sector: 'Enterprise SaaS',
        isPublic: true,
      },
    ];

    // Perform calculation
    const result = calculateSandboxValuation(inputs, comps, company);

    const response: CalculateValuationResponse = {
      result,
    };

    res["json"](response);
  } catch (error) {
    console.error('[Compass] Error calculating valuation:', error);

    if (error instanceof Error) {
      return res["status"](400)["json"]({ error: error.message });
    }

    res["status"](500)["json"]({ error: 'Failed to calculate valuation' });
  }
});

/**
 * POST /api/compass/scenarios
 * Save a valuation scenario
 */
router["post"]('/scenarios', async (req: Request, res: Response) => {
  try {
    const { portfolioCompanyId, scenarioName, result } = req.body as SaveScenarioRequest;
    const userId = (req as any).user?.id || 'system'; // TODO: Get from auth middleware

    // Validate request
    if (!portfolioCompanyId || !scenarioName || !result) {
      return res["status"](400)["json"]({ error: 'Missing required fields' });
    }

    // TODO: Save to database
    // const scenario = await db.query(`
    //   INSERT INTO compass.valuation_scenarios (user_id, portfolio_company_id, scenario_name, inputs, outputs, comps_used)
    //   VALUES ($1, $2, $3, $4, $5, $6)
    //   RETURNING *
    // `, [userId, portfolioCompanyId, scenarioName, result.inputs, result, result.compsUsed]);

    // Mock response
    const response: SaveScenarioResponse = {
      scenario: {
        id: crypto.randomUUID(),
        userId,
        portfolioCompanyId,
        scenarioName,
        result,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    res["status"](201)["json"](response);
  } catch (error) {
    console.error('[Compass] Error saving scenario:', error);
    res["status"](500)["json"]({ error: 'Failed to save scenario' });
  }
});

/**
 * GET /api/compass/scenarios
 * List user's saved scenarios
 */
router["get"]('/scenarios', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'system'; // TODO: Get from auth middleware
    const { companyId } = req.query;

    // TODO: Fetch from database
    // const scenarios = await db.query(`
    //   SELECT * FROM compass.valuation_scenarios
    //   WHERE user_id = $1 AND deleted_at IS NULL
    //   AND ($2::uuid IS NULL OR portfolio_company_id = $2)
    //   ORDER BY created_at DESC
    // `, [userId, companyId]);

    // Mock response
    res["json"]({
      scenarios: [],
      totalCount: 0,
    });
  } catch (error) {
    console.error('[Compass] Error fetching scenarios:', error);
    res["status"](500)["json"]({ error: 'Failed to fetch scenarios' });
  }
});

/**
 * DELETE /api/compass/scenarios/:id
 * Delete (soft delete) a scenario
 */
router["delete"]('/scenarios/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id || 'system';

    // TODO: Soft delete in database
    // await db.query(`
    //   UPDATE compass.valuation_scenarios
    //   SET deleted_at = NOW()
    //   WHERE id = $1 AND user_id = $2
    // `, [id, userId]);

    res["status"](204)["end"]();
  } catch (error) {
    console.error('[Compass] Error deleting scenario:', error);
    res["status"](500)["json"]({ error: 'Failed to delete scenario' });
  }
});

/**
 * GET /api/compass/portfolio/heatmap
 * Get portfolio-wide heatmap view
 */
router["get"]('/portfolio/heatmap', async (req: Request, res: Response) => {
  try {
    const { fundId, stage, sector } = req.query as unknown as GetPortfolioHeatmapRequest;

    // TODO: Fetch all companies and calculate sandbox values
    // This would be a complex query joining multiple tables

    // Mock response
    const response: GetPortfolioHeatmapResponse = {
      entries: [
        {
          companyId: crypto.randomUUID(),
          companyName: 'Acme AI Inc',
          stage: 'Series B',
          sector: 'Enterprise SaaS',
          sandboxValue: 415000000,
          lastOfficialMark: 320000000,
          vsLastMark: {
            absoluteChange: 95000000,
            percentChange: 29.7,
          },
          impliedMultiple: 9.2,
          revenue: 45000000,
          lastCalculated: new Date(),
        },
      ],
      summary: {
        totalCompanies: 1,
        totalSandboxValue: 415000000,
        averageMultiple: 9.2,
      },
    };

    res["json"](response);
  } catch (error) {
    console.error('[Compass] Error fetching portfolio heatmap:', error);
    res["status"](500)["json"]({ error: 'Failed to fetch portfolio heatmap' });
  }
});

export default router;
