import { describe, expect, it, vi } from 'vitest';

import {
  emitRankedShadowTelemetry,
  type RankedReserveShadowLogger,
} from '../../../../server/services/reserves/ranked-reserve-shadow-telemetry';
import type { RankedReserveShadowTelemetry } from '../../../../server/services/reserves/ranked-reserve-orchestrator';

describe('emitRankedShadowTelemetry', () => {
  it('emits the aggregate comparison with truncated hashes without mutating the builder output', () => {
    const telemetry: RankedReserveShadowTelemetry = {
      totalAllocationDeltaCents: 125,
      rankAgreement: true,
      excludedCountsByReason: { unavailable: 2, indicative: 1 },
      envelopeInputHash: 'e'.repeat(64),
      factsInputHash: 'f'.repeat(64),
      assumptionsHash: 'a'.repeat(64),
    };
    const original = structuredClone(telemetry);
    const info = vi.fn();

    emitRankedShadowTelemetry({ fundId: 7, asOfDate: '2026-07-19', telemetry }, { info });

    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(
      {
        fundId: 7,
        asOfDate: '2026-07-19',
        totalAllocationDeltaCents: 125,
        rankAgreement: true,
        excludedCountsByReason: { unavailable: 2, indicative: 1 },
        envelopeInputHash: 'e'.repeat(12),
        factsInputHash: 'f'.repeat(12),
        assumptionsHash: 'a'.repeat(12),
      },
      'ranked reserve shadow comparison generated'
    );
    expect(telemetry).toEqual(original);
  });

  it('swallows logger failures', () => {
    const throwingLogger: RankedReserveShadowLogger = {
      info: () => {
        throw new Error('logger unavailable');
      },
    };

    expect(() =>
      emitRankedShadowTelemetry(
        {
          fundId: 7,
          asOfDate: '2026-07-19',
          telemetry: {
            totalAllocationDeltaCents: 0,
            rankAgreement: false,
            excludedCountsByReason: { unavailable: 0, indicative: 0 },
            envelopeInputHash: 'e'.repeat(64),
            factsInputHash: 'f'.repeat(64),
            assumptionsHash: 'a'.repeat(64),
          },
        },
        throwingLogger
      )
    ).not.toThrow();
  });
});
