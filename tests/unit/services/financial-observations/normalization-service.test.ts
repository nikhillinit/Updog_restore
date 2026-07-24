import { describe, expect, it } from 'vitest';

import { canonicalSha256 } from '@shared/lib/canonical-hash';
import {
  FINGERPRINT_VERSION,
  type ImportMappingProfileV1,
  type ManualEntryV2,
  type MappingRuleV1,
  type NormalizedCandidateV2,
} from '@shared/contracts/financial-observations';
import { buildIdentitySemanticsHash } from '@shared/contracts/financial-observations/import-profile.contract';

import {
  applyMappingTransforms,
  normalizeObservation,
} from '@/server/services/financial-observations/normalization-service';
import { normalizeCsvObservations } from '@/server/services/financial-observations/csv-adapter';
import { normalizeManualObservation } from '@/server/services/financial-observations/manual-entry-adapter';
import {
  CORPUS_FUND_ID,
  EQUIVALENCE_CASES,
  type EquivalenceCase,
  type Variant,
} from '../../../fixtures/financial-observations/equivalence-corpus';

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function runVariant(caseObj: EquivalenceCase, variant: Variant): NormalizedCandidateV2 {
  if (variant.kind === 'manual') {
    return normalizeManualObservation(variant.entry);
  }
  const buffer = Buffer.from(`${variant.header}\n${variant.row}\n`, 'utf8');
  const result = normalizeCsvObservations({
    buffer,
    profile: caseObj.profile,
    domain: caseObj.domain,
    fundId: CORPUS_FUND_ID,
  });
  return result.candidates[0] ?? { outcome: result.outcome, issues: result.issues };
}

function runCase(caseObj: EquivalenceCase): Record<string, NormalizedCandidateV2> {
  const out: Record<string, NormalizedCandidateV2> = {};
  for (const [key, variant] of Object.entries(caseObj.variants)) {
    out[key] = runVariant(caseObj, variant);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Corpus assertions
// ---------------------------------------------------------------------------

describe('equivalence corpus', () => {
  for (const caseObj of EQUIVALENCE_CASES) {
    it(`case ${caseObj.id}: ${caseObj.name}`, () => {
      const results = runCase(caseObj);
      for (const a of caseObj.assertions) {
        switch (a.assert) {
          case 'staged':
            expect(results[a.variant]!.outcome, `${a.variant} staged`).toBe('staged');
            break;
          case 'rejected': {
            const r = results[a.variant]!;
            expect(r.outcome, `${a.variant} rejected`).toBe('rejected');
            const codes = r.issues.map((i) => i.code);
            for (const code of a.issueCodes) {
              expect(codes, `${a.variant} carries ${code}`).toContain(code);
            }
            break;
          }
          case 'noIssues':
            expect(results[a.variant]!.issues, `${a.variant} no issues`).toEqual([]);
            break;
          case 'payloadEqual':
            expect(results[a.left]!.normalizedPayload).toEqual(results[a.right]!.normalizedPayload);
            break;
          case 'payloadDiffer':
            expect(results[a.left]!.normalizedPayload).not.toEqual(
              results[a.right]!.normalizedPayload
            );
            break;
          case 'fingerprintEqual':
            expect(results[a.left]!.candidateFingerprint).toBe(
              results[a.right]!.candidateFingerprint
            );
            break;
          case 'fingerprintDiffer':
            expect(results[a.left]!.candidateFingerprint).not.toBe(
              results[a.right]!.candidateFingerprint
            );
            break;
          case 'hashEqual':
            expect(results[a.left]!.observationHash).toBe(results[a.right]!.observationHash);
            break;
          case 'hashDiffer':
            expect(results[a.left]!.observationHash).not.toBe(results[a.right]!.observationHash);
            break;
          case 'payloadPinned':
            expect(results[a.variant]!.normalizedPayload).toEqual(a.expected);
            break;
          default: {
            a satisfies never;
            throw new Error('unknown assertion');
          }
        }
      }
    });
  }

  it('exit gate: every csv/manual pair has equal payload and fingerprint', () => {
    let pairs = 0;
    for (const caseObj of EQUIVALENCE_CASES) {
      const results = runCase(caseObj);
      const csv = results.csv;
      const manual = results.manual;
      if (csv?.outcome === 'staged' && manual?.outcome === 'staged') {
        pairs++;
        expect(csv.normalizedPayload, `case ${caseObj.id} payload`).toEqual(
          manual.normalizedPayload
        );
        expect(csv.candidateFingerprint, `case ${caseObj.id} fingerprint`).toBe(
          manual.candidateFingerprint
        );
      }
    }
    expect(pairs).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Hash derivation (D15: derivation asserted, cross-mode byte-identity not a gate)
// ---------------------------------------------------------------------------

describe('hash derivation', () => {
  function preimageFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const {
      schemaVersion: _schemaVersion,
      descriptor: _descriptor,
      ...economicAndIdentity
    } = payload;
    return { fingerprintVersion: FINGERPRINT_VERSION, ...economicAndIdentity };
  }

  it('observationHash and candidateFingerprint derive from their exact preimages', () => {
    for (const caseObj of EQUIVALENCE_CASES) {
      const results = runCase(caseObj);
      for (const [key, candidate] of Object.entries(results)) {
        if (candidate.outcome !== 'staged') continue;
        const payload = candidate.normalizedPayload!;
        expect(candidate.observationHash, `${caseObj.id}.${key} hash`).toBe(
          canonicalSha256(payload)
        );
        expect(candidate.candidateFingerprint, `${caseObj.id}.${key} fp`).toBe(
          canonicalSha256(preimageFromPayload(payload))
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Negative gating — one per issue code
// ---------------------------------------------------------------------------

function baseLedger(over: Partial<ManualEntryV2>): ManualEntryV2 {
  return {
    domain: 'ledger_event',
    measureKey: 'initial_investment',
    companyName: 'Acme',
    effectiveDate: '2023-01-15',
    currency: 'USD',
    amount: '1000',
    ...over,
  };
}

function csvProfile(
  mappings: MappingRuleV1[],
  over: Partial<ImportMappingProfileV1> = {}
): ImportMappingProfileV1 {
  return {
    name: 'neg',
    sourceType: 'csv',
    domain: 'ledger_event',
    version: 1,
    mappings,
    identitySemanticsHash: buildIdentitySemanticsHash(mappings),
    ...over,
  };
}

const NEG_MAPPINGS: MappingRuleV1[] = [
  { sourceColumn: 'company_name', targetField: 'company_name', transforms: ['trim'] },
  { sourceColumn: 'measure_key', targetField: 'measure_key', transforms: ['trim'] },
  { sourceColumn: 'effective_date', targetField: 'effective_date', transforms: ['parse_date_iso'] },
  { sourceColumn: 'currency', targetField: 'currency', transforms: ['trim'] },
  { sourceColumn: 'amount', targetField: 'amount', transforms: ['parse_decimal'] },
];
const NEG_HEADER = 'company_name,measure_key,effective_date,currency,amount';

function csvRows(
  header: string,
  rows: string[],
  domain: EquivalenceCase['domain'] = 'ledger_event',
  profile = csvProfile(NEG_MAPPINGS)
) {
  const buffer = Buffer.from([header, ...rows].join('\n'), 'utf8');
  return normalizeCsvObservations({ buffer, profile, domain, fundId: 1 });
}

describe('negative gating', () => {
  it('MISSING_TRANSACTION_DATE', () => {
    const r = normalizeObservation(baseLedger({ effectiveDate: undefined }));
    expect(r.outcome).toBe('rejected');
    expect(r.issues.map((i) => i.code)).toContain('MISSING_TRANSACTION_DATE');
  });

  it('MALFORMED_DATE', () => {
    const r = normalizeObservation(baseLedger({ effectiveDate: '2023-13-40' }));
    expect(r.issues.map((i) => i.code)).toContain('MALFORMED_DATE');
  });

  it('MALFORMED_NUMBER', () => {
    const r = normalizeObservation(baseLedger({ amount: 'not-a-number' }));
    expect(r.issues.map((i) => i.code)).toContain('MALFORMED_NUMBER');
  });

  it('PRECISION_EXCEEDED', () => {
    const r = normalizeObservation(baseLedger({ amount: '1.0000001' }));
    expect(r.issues.map((i) => i.code)).toContain('PRECISION_EXCEEDED');
  });

  it('FORMULA_REJECTED', () => {
    const result = csvRows(NEG_HEADER, ['Acme,initial_investment,2023-01-15,USD,=1+1']);
    expect(result.candidates[0]!.issues.map((i) => i.code)).toContain('FORMULA_REJECTED');
  });

  it('CURRENCY_REQUIRED', () => {
    const r = normalizeObservation(baseLedger({ currency: undefined }));
    expect(r.issues.map((i) => i.code)).toContain('CURRENCY_REQUIRED');
  });

  it('NON_USD_VALUE_UNSUPPORTED', () => {
    const r = normalizeObservation(baseLedger({ currency: 'EUR' }));
    expect(r.issues.map((i) => i.code)).toContain('NON_USD_VALUE_UNSUPPORTED');
  });

  it('INFERRED_FX_REJECTED — non-unity fx', () => {
    const r = normalizeObservation(baseLedger({ fxRate: '1.5' }));
    expect(r.issues.map((i) => i.code)).toContain('INFERRED_FX_REJECTED');
  });

  it('INFERRED_FX_REJECTED — fx without currency', () => {
    const r = normalizeObservation(baseLedger({ currency: undefined, fxRate: '1.0' }));
    expect(r.issues.map((i) => i.code)).toContain('INFERRED_FX_REJECTED');
  });

  it('MISSING_ECONOMIC_VALUE', () => {
    const r = normalizeObservation(baseLedger({ amount: undefined }));
    expect(r.issues.map((i) => i.code)).toContain('MISSING_ECONOMIC_VALUE');
  });

  it('MEASURE_DOMAIN_MISMATCH', () => {
    const r = normalizeObservation(baseLedger({ measureKey: 'ownership_stake' }));
    expect(r.issues.map((i) => i.code)).toContain('MEASURE_DOMAIN_MISMATCH');
  });

  it('VALUE_DOMAIN_MISMATCH', () => {
    const r = normalizeObservation(baseLedger({ postMoneyValuation: '100' }));
    expect(r.issues.map((i) => i.code)).toContain('VALUE_DOMAIN_MISMATCH');
  });

  it('OWNERSHIP_OUT_OF_RANGE', () => {
    const r = normalizeObservation({
      domain: 'ownership',
      measureKey: 'ownership_stake',
      companyName: 'Acme',
      effectiveDate: '2023-01-15',
      currency: 'USD',
      ownershipPct: '150',
    });
    expect(r.issues.map((i) => i.code)).toContain('OWNERSHIP_OUT_OF_RANGE');
  });

  it('IDENTITY_REQUIRED', () => {
    const r = normalizeObservation(baseLedger({ companyName: undefined }));
    expect(r.issues.map((i) => i.code)).toContain('IDENTITY_REQUIRED');
  });

  it('TEXT_LENGTH_EXCEEDED', () => {
    const r = normalizeObservation(baseLedger({ descriptor: { memo: 'x'.repeat(2001) } }));
    expect(r.issues.map((i) => i.code)).toContain('TEXT_LENGTH_EXCEEDED');
  });

  it('ROW_LIMIT_EXCEEDED', () => {
    const rows = Array.from({ length: 5001 }, () => 'Acme,initial_investment,2023-01-15,USD,1000');
    const result = csvRows(NEG_HEADER, rows);
    expect(result.outcome).toBe('rejected');
    expect(result.issues.map((i) => i.code)).toContain('ROW_LIMIT_EXCEEDED');
  });

  it('PROFILE_SOURCE_MISMATCH', () => {
    const result = csvRows(
      NEG_HEADER,
      ['Acme,initial_investment,2023-01-15,USD,1000'],
      'ledger_event',
      csvProfile(NEG_MAPPINGS, { sourceType: 'manual' })
    );
    expect(result.issues.map((i) => i.code)).toContain('PROFILE_SOURCE_MISMATCH');
  });

  it('PROFILE_DOMAIN_MISMATCH', () => {
    const result = csvRows(
      NEG_HEADER,
      ['Acme,initial_investment,2023-01-15,USD,1000'],
      'ledger_event',
      csvProfile(NEG_MAPPINGS, { domain: 'valuation' })
    );
    expect(result.issues.map((i) => i.code)).toContain('PROFILE_DOMAIN_MISMATCH');
  });

  it('PROFILE_DUPLICATE_TARGET', () => {
    const dup = [
      ...NEG_MAPPINGS,
      { sourceColumn: 'amount2', targetField: 'amount', transforms: ['parse_decimal'] as const },
    ];
    const result = csvRows(
      NEG_HEADER,
      ['Acme,initial_investment,2023-01-15,USD,1000'],
      'ledger_event',
      csvProfile(dup as MappingRuleV1[])
    );
    expect(result.issues.map((i) => i.code)).toContain('PROFILE_DUPLICATE_TARGET');
  });

  it('DUPLICATE_HEADER', () => {
    const result = csvRows('company_name,amount,amount', ['Acme,1000,2000']);
    expect(result.issues.map((i) => i.code)).toContain('DUPLICATE_HEADER');
  });

  it('UNMAPPED_REQUIRED_COLUMN', () => {
    const result = csvRows('company_name,measure_key,effective_date,currency', [
      'Acme,initial_investment,2023-01-15,USD',
    ]);
    expect(result.issues.map((i) => i.code)).toContain('UNMAPPED_REQUIRED_COLUMN');
  });

  it('EMBEDDED_LINE_BREAK_UNSUPPORTED', () => {
    const buffer = Buffer.from(
      `${NEG_HEADER}\nAcme,initial_investment,2023-01-15,USD,"10\n00"\n`,
      'utf8'
    );
    const result = normalizeCsvObservations({
      buffer,
      profile: csvProfile(NEG_MAPPINGS),
      domain: 'ledger_event',
      fundId: 1,
    });
    expect(result.issues.map((i) => i.code)).toContain('EMBEDDED_LINE_BREAK_UNSUPPORTED');
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('structured external identity avoids delimiter collision', () => {
    const a = normalizeObservation(
      baseLedger({ companyName: undefined, companyExternalId: { system: 'a:b', value: 'c' } })
    );
    const b = normalizeObservation(
      baseLedger({ companyName: undefined, companyExternalId: { system: 'a', value: 'b:c' } })
    );
    expect(a.outcome).toBe('staged');
    expect(b.outcome).toBe('staged');
    expect(a.candidateFingerprint).not.toBe(b.candidateFingerprint);
  });

  it('transform application is order-dependent and repeatable', () => {
    const first = applyMappingTransforms(' 1,000.00 ', ['trim', 'parse_decimal']);
    const second = applyMappingTransforms(' 1,000.00 ', ['trim', 'parse_decimal']);
    expect(first).toEqual({ ok: true, value: '1000.00' });
    expect(second).toEqual(first);
    const negated = applyMappingTransforms('1000', ['parse_decimal', 'negate']);
    expect(negated).toEqual({ ok: true, value: '-1000' });
  });

  it('decimal precision follows the per-field policy', () => {
    const money = normalizeObservation(baseLedger({ amount: '1000' }));
    expect(money.normalizedPayload!.amount).toBe('1000.000000');
    expect(money.normalizedPayload!.fxRate).toBe('1.000000000000');
    const ownership = normalizeObservation({
      domain: 'ownership',
      measureKey: 'ownership_stake',
      companyName: 'Acme',
      effectiveDate: '2023-01-15',
      currency: 'USD',
      ownershipPct: '8',
    });
    expect(ownership.normalizedPayload!.ownershipPct).toBe('8.000000000000');
  });
});
