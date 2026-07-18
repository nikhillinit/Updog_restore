import { describe, it, expect } from 'vitest';
import {
  reconcileConstrainedReserveShadow,
  type LegacyConstrainedReserveResult,
} from '../../../server/services/constrained-reserve-substrate-shadow';
import {
  runConstrainedReserveWithSubstrate,
  CONSTRAINED_RESERVE_CALCULATION_KEY,
  ConstrainedReserveCalcValueSchema,
  type ConstrainedReserveCalcValue,
} from '../../../shared/core/reserves/constrained-reserve-substrate-adapter';
import { createCalculationContext } from '../../../shared/core/calc-substrate';
import { ReserveInputSchema } from '../../../shared/schemas';
import { ConstrainedReserveEngine } from '../../../shared/core/reserves/ConstrainedReserveEngine';

const AS_OF = '2026-07-18T00:00:00.000Z';

// Two seed/series_a companies with no per-company or per-stage caps: the greedy
// fill hands the full 1,000,000 to the top-ranked company, so the run yields a
// non-trivial allocation set with a rendered money boundary to reconcile.
const INPUT = {
  availableReserves: 1_000_000,
  companies: [
    { id: 'c1', name: 'Alpha', stage: 'seed', invested: 250_000, ownership: 0.15 },
    { id: 'c2', name: 'Beta', stage: 'series_a', invested: 1_000_000, ownership: 0.1 },
  ],
  stagePolicies: [
    { stage: 'seed', reserveMultiple: 2.5, weight: 1 },
    { stage: 'series_a', reserveMultiple: 2, weight: 1.2 },
  ],
};

/**
 * Build a REAL substrate value and the matching legacy engine result from the
 * SAME parsed input. The substrate value renders money as fixed 2-decimal
 * strings; the legacy result carries plain numbers. Any divergence between them
 * would be a real transformation defect (the whole point of the reconciliation).
 */
function buildReal(): {
  substrateValue: ConstrainedReserveCalcValue;
  legacy: LegacyConstrainedReserveResult;
} {
  const parsed = ReserveInputSchema.parse(INPUT);
  const ctx = createCalculationContext({
    calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
    seed: 1,
    asOf: AS_OF,
  });
  const result = runConstrainedReserveWithSubstrate(ctx, parsed, {
    configuredMode: 'on',
    killSwitchActive: false,
  });
  if (result.state !== 'available') {
    throw new Error(`expected an available substrate result, got '${result.state}'`);
  }
  const legacy = new ConstrainedReserveEngine().calculate(parsed);
  return { substrateValue: result.value, legacy };
}

describe('reconcileConstrainedReserveShadow', () => {
  it('MATCH: a real substrate value reconciles with the legacy result it derives from', () => {
    const { substrateValue, legacy } = buildReal();

    const recon = reconcileConstrainedReserveShadow(substrateValue, legacy);

    expect(recon.status).toBe('match');
    expect(recon.mismatches).toEqual([]);
  });

  it('MATCH: cents precision - the "100.55" string reconciles with the number 100.55 exactly', () => {
    const substrateValue = ConstrainedReserveCalcValueSchema.parse({
      allocations: [{ id: 'p1', name: 'Precise', stage: 'seed', allocated: '100.55' }],
      totalAllocated: '100.55',
      remaining: '0.00',
      conservationOk: true,
      asOfUtc: AS_OF,
    });
    const legacy: LegacyConstrainedReserveResult = {
      allocations: [{ id: 'p1', allocated: 100.55 }],
      totalAllocated: 100.55,
      remaining: 0,
      conservationOk: true,
    };

    const recon = reconcileConstrainedReserveShadow(substrateValue, legacy);

    expect(recon.status).toBe('match');
    expect(recon.mismatches).toEqual([]);
  });

  it('MISMATCH: a per-allocation allocated divergence is reported', () => {
    const { substrateValue, legacy } = buildReal();
    const tampered: LegacyConstrainedReserveResult = {
      ...legacy,
      allocations: legacy.allocations.map((allocation, index) =>
        index === 0 ? { ...allocation, allocated: allocation.allocated - 1 } : allocation
      ),
    };

    const recon = reconcileConstrainedReserveShadow(substrateValue, tampered);

    expect(recon.status).toBe('mismatch');
    expect(recon.mismatches.some((m) => m.includes('allocated cents differ'))).toBe(true);
  });

  it('MISMATCH: a totalAllocated divergence is reported', () => {
    const { substrateValue, legacy } = buildReal();
    const tampered: LegacyConstrainedReserveResult = {
      ...legacy,
      totalAllocated: legacy.totalAllocated + 1,
    };

    const recon = reconcileConstrainedReserveShadow(substrateValue, tampered);

    expect(recon.status).toBe('mismatch');
    expect(recon.mismatches.some((m) => m.includes('totalAllocated cents differ'))).toBe(true);
  });

  it('MISMATCH: a remaining divergence is reported', () => {
    const { substrateValue, legacy } = buildReal();
    const tampered: LegacyConstrainedReserveResult = {
      ...legacy,
      remaining: legacy.remaining + 1,
    };

    const recon = reconcileConstrainedReserveShadow(substrateValue, tampered);

    expect(recon.status).toBe('mismatch');
    expect(recon.mismatches.some((m) => m.includes('remaining cents differ'))).toBe(true);
  });

  it('MISMATCH: a conservationOk divergence is reported', () => {
    const { substrateValue, legacy } = buildReal();
    const tampered: LegacyConstrainedReserveResult = {
      ...legacy,
      conservationOk: !legacy.conservationOk,
    };

    const recon = reconcileConstrainedReserveShadow(substrateValue, tampered);

    expect(recon.status).toBe('mismatch');
    expect(recon.mismatches.some((m) => m.includes('conservationOk differs'))).toBe(true);
  });

  it('MISMATCH: an allocation-id-set divergence (id present on one side only) is reported', () => {
    const { substrateValue, legacy } = buildReal();
    const tampered: LegacyConstrainedReserveResult = {
      ...legacy,
      allocations: [...legacy.allocations, { id: 'ghost', allocated: 0 }],
    };

    const recon = reconcileConstrainedReserveShadow(substrateValue, tampered);

    expect(recon.status).toBe('mismatch');
    expect(
      recon.mismatches.some((m) => m.includes('ghost') && m.includes('absent from substrate'))
    ).toBe(true);
  });
});
