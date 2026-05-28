import { z } from 'zod';

import { LpMetricRunDiagnosticsSchema } from '@shared/contracts/lp-reporting';

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);

const CashFlowEventSchema = z.object({
  id: z.number().int().positive(),
  eventType: z.enum([
    'lp_capital_call',
    'lp_distribution',
    'portfolio_investment',
    'realized_proceeds',
    'fund_expense',
    'recallable_distribution',
    'reversal',
  ]),
  amount: decimalString,
  eventDate: z.string().min(10),
  perspective: z.enum(['lp_net', 'fund_gross', 'vehicle', 'company']),
  status: z.enum(['draft', 'approved', 'locked', 'reversed']).optional(),
  reversalOfEventId: z.number().int().positive().nullable().optional(),
});

const ValuationMarkSchema = z.object({
  id: z.number().int().positive(),
  fairValue: decimalString,
  markDate: z.string().date(),
  asOfDate: z.string().date(),
  status: z.enum(['draft', 'approved', 'locked', 'superseded', 'reversed']).optional(),
  confidenceLevel: z.enum(['high', 'medium', 'low']),
  companyId: z.number().int().positive().optional(),
});

export const GoldenMetricFixtureSchema = z.object({
  scenario_id: z.string().min(1),
  description: z.string().min(1),
  engine: z.object({
    target: z.string().min(1),
    current_output_precision: z.string().min(1),
    requested_golden_precision: z.literal('1e-8'),
    precision_note: z.string().min(1),
  }),
  input: z.object({
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    perspective: z.enum(['lp_net', 'fund_gross']),
    cashFlowEvents: z.array(CashFlowEventSchema),
    valuationMarks: z.array(ValuationMarkSchema),
  }),
  derivedCapital: z.object({
    investable_capital_usd: decimalString,
    total_deployed_usd: decimalString,
    remaining_capital_usd: decimalString,
    recycled_capital_usd: decimalString,
  }),
  expected: z.object({
    contributionsTotal: decimalString,
    distributionsTotal: decimalString,
    currentNav: decimalString,
    dpi: decimalString.nullable(),
    rvpi: decimalString.nullable(),
    tvpi: decimalString.nullable(),
    irr: decimalString.nullable(),
    lp_proceeds_usd: decimalString,
    engine_decimal_strings: z.object({
      dpi: decimalString.nullable(),
      rvpi: decimalString.nullable(),
      tvpi: decimalString.nullable(),
      netIrr: decimalString.nullable(),
      grossIrr: decimalString.nullable(),
      contributionsTotal: decimalString,
      distributionsTotal: decimalString,
      currentNav: decimalString,
    }),
    tolerances: z.object({
      requested_metric: decimalString,
      current_engine_metric: decimalString,
      money: decimalString,
    }),
  }),
  notes: z.array(z.string()).default([]),
  lock: z
    .object({
      locked_at: z.string().datetime(),
      inputs_hash: z.string().regex(/^[a-f0-9]{64}$/),
      diagnostics: LpMetricRunDiagnosticsSchema,
    })
    .optional(),
});

export type GoldenMetricFixture = z.infer<typeof GoldenMetricFixtureSchema>;
