import { describe, it, expect } from 'vitest';
import { buildMinimalV2Input } from '../../../helpers/v2-input-builder';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../../shared/lib/internal-economics/v2/normalize-input-v2';
import {
  INTERNAL_ECONOMICS_COMPOSITE_V2_VERSION,
  V2_REFUSAL_CODES,
  V2_EVENT_KINDS,
  V2_DERIVED_EVENT_KINDS,
  V2_STAGES,
} from '../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';

describe('verifyAndNormalizeInternalEconomicsInputV2', () => {
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
        expect(result.refusal.code).toBe('SCHEMA_VALIDATION_FAILED');
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
    it('refuses when commitment sum mismatches', () => {
      const input = buildMinimalV2Input();
      input.openingState.openingCommitments = '999999.000000';
      const result = verifyAndNormalizeInternalEconomicsInputV2(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('OPENING_RECONCILIATION_VIOLATION');
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

  describe('contract completeness', () => {
    it('has exactly 23 refusal codes', () => {
      expect(V2_REFUSAL_CODES).toHaveLength(23);
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
