/**
 * LP Reporting -- Cash Flow Event Contract (CREATE shape)
 *
 * Discriminated union over the 7 documented event types from
 * migrations/0014_lp_evidence_sprint3_drift.sql:
 *   lp_capital_call, lp_distribution, fund_expense, portfolio_investment,
 *   realized_proceeds, recallable_distribution, reversal.
 *
 * Money fields are decimal strings per ADR-011
 * (docs/adr/ADR-011-decimal-string-api-convention.md). NEVER JS number
 * for money. The Phase 0.5 verifier greps this directory for
 * `z.number()` in money-bearing fields and fails the gate on any match.
 *
 * UPDATE and response shapes are Phase 1 work.
 *
 * @module shared/contracts/lp-reporting/cash-flow-event.contract
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { z } from 'zod';

/**
 * Decimal-as-string. Up to 6 decimal places to match NUMERIC(20,6) at rest.
 * Accepts: "1250000", "1250000.000000", "-50.5", "0".
 * Rejects: "1.2.3", "abc", "1250000.0000001" (7 decimals).
 */
export const DecimalStringSchema = z.string().regex(/^-?\d+(\.\d{1,6})?$/);
export const MoneyStringSchema = DecimalStringSchema;
export const BigIntStringSchema = z.string().regex(/^-?\d+$/);

export type DecimalString = z.infer<typeof DecimalStringSchema>;
export type MoneyString = z.infer<typeof MoneyStringSchema>;
export type BigIntString = z.infer<typeof BigIntStringSchema>;

export const CashFlowEventTypeSchema = z.enum([
  'lp_capital_call',
  'lp_distribution',
  'fund_expense',
  'portfolio_investment',
  'realized_proceeds',
  'recallable_distribution',
  'reversal',
]);

export const CashFlowPerspectiveSchema = z.enum(['lp_net', 'fund_gross', 'vehicle', 'company']);

export type CashFlowEventType = z.infer<typeof CashFlowEventTypeSchema>;
export type CashFlowPerspective = z.infer<typeof CashFlowPerspectiveSchema>;

const BaseCashFlowEventSchema = z
  .object({
    fundId: z.number().int().positive(),
    vehicleId: z.number().int().positive().optional(),
    companyId: z.number().int().positive().optional(),
    lpId: z.number().int().positive().optional(),
    amount: DecimalStringSchema,
    currency: z.literal('USD').default('USD'),
    eventDate: z.string().datetime(),
    description: z.string().max(1000).optional(),
    perspective: CashFlowPerspectiveSchema,
  })
  .strict();

export const LpCapitalCallSchema = BaseCashFlowEventSchema.extend({
  eventType: z.literal('lp_capital_call'),
  payload: z
    .object({
      callNumber: z.number().int().positive().optional(),
      dueDate: z.string().date().optional(),
      purpose: z.string().max(500).optional(),
    })
    .strict()
    .default({}),
}).strict();

export const LpDistributionSchema = BaseCashFlowEventSchema.extend({
  eventType: z.literal('lp_distribution'),
  payload: z
    .object({
      distributionType: z.enum(['return_of_capital', 'gain', 'income', 'recallable']).optional(),
      recallable: z.boolean().optional(),
    })
    .strict()
    .default({}),
}).strict();

export const PortfolioInvestmentSchema = BaseCashFlowEventSchema.extend({
  eventType: z.literal('portfolio_investment'),
  // Override: companyId is REQUIRED for portfolio_investment events.
  companyId: z.number().int().positive(),
  payload: z
    .object({
      roundName: z.string().max(64).optional(),
      securityType: z.string().max(64).optional(),
      ownershipPercent: DecimalStringSchema.optional(),
    })
    .strict()
    .default({}),
}).strict();

export const RealizedProceedsSchema = BaseCashFlowEventSchema.extend({
  eventType: z.literal('realized_proceeds'),
  // Override: companyId is REQUIRED for realized_proceeds events.
  companyId: z.number().int().positive(),
  payload: z
    .object({
      realizationType: z.enum(['exit', 'secondary', 'dividend', 'recap']).optional(),
    })
    .strict()
    .default({}),
}).strict();

export const FundExpenseSchema = BaseCashFlowEventSchema.extend({
  eventType: z.literal('fund_expense'),
  payload: z
    .object({
      category: z.enum(['management_fee', 'legal', 'audit', 'admin', 'other']),
      vendor: z.string().max(255).optional(),
      periodStart: z.string().date().optional(),
      periodEnd: z.string().date().optional(),
    })
    .strict(),
}).strict();

export const RecallableDistributionSchema = BaseCashFlowEventSchema.extend({
  eventType: z.literal('recallable_distribution'),
  payload: z
    .object({
      windowEnd: z.string().date().optional(),
      sourceCompanyId: z.number().int().positive().optional(),
    })
    .strict()
    .default({}),
}).strict();

export const ReversalSchema = BaseCashFlowEventSchema.extend({
  eventType: z.literal('reversal'),
  reversalOfEventId: z.number().int().positive(),
  payload: z
    .object({
      reason: z.string().max(500).optional(),
    })
    .strict()
    .default({}),
}).strict();

export const CashFlowEventCreateSchema = z.discriminatedUnion('eventType', [
  LpCapitalCallSchema,
  LpDistributionSchema,
  PortfolioInvestmentSchema,
  RealizedProceedsSchema,
  FundExpenseSchema,
  RecallableDistributionSchema,
  ReversalSchema,
]);

export type LpCapitalCall = z.infer<typeof LpCapitalCallSchema>;
export type LpDistribution = z.infer<typeof LpDistributionSchema>;
export type PortfolioInvestment = z.infer<typeof PortfolioInvestmentSchema>;
export type RealizedProceeds = z.infer<typeof RealizedProceedsSchema>;
export type FundExpense = z.infer<typeof FundExpenseSchema>;
export type RecallableDistribution = z.infer<typeof RecallableDistributionSchema>;
export type Reversal = z.infer<typeof ReversalSchema>;
export type CashFlowEventCreate = z.infer<typeof CashFlowEventCreateSchema>;

// ============================================================================
// RESPONSE SHAPES (server -> client) -- Phase 1
// Money as decimal string (ADR-011). NEVER expose source_hash, lock/supersede/
// reversal internals, or import provenance.
// ============================================================================

export const CashFlowEventResponseSchema = z
  .object({
    id: z.number().int().positive(),
    fundId: z.number().int().positive(),
    eventType: CashFlowEventTypeSchema,
    amount: MoneyStringSchema,
    currency: z.literal('USD'),
    eventDate: z.string().datetime(),
    perspective: CashFlowPerspectiveSchema,
    description: z.string().nullable(),
    payload: z.record(z.unknown()),
    status: z.enum(['draft', 'approved', 'locked', 'reversed']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    etag: z.string().min(1),
  })
  .strict();

export const CashFlowEventListResponseSchema = z.object({
  data: z.array(CashFlowEventResponseSchema),
});

// ============================================================================
// PATCH (draft edit) -- lp_capital_call only. Strict partial update.
// `null` stores JSON/SQL null; omitted keys preserve existing values.
// ============================================================================

export const LpCapitalCallPatchSchema = z
  .object({
    fundId: z.number().int().positive().optional(),
    amount: MoneyStringSchema.optional(),
    description: z.string().max(1000).nullable().optional(),
    eventDate: z.string().datetime().optional(),
    payload: z
      .object({
        callNumber: z.number().int().positive().nullable().optional(),
        dueDate: z.string().date().nullable().optional(),
        purpose: z.string().max(500).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) => {
      const editKeys = Object.keys(value).filter((key) => key !== 'fundId');
      if (editKeys.length === 0) return false;
      if (editKeys.length === 1 && editKeys[0] === 'payload') {
        return value.payload !== undefined && Object.keys(value.payload).length > 0;
      }
      return true;
    },
    { message: 'PATCH must include at least one editable field' }
  );

export type LpCapitalCallPatch = z.infer<typeof LpCapitalCallPatchSchema>;

export type CashFlowEventResponse = z.infer<typeof CashFlowEventResponseSchema>;
export type CashFlowEventListResponse = z.infer<typeof CashFlowEventListResponseSchema>;
