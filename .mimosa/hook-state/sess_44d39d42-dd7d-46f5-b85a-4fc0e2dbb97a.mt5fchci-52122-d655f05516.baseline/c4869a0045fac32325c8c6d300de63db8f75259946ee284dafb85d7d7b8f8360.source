import { z } from 'zod';

/**
 * Shared dataset `meta` contract for fund-scoped portfolio reads.
 *
 * Mirrors the `PortfolioCompaniesMeta` shape produced by
 * `server/services/portfolio-time-machine-read.ts` (and consumed client-side in
 * `client/src/hooks/use-fund-data.ts`). Centralised here so the portfolio
 * companies and portfolio overview responses share one definition and cannot
 * drift.
 */

export const PortfolioCompaniesModeSchema = z.enum(['live', 'historical']);
export const PortfolioCompaniesSourceSchema = z.enum(['live', 'snapshot']);
export const PortfolioCompaniesEmptyReasonSchema = z.enum([
  'no_snapshot',
  'unsupported_snapshot',
  'no_companies_at_date',
]);

export const PortfolioCompaniesMetaSchema = z
  .object({
    mode: PortfolioCompaniesModeSchema,
    requestedAsOf: z.string().nullable(),
    resolvedAsOf: z.string().nullable(),
    source: PortfolioCompaniesSourceSchema,
    historicalAvailable: z.boolean(),
    emptyReason: PortfolioCompaniesEmptyReasonSchema.optional(),
  })
  .strict();

export type PortfolioCompaniesMode = z.infer<typeof PortfolioCompaniesModeSchema>;
export type PortfolioCompaniesSource = z.infer<typeof PortfolioCompaniesSourceSchema>;
export type PortfolioCompaniesEmptyReason = z.infer<typeof PortfolioCompaniesEmptyReasonSchema>;
export type PortfolioCompaniesMeta = z.infer<typeof PortfolioCompaniesMetaSchema>;
