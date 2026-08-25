import { describe, it, expect } from 'vitest';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import {
  INTERNAL_ECONOMICS_COMPOSITE_V2_VERSION,
  V2_ADMISSION_LIMITS,
  V2_REFUSAL_CODES,
  V2_EVENT_KINDS,
  V2_DERIVED_EVENT_KINDS,
  V2_STAGES,
  type WaterfallTierV2,
} from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';

function zeroInvestorLedger(partnerId: string) {
  return {
    partnerId,
    committedCapital: '0.000000',
    calledCapital: '0.000000',
    settledCapital: '0.000000',
    paidInCapital: '0.000000',
    unreturnedSettledCashCapital: '0.000000',
    cumulativeDistributions: '0.000000',
    cumulativeFees: '0.000000',
    accruedPreference: '0.000000',
  };
}

describe('verifyAndNormalizeInternalEconomicsInputV2', () => {
  describe('opening provenance', () => {
    it('rejects caller-controlled component versions', () => {
      const input = { ...buildMinimalV2Input(), componentVersions: {} };
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
    });

    it.each([
      ['duplicate', zeroInvestorLedger('lp-1')],
      ['unknown', zeroInvestorLedger('ghost')],
    ])('rejects %s investor ledger identity', (_kind, extraLedger) => {
      const input = buildMinimalV2Input();
      input.openingState.investorLedgers.push(extraLedger);

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('rejects split investor ledger rows for one partner', () => {
      const input = buildMinimalV2Input();
      const lpIndex = input.openingState.investorLedgers.findIndex(
        (ledger) => ledger.partnerId === 'lp-1'
      );
      input.openingState.investorLedgers.splice(
        lpIndex,
        1,
        {
          partnerId: 'lp-1',
          committedCapital: '600000.000000',
          calledCapital: '100000.000000',
          settledCapital: '100000.000000',
          paidInCapital: '100000.000000',
          unreturnedSettledCashCapital: '100000.000000',
          cumulativeDistributions: '0.000000',
          cumulativeFees: '0.000000',
          accruedPreference: '0.000000',
        },
        {
          partnerId: 'lp-1',
          committedCapital: '400000.000000',
          calledCapital: '400000.000000',
          settledCapital: '400000.000000',
          paidInCapital: '400000.000000',
          unreturnedSettledCashCapital: '400000.000000',
          cumulativeDistributions: '0.000000',
          cumulativeFees: '0.000000',
          accruedPreference: '0.000000',
        }
      );

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('canonicalizes omitted zero-opening provenance to empty arrays', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingCash = '0.000000';
      input.openingState.openingCashClassification.paidIn = '0.000000';
      for (const ledger of input.openingState.investorLedgers) {
        ledger.calledCapital = '0.000000';
        ledger.settledCapital = '0.000000';
        ledger.paidInCapital = '0.000000';
        ledger.unreturnedSettledCashCapital = '0.000000';
      }
      for (const partner of input.partners) {
        partner.settledCash = '0.000000';
        partner.remainingCallableCommitment = partner.committedCapital;
      }
      delete (input.openingState as Partial<typeof input.openingState>).openingProvenance;

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.input.openingState.openingProvenance).toEqual({
          cashLots: [],
          investmentLots: [],
          entitlementPools: [],
        });
      }
    });

    it('refuses nonempty provenance that leaves paid-in opening capital unexplained', () => {
      const input = buildMinimalV2Input();
      const lpLedger = input.openingState.investorLedgers.find(
        (ledger) => ledger.partnerId === 'lp-1'
      )!;
      const lpCashLot = input.openingState.openingProvenance.cashLots.find(
        (lot) => lot.owner.kind === 'lp' && lot.owner.partnerId === 'lp-1'
      )!;
      input.openingState.openingCash = '50001.000000';
      input.openingState.openingCashClassification.paidIn = '50001.000000';
      lpLedger.unreturnedSettledCashCapital = '1.000000';
      lpCashLot.originalAmount = '1.000000';
      lpCashLot.remainingBalance = '1.000000';

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('refuses unrelated provenance for an unsupported nonzero opening category', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingCash = '0.000000';
      input.openingState.openingCashClassification.paidIn = '0.000000';
      for (const ledger of input.openingState.investorLedgers) {
        ledger.calledCapital = '0.000000';
        ledger.settledCapital = '0.000000';
        ledger.paidInCapital = '0.000000';
        ledger.unreturnedSettledCashCapital = '0.000000';
      }
      for (const partner of input.partners) {
        partner.settledCash = '0.000000';
        partner.remainingCallableCommitment = partner.committedCapital;
      }
      input.openingState.investorLedgers[0]!.accruedPreference = '1.000000';
      input.openingState.accruedPreferenceTotal = '1.000000';
      input.openingState.openingProvenance = {
        cashLots: [],
        investmentLots: [],
        entitlementPools: [
          {
            entitlementPoolId: 'pool-1',
            sourceRef: 'pool-source:1',
            dealId: 'deal-1',
            securityId: 'security-1',
          },
        ],
      };

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('refuses paid-in cash owners that do not reconcile to investor ledgers', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingProvenance.cashLots[0]!.owner = {
        kind: 'lp',
        partnerId: 'lp-1',
        lpClassId: 'class-a',
      };
      input.openingState.openingProvenance.cashLots[1]!.owner = {
        kind: 'gp',
        partnerId: 'gp-1',
      };

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('refuses dangling owner identity', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingProvenance.cashLots[0]!.owner = {
        kind: 'gp',
        partnerId: 'missing-gp',
      };

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('refuses cash classification mismatch', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingProvenance.cashLots[0]!.remainingBalance = '49.000000';

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_RECONCILIATION_VIOLATION');
    });

    it('accepts entitlement weights independent of investment basis', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingCash = '549900.000000';
      input.openingState.openingCashClassification.paidIn = '549900.000000';
      input.openingState.openingProvenance.cashLots[1]!.originalAmount = '499900.000000';
      input.openingState.openingProvenance.cashLots[1]!.remainingBalance = '499900.000000';
      input.openingState.openingProvenance.entitlementPools = [
        {
          entitlementPoolId: 'pool-1',
          sourceRef: 'pool-source:1',
          dealId: 'deal-1',
          securityId: 'security-1',
        },
      ];
      input.openingState.openingProvenance.investmentLots = [
        {
          investmentLotId: 'opening-investment:1',
          sourceRef: 'investment-source:1',
          entitlementPoolId: 'pool-1',
          dealId: 'deal-1',
          securityId: 'security-1',
          owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
          costBasis: '100.000000',
          relievedAmount: '0.000000',
          entitlementAmount: '99.000000',
        },
      ];

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(true);
    });

    it('refuses nonzero opening investment relief before relief semantics activate', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingCash = '549901.000000';
      input.openingState.openingCashClassification.paidIn = '549901.000000';
      input.openingState.openingProvenance.cashLots[1]!.originalAmount = '499901.000000';
      input.openingState.openingProvenance.cashLots[1]!.remainingBalance = '499901.000000';
      input.openingState.openingProvenance.entitlementPools = [
        {
          entitlementPoolId: 'pool-1',
          sourceRef: 'pool-source:1',
          dealId: 'deal-1',
          securityId: 'security-1',
        },
      ];
      input.openingState.openingProvenance.investmentLots = [
        {
          investmentLotId: 'opening-investment:1',
          sourceRef: 'investment-source:1',
          entitlementPoolId: 'pool-1',
          dealId: 'deal-1',
          securityId: 'security-1',
          owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
          costBasis: '100.000000',
          relievedAmount: '1.000000',
          entitlementAmount: '99.000000',
        },
      ];

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('rejects duplicate investment lot IDs across owners', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingProvenance.entitlementPools = [
        {
          entitlementPoolId: 'pool-1',
          sourceRef: 'pool-source:1',
          dealId: 'deal-1',
          securityId: 'security-1',
        },
      ];
      input.openingState.openingProvenance.investmentLots = [
        {
          investmentLotId: 'opening-investment:1',
          sourceRef: 'investment-source:1',
          entitlementPoolId: 'pool-1',
          dealId: 'deal-1',
          securityId: 'security-1',
          owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
          costBasis: '100.000000',
          relievedAmount: '0.000000',
          entitlementAmount: '60.000000',
        },
        {
          investmentLotId: 'opening-investment:1',
          sourceRef: 'investment-source:2',
          entitlementPoolId: 'pool-1',
          dealId: 'deal-1',
          securityId: 'security-1',
          owner: { kind: 'gp', partnerId: 'gp-1' },
          costBasis: '40.000000',
          relievedAmount: '0.000000',
          entitlementAmount: '40.000000',
        },
      ];

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('accepts unequal owner lots grouped by one entitlement pool', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingCash = '549865.000000';
      input.openingState.openingCashClassification.paidIn = '549865.000000';
      input.openingState.openingProvenance.cashLots[0]!.originalAmount = '49965.000000';
      input.openingState.openingProvenance.cashLots[0]!.remainingBalance = '49965.000000';
      input.openingState.openingProvenance.cashLots[1]!.originalAmount = '499900.000000';
      input.openingState.openingProvenance.cashLots[1]!.remainingBalance = '499900.000000';
      input.openingState.openingProvenance.entitlementPools = [
        {
          entitlementPoolId: 'pool-1',
          sourceRef: 'pool-source:1',
          dealId: 'deal-1',
          securityId: 'security-1',
        },
      ];
      input.openingState.openingProvenance.investmentLots = [
        {
          investmentLotId: 'opening-investment:lp-1',
          sourceRef: 'investment-source:lp-1',
          entitlementPoolId: 'pool-1',
          dealId: 'deal-1',
          securityId: 'security-1',
          owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
          costBasis: '100.000000',
          relievedAmount: '0.000000',
          entitlementAmount: '60.000000',
        },
        {
          investmentLotId: 'opening-investment:gp-1',
          sourceRef: 'investment-source:gp-1',
          entitlementPoolId: 'pool-1',
          dealId: 'deal-1',
          securityId: 'security-1',
          owner: { kind: 'gp', partnerId: 'gp-1' },
          costBasis: '35.000000',
          relievedAmount: '0.000000',
          entitlementAmount: '40.000000',
        },
      ];

      expect(verifyAndNormalizeInternalEconomicsInputV2(input).ok).toBe(true);
    });

    it('refuses entitlement pool deal or security mismatch', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingProvenance.investmentLots = [
        {
          investmentLotId: 'opening-investment:1',
          sourceRef: 'investment-source:1',
          entitlementPoolId: 'pool-1',
          dealId: 'deal-1',
          securityId: 'security-1',
          owner: { kind: 'lp', partnerId: 'lp-1', lpClassId: 'class-a' },
          costBasis: '100.000000',
          relievedAmount: '0.000000',
          entitlementAmount: '100.000000',
        },
      ];
      input.openingState.openingProvenance.entitlementPools = [
        {
          entitlementPoolId: 'pool-1',
          sourceRef: 'pool-source:1',
          dealId: 'deal-2',
          securityId: 'security-1',
        },
      ];

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('requires opening recycling cash to be owned by an entitlement pool', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingCashClassification.paidIn = '549999.000000';
      input.openingState.openingCashClassification.recycling = '1.000000';
      input.openingState.openingProvenance.cashLots[1]!.remainingBalance = '499999.000000';
      input.openingState.openingProvenance.cashLots.push({
        lotId: 'opening-recycling:1',
        sourceRef: 'opening-recycling-source:1',
        owner: { kind: 'fund' },
        classification: 'recycling',
        originalAmount: '1.000000',
        remainingBalance: '1.000000',
      });

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('accepts opening recycling cash owned by its entitlement pool', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingCashClassification.paidIn = '549999.000000';
      input.openingState.openingCashClassification.recycling = '1.000000';
      input.openingState.investorLedgers[0]!.unreturnedSettledCashCapital = '499999.000000';
      input.openingState.openingProvenance.cashLots[1]!.originalAmount = '499999.000000';
      input.openingState.openingProvenance.cashLots[1]!.remainingBalance = '499999.000000';
      input.openingState.openingProvenance.entitlementPools.push({
        entitlementPoolId: 'pool-1',
        sourceRef: 'pool-source:1',
        dealId: 'deal-1',
        securityId: 'security-1',
      });
      input.openingState.openingProvenance.cashLots.push({
        lotId: 'opening-recycling:1',
        sourceRef: 'opening-recycling-source:1',
        owner: { kind: 'entitlement_pool', entitlementPoolId: 'pool-1' },
        classification: 'recycling',
        originalAmount: '1.000000',
        remainingBalance: '1.000000',
      });

      expect(verifyAndNormalizeInternalEconomicsInputV2(input).ok).toBe(true);
    });

    it('refuses unreferenced entitlement pools', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingProvenance.entitlementPools.push({
        entitlementPoolId: 'orphan-pool',
        sourceRef: 'orphan-pool-source',
        dealId: 'deal-1',
        securityId: 'security-1',
      });

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('refuses ambiguous provenance source references', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingProvenance.cashLots[1]!.sourceRef =
        input.openingState.openingProvenance.cashLots[0]!.sourceRef;

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('OPENING_PROVENANCE_REQUIRED');
    });

    it('sorts provenance before hashing', () => {
      const first = buildMinimalV2Input();
      const second = buildMinimalV2Input();
      second.openingState.openingProvenance.cashLots.reverse();

      const firstResult = verifyAndNormalizeInternalEconomicsInputV2(first);
      const secondResult = verifyAndNormalizeInternalEconomicsInputV2(second);

      expect(firstResult.ok).toBe(true);
      expect(secondResult.ok).toBe(true);
      if (firstResult.ok && secondResult.ok) {
        expect(secondResult.input._normalizedInputHash).toBe(
          firstResult.input._normalizedInputHash
        );
        expect(
          secondResult.input.openingState.openingProvenance.cashLots.map((lot) => lot.lotId)
        ).toEqual(['opening-cash:gp-1', 'opening-cash:lp-1']);
      }
    });
  });

  describe('schema validation', () => {
    it('accepts minimal valid input', () => {
      const input = buildMinimalV2Input();
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.input._normalizedInputHash).toMatch(/^[a-f0-9]{64}$/);
        expect(result.input._hashAlgorithm).toBe('canonical-json-sha256/1');
      }
    });

    it('refuses wrong contract version', () => {
      const input = buildMinimalV2Input();
      (input as Record<string, unknown>).contractVersion = 'wrong/1.0.0';
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION');
      }
    });

    it('refuses unknown top-level fields', () => {
      const input = buildMinimalV2Input();
      (input as Record<string, unknown>).surprise = 'bad';
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it.each([
      ['undefined', undefined],
      ['BigInt', 1n],
      [
        'circular input',
        (() => {
          const circular: Record<string, unknown> = {};
          circular.self = circular;
          return circular;
        })(),
      ],
    ])('returns a schema refusal without throwing for %s', (_label, input) => {
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it('returns schema refusal when contractVersion getter throws', () => {
      const input = Object.defineProperty({}, 'contractVersion', {
        get() {
          throw new Error('getter exploded');
        },
      });

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
    });

    it('returns schema refusal when proxy throws during schema parsing', () => {
      const input = new Proxy(
        { contractVersion: buildMinimalV2Input().contractVersion },
        {
          get(target, property, receiver) {
            if (property === 'currency') throw new Error('proxy exploded');
            return Reflect.get(target, property, receiver);
          },
        }
      );

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
    });

    it.each([
      'calculationDate',
      'cutoverInstant',
      'fundEstablishmentDate',
      'investmentPeriodEndDate',
      'fundTermDate',
    ])('refuses non-UTC %s timestamps', (field) => {
      const input = buildMinimalV2Input();
      (input as unknown as Record<string, unknown>)[field] = '2025-06-30T01:00:00+01:00';
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it.each(['periodStartDate', 'periodEndDate'] as const)(
      'refuses non-UTC management-fee %s',
      (field) => {
        const input = buildMinimalV2Input();
        input.lpClasses[0]!.feeProfile.managementFeeSchedule[0]![field] =
          '2027-01-01T01:00:00+01:00';

        const result = verifyAndNormalizeInternalEconomicsInputV2(input);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      }
    );

    it('refuses non-UTC event timestamps', () => {
      const input = buildMinimalV2Input({
        events: [
          {
            eventId: 'e-1',
            instant: '2025-03-01T01:00:00+01:00',
            amountUsd: '100.000000',
            kind: 'settled_contribution',
            partnerId: 'lp-1',
            purpose: 'deployment',
            settlementSourceRef: 'ref-1',
          },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it('refuses numeric money values in fee profile', () => {
      const input = buildMinimalV2Input();
      (input.lpClasses[0]!.feeProfile as Record<string, unknown>).feeRecyclingCapUsd = 123;
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it('refuses malformed decimal strings', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingCash = '1000' as string;
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it('refuses derived event kinds in caller input', () => {
      const input = buildMinimalV2Input({
        events: [
          {
            eventId: 'e-1',
            instant: '2025-03-01T00:00:00Z',
            amountUsd: '100.000000',
            kind: 'management_fee_payment' as 'settled_contribution',
          } as never,
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });
  });

  describe('calendar ordering', () => {
    it('refuses establishment after IP end', () => {
      const input = buildMinimalV2Input({
        fundEstablishmentDate: '2030-01-01T00:00:00Z',
        investmentPeriodEndDate: '2028-01-01T00:00:00Z',
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
        expect(result.refusal.stage).toBe('normalization');
      }
    });

    it('refuses cutover after calculation date', () => {
      const input = buildMinimalV2Input({
        cutoverInstant: '2026-01-01T00:00:00Z',
        calculationDate: '2025-06-30T00:00:00Z',
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it('allows calculation date past fund term (post-term wind-down)', () => {
      const input = buildMinimalV2Input({
        investmentPeriodEndDate: '2025-01-15T00:00:00Z',
        fundTermDate: '2025-03-01T00:00:00Z',
        calculationDate: '2025-06-30T00:00:00Z',
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(true);
    });

    it('compares calendar timestamps as instants despite precision differences', () => {
      const input = buildMinimalV2Input({
        fundEstablishmentDate: '2025-01-01T00:00:00Z',
        cutoverInstant: '2025-01-01T00:00:00.000Z',
      });

      expect(verifyAndNormalizeInternalEconomicsInputV2(input).ok).toBe(true);
    });
  });

  describe('event window', () => {
    it('refuses event at cutover instant (closed lower bound)', () => {
      const input = buildMinimalV2Input({
        events: [
          {
            eventId: 'e-1',
            instant: '2025-01-01T00:00:00Z',
            amountUsd: '100.000000',
            kind: 'settled_contribution',
            partnerId: 'lp-1',
            purpose: 'deployment',
            settlementSourceRef: 'ref-1',
          },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('EVENT_OUT_OF_WINDOW');
      }
    });

    it('compares event bounds as instants despite precision differences', () => {
      const input = buildMinimalV2Input({
        events: [
          {
            eventId: 'e-1',
            instant: '2025-01-01T00:00:00.000Z',
            amountUsd: '100.000000',
            kind: 'settled_contribution',
            partnerId: 'lp-1',
            purpose: 'deployment',
            settlementSourceRef: 'ref-1',
          },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('EVENT_OUT_OF_WINDOW');
      }
    });

    it('refuses event after calculation date', () => {
      const input = buildMinimalV2Input({
        events: [
          {
            eventId: 'e-1',
            instant: '2025-12-31T00:00:00Z',
            amountUsd: '100.000000',
            kind: 'settled_contribution',
            partnerId: 'lp-1',
            purpose: 'deployment',
            settlementSourceRef: 'ref-1',
          },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('EVENT_OUT_OF_WINDOW');
      }
    });

    it('accepts event at calculation date (closed upper bound)', () => {
      const input = buildMinimalV2Input({
        events: [
          {
            eventId: 'e-1',
            instant: '2025-06-30T00:00:00Z',
            amountUsd: '100.000000',
            kind: 'settled_contribution',
            partnerId: 'lp-1',
            purpose: 'deployment',
            settlementSourceRef: 'ref-1',
          },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(true);
    });
  });

  describe('duplicate events', () => {
    it('refuses duplicate event IDs', () => {
      const input = buildMinimalV2Input({
        events: [
          {
            eventId: 'e-1',
            instant: '2025-03-01T00:00:00Z',
            amountUsd: '100.000000',
            kind: 'settled_contribution',
            partnerId: 'lp-1',
            purpose: 'deployment',
            settlementSourceRef: 'ref-1',
          },
          {
            eventId: 'e-1',
            instant: '2025-04-01T00:00:00Z',
            amountUsd: '200.000000',
            kind: 'settled_contribution',
            partnerId: 'lp-1',
            purpose: 'deployment',
            settlementSourceRef: 'ref-2',
          },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('DUPLICATE_EVENT_IDENTITY');
      }
    });
  });

  describe('admission limits', () => {
    it('preserves schema-first size admission and ignores caller toJSON', () => {
      const input = buildMinimalV2Input();
      input.partners[0]!.name = 'x'.repeat(V2_ADMISSION_LIMITS.MAX_SERIALIZED_INPUT_BYTES);
      Object.defineProperty(input, 'toJSON', {
        enumerable: false,
        value: () => ({}),
      });

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('ADMISSION_LIMIT_EXCEEDED');

      const schemaInvalidInput = {
        ...buildMinimalV2Input(),
        currency: 'EUR',
      };
      schemaInvalidInput.partners[0]!.name = 'x'.repeat(
        V2_ADMISSION_LIMITS.MAX_SERIALIZED_INPUT_BYTES
      );

      const schemaInvalidResult = verifyAndNormalizeInternalEconomicsInputV2(schemaInvalidInput);

      expect(schemaInvalidResult.ok).toBe(false);
      if (!schemaInvalidResult.ok) {
        expect(schemaInvalidResult.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
      }
    });

    it('refuses too many events', () => {
      const events = Array.from({ length: 10_001 }, (_, i) => ({
        eventId: `e-${i}`,
        instant: '2025-03-01T00:00:00Z',
        amountUsd: '1.000000',
        kind: 'settled_contribution' as const,
        partnerId: 'lp-1',
        purpose: 'deployment' as const,
        settlementSourceRef: `ref-${i}`,
      }));
      const input = buildMinimalV2Input({ events });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('ADMISSION_LIMIT_EXCEEDED');
      }
    });
  });

  describe('tier policy validation', () => {
    it.each([
      {
        name: 'return_of_capital',
        waterfallPolicy: [
          { kind: 'return_of_capital', priority: 1 },
          { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
        ] as WaterfallTierV2[],
        tierIndex: 0,
      },
      {
        name: 'preferred_return',
        waterfallPolicy: [
          {
            kind: 'preferred_return',
            priority: 1,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '0.080000000000',
            rateMode: 'simple',
          },
          { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
        ] as WaterfallTierV2[],
        tierIndex: 0,
      },
      {
        name: 'gp_catch_up',
        waterfallPolicy: [
          { kind: 'return_of_capital', priority: 1 },
          {
            kind: 'preferred_return',
            priority: 2,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '0.080000000000',
            rateMode: 'simple',
          },
          { kind: 'gp_catch_up', priority: 3, gpAllocationRate: '0.500000000000' },
          { kind: 'carry', priority: 4, gpShare: '0.200000000000' },
        ] as WaterfallTierV2[],
        tierIndex: 2,
      },
      {
        name: 'carry',
        waterfallPolicy: [
          { kind: 'carry', priority: 1, gpShare: '0.200000000000' },
        ] as WaterfallTierV2[],
        tierIndex: 0,
      },
    ])('rejects unknown fields on $name tiers', ({ waterfallPolicy, tierIndex }) => {
      const input = buildMinimalV2Input({ waterfallPolicy });
      (input.waterfallPolicy[tierIndex] as unknown as Record<string, unknown>).unexpectedPolicyNote =
        'unsupported';

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
        expect(result.refusal.stage).toBe('normalization');
      }
    });

    it.each([
      {
        name: 'gpShare below zero',
        waterfallPolicy: [
          { kind: 'carry', priority: 1, gpShare: '-1.000000000000' },
        ] as WaterfallTierV2[],
      },
      {
        name: 'gpShare above one',
        waterfallPolicy: [
          { kind: 'carry', priority: 1, gpShare: '2.000000000000' },
        ] as WaterfallTierV2[],
      },
      {
        name: 'gpAllocationRate below zero',
        waterfallPolicy: [
          { kind: 'return_of_capital', priority: 1 },
          {
            kind: 'preferred_return',
            priority: 2,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '0.080000000000',
            rateMode: 'simple',
          },
          { kind: 'gp_catch_up', priority: 3, gpAllocationRate: '-1.000000000000' },
          { kind: 'carry', priority: 4, gpShare: '0.200000000000' },
        ] as WaterfallTierV2[],
      },
      {
        name: 'gpAllocationRate above one',
        waterfallPolicy: [
          { kind: 'return_of_capital', priority: 1 },
          {
            kind: 'preferred_return',
            priority: 2,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '0.080000000000',
            rateMode: 'simple',
          },
          { kind: 'gp_catch_up', priority: 3, gpAllocationRate: '2.000000000000' },
          { kind: 'carry', priority: 4, gpShare: '0.200000000000' },
        ] as WaterfallTierV2[],
      },
      {
        name: 'annualRate below zero',
        waterfallPolicy: [
          {
            kind: 'preferred_return',
            priority: 1,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '-1.000000000000',
            rateMode: 'simple',
          },
          { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
        ] as WaterfallTierV2[],
      },
      {
        name: 'annualRate above one',
        waterfallPolicy: [
          {
            kind: 'preferred_return',
            priority: 1,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '2.000000000000',
            rateMode: 'simple',
          },
          { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
        ] as WaterfallTierV2[],
      },
    ])('rejects $name outside the inclusive ratio bounds', ({ waterfallPolicy }) => {
      const result = verifyAndNormalizeInternalEconomicsInputV2(
        buildMinimalV2Input({ waterfallPolicy })
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('INVALID_TIER_POLICY');
        expect(result.refusal.stage).toBe('normalization');
      }
    });

    it.each([
      {
        name: 'carry gpShare at zero',
        waterfallPolicy: [{ kind: 'carry', priority: 1, gpShare: '0.000000000000' }],
      },
      {
        name: 'carry gpShare at negative zero',
        waterfallPolicy: [{ kind: 'carry', priority: 1, gpShare: '-0.000000000000' }],
      },
      {
        name: 'carry gpShare at one',
        waterfallPolicy: [{ kind: 'carry', priority: 1, gpShare: '1.000000000000' }],
      },
      {
        name: 'preferred annualRate at zero',
        waterfallPolicy: [
          {
            kind: 'preferred_return',
            priority: 1,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '0.000000000000',
            rateMode: 'simple',
          },
          { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
        ],
      },
      {
        name: 'preferred annualRate at negative zero',
        waterfallPolicy: [
          {
            kind: 'preferred_return',
            priority: 1,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '-0.000000000000',
            rateMode: 'simple',
          },
          { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
        ],
      },
      {
        name: 'preferred annualRate at one',
        waterfallPolicy: [
          {
            kind: 'preferred_return',
            priority: 1,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '1.000000000000',
            rateMode: 'simple',
          },
          { kind: 'carry', priority: 2, gpShare: '0.200000000000' },
        ],
      },
      {
        name: 'gpAllocationRate at one',
        waterfallPolicy: [
          { kind: 'return_of_capital', priority: 1 },
          {
            kind: 'preferred_return',
            priority: 2,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '0.080000000000',
            rateMode: 'simple',
          },
          { kind: 'gp_catch_up', priority: 3, gpAllocationRate: '1.000000000000' },
          { kind: 'carry', priority: 4, gpShare: '0.200000000000' },
        ],
      },
    ] as const)('accepts $name', ({ waterfallPolicy }) => {
      const result = verifyAndNormalizeInternalEconomicsInputV2(
        buildMinimalV2Input({ waterfallPolicy: [...waterfallPolicy] as WaterfallTierV2[] })
      );

      expect(result.ok).toBe(true);
    });

    it('refuses non-contiguous priorities', () => {
      const input = buildMinimalV2Input({
        waterfallPolicy: [
          { kind: 'return_of_capital', priority: 1 },
          { kind: 'carry', priority: 3, gpShare: '0.200000000000' },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('INVALID_TIER_POLICY');
      }
    });

    it('refuses carry not last', () => {
      const input = buildMinimalV2Input({
        waterfallPolicy: [
          { kind: 'carry', priority: 1, gpShare: '0.200000000000' },
          { kind: 'return_of_capital', priority: 2 },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('INVALID_TIER_POLICY');
      }
    });

    it('refuses catch-up without preferred return', () => {
      const input = buildMinimalV2Input({
        waterfallPolicy: [
          { kind: 'return_of_capital', priority: 1 },
          { kind: 'gp_catch_up', priority: 2, gpAllocationRate: '1.000000000000' },
          { kind: 'carry', priority: 3, gpShare: '0.200000000000' },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('INVALID_TIER_POLICY');
      }
    });

    it('refuses catch-up rate <= carry share', () => {
      const input = buildMinimalV2Input({
        waterfallPolicy: [
          { kind: 'return_of_capital', priority: 1 },
          {
            kind: 'preferred_return',
            priority: 2,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '0.080000000000',
            rateMode: 'simple',
          },
          { kind: 'gp_catch_up', priority: 3, gpAllocationRate: '0.200000000000' },
          { kind: 'carry', priority: 4, gpShare: '0.200000000000' },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('INVALID_TIER_POLICY');
      }
    });

    it('accepts valid catch-up configuration', () => {
      const input = buildMinimalV2Input({
        waterfallPolicy: [
          { kind: 'return_of_capital', priority: 1 },
          {
            kind: 'preferred_return',
            priority: 2,
            basis: 'unreturned_settled_cash_capital',
            annualRate: '0.080000000000',
            rateMode: 'simple',
          },
          { kind: 'gp_catch_up', priority: 3, gpAllocationRate: '1.000000000000' },
          { kind: 'carry', priority: 4, gpShare: '0.200000000000' },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(true);
    });
  });

  describe('LP class validation', () => {
    it('refuses duplicate partner IDs', () => {
      const input = buildMinimalV2Input();
      input.partners[1]!.partnerId = input.partners[0]!.partnerId;

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('LP_CLASS_PROFILE_AMBIGUITY');
    });

    it('refuses GP partners carrying an LP class', () => {
      const input = buildMinimalV2Input();
      input.partners[1]!.lpClassId = 'class-a';

      const result = verifyAndNormalizeInternalEconomicsInputV2(input);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal.code).toBe('LP_CLASS_PROFILE_AMBIGUITY');
    });

    it('refuses LP partner referencing unknown class', () => {
      const input = buildMinimalV2Input();
      input.partners[0]!.lpClassId = 'nonexistent';
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('LP_CLASS_PROFILE_AMBIGUITY');
      }
    });
  });

  describe('opening reconciliation', () => {
    it('refuses opening and partner ledger identity mismatches', () => {
      const mutations: Array<[string, (input: ReturnType<typeof buildMinimalV2Input>) => void]> = [
        [
          'opening commitment total',
          (input) => {
            input.openingState.openingCommitments = '999999.000000';
          },
        ],
        [
          'partner committed capital',
          (input) => {
            input.partners[0]!.committedCapital = '999999.000000';
          },
        ],
        [
          'partner settled cash',
          (input) => {
            input.partners[0]!.settledCash = '499999.000000';
          },
        ],
        [
          'partner remaining callable commitment',
          (input) => {
            input.partners[0]!.remainingCallableCommitment = '499999.000000';
          },
        ],
        [
          'negative committed capital',
          (input) => {
            const ledger = input.openingState.investorLedgers[0]!;
            ledger.committedCapital = '-1.000000';
            ledger.calledCapital = '-2.000000';
            input.openingState.openingCommitments = '99999.000000';
            input.partners[0]!.committedCapital = '-1.000000';
            input.partners[0]!.remainingCallableCommitment = '1.000000';
          },
        ],
        [
          'negative called capital',
          (input) => {
            input.openingState.investorLedgers[0]!.calledCapital = '-1.000000';
            input.partners[0]!.remainingCallableCommitment = '1000001.000000';
          },
        ],
        [
          'negative settled capital',
          (input) => {
            input.openingState.investorLedgers[0]!.settledCapital = '-1.000000';
            input.partners[0]!.settledCash = '-1.000000';
          },
        ],
        [
          'negative paid-in capital',
          (input) => {
            input.openingState.investorLedgers[0]!.paidInCapital = '-1.000000';
          },
        ],
        [
          'negative unreturned settled cash capital',
          (input) => {
            input.openingState.investorLedgers[0]!.unreturnedSettledCashCapital = '-1.000000';
          },
        ],
        [
          'negative cumulative distributions with offset',
          (input) => {
            input.openingState.investorLedgers[0]!.cumulativeDistributions = '-1.000000';
            input.openingState.investorLedgers[1]!.cumulativeDistributions = '1.000000';
          },
        ],
        [
          'negative cumulative fees with offset',
          (input) => {
            input.openingState.investorLedgers[0]!.cumulativeFees = '-1.000000';
            input.openingState.investorLedgers[1]!.cumulativeFees = '1.000000';
          },
        ],
        [
          'negative accrued preference with offset',
          (input) => {
            input.openingState.investorLedgers[0]!.accruedPreference = '-1.000000';
            input.openingState.investorLedgers[1]!.accruedPreference = '1.000000';
          },
        ],
        [
          'unreturned capital above paid-in capital',
          (input) => {
            input.openingState.investorLedgers[0]!.unreturnedSettledCashCapital = '500001.000000';
          },
        ],
        [
          'paid-in capital differs from settled capital',
          (input) => {
            input.openingState.investorLedgers[0]!.paidInCapital = '499999.000000';
            input.openingState.openingCash = '549999.000000';
            input.openingState.openingCashClassification.paidIn = '549999.000000';
            const lot = input.openingState.openingProvenance.cashLots.find(
              (candidate) => candidate.lotId === 'opening-cash:lp-1'
            )!;
            lot.originalAmount = '499999.000000';
            lot.remainingBalance = '499999.000000';
          },
        ],
        [
          'settled capital above called capital',
          (input) => {
            input.openingState.investorLedgers[0]!.calledCapital = '499999.000000';
            input.partners[0]!.remainingCallableCommitment = '500001.000000';
          },
        ],
        [
          'called capital above committed capital',
          (input) => {
            input.openingState.investorLedgers[0]!.calledCapital = '1000001.000000';
            input.partners[0]!.remainingCallableCommitment = '-1.000000';
          },
        ],
        [
          'negative LP deemed contribution',
          (input) => {
            input.partners[0]!.gpDeemedContribution = '-1.000000';
          },
        ],
        [
          'positive GP deemed contribution',
          (input) => {
            input.partners[1]!.gpDeemedContribution = '100001.000000';
          },
        ],
      ];

      for (const [name, mutate] of mutations) {
        const input = buildMinimalV2Input();
        mutate(input);
        const result = verifyAndNormalizeInternalEconomicsInputV2(input);

        expect(result.ok, name).toBe(false);
        if (!result.ok) {
          expect(result.refusal.code, name).toBe('OPENING_RECONCILIATION_VIOLATION');
        }
      }
    });

    it('refuses when cash classification does not partition', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingCashClassification.paidIn = '100.000000';
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('OPENING_RECONCILIATION_VIOLATION');
      }
    });
  });

  describe('equalization refusal', () => {
    it('refuses equalization_principal events', () => {
      const input = buildMinimalV2Input({
        events: [
          {
            eventId: 'eq-1',
            instant: '2025-03-01T00:00:00Z',
            amountUsd: '1000.000000',
            kind: 'equalization_principal',
          },
        ],
      });
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('UNSUPPORTED_V2_EQUALIZATION');
      }
    });
  });

  describe('hashing determinism', () => {
    it('produces identical hash for identical input', () => {
      const input1 = buildMinimalV2Input();
      const input2 = buildMinimalV2Input();
      const r1 = verifyAndNormalizeInternalEconomicsInputV2(input1);
      const r2 = verifyAndNormalizeInternalEconomicsInputV2(input2);
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      if (r1.ok && r2.ok) {
        expect(r1.input._normalizedInputHash).toBe(r2.input._normalizedInputHash);
      }
    });
  });

  describe('mutation detection', () => {
    it('normalized input is frozen', () => {
      const input = buildMinimalV2Input();
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(() => {
          (result.input as Record<string, unknown>).currency = 'EUR';
        }).toThrow();
      }
    });
  });

describe('deep sealing', () => {
  function everyNodeFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
    if (value === null || typeof value !== 'object') return true;
    if (seen.has(value)) return true;
    seen.add(value);
    return Object.isFrozen(value) &&
      Object.values(value as Record<string, unknown>).every((child) => everyNodeFrozen(child, seen));
  }

  it('freezes root and every nested normalized object, array, and owner', () => {
    const input = buildMinimalV2Input();
    const result = verifyAndNormalizeInternalEconomicsInputV2(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(everyNodeFrozen(result.input)).toBe(true);
    expect(Object.isFrozen(result.input.openingState)).toBe(true);
    expect(Object.isFrozen(result.input.openingState.openingProvenance)).toBe(true);
    expect(Object.isFrozen(result.input.openingState.openingProvenance.cashLots[0])).toBe(true);
    expect(Object.isFrozen(result.input.openingState.openingProvenance.cashLots[0]!.owner)).toBe(true);
    expect(Object.isFrozen(result.input.partners)).toBe(true);
    expect(Object.isFrozen(result.input.lpClasses[0]!.feeProfile)).toBe(true);
    expect(Object.isFrozen(result.input.waterfallPolicy)).toBe(true);
    expect(Object.isFrozen(result.input.events)).toBe(true);
  });

  it('rejects nested mutation or leaves it unchanged without changing normalized hash', () => {
    const input = buildMinimalV2Input();
    const first = verifyAndNormalizeInternalEconomicsInputV2(input);

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const originalHash = first.input._normalizedInputHash;
    const attemptMutation = () => {
      (first.input.partners[0] as unknown as { name: string }).name = 'mutated';
    };

    try {
      attemptMutation();
    } catch {
      // Strict-mode frozen writes throw; no-op writes are also acceptable here.
    }
    expect(first.input.partners[0]!.name).toBe('LP One');
    const second = verifyAndNormalizeInternalEconomicsInputV2(input);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.input._normalizedInputHash).toBe(originalHash);
  });
});

describe('contract completeness', () => {
    it('has exactly 38 refusal codes', () => {
      expect(V2_REFUSAL_CODES).toHaveLength(38);
    });

    it('has exactly 9 event kinds', () => {
      expect(V2_EVENT_KINDS).toHaveLength(9);
    });

    it('has exactly 2 derived event kinds', () => {
      expect(V2_DERIVED_EVENT_KINDS).toHaveLength(2);
    });

    it('has exactly 10 stages', () => {
      expect(V2_STAGES).toHaveLength(10);
    });

    it('version constant matches plan', () => {
      expect(INTERNAL_ECONOMICS_COMPOSITE_V2_VERSION).toBe('internal-economics-composite/2.0.0');
    });
  });
});
