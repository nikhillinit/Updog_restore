/**
 * Versioned calculation basis (Tranche 1 substrate).
 *
 * The basis records everything that determined a calculation run: contract
 * version, calculation key, configured/effective mode, kill-switch state,
 * engine/methodology versions, and the input/assumptions hashes.
 *
 * The result hash is deliberately NOT part of the basis: it is computed over
 * a preimage that includes the basis (see hash-admission.ts), so placing it
 * inside the basis would make the hash self-referential.
 */

import { z } from 'zod';

export const CALC_SUBSTRATE_CONTRACT_VERSION = 'calc-substrate/1.0.0';

export const CalcModeSchema = z.enum(['off', 'shadow', 'on']);
export type CalcMode = z.infer<typeof CalcModeSchema>;

const MODE_RANK: Record<CalcMode, number> = { off: 0, shadow: 1, on: 2 };

export const Sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'must be a lowercase 64-char sha256 hex digest');

export const CalculationKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/, 'must be lowercase snake/kebab starting with a letter');

export const CalcBasisSchema = z
  .object({
    contractVersion: z.literal(CALC_SUBSTRATE_CONTRACT_VERSION),
    calculationKey: CalculationKeySchema,
    configuredMode: CalcModeSchema,
    effectiveMode: CalcModeSchema,
    killSwitchActive: z.boolean(),
    engineVersion: z.string().min(1),
    methodologyVersion: z.string().min(1),
    inputHash: Sha256HexSchema,
    assumptionsHash: Sha256HexSchema,
  })
  .strict()
  .superRefine((basis, ctx) => {
    if (basis.killSwitchActive && basis.effectiveMode !== 'off') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveMode'],
        message: 'effectiveMode must be off while the kill switch is active',
      });
    }
    if (MODE_RANK[basis.effectiveMode] > MODE_RANK[basis.configuredMode]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveMode'],
        message: `effectiveMode ${basis.effectiveMode} cannot exceed configuredMode ${basis.configuredMode}`,
      });
    }
  });

export type CalcBasis = z.infer<typeof CalcBasisSchema>;
