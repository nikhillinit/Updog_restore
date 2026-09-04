import { z } from 'zod';

export const FINANCIAL_FACTS_CONSUMER_KEYS = [
  'forecast',
  'reserve',
  'economics',
  'periodic_analysis',
] as const;

export const FinancialFactsConsumerKeySchema = z.enum(FINANCIAL_FACTS_CONSUMER_KEYS);

export const ConsumerEvaluationReasonSchema = z.enum([
  'unattributed_legacy_direct',
  // Additive (PLAN_61 Task 6, facts policy 1.0.1): a non-default working-value
  // selection head deviates from the default rule for this consumer. Persisted
  // 1.0.0 rows never carry it, so they still parse; dormant in production until
  // Task 11 seeds a non-default head.
  'working_value_selection_deviation',
]);

export const ConsumerEvaluationReasonV2Schema = z.enum([
  ...ConsumerEvaluationReasonSchema.options,
  'mixed_term_versions',
  'uniformly_stale_refs',
  'mixed_legacy_ledger_provenance',
  'position_valuation_incomplete',
  'valuation_mark_stale',
  'contingent_instrument_excluded',
]);

export const ConsumerEvaluationReasonV3Schema = z.enum([
  ...ConsumerEvaluationReasonV2Schema.options,
  'unsupported_payload_policy',
  'ledger_coverage_partial',
  'investment_lineage_unresolved',
  'period_nav_unavailable',
]);

export const ConsumerEvaluationDetailV2Schema = z
  .object({
    code: ConsumerEvaluationReasonV2Schema,
    companyIds: z.array(z.number().int().positive()).optional(),
    vehicleId: z.number().int().positive().optional(),
    companyIdentityId: z.number().int().positive().optional(),
    message: z.string().min(1).optional(),
  })
  .strict();

export const ConsumerEvaluationSchema = z
  .object({
    consumer: FinancialFactsConsumerKeySchema,
    status: z.enum(['accepted', 'blocked']),
    reasons: z.array(ConsumerEvaluationReasonSchema),
  })
  .strict();

export const ConsumerEvaluationV2Schema = z
  .object({
    consumer: FinancialFactsConsumerKeySchema,
    status: z.enum(['accepted', 'blocked']),
    reasons: z.array(ConsumerEvaluationReasonV2Schema),
    details: z.array(ConsumerEvaluationDetailV2Schema).optional(),
  })
  .strict();

export const ConsumerEvaluationDetailV3Schema = z
  .object({
    code: ConsumerEvaluationReasonV3Schema,
    companyIds: z.array(z.number().int().positive()).optional(),
    vehicleId: z.number().int().positive().optional(),
    companyIdentityId: z.number().int().positive().optional(),
    message: z.string().min(1).optional(),
  })
  .strict();

export const ConsumerEvaluationV3Schema = z
  .object({
    consumer: FinancialFactsConsumerKeySchema,
    status: z.enum(['accepted', 'blocked']),
    reasons: z.array(ConsumerEvaluationReasonV3Schema),
    details: z.array(ConsumerEvaluationDetailV3Schema).optional(),
  })
  .strict();

export type FinancialFactsConsumerKey = z.infer<typeof FinancialFactsConsumerKeySchema>;
export type ConsumerEvaluationReason = z.infer<typeof ConsumerEvaluationReasonSchema>;
export type ConsumerEvaluationReasonV2 = z.infer<typeof ConsumerEvaluationReasonV2Schema>;
export type ConsumerEvaluationReasonV3 = z.infer<typeof ConsumerEvaluationReasonV3Schema>;
export type ConsumerEvaluation = z.infer<typeof ConsumerEvaluationSchema>;
export type ConsumerEvaluationV2 = z.infer<typeof ConsumerEvaluationV2Schema>;
export type ConsumerEvaluationDetailV3 = z.infer<typeof ConsumerEvaluationDetailV3Schema>;
export type ConsumerEvaluationV3 = z.infer<typeof ConsumerEvaluationV3Schema>;

export const DEFAULT_SELECTION_RULE = 'latest_effective_dated_accepted_at_or_before_as_of' as const;

export const CONSUMER_DEFAULT_SELECTION_RULES: Record<
  FinancialFactsConsumerKey,
  typeof DEFAULT_SELECTION_RULE
> = {
  forecast: DEFAULT_SELECTION_RULE,
  reserve: DEFAULT_SELECTION_RULE,
  economics: DEFAULT_SELECTION_RULE,
  periodic_analysis: DEFAULT_SELECTION_RULE,
};
