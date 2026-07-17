/**
 * Stable reason-code registry for calculation results (Tranche 1 substrate).
 *
 * Codes are append-only: renaming or deleting a code is a contract-version
 * change. These are calculation-result reasons; presentation-layer warning
 * codes remain in shared/contracts/provenance-envelope.contract.ts.
 */

import { z } from 'zod';

export const CALC_REASON_CODES = [
  'INPUT_MISSING',
  'INPUT_INVALID',
  'ASSUMPTION_GAP',
  'STALE_SOURCE',
  'UPSTREAM_UNAVAILABLE',
  'METHODOLOGY_UNSUPPORTED',
  'ENGINE_ERROR',
  'KILL_SWITCH_ACTIVE',
  'MODE_OFF',
  'SHADOW_ONLY',
] as const;

export const CalcReasonCodeSchema = z.enum(CALC_REASON_CODES);

export type CalcReasonCode = z.infer<typeof CalcReasonCodeSchema>;
