/**
 * LP Reporting -- Valuation Mark Contract (CREATE shape)
 *
 * Mirrors the valuation_marks table from
 * server/migrations/20260508_lp_reporting_foundation_v1.up.sql.
 * fairValue and costBasis are decimal strings per ADR-011; never JS
 * number for money.
 *
 * @module shared/contracts/lp-reporting/valuation-mark.contract
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { z } from 'zod';
import { DecimalStringSchema } from './cash-flow-event.contract';

export const MarkSourceSchema = z.enum([
  'financing_round',
  'signed_loi',
  'revenue_milestone',
  'strategic_partnership',
  'audited_financials',
  'board_update',
  'gp_estimate',
  'third_party_priced',
  'secondary_transaction',
  'impairment',
]);

export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);

export type MarkSource = z.infer<typeof MarkSourceSchema>;
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const ValuationMarkCreateSchema = z
  .object({
    fundId: z.number().int().positive(),
    vehicleId: z.number().int().positive().optional(),
    companyId: z.number().int().positive(),
    markDate: z.string().date(),
    asOfDate: z.string().date(),
    fairValue: DecimalStringSchema,
    currency: z.literal('USD').default('USD'),
    costBasis: DecimalStringSchema.optional(),
    markSource: MarkSourceSchema,
    confidenceLevel: ConfidenceLevelSchema,
    valuationMethod: z.string().max(64),
    methodologyNotes: z.string().max(5000).optional(),
    priorMarkId: z.number().int().positive().optional(),
  })
  .strict();

export type ValuationMarkCreate = z.infer<typeof ValuationMarkCreateSchema>;
