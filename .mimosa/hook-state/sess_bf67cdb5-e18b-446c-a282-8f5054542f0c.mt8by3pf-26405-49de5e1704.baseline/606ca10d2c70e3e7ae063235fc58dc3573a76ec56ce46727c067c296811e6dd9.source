import { z } from 'zod';
import {
  FinancialActionabilitySchema,
  FinancialSourceKindSchema,
} from './financial-provenance.contract';

export const ACTIONABILITY_POLICY_VERSION = 'h9-policy-v1';

export const H9SourceKindSchema = FinancialSourceKindSchema;
export const H9ActionabilityStatusSchema = FinancialActionabilitySchema;

export const H9SourceFingerprintSchema = z
  .object({
    moicSourceInputHash: z.string().min(1),
    roundEvidenceInputHash: z.string().min(1),
    roundEvidenceAssumptionsHash: z.string().min(1),
    fingerprintHash: z.string().min(1),
    policyVersion: z.string().min(1),
  })
  .strict();

export type H9SourceKind = z.infer<typeof H9SourceKindSchema>;
export type H9ActionabilityStatus = z.infer<typeof H9ActionabilityStatusSchema>;
export type H9SourceFingerprint = z.infer<typeof H9SourceFingerprintSchema>;
