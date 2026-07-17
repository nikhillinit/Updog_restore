/**
 * Seam-correctness proof for the DeterministicReserveEngine capability seam
 * (Tranche 4, ADR-045).
 *
 * The seam adds an optional second constructor parameter
 * `{ now?: () => number; debugMode?: boolean }` whose defaults preserve the
 * legacy ambient behavior (Date.now; per-call NODE_ENV read). Correctness is
 * proven two ways:
 *
 * 1. The pre-existing engine suites pass UNMODIFIED (default path untouched).
 * 2. Here: a seam-injected fixed `now` reproduces the legacy engine's output
 *    at the same instant - while the SYSTEM clock is frozen at a DIFFERENT
 *    instant that would change the age-based risk multiplier. Any ambient
 *    Date.now/new Date() left behind would leak the system instant into
 *    calculationDate, calculationDuration, or the risk multiplier and break
 *    the field-for-field equality.
 *
 * debugMode has no output surface (it only gates logger.debug calls), so the
 * capability is exercised (debugMode: false) but has no value assertion.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeterministicReserveEngine } from '../../../shared/core/reserves/DeterministicReserveEngine';
import { T1_ISO, T1_MS, T2_ISO, baseInput } from './fixtures';

describe('DeterministicReserveEngine capability seam', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('seam-injected fixed now reproduces the legacy engine at the same instant, ignoring the system clock', async () => {
    // Legacy default path, system clock frozen at T1.
    vi.setSystemTime(new Date(T1_ISO));
    const legacy = await new DeterministicReserveEngine().calculateOptimalReserveAllocation(
      baseInput()
    );

    // Seam path pinned to T1 while the system clock reads T2 - an instant at
    // which the age-based risk multiplier WOULD differ (see the
    // characterization suite), so any unrouted ambient clock read fails this.
    vi.setSystemTime(new Date(T2_ISO));
    const seamEngine = new DeterministicReserveEngine(undefined, {
      now: () => T1_MS,
      debugMode: false,
    });
    const seam = await seamEngine.calculateOptimalReserveAllocation(baseInput());

    expect(seam).toEqual(legacy);
    expect(seam.metadata.calculationDate).toEqual(new Date(T1_ISO));
    expect(seam.metadata.calculationDuration).toBe(0);
  });
});
