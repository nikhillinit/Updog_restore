import { z } from 'zod';

import { FinancialProvenanceSchema } from './financial-provenance.contract';
import { PortfolioCompaniesMetaSchema } from './portfolio-meta.contract';

/**
 * Portfolio overview response (v1).
 *
 * Server-computed per-company MOIC and portfolio aggregates for a fund, carried
 * under the canonical #910 `FinancialProvenance`. Money/ratio fields are decimal
 * strings (computed with Decimal.js server-side; the client parses them purely
 * for display formatting, never for derivation). Counts are integers.
 */

const DecimalStringSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Must be a fixed-point decimal string');

export const PortfolioOverviewCompanySchema = z
  .object({
    // Live ids are positive; historical-snapshot fallbacks can be synthetic/negative.
    id: z.number().int(),
    name: z.string(),
    sector: z.string(),
    stage: z.string(),
    status: z.string(),
    invested: DecimalStringSchema,
    currentValue: DecimalStringSchema,
    moic: DecimalStringSchema,
  })
  .strict();

export const PortfolioOverviewMetricsSchema = z
  .object({
    totalInvested: DecimalStringSchema,
    totalValue: DecimalStringSchema,
    averageMOIC: DecimalStringSchema,
    returnPct: DecimalStringSchema,
    totalCompanies: z.number().int().nonnegative(),
    activeCompanies: z.number().int().nonnegative(),
    exitedCompanies: z.number().int().nonnegative(),
  })
  .strict();

export const PortfolioOverviewResponseV1Schema = z
  .object({
    fundId: z.number().int().positive(),
    generatedAt: z.string().datetime(),
    currency: z.string().length(3),
    provenance: FinancialProvenanceSchema,
    sourceRecordCounts: z.record(z.string(), z.number().int().nonnegative()),
    metrics: PortfolioOverviewMetricsSchema,
    companies: z.array(PortfolioOverviewCompanySchema),
    meta: PortfolioCompaniesMetaSchema,
  })
  .strict();

export type PortfolioOverviewCompany = z.infer<typeof PortfolioOverviewCompanySchema>;
export type PortfolioOverviewMetrics = z.infer<typeof PortfolioOverviewMetricsSchema>;
export type PortfolioOverviewResponseV1 = z.infer<typeof PortfolioOverviewResponseV1Schema>;
