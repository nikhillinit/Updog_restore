import { describe, expect, it } from 'vitest';

import {
  createOriginalParticipationSourceHash,
  createParticipationWireFingerprint,
} from '../../../../shared/lib/investment-ledger/participation-wire-fingerprint';

describe('participation wire fingerprint', () => {
  it('is stable across surrogate participation ids and changes with wire economics', () => {
    const baseWire = {
      fundId: 7,
      vehicleId: 41,
      portfolioCompanyId: 42,
      financingEventId: 100,
      trancheKey: 'first-close',
      effectiveClosingDate: '2026-02-01',
      cashFlowAmountUsd: '1000',
      currency: 'usd',
    };

    const fingerprint = createParticipationWireFingerprint(baseWire);

    expect(fingerprint).toBe('d53cfe684a8035fa107cafef10ef09d4168f3074eb7bd69a694471d14c60f947');
    expect(
      createParticipationWireFingerprint({ ...baseWire, cashFlowAmountUsd: '1000.000000' })
    ).toBe(fingerprint);
    expect(createParticipationWireFingerprint({ ...baseWire, participationId: 700 })).toBe(
      fingerprint
    );
    expect(
      createParticipationWireFingerprint({ ...baseWire, cashFlowAmountUsd: '1100.000000' })
    ).toBe('6a9ac3175e74a4feef0bc14e0e66ad41176e3b78c788a48411f5af725ac1e56e');
    expect(
      createParticipationWireFingerprint({ ...baseWire, effectiveClosingDate: '2026-02-02' })
    ).toBe('00858e27abcac340f1498153072f2ce459c0cc4bf5fad6c09e614389705c250b');
  });

  it('envelopes original source hash around role and wire fingerprint only', () => {
    expect(
      createOriginalParticipationSourceHash(
        'd53cfe684a8035fa107cafef10ef09d4168f3074eb7bd69a694471d14c60f947'
      )
    ).toBe('0916d139dee222b9a47461fbee66157d7262785e6bc8a13466e95c91ebb0d62f');
  });
});
