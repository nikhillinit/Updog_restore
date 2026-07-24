/**
 * Manual-entry adapter (PLAN_61 Wave C, Task 5a).
 *
 * Normalizes a typed manual observation. No transforms are applied: the entry
 * is already typed, so it flows straight through the shared normalization path,
 * guaranteeing equivalence with the CSV adapter by construction.
 *
 * This adapter is also the seam canonical direct writes will use (Tasks 9-11)
 * to synthesize `sourceType: 'manual'` observations in-transaction. Here it is
 * built only; no route or database wiring.
 *
 * @module server/services/financial-observations/manual-entry-adapter
 */

import type {
  ManualEntryV2,
  NormalizedCandidateV2,
} from '@shared/contracts/financial-observations/normalization.contract';

import { normalizeObservation } from './normalization-service';

export function normalizeManualObservation(entry: ManualEntryV2): NormalizedCandidateV2 {
  return normalizeObservation({
    ...entry,
    sourceLocator: entry.sourceLocator ?? 'manual',
  });
}
