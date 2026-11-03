import { z } from 'zod';

const Money = z.string().regex(/^\d+(?:\.\d+)?$/);
const Count = z.number().int().nonnegative();
const Quarter = z.string().regex(/^\d{4}-Q[1-4]$/);

export const PublishedInvestmentTotalsSchema = z
  .object({
    deployedCapital: Money,
    initialCapital: Money,
    followOnCapital: Money,
    secondaryCapital: Money.optional(),
    otherCapital: Money.optional(),
    transactionCount: Count,
    companyCount: Count,
  })
  .strict();

export const PublishedInvestmentPeriodSchema = PublishedInvestmentTotalsSchema.extend({
  period: Quarter,
  newCompanies: Count,
  cumulativeCapital: Money,
  cumulativeCompanies: Count,
}).strict();

export const ForecastInvestmentBaselineSchema = z
  .object({
    snapshotId: z.number().int().positive(),
    scenarioName: z.string(),
    configVersion: z.number().int().positive(),
    inputHash: z.string(),
    startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    committedCapital: Money,
    totals: z
      .object({
        deployedCapital: Money,
        initialCapital: Money,
        followOnCapital: Money,
        companyCount: Money,
      })
      .strict(),
    periods: z.array(
      z
        .object({
          period: Quarter,
          initialCapital: Money,
          followOnCapital: Money,
          deployedCapital: Money,
          newCompanies: Money,
          cumulativeCapital: Money,
          cumulativeCompanies: Money,
        })
        .strict()
    ),
  })
  .strict();

export const InvestmentComparisonSchema = z
  .object({
    status: z.enum(['available', 'unavailable']),
    asOfDate: z.string().date(),
    basis: z
      .object({
        snapshotId: z.number().int().positive(),
        snapshotInputHash: z.string(),
        snapshotAsOfDate: z.string().date(),
        knowledgeCutoff: z.string().datetime(),
      })
      .strict()
      .nullable(),
    actual: PublishedInvestmentTotalsSchema.nullable(),
    periods: z.array(PublishedInvestmentPeriodSchema),
    baseline: ForecastInvestmentBaselineSchema.nullable(),
    reason: z.string().nullable(),
    baselineReason: z.string().nullable(),
    disclosures: z.array(z.string()),
  })
  .strict();

export type InvestmentComparison = z.infer<typeof InvestmentComparisonSchema>;
export type PublishedInvestmentTotals = z.infer<typeof PublishedInvestmentTotalsSchema>;
export type PublishedInvestmentPeriod = z.infer<typeof PublishedInvestmentPeriodSchema>;
export type ForecastInvestmentBaseline = z.infer<typeof ForecastInvestmentBaselineSchema>;

export interface InvestmentComparisonOptions {
  asOfDate?: string | undefined;
  baselineSnapshotId?: number | undefined;
  baselineStartMonth?: string | undefined;
}
