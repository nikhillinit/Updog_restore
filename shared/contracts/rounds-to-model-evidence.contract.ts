import { z } from 'zod';

import { SecurityTypeSchema } from './investments/investment-round.contract';
import { DecimalStringSchema } from './lp-reporting/cash-flow-event.contract';
import {
  ProvenanceEnvelopeSchema,
  StructuredWarningSchema,
  WarningCodeSchema,
} from './provenance-envelope.contract';

const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);

export const RoundModelRoleSchema = z.enum(['initial', 'follow_on', 'ambiguous', 'amount_only']);

export const RoundEvidenceSchema = z
  .object({
    roundId: z.number().int().positive(),
    investmentId: z.number().int().positive(),
    companyId: z.number().int().positive(),
    roundDate: z.string().date(),
    securityType: SecurityTypeSchema,
    role: RoundModelRoleSchema,
    currency: CurrencySchema,
    investmentAmount: DecimalStringSchema,
    amountOnly: z.boolean(),
    overrideApplied: z.boolean(),
  })
  .strict();

export const CompanyRoundsEvidenceSchema = z
  .object({
    companyId: z.number().int().positive(),
    companyName: z.string().min(1),
    investmentIds: z.array(z.number().int().positive()),
    initialAmount: DecimalStringSchema,
    followOnAmount: DecimalStringSchema,
    amountOnlyNonEquityAmount: DecimalStringSchema,
    roundCount: z.number().int().nonnegative(),
    rounds: z.array(RoundEvidenceSchema),
    warnings: z.array(StructuredWarningSchema),
  })
  .strict();

export const RoundsEvidenceCoverageSchema = z
  .object({
    companyCount: z.number().int().nonnegative(),
    investmentCount: z.number().int().nonnegative(),
    activeRoundCount: z.number().int().nonnegative(),
    activeOverrideCount: z.number().int().nonnegative(),
    warningsByCode: z.record(WarningCodeSchema, z.number().int().nonnegative()),
  })
  .strict();

export const RoundsToModelEvidenceSchema = z
  .object({
    fundId: z.number().int().positive(),
    baseCurrency: CurrencySchema,
    generatedAt: z.string().datetime(),
    companies: z.array(CompanyRoundsEvidenceSchema),
    coverage: RoundsEvidenceCoverageSchema,
    provenance: ProvenanceEnvelopeSchema,
  })
  .strict();

export type RoundModelRole = z.infer<typeof RoundModelRoleSchema>;
export type RoundEvidence = z.infer<typeof RoundEvidenceSchema>;
export type CompanyRoundsEvidence = z.infer<typeof CompanyRoundsEvidenceSchema>;
export type RoundsEvidenceCoverage = z.infer<typeof RoundsEvidenceCoverageSchema>;
export type RoundsToModelEvidence = z.infer<typeof RoundsToModelEvidenceSchema>;

export function serializeRoundsToModelEvidence(value: unknown): RoundsToModelEvidence {
  return RoundsToModelEvidenceSchema.parse(value);
}
