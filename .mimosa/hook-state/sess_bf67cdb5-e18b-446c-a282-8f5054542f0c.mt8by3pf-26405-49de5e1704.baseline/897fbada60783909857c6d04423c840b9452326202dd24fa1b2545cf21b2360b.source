/**
 * Discriminated calculation result/trust union (Tranche 1 substrate).
 *
 * States:
 * - available:   trusted value; hash-bound; no reason codes.
 * - indicative:  value present but not decision-grade; must disclose why.
 * - unavailable: no value could be produced; must disclose why.
 * - failed:      the engine errored; must disclose why.
 *
 * Truthfulness invariants (enforced below) exist so that a result can never
 * silently fabricate trust: an off/kill-switched engine cannot emit an
 * available value, and kill-switch/mode-off suppression must be disclosed
 * through reason codes.
 *
 * This union is the substrate-internal vocabulary. The presentation-layer
 * vocabulary in shared/contracts/provenance-envelope.contract.ts is mapped
 * via toDatasetTrustState (ADR-042 adapter decision), not duplicated.
 */

import { z } from 'zod';
import type { DatasetTrustState } from '../../contracts/provenance-envelope.contract';
import { CalcBasisSchema } from './calc-basis';
import { Sha256HexSchema } from './calc-basis';
import { CalcReasonCodeSchema } from './reason-codes';

export const CalcResultStateSchema = z.enum(['available', 'indicative', 'unavailable', 'failed']);
export type CalcResultState = z.infer<typeof CalcResultStateSchema>;

const nonEmptyReasonCodes = z
  .array(CalcReasonCodeSchema)
  .min(1, 'non-available results must disclose at least one reason code');

export function createCalcResultSchema<V extends z.ZodTypeAny>(valueSchema: V) {
  const available = z
    .object({
      state: z.literal('available'),
      basis: CalcBasisSchema,
      value: valueSchema,
      resultHash: Sha256HexSchema,
      reasonCodes: z.array(CalcReasonCodeSchema).length(0),
    })
    .strict();

  const indicative = z
    .object({
      state: z.literal('indicative'),
      basis: CalcBasisSchema,
      value: valueSchema,
      resultHash: Sha256HexSchema,
      reasonCodes: nonEmptyReasonCodes,
    })
    .strict();

  const unavailable = z
    .object({
      state: z.literal('unavailable'),
      basis: CalcBasisSchema,
      reasonCodes: nonEmptyReasonCodes,
    })
    .strict();

  const failed = z
    .object({
      state: z.literal('failed'),
      basis: CalcBasisSchema,
      reasonCodes: nonEmptyReasonCodes,
      diagnostic: z.string().min(1).optional(),
    })
    .strict();

  return z
    .discriminatedUnion('state', [available, indicative, unavailable, failed])
    .superRefine((result, ctx) => {
      const { basis } = result;
      const carriesValue = result.state === 'available' || result.state === 'indicative';
      if (carriesValue && basis.effectiveMode === 'off') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['state'],
          message: `a ${result.state} value cannot come from an engine whose effectiveMode is off`,
        });
      }
      if (basis.killSwitchActive && !result.reasonCodes.includes('KILL_SWITCH_ACTIVE')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reasonCodes'],
          message: 'an active kill switch must be disclosed via the KILL_SWITCH_ACTIVE reason code',
        });
      }
      if (
        basis.effectiveMode === 'off' &&
        !basis.killSwitchActive &&
        !result.reasonCodes.includes('MODE_OFF')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reasonCodes'],
          message: 'effectiveMode off must be disclosed via the MODE_OFF reason code',
        });
      }
    });
}

export const GenericCalcResultSchema = createCalcResultSchema(z.unknown());
export type CalcResult<V> =
  | {
      state: 'available';
      basis: z.infer<typeof CalcBasisSchema>;
      value: V;
      resultHash: string;
      reasonCodes: [];
    }
  | {
      state: 'indicative';
      basis: z.infer<typeof CalcBasisSchema>;
      value: V;
      resultHash: string;
      reasonCodes: z.infer<typeof CalcReasonCodeSchema>[];
    }
  | {
      state: 'unavailable';
      basis: z.infer<typeof CalcBasisSchema>;
      reasonCodes: z.infer<typeof CalcReasonCodeSchema>[];
    }
  | {
      state: 'failed';
      basis: z.infer<typeof CalcBasisSchema>;
      reasonCodes: z.infer<typeof CalcReasonCodeSchema>[];
      diagnostic?: string;
    };

/**
 * ADR-042 adapter: maps substrate result states onto the existing
 * presentation-layer DatasetTrustState vocabulary instead of introducing a
 * second persisted trust vocabulary.
 */
export function toDatasetTrustState(state: CalcResultState): DatasetTrustState {
  switch (state) {
    case 'available':
      return 'LIVE';
    case 'indicative':
      return 'PARTIAL';
    case 'unavailable':
      return 'UNAVAILABLE';
    case 'failed':
      return 'FAILED';
  }
}
