import { describe, expect, it } from 'vitest';
import {
  canonicalScenarioInputString,
  normalizeScenarioInputEnvelope,
} from '../../../shared/lib/scenarios/scenario-input-envelope';
import { createScenarioInputHash } from '../../../server/lib/scenarios/scenario-input-hash';

const baseEnvelope = {
  version: 'scenario-input-hash-v1',
  contractVersion: 'fund-scenarios-v1',
  scenarioSetId: '11111111-1111-4111-8111-111111111111',
  sourceConfigId: 42,
  sourceConfigVersion: 7,
  calculationMode: 'sync_fee_profile',
  overrideType: 'fee_profile',
  engineVersion: 'fund-scenarios-v1',
  variants: [
    {
      variantId: '22222222-2222-4222-8222-222222222222',
      sortOrder: 2,
      override: {
        managementFeeRateDecimal: '0.0200',
        nested: { b: 2, a: 1 },
        omitted: undefined,
      },
    },
    {
      variantId: '33333333-3333-4333-8333-333333333333',
      sortOrder: 1,
      override: {
        carryRateDecimal: '0.2000',
        amountCents: 123456n,
      },
    },
  ],
} as const;

describe('scenario input hash canonicalization', () => {
  it('binds modelInputsAsOfDate only in scenario-input-hash-v2', () => {
    const juneEnvelope = {
      ...baseEnvelope,
      version: 'scenario-input-hash-v2' as const,
      modelInputsAsOfDate: '2026-06-30',
    };
    const julyEnvelope = {
      ...juneEnvelope,
      modelInputsAsOfDate: '2026-07-31',
    };

    expect(canonicalScenarioInputString(juneEnvelope)).toContain(
      '"modelInputsAsOfDate":"2026-06-30"'
    );
    expect(createScenarioInputHash(juneEnvelope)).toMatch(/^[a-f0-9]{64}$/);
    expect(createScenarioInputHash(juneEnvelope)).not.toBe(createScenarioInputHash(julyEnvelope));
    expect(createScenarioInputHash(juneEnvelope)).not.toBe(createScenarioInputHash(baseEnvelope));
  });

  it('hashes object key order and nested key order identically', () => {
    const reordered = {
      ...baseEnvelope,
      variants: [
        {
          variantId: '22222222-2222-4222-8222-222222222222',
          sortOrder: 2,
          override: {
            nested: { a: 1, b: 2 },
            omitted: undefined,
            managementFeeRateDecimal: '0.0200',
          },
        },
        baseEnvelope.variants[1],
      ],
    };

    expect(createScenarioInputHash(baseEnvelope)).toBe(createScenarioInputHash(reordered));
  });

  it('sorts variants by sortOrder then variantId', () => {
    const reversed = {
      ...baseEnvelope,
      variants: [...baseEnvelope.variants].reverse(),
    };

    expect(canonicalScenarioInputString(reversed)).toBe(canonicalScenarioInputString(baseEnvelope));
  });

  it('normalizes undefined object properties as omitted while preserving null', () => {
    const omitted = {
      ...baseEnvelope,
      variants: [
        {
          ...baseEnvelope.variants[0],
          override: {
            managementFeeRateDecimal: '0.0200',
            nested: { b: 2, a: 1 },
          },
        },
        baseEnvelope.variants[1],
      ],
    };
    const withNull = {
      ...baseEnvelope,
      variants: [
        {
          ...baseEnvelope.variants[0],
          override: {
            managementFeeRateDecimal: '0.0200',
            nested: { b: 2, a: 1 },
            omitted: null,
          },
        },
        baseEnvelope.variants[1],
      ],
    };

    expect(createScenarioInputHash(baseEnvelope)).toBe(createScenarioInputHash(omitted));
    expect(createScenarioInputHash(baseEnvelope)).not.toBe(createScenarioInputHash(withNull));
  });

  it('normalizes bigint cents and decimal strings deterministically', () => {
    const normalized = normalizeScenarioInputEnvelope(baseEnvelope);

    expect(normalized.variants[0]?.override).toMatchObject({
      amountCents: '123456',
      carryRateDecimal: '0.2000',
    });
  });

  it('changes hash when governance fields change', () => {
    expect(createScenarioInputHash(baseEnvelope)).not.toBe(
      createScenarioInputHash({ ...baseEnvelope, sourceConfigVersion: 8 })
    );
    expect(createScenarioInputHash(baseEnvelope)).not.toBe(
      createScenarioInputHash({
        ...baseEnvelope,
        engineVersion: 'fund-scenarios-v2',
      })
    );
    expect(createScenarioInputHash(baseEnvelope)).not.toBe(
      createScenarioInputHash({
        ...baseEnvelope,
        calculationMode: 'async_reserve_allocation',
        overrideType: 'reserve_allocation',
      })
    );
  });

  it('breaks variant ties on variantId without locale sensitivity', () => {
    const lo = {
      variantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sortOrder: 5,
      override: { x: 1 },
    };
    const hi = {
      variantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sortOrder: 5,
      override: { x: 2 },
    };

    expect(canonicalScenarioInputString({ ...baseEnvelope, variants: [lo, hi] })).toBe(
      canonicalScenarioInputString({ ...baseEnvelope, variants: [hi, lo] })
    );
  });

  it('rejects non-POJO override values instead of hashing them as {}', () => {
    expect(() =>
      canonicalScenarioInputString({
        ...baseEnvelope,
        variants: [
          {
            variantId: '44444444-4444-4444-8444-444444444444',
            sortOrder: 1,
            override: new Date('2026-05-29T00:00:00Z'),
          },
        ],
      })
    ).toThrow(TypeError);
  });
});
