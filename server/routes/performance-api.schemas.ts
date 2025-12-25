/**
 * Performance API - Zod Validation Schemas
 *
 * Request validation schemas for the Performance Dashboard API endpoints.
 *
 * Security Features:
 * - Input length limits to prevent DoS
 * - Metric whitelist to prevent injection
 * - Date range validation to limit query scope
 *
 * @module server/routes/performance-api.schemas
 */

import { z } from 'zod';

// ============================================================================
// SECURITY CONSTANTS
// ============================================================================

/** Maximum number of metrics per request */
const MAX_METRICS = 10;

/** Maximum length for metric string input */
const MAX_METRIC_STRING_LENGTH = 200;

/** Allowed metric names - whitelist approach prevents injection */
const ALLOWED_METRICS = [
  'irr',
  'moic',
  'tvpi',
  'dpi',
  'rvpi',
  'deployed',
  'nav',
  'distributions',
  'contributions',
  'gain_loss',
  'pme',
  'coc',
] as const;

// ============================================================================
// COMMON VALIDATION HELPERS
// ============================================================================

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const dateFormat = 'Invalid date format (YYYY-MM-DD)';

const isoDateString = z.string().regex(dateRegex, dateFormat);

const stringToBoolean = z
  .string()
  .transform((val) => val === 'true')
  .optional();

/**
 * Parse comma-delimited metric string with security validation:
 * - Enforces max string length
 * - Enforces max number of metrics
 * - Filters to allowed metrics only (unknown metrics ignored)
 */
const commaDelimitedMetrics = z
  .string()
  .max(MAX_METRIC_STRING_LENGTH, `Metrics string too long (max ${MAX_METRIC_STRING_LENGTH} chars)`)
  .transform((str) => {
    const metrics = str.split(',').map((s) => s.trim().toLowerCase());
    // Filter to only allowed metrics, limit count
    return metrics
      .filter((m): m is (typeof ALLOWED_METRICS)[number] =>
        ALLOWED_METRICS.includes(m as (typeof ALLOWED_METRICS)[number])
      )
      .slice(0, MAX_METRICS);
  })
  .optional();

// ============================================================================
// TIMESERIES QUERY SCHEMA
// ============================================================================

export const TimeseriesQuerySchema = z
  .object({
    startDate: isoDateString,
    endDate: isoDateString,
    granularity: z.enum(['daily', 'weekly', 'monthly', 'quarterly']),
    metrics: commaDelimitedMetrics,
    skipCache: stringToBoolean,
  })
  .refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
    message: 'startDate must be before or equal to endDate',
    path: ['startDate'],
  })
  .refine(
    (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      // Max 2 years of daily data
      return !(data.granularity === 'daily' && diffDays > 730);
    },
    {
      message: 'Daily granularity limited to 2 years max',
      path: ['granularity'],
    }
  );

export type TimeseriesQueryInput = z.input<typeof TimeseriesQuerySchema>;
export type TimeseriesQueryOutput = z.output<typeof TimeseriesQuerySchema>;

// ============================================================================
// BREAKDOWN QUERY SCHEMA
// ============================================================================

export const BreakdownQuerySchema = z.object({
  asOfDate: isoDateString.optional(),
  groupBy: z.enum(['sector', 'stage', 'company']),
  includeExited: stringToBoolean,
  skipCache: stringToBoolean,
});

export type BreakdownQueryInput = z.input<typeof BreakdownQuerySchema>;
export type BreakdownQueryOutput = z.output<typeof BreakdownQuerySchema>;

// ============================================================================
// COMPARISON QUERY SCHEMA
// ============================================================================

export const ComparisonQuerySchema = z
  .object({
    dates: z.string().transform((str) => str.split(',').map((d) => d.trim())),
    metrics: commaDelimitedMetrics,
    skipCache: stringToBoolean,
  })
  .refine((data) => data.dates.length >= 1 && data.dates.length <= 5, {
    message: 'Must provide 1-5 dates for comparison',
    path: ['dates'],
  })
  .refine((data) => data.dates.every((d) => dateRegex.test(d)), {
    message: 'All dates must be in YYYY-MM-DD format',
    path: ['dates'],
  });

export type ComparisonQueryInput = z.input<typeof ComparisonQuerySchema>;
export type ComparisonQueryOutput = z.output<typeof ComparisonQuerySchema>;
