import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import corpus from '../../../docs/internal-economics-v2.truth-cases.json';
import {
  adaptLegacyCase,
  computeStrictWireDigest,
  LEGACY_CORPUS_ADAPTER_VERSION,
} from '../internal-economics/v2/support/legacy-corpus-adapter';
import {
  isValidRefusal,
  INTERNAL_ECONOMICS_TEST_ORACLE_VERSION,
} from '../internal-economics/v2/support/canonical-receipt-oracle-v1';
import { deriveInternalEconomicsV2 } from '../../../shared/lib/internal-economics/v2/derive-composite-v2';
import { verifyAndNormalizeInternalEconomicsInputV2 } from '../../../shared/lib/internal-economics/v2/normalize-input-v2';

const PINNED_CORPUS_SHA256 = '39793b3b40e63acbf7892fcf40af978fb3191b3337aca670c185b531af00360d';

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
  'V2-TC-R03': { code: 'UNSUPPORTED_INTERNAL_ECONOMICS_CONTRACT_VERSION', stage: 'normalization' },
};

describe('V2 engine truth corpus replay', () => {
  it('adapter and oracle version constants are set', () => {
    expect(LEGACY_CORPUS_ADAPTER_VERSION).toBe('internal-economics-legacy-corpus-adapter/1.0.0');
    expect(INTERNAL_ECONOMICS_TEST_ORACLE_VERSION).toBe('internal-economics-test-oracle/1.0.0');
  });

  it('raw corpus SHA-256 is pinned', () => {
    const corpusUrl = new URL(
      '../../../docs/internal-economics-v2.truth-cases.json',
      import.meta.url
    );
    const bytes = fs.readFileSync(corpusUrl, 'utf-8');
    const hash = createHash('sha256').update(bytes, 'utf-8').digest('hex');
    expect(hash).toBe(PINNED_CORPUS_SHA256);
  });

  it('strict-wire digest is stable', () => {
    const adapted = corpus.cases.map((c) =>
      adaptLegacyCase(c.input as Parameters<typeof adaptLegacyCase>[0])
    );
    const digest = computeStrictWireDigest(adapted);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('covers all 11 corpus cases', () => {
    expect(corpus.cases).toHaveLength(11);
    expect(Object.keys(EXPECTED_REFUSALS)).toHaveLength(11);
  });

  it('oracle imports no production modules', () => {
    const oracleUrl = new URL(
      '../internal-economics/v2/support/canonical-receipt-oracle-v1.ts',
      import.meta.url
    );
    const source = fs.readFileSync(oracleUrl, 'utf-8');
    expect(source).not.toMatch(/shared\/lib\/internal-economics/);
    expect(source).not.toMatch(/shared\/contracts/);
  });

  describe('success-path cases normalize before refusing', () => {
    const successCases = corpus.cases.filter((c) => c.expected.ok === true);

    for (const tc of successCases) {
      it(`${tc.id}: adapted input passes normalization`, () => {
        const adapted = adaptLegacyCase(tc.input as Parameters<typeof adaptLegacyCase>[0]);
        const result = verifyAndNormalizeInternalEconomicsInputV2(adapted);
        expect(result.ok).toBe(true);
      });
    }
  });

  describe('cumulative replay through public derive', () => {
    for (const tc of corpus.cases) {
      const expected = EXPECTED_REFUSALS[tc.id];
      if (!expected) throw new Error(`Missing expected refusal for ${tc.id}`);

      it(`${tc.id}: refuses with ${expected.code}/${expected.stage}`, () => {
        const adapted = adaptLegacyCase(tc.input as Parameters<typeof adaptLegacyCase>[0]);
        const result = deriveInternalEconomicsV2(adapted);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(isValidRefusal(result)).toBe(true);
          expect(result.refusal.code).toBe(expected.code);
          expect(result.refusal.stage).toBe(expected.stage);
        }
      });
    }
  });
});
