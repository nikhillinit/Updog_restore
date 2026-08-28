import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import corpus from '../../../docs/internal-economics-v2.truth-cases.json';
import { deriveInternalEconomicsV2 } from '../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../shared/lib/internal-economics/v2/normalize-input-v2';
import {
  adaptLegacyCase,
  computeStrictWireDigest,
} from '../internal-economics/v2/support/legacy-corpus-adapter';

const PINNED_CORPUS_SHA256 = '39793b3b40e63acbf7892fcf40af978fb3191b3337aca670c185b531af00360d';
const PINNED_STRICT_WIRE_SHA256 =
  'f1ea691d5e7e59fa1c7259e50c2f898ae3a9283d3daaf24123adda7c728282f7';

const EXPECTED_REFUSALS: Record<string, { code: string; stage: string }> = {
  'V2-TC-001': { code: 'UNSUPPORTED_V2_BASE_EVENT', stage: 'admission' },
  'V2-TC-002': { code: 'UNSUPPORTED_V2_BASE_EVENT', stage: 'admission' },
  'V2-TC-003': { code: 'UNSUPPORTED_V2_BASE_EVENT', stage: 'admission' },
  'V2-TC-004': { code: 'UNSUPPORTED_V2_BASE_EVENT', stage: 'admission' },
  'V2-TC-005': { code: 'UNSUPPORTED_V2_BASE_EVENT', stage: 'admission' },
  'V2-TC-006': { code: 'UNSUPPORTED_V2_BASE_EVENT', stage: 'admission' },
  'V2-TC-007': { code: 'UNSUPPORTED_V2_BASE_EVENT', stage: 'admission' },
  'V2-TC-008': { code: 'UNSUPPORTED_V2_BASE_EVENT', stage: 'admission' },
  'V2-TC-R01': { code: 'UNSUPPORTED_V2_EQUALIZATION', stage: 'equalization' },
  'V2-TC-R02': { code: 'INVALID_TIER_POLICY', stage: 'normalization' },
  'V2-TC-R03': {
    code: 'UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION',
    stage: 'normalization',
  },
};

const adaptedCases = corpus.cases.map((tc) => ({
  id: tc.id,
  input: adaptLegacyCase(tc.input as Parameters<typeof adaptLegacyCase>[0]),
}));

describe('V2 F1 truth corpus refusal replay', () => {
  it('pins raw corpus and strict adapted-input bytes', () => {
    const rawCorpus = fs.readFileSync(
      new URL('../../../docs/internal-economics-v2.truth-cases.json', import.meta.url),
      'utf-8'
    );
    expect(createHash('sha256').update(rawCorpus, 'utf-8').digest('hex')).toBe(
      PINNED_CORPUS_SHA256
    );
    expect(computeStrictWireDigest(adaptedCases.map((tc) => tc.input))).toBe(
      PINNED_STRICT_WIRE_SHA256
    );
  });

  it('covers a non-empty exact 11-case refusal domain', () => {
    expect(adaptedCases).toHaveLength(11);
    expect(Object.keys(EXPECTED_REFUSALS)).toHaveLength(11);
  });

  it('normalizes all eight migrated calculation cases', () => {
    for (const tc of adaptedCases.slice(0, 8)) {
      expect(verifyAndNormalizeInternalEconomicsInputV2(tc.input).ok, tc.id).toBe(true);
    }
  });

  for (const tc of adaptedCases) {
    const expected = EXPECTED_REFUSALS[tc.id];
    if (!expected) throw new Error(`Missing refusal expectation for ${tc.id}`);

    it(`${tc.id}: ${expected.code}/${expected.stage}`, () => {
      const before = structuredClone(tc.input);
      const result = deriveInternalEconomicsV2(tc.input);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.refusal).toMatchObject(expected);
      expect(result).not.toHaveProperty('receipt');
      expect(result).not.toHaveProperty('result');
      expect(result).not.toHaveProperty('certification');
      expect(tc.input).toEqual(before);
    });
  }
});
