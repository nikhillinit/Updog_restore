import { describe, expect, it, vi } from 'vitest';

import type {
  AmericanWaterfallConfig,
  ContributionCF,
  ExitCF,
} from '../../../shared/lib/waterfall/american-ledger';
import * as americanLedgerModule from '../../../shared/lib/waterfall/american-ledger';
import {
  computeLedgerAllocationV1,
  LedgerAllocationInvariantError,
  type LedgerAllocationConfigV1,
} from '../../../shared/lib/internal-economics/ledger-allocation-v1';

const { calculateAmericanWaterfallLedger } = americanLedgerModule;

// ── truth-case fixtures (L01, L02, L03) ─────────────────────────────

const L01_CONFIG: LedgerAllocationConfigV1 = { carryPct: 0 };
const L01_CONTRIBUTIONS: ContributionCF[] = [{ quarter: 1, amount: 1_000_000 }];
const L01_EXITS: ExitCF[] = [{ quarter: 4, grossProceeds: 1_000_000 }];

const L02_CONFIG: LedgerAllocationConfigV1 = { carryPct: 0.2 };
const L02_CONTRIBUTIONS: ContributionCF[] = [{ quarter: 1, amount: 1_000_000 }];
const L02_EXITS: ExitCF[] = [{ quarter: 4, grossProceeds: 2_000_000 }];

const L03_CONFIG: LedgerAllocationConfigV1 = { carryPct: 0.2 };
const L03_CONTRIBUTIONS: ContributionCF[] = [
  { quarter: 1, amount: 500_000 },
  { quarter: 2, amount: 500_000 },
];
const L03_EXITS: ExitCF[] = [
  { quarter: 4, grossProceeds: 800_000 },
  { quarter: 8, grossProceeds: 1_500_000 },
];

// ── helpers ──────────────────────────────────────────────────────────

/**
 * Build the full AmericanWaterfallConfig that the wrapper should pass
 * to the underlying ledger: carryPct only, with hurdle, recycling, and
 * clawback structurally disabled.
 */
function expectedFullConfig(narrow: LedgerAllocationConfigV1): AmericanWaterfallConfig {
  return {
    carryPct: narrow.carryPct,
    recyclingEnabled: false,
    clawbackEnabled: false,
  };
}

// ── tests ────────────────────────────────────────────────────────────

describe('computeLedgerAllocationV1', () => {
  // ── byte-identical output tests ──────────────────────────────────

  describe('byte-identical outputs vs direct ledger call', () => {
    it('L01-basic-no-carry: wrapper matches direct call', () => {
      const direct = calculateAmericanWaterfallLedger(
        expectedFullConfig(L01_CONFIG),
        L01_CONTRIBUTIONS,
        L01_EXITS
      );
      const wrapped = computeLedgerAllocationV1(L01_CONFIG, L01_CONTRIBUTIONS, L01_EXITS);

      expect(wrapped).toEqual(direct);
      expect(wrapped.totals.paidIn).toBe(1_000_000);
      expect(wrapped.totals.distributed).toBe(1_000_000);
      expect(wrapped.totals.gpCarryTotal).toBe(0);
      expect(wrapped.totals.dpi).toBe(1.0);
    });

    it('L02-carry-on-profits: wrapper matches direct call', () => {
      const direct = calculateAmericanWaterfallLedger(
        expectedFullConfig(L02_CONFIG),
        L02_CONTRIBUTIONS,
        L02_EXITS
      );
      const wrapped = computeLedgerAllocationV1(L02_CONFIG, L02_CONTRIBUTIONS, L02_EXITS);

      expect(wrapped).toEqual(direct);
      expect(wrapped.totals.paidIn).toBe(1_000_000);
      expect(wrapped.totals.distributed).toBe(1_800_000);
      expect(wrapped.totals.gpCarryTotal).toBe(200_000);
      expect(wrapped.totals.dpi).toBe(1.8);
    });

    it('L03-multiple-exits: wrapper matches direct call', () => {
      const direct = calculateAmericanWaterfallLedger(
        expectedFullConfig(L03_CONFIG),
        L03_CONTRIBUTIONS,
        L03_EXITS
      );
      const wrapped = computeLedgerAllocationV1(L03_CONFIG, L03_CONTRIBUTIONS, L03_EXITS);

      expect(wrapped).toEqual(direct);
      expect(wrapped.totals.paidIn).toBe(1_000_000);
      expect(wrapped.rows[0]!.lpCapitalReturn).toBe(800_000);
      expect(wrapped.rows[0]!.gpCarry).toBe(0);
      expect(wrapped.rows[1]!.lpCapitalReturn).toBe(200_000);
      expect(wrapped.rows[1]!.gpCarry).toBe(260_000);
    });

  });

  // ── structural enforcement tests ─────────────────────────────────

  describe('structural enforcement: recycling/clawback always disabled', () => {
    it('omits recyclingEnabled and clawbackEnabled (defaults to off)', () => {
      const spy = vi.spyOn(americanLedgerModule, 'calculateAmericanWaterfallLedger');

      computeLedgerAllocationV1(L01_CONFIG, L01_CONTRIBUTIONS, L01_EXITS);

      expect(spy).toHaveBeenCalledTimes(1);
      const passedConfig = spy.mock.calls[0]![0] as AmericanWaterfallConfig;
      // Optional booleans omitted — exactOptionalPropertyTypes forbids
      // explicit `false` for optional fields; omission = disabled.
      expect(passedConfig.recyclingEnabled).toBeUndefined();
      expect(passedConfig.clawbackEnabled).toBeUndefined();

      spy.mockRestore();
    });

    it('ignores hurdle/recycling/clawback fields if somehow present on input object', () => {
      const spy = vi.spyOn(americanLedgerModule, 'calculateAmericanWaterfallLedger');

      // Force extra fields at runtime (callers cannot do this via the type system)
      const tainted = {
        carryPct: 0.2,
        hurdleRate: 0.08,
        recyclingEnabled: true,
        clawbackEnabled: true,
        clawbackLpHurdleMultiple: 1.1,
        recyclingCapPctOfCommitted: 0.15,
      } as LedgerAllocationConfigV1;

      computeLedgerAllocationV1(tainted, L01_CONTRIBUTIONS, L01_EXITS);

      expect(spy).toHaveBeenCalledTimes(1);
      const passedConfig = spy.mock.calls[0]![0] as AmericanWaterfallConfig;
      expect(passedConfig.hurdleRate).toBeUndefined();
      expect(passedConfig.recyclingEnabled).toBeUndefined();
      expect(passedConfig.clawbackEnabled).toBeUndefined();
      // Ensure tainted fields are NOT forwarded
      expect(passedConfig).not.toHaveProperty('clawbackLpHurdleMultiple');
      expect(passedConfig).not.toHaveProperty('recyclingCapPctOfCommitted');

      spy.mockRestore();
    });

    it('throws LedgerAllocationInvariantError when the ledger reports recycled cash', () => {
      const clean = calculateAmericanWaterfallLedger(
        expectedFullConfig(L02_CONFIG),
        L02_CONTRIBUTIONS,
        L02_EXITS
      );
      const taintedResult = {
        ...clean,
        totals: { ...clean.totals, recycled: 1 },
      };
      const spy = vi
        .spyOn(americanLedgerModule, 'calculateAmericanWaterfallLedger')
        .mockReturnValue(taintedResult);

      expect(() => computeLedgerAllocationV1(L02_CONFIG, L02_CONTRIBUTIONS, L02_EXITS)).toThrow(
        LedgerAllocationInvariantError
      );

      spy.mockRestore();
    });

    it('throws LedgerAllocationInvariantError when the ledger reports clawback', () => {
      const clean = calculateAmericanWaterfallLedger(
        expectedFullConfig(L02_CONFIG),
        L02_CONTRIBUTIONS,
        L02_EXITS
      );
      const taintedResult = {
        ...clean,
        totals: { ...clean.totals, gpClawback: 100 },
      };
      const spy = vi
        .spyOn(americanLedgerModule, 'calculateAmericanWaterfallLedger')
        .mockReturnValue(taintedResult);

      expect(() => computeLedgerAllocationV1(L02_CONFIG, L02_CONTRIBUTIONS, L02_EXITS)).toThrow(
        LedgerAllocationInvariantError
      );

      spy.mockRestore();
    });

    it('recycled amount is always 0 in output', () => {
      const result = computeLedgerAllocationV1(L02_CONFIG, L02_CONTRIBUTIONS, L02_EXITS);

      expect(result.totals.recycled).toBe(0);
      for (const row of result.rows) {
        expect(row.recycledAmount).toBe(0);
      }
    });

    it('clawback fields are never present in output', () => {
      const result = computeLedgerAllocationV1(L02_CONFIG, L02_CONTRIBUTIONS, L02_EXITS);

      expect(result.totals.gpClawback).toBeUndefined();
      for (const row of result.rows) {
        expect(row.gpClawback).toBeUndefined();
      }
    });
  });

  // ── type safety tests ────────────────────────────────────────────

  describe('type safety', () => {
    it('forwards a config containing exactly carryPct to the ledger', () => {
      const spy = vi.spyOn(americanLedgerModule, 'calculateAmericanWaterfallLedger');

      computeLedgerAllocationV1({ carryPct: 0.2 }, L01_CONTRIBUTIONS, L01_EXITS);

      const passedConfig = spy.mock.calls[0]![0] as AmericanWaterfallConfig;
      expect(Object.keys(passedConfig)).toEqual(['carryPct']);
      expect(passedConfig.carryPct).toBe(0.2);

      spy.mockRestore();
    });

    it('accepts readonly contribution and exit arrays', () => {
      const contributions: readonly ContributionCF[] = [{ quarter: 1, amount: 1_000_000 }];
      const exits: readonly ExitCF[] = [{ quarter: 4, grossProceeds: 2_000_000 }];

      // Should compile and run without error
      const result = computeLedgerAllocationV1(L02_CONFIG, contributions, exits);
      expect(result.totals.paidIn).toBe(1_000_000);
    });
  });

  // ── edge cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('no exits produces empty rows and zero totals', () => {
      const result = computeLedgerAllocationV1(
        { carryPct: 0.2 },
        [{ quarter: 1, amount: 1_000_000 }],
        []
      );

      expect(result.rows).toHaveLength(0);
      expect(result.totals.paidIn).toBe(0);
      expect(result.totals.distributed).toBe(0);
      expect(result.totals.gpCarryTotal).toBe(0);
    });

    it('no contributions produces zero capital return', () => {
      const result = computeLedgerAllocationV1(
        { carryPct: 0.2 },
        [],
        [{ quarter: 4, grossProceeds: 1_000_000 }]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.lpCapitalReturn).toBe(0);
      expect(result.totals.paidIn).toBe(0);
    });

    it('exit below capital returns capital only, no carry', () => {
      const result = computeLedgerAllocationV1(
        { carryPct: 0.2 },
        [{ quarter: 1, amount: 1_000_000 }],
        [{ quarter: 4, grossProceeds: 500_000 }]
      );

      expect(result.rows[0]!.lpCapitalReturn).toBe(500_000);
      expect(result.rows[0]!.gpCarry).toBe(0);
      expect(result.totals.gpCarryTotal).toBe(0);
    });
  });
});
