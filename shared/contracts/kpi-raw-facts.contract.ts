/**
 * KPI RAW FACTS CONTRACT
 *
 * API endpoint returns ONLY raw facts (no computed KPIs).
 * Client-side selectors derive DPI, TVPI, IRR from these facts.
 *
 * Endpoint: GET /api/funds/:fundId/kpis
 * Decision: Keep API lightweight; computation happens client-side in pure selectors
 */

import { z } from 'zod';

// ============================================================================
// RAW FACTS RESPONSE (What API Returns)
// ============================================================================

export const InvestmentSchema = z.object({
  id: z.string().optional(), // May be generated client-side
  companyName: z.string(),
  initialAmount: z.number().positive(),
  followOns: z.array(z.number()).optional(),
  realized: z.array(z.number()).optional(),
  nav: z.number().optional(),
  cashflows: z.array(z.number()).optional(),
});

export const KPIRawFactsResponseSchema = z.object({
  fundId: z.string().uuid(),
  asOf: z.string().datetime(), // ISO 8601 timestamp
  committed: z.number().nonnegative(),

  // Transaction history (raw facts)
  capitalCalls: z.array(z.object({
    date: z.string().datetime(),
    amount: z.number(),
  })),

  distributions: z.array(z.object({
    date: z.string().datetime(),
    amount: z.number(),
  })),

  navSeries: z.array(z.object({
    date: z.string().datetime(),
    value: z.number(),
  })),

  investments: z.array(InvestmentSchema),
});

export type KPIRawFactsResponse = z.infer<typeof KPIRawFactsResponseSchema>;

// ============================================================================
// COMPUTED KPIs (What Selectors Produce)
// ============================================================================

export interface FundKpis {
  committed: number;
  called: number;
  uncalled: number;
  invested: number;
  nav: number;
  dpi: number;
  tvpi: number;
  irr: number | null;
  asOf: string;
}

/**
 * API Endpoint Contract
 * GET /api/funds/:fundId/kpis?asOf=YYYY-MM-DD
 * Response: KPIRawFactsResponse (200) | ErrorResponse (4xx/5xx)
 *
 * NOTE: If you need server-computed KPIs for other clients,
 * create a SEPARATE endpoint: GET /api/funds/:fundId/kpis/summary
 * Do NOT feed header cards from summary to avoid drift.
 */
export const KPI_RAW_FACTS_ENDPOINT = '/api/funds/:fundId/kpis' as const;
