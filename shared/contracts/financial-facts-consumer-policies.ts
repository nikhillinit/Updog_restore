import { z } from 'zod';

export const FINANCIAL_FACTS_CONSUMER_KEYS = [
  'forecast',
  'reserve',
  'economics',
  'periodic_analysis',
] as const;

export const FinancialFactsConsumerKeySchema = z.enum(FINANCIAL_FACTS_CONSUMER_KEYS);

export const ConsumerEvaluationReasonSchema = z.enum(['unattributed_legacy_direct']);

export const ConsumerEvaluationSchema = z
  .object({
    consumer: FinancialFactsConsumerKeySchema,
    status: z.enum(['accepted', 'blocked']),
    reasons: z.array(ConsumerEvaluationReasonSchema),
  })
  .strict();

export type FinancialFactsConsumerKey = z.infer<typeof FinancialFactsConsumerKeySchema>;
export type ConsumerEvaluationReason = z.infer<typeof ConsumerEvaluationReasonSchema>;
export type ConsumerEvaluation = z.infer<typeof ConsumerEvaluationSchema>;
