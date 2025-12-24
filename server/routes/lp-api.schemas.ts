/**
 * LP Reporting API - Zod Validation Schemas
 *
 * Request validation schemas for LP Reporting Dashboard endpoints.
 *
 * Security Features:
 * - Input length limits to prevent DoS
 * - Date range validation to limit query scope
 * - Granularity constraints for performance timeseries
 * - Fund ID whitelist validation (LP can only query funds they're invested in)
 *
 * @module server/routes/lp-api.schemas
 */

import { z } from 'zod';

// ============================================================================
// COMMON VALIDATION HELPERS
// ============================================================================

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateFormat = 'Invalid date format (YYYY-MM-DD)';

const isoDateString = z.string().regex(dateRegex, dateFormat);

const stringToBoolean = z
  .string()
  .optional()
  .transform((val) => val === 'true');

const stringToBooleanDefaultTrue = z
  .string()
  .optional()
  .transform((val) => val === undefined || val === 'true');

/** Maximum number of fund IDs per request */
const MAX_FUND_IDS = 10;

/** Maximum pagination limit */
const MAX_LIMIT = 100;

// ============================================================================
// LP PROFILE SCHEMA
// ============================================================================

export const LPProfileSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  entityType: z.enum(['individual', 'institution', 'fund_of_funds']),
  taxId: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  contactName: z.string().max(255).optional(),
  contactEmail: z.string().email().max(255).optional(),
  contactPhone: z.string().max(50).optional(),
});

export type LPProfileInput = z.input<typeof LPProfileSchema>;
export type LPProfileOutput = z.output<typeof LPProfileSchema>;

// ============================================================================
// CAPITAL ACCOUNT QUERY SCHEMA
// ============================================================================

export const CapitalAccountQuerySchema = z.object({
  fundIds: z
    .string()
    .optional()
    .transform((str) => {
      if (!str) return undefined;
      const ids = str.split(',').map((s) => parseInt(s.trim(), 10));
      return ids.filter((id) => !isNaN(id)).slice(0, MAX_FUND_IDS);
    }),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  limit: z
    .string()
    .optional()
    .transform((str) => {
      if (!str) return 50; // Default limit
      const num = parseInt(str, 10);
      return isNaN(num) ? 50 : Math.min(num, MAX_LIMIT);
    }),
  cursor: z.string().optional(), // Opaque cursor for pagination
  skipCache: stringToBoolean,
});

export type CapitalAccountQueryInput = z.input<typeof CapitalAccountQuerySchema>;
export type CapitalAccountQueryOutput = z.output<typeof CapitalAccountQuerySchema>;

// ============================================================================
// PERFORMANCE QUERY SCHEMA
// ============================================================================

export const PerformanceQuerySchema = z.object({
  fundId: z
    .string()
    .optional()
    .transform((str) => {
      if (!str) return undefined;
      const num = parseInt(str, 10);
      return isNaN(num) ? undefined : num;
    }),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  granularity: z.enum(['daily', 'weekly', 'monthly', 'quarterly']).optional().default('monthly'),
  includeBenchmarks: stringToBoolean,
  skipCache: stringToBoolean,
});

export type PerformanceQueryInput = z.input<typeof PerformanceQuerySchema>;
export type PerformanceQueryOutput = z.output<typeof PerformanceQuerySchema>;

// ============================================================================
// REPORT CONFIG SCHEMA
// ============================================================================

export const ReportConfigSchema = z
  .object({
    reportType: z.enum(['quarterly', 'annual', 'tax_package', 'capital_account']),
    dateRange: z.object({
      startDate: isoDateString,
      endDate: isoDateString,
    }),
    fundIds: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_FUND_IDS)
      .optional(),
    sections: z
      .array(
        z.enum([
          'summary',
          'capital_account',
          'performance',
          'holdings',
          'distributions',
          'tax_summary',
        ])
      )
      .optional(),
    format: z.enum(['pdf', 'xlsx', 'csv']).optional().default('pdf'),
    templateId: z.number().int().positive().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((data) => new Date(data.dateRange.startDate) <= new Date(data.dateRange.endDate), {
    message: 'startDate must be before or equal to endDate',
    path: ['dateRange', 'startDate'],
  })
  .refine(
    (data) => {
      const start = new Date(data.dateRange.startDate);
      const end = new Date(data.dateRange.endDate);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      // Max 5 years for a single report
      return diffDays <= 1825; // ~5 years
    },
    {
      message: 'Report date range limited to 5 years max',
      path: ['dateRange'],
    }
  );

export type ReportConfigInput = z.input<typeof ReportConfigSchema>;
export type ReportConfigOutput = z.output<typeof ReportConfigSchema>;

// ============================================================================
// FUND DETAIL QUERY SCHEMA
// ============================================================================

export const FundDetailQuerySchema = z.object({
  asOfDate: isoDateString.optional(),
  includeHoldings: stringToBooleanDefaultTrue,
  skipCache: stringToBoolean,
});

export type FundDetailQueryInput = z.input<typeof FundDetailQuerySchema>;
export type FundDetailQueryOutput = z.output<typeof FundDetailQuerySchema>;
