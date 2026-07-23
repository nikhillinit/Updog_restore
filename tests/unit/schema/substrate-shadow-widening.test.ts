/**
 * Substrate-shadow representability widening -- migration 0038 regression pin.
 *
 * Migration 0038 widens `substrate_shadow_reconciliations` so the NEW
 * current-forecast shadow can record non-value-producing observations:
 * `substrate_state` gains `unavailable`/`failed` and `result_hash` becomes
 * nullable. This pins two invariants without a live DB:
 *   1. the EXISTING substrate writer path stays constrained to
 *      `available`/`indicative` (compile-time union) so it can never emit the
 *      new states, and
 *   2. the Drizzle table mirrors the migration -- `result_hash` is nullable and
 *      the widened state CHECK plus the null-hash guard CHECK are declared.
 */
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  substrateShadowReconciliations,
  type InsertSubstrateShadowReconciliation,
} from '@shared/schema';
import type { SubstrateShadowReconciliationRecord } from '../../../server/services/constrained-reserve-substrate-shadow';

// Compile-time guard: the value-producing writer union must EXCLUDE the new
// non-value-producing states. If a future edit widens it, these stop compiling.
type WriterState = SubstrateShadowReconciliationRecord['substrateState'];
const writerStatesAreValueProducingOnly: [WriterState] extends ['available' | 'indicative']
  ? true
  : never = true;
const writerHasNoNewStates: Exclude<WriterState, 'available' | 'indicative'> extends never
  ? true
  : never = true;

describe('substrate-shadow representability widening (migration 0038)', () => {
  const config = getTableConfig(substrateShadowReconciliations);

  it('keeps the existing substrate writer path constrained to available|indicative', () => {
    // Runtime mirror of the compile-time guards above.
    expect(writerStatesAreValueProducingOnly).toBe(true);
    expect(writerHasNoNewStates).toBe(true);
  });

  it('makes result_hash nullable at the Drizzle layer', () => {
    const resultHash = config.columns.find((column) => column.name === 'result_hash');
    expect(resultHash).toBeDefined();
    expect(resultHash?.notNull).toBe(false);
  });

  it('declares the widened substrate_state and null-hash guard CHECK constraints', () => {
    const checkNames = config.checks.map((check) => check.name);
    expect(checkNames).toContain('substrate_shadow_reconciliations_substrate_state_check');
    expect(checkNames).toContain('substrate_shadow_reconciliations_result_hash_state_check');
  });

  it('accepts a null result_hash for non-value-producing current-forecast rows', () => {
    const unavailableRow: InsertSubstrateShadowReconciliation = {
      fundId: 1,
      calculationKey: 'current_forecast',
      configuredMode: 'shadow',
      effectiveMode: 'shadow',
      killSwitchActive: false,
      substrateState: 'unavailable',
      reconciliationStatus: 'mismatch',
      inputHash: 'input-abc',
      resultHash: null,
      assumptionsHash: 'assume-def',
      mismatches: ['unavailable_expected'],
    };
    expect(unavailableRow.resultHash).toBeNull();
  });
});
