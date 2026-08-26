/**
 * Golden equivalence corpus (PLAN_61 Wave C, Task 5a).
 *
 * 12 event types, each expressed as equivalent CSV and manual variants, with
 * pinned dispositions and hash relationships. Values are grounded in the real
 * Press On Ventures fund files (Venture Pipeline, LPs x Funds); values marked
 * `// illustrative` are synthetic.
 *
 * Fixture only: no database, no route. Consumed by
 * `tests/unit/services/financial-observations/normalization-service.test.ts`.
 */

import type { FinancialObservationDomain } from '@shared/contracts/financial-observations/financial-observation.contract';
import {
  buildIdentitySemanticsHash,
  type ImportMappingProfileV1,
  type MappingRuleV1,
} from '@shared/contracts/financial-observations/import-profile.contract';
import type {
  ManualEntryV2,
  NormalizationIssueCode,
} from '@shared/contracts/financial-observations/normalization.contract';

export const CORPUS_FUND_ID = 1;

export type CsvVariant = { kind: 'csv'; header: string; row: string };
export type ManualVariant = { kind: 'manual'; entry: ManualEntryV2 };
export type Variant = CsvVariant | ManualVariant;

export type CorpusAssertion =
  | { assert: 'staged'; variant: string }
  | { assert: 'rejected'; variant: string; issueCodes: NormalizationIssueCode[] }
  | { assert: 'noIssues'; variant: string }
  | { assert: 'payloadEqual'; left: string; right: string }
  | { assert: 'payloadDiffer'; left: string; right: string }
  | { assert: 'fingerprintEqual'; left: string; right: string }
  | { assert: 'fingerprintDiffer'; left: string; right: string }
  | { assert: 'hashEqual'; left: string; right: string }
  | { assert: 'hashDiffer'; left: string; right: string }
  | { assert: 'payloadPinned'; variant: string; expected: Record<string, unknown> };

export interface EquivalenceCase {
  readonly id: number;
  readonly name: string;
  readonly domain: FinancialObservationDomain;
  readonly profile: ImportMappingProfileV1;
  readonly variants: Record<string, Variant>;
  readonly assertions: readonly CorpusAssertion[];
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

function profile(
  name: string,
  domain: FinancialObservationDomain,
  mappings: MappingRuleV1[]
): ImportMappingProfileV1 {
  return {
    name,
    sourceType: 'csv',
    domain,
    version: 1,
    mappings,
    identitySemanticsHash: buildIdentitySemanticsHash(mappings),
  };
}

const LEDGER_MAPPINGS: MappingRuleV1[] = [
  { sourceColumn: 'company_name', targetField: 'company_name', transforms: ['trim'] },
  { sourceColumn: 'measure_key', targetField: 'measure_key', transforms: ['trim'] },
  { sourceColumn: 'effective_date', targetField: 'effective_date', transforms: ['parse_date_iso'] },
  { sourceColumn: 'currency', targetField: 'currency', transforms: ['trim'] },
  { sourceColumn: 'amount', targetField: 'amount', transforms: ['parse_decimal'] },
  { sourceColumn: 'external_ref', targetField: 'external_ref', transforms: ['trim'] },
  { sourceColumn: 'memo', targetField: 'memo', transforms: ['trim'] },
];
const LEDGER_HEADER = 'company_name,measure_key,effective_date,currency,amount,external_ref,memo';
const LEDGER_PROFILE = profile('ledger-v2', 'ledger_event', LEDGER_MAPPINGS);

const LEDGER_FX_MAPPINGS: MappingRuleV1[] = [
  ...LEDGER_MAPPINGS,
  { sourceColumn: 'fx_rate', targetField: 'fx_rate', transforms: ['trim'] },
];
const LEDGER_FX_HEADER = `${LEDGER_HEADER},fx_rate`;
const LEDGER_FX_PROFILE = profile('ledger-fx-v2', 'ledger_event', LEDGER_FX_MAPPINGS);

const VALUATION_MAPPINGS: MappingRuleV1[] = [
  { sourceColumn: 'company_name', targetField: 'company_name', transforms: ['trim'] },
  { sourceColumn: 'measure_key', targetField: 'measure_key', transforms: ['trim'] },
  { sourceColumn: 'effective_date', targetField: 'effective_date', transforms: ['parse_date_iso'] },
  { sourceColumn: 'currency', targetField: 'currency', transforms: ['trim'] },
  {
    sourceColumn: 'post_money_valuation',
    targetField: 'post_money_valuation',
    transforms: ['parse_decimal'],
  },
  { sourceColumn: 'valuation_basis', targetField: 'valuation_basis', transforms: ['trim'] },
  { sourceColumn: 'external_ref', targetField: 'external_ref', transforms: ['trim'] },
];
const VALUATION_HEADER =
  'company_name,measure_key,effective_date,currency,post_money_valuation,valuation_basis,external_ref';
const VALUATION_PROFILE = profile('valuation-v2', 'valuation', VALUATION_MAPPINGS);

const OWNERSHIP_MAPPINGS: MappingRuleV1[] = [
  { sourceColumn: 'company_name', targetField: 'company_name', transforms: ['trim'] },
  { sourceColumn: 'measure_key', targetField: 'measure_key', transforms: ['trim'] },
  { sourceColumn: 'effective_date', targetField: 'effective_date', transforms: ['parse_date_iso'] },
  { sourceColumn: 'currency', targetField: 'currency', transforms: ['trim'] },
  { sourceColumn: 'ownership_pct', targetField: 'ownership_pct', transforms: ['parse_decimal'] },
  { sourceColumn: 'external_ref', targetField: 'external_ref', transforms: ['trim'] },
];
const OWNERSHIP_HEADER =
  'company_name,measure_key,effective_date,currency,ownership_pct,external_ref';
const OWNERSHIP_PROFILE = profile('ownership-v2', 'ownership', OWNERSHIP_MAPPINGS);

const EXTERNAL_MAPPINGS: MappingRuleV1[] = [
  {
    sourceColumn: 'company_external_system',
    targetField: 'company_external_system',
    transforms: ['trim'],
  },
  {
    sourceColumn: 'company_external_value',
    targetField: 'company_external_value',
    transforms: ['trim'],
  },
  { sourceColumn: 'measure_key', targetField: 'measure_key', transforms: ['trim'] },
  { sourceColumn: 'effective_date', targetField: 'effective_date', transforms: ['parse_date_iso'] },
  { sourceColumn: 'currency', targetField: 'currency', transforms: ['trim'] },
  { sourceColumn: 'amount', targetField: 'amount', transforms: ['parse_decimal'] },
  { sourceColumn: 'external_ref', targetField: 'external_ref', transforms: ['trim'] },
  { sourceColumn: 'source_label', targetField: 'source_label', transforms: ['trim'] },
];
const EXTERNAL_HEADER =
  'company_external_system,company_external_value,measure_key,effective_date,currency,amount,external_ref,source_label';
const EXTERNAL_PROFILE = profile('ledger-external-v2', 'ledger_event', EXTERNAL_MAPPINGS);

// ---------------------------------------------------------------------------
// Helpers for canonical manual entries
// ---------------------------------------------------------------------------

function ledgerManual(over: Partial<ManualEntryV2>): ManualEntryV2 {
  return {
    domain: 'ledger_event',
    measureKey: 'initial_investment',
    currency: 'USD',
    effectiveDate: '2023-01-15',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export const EQUIVALENCE_CASES: readonly EquivalenceCase[] = [
  // 1. Initial investment — Jon Victor SPV Three initial $100,000
  {
    id: 1,
    name: 'initial investment',
    domain: 'ledger_event',
    profile: LEDGER_PROFILE,
    variants: {
      csv: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'Jon Victor SPV Three,initial_investment,2023-01-15,USD,"100,000.00",wire-001,initial check',
      },
      manual: {
        kind: 'manual',
        entry: ledgerManual({
          companyName: 'Jon Victor SPV Three',
          measureKey: 'initial_investment',
          amount: '100000.00',
          externalRef: 'wire-001',
          descriptor: { memo: 'initial check' },
        }),
      },
    },
    assertions: [
      { assert: 'staged', variant: 'csv' },
      { assert: 'staged', variant: 'manual' },
      { assert: 'payloadEqual', left: 'csv', right: 'manual' },
      { assert: 'fingerprintEqual', left: 'csv', right: 'manual' },
      {
        assert: 'payloadPinned',
        variant: 'manual',
        expected: {
          schemaVersion: 1,
          domain: 'ledger_event',
          measureKey: 'initial_investment',
          companyIdentity: { kind: 'name', canonicalName: 'jon victor spv three' },
          effectiveDate: '2023-01-15',
          currency: 'USD',
          fxRate: '1.000000000000',
          amount: '100000.000000',
          externalRef: 'wire-001',
          descriptor: { memo: 'initial check' },
        },
      },
    ],
  },

  // 2. Follow-on — Jon Victor SPV Three follow-on $25,040
  {
    id: 2,
    name: 'follow-on investment',
    domain: 'ledger_event',
    profile: LEDGER_PROFILE,
    variants: {
      csv: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'Jon Victor SPV Three,follow_on_investment,2023-06-01,USD,"25,040.00",wire-002,follow on',
      },
      manual: {
        kind: 'manual',
        entry: ledgerManual({
          companyName: 'Jon Victor SPV Three',
          measureKey: 'follow_on_investment',
          effectiveDate: '2023-06-01',
          amount: '25040',
          externalRef: 'wire-002',
          descriptor: { memo: 'follow on' },
        }),
      },
    },
    assertions: [
      { assert: 'staged', variant: 'csv' },
      { assert: 'staged', variant: 'manual' },
      { assert: 'payloadEqual', left: 'csv', right: 'manual' },
      { assert: 'fingerprintEqual', left: 'csv', right: 'manual' },
    ],
  },

  // 3. Valuation mark — Puzzle Medical Devices Series A $100m post-money
  {
    id: 3,
    name: 'valuation mark',
    domain: 'valuation',
    profile: VALUATION_PROFILE,
    variants: {
      csv: {
        kind: 'csv',
        header: VALUATION_HEADER,
        row: 'Puzzle Medical Devices,post_money_valuation,2023-04-01,USD,100000000,priced_round,mark-001',
      },
      manual: {
        kind: 'manual',
        entry: {
          domain: 'valuation',
          measureKey: 'post_money_valuation',
          companyName: 'Puzzle Medical Devices',
          effectiveDate: '2023-04-01',
          currency: 'USD',
          postMoneyValuation: '100000000',
          valuationBasis: 'priced_round',
          externalRef: 'mark-001',
        },
      },
    },
    assertions: [
      { assert: 'staged', variant: 'csv' },
      { assert: 'staged', variant: 'manual' },
      { assert: 'payloadEqual', left: 'csv', right: 'manual' },
      { assert: 'fingerprintEqual', left: 'csv', right: 'manual' },
      {
        assert: 'payloadPinned',
        variant: 'manual',
        expected: {
          schemaVersion: 1,
          domain: 'valuation',
          measureKey: 'post_money_valuation',
          companyIdentity: { kind: 'name', canonicalName: 'puzzle medical devices' },
          effectiveDate: '2023-04-01',
          currency: 'USD',
          fxRate: '1.000000000000',
          postMoneyValuation: '100000000.000000',
          valuationBasis: 'priced_round',
          externalRef: 'mark-001',
        },
      },
    ],
  },

  // 4. Ownership update — Get Globy seed SPV stake (8% // illustrative)
  {
    id: 4,
    name: 'ownership update',
    domain: 'ownership',
    profile: OWNERSHIP_PROFILE,
    variants: {
      csv: {
        kind: 'csv',
        header: OWNERSHIP_HEADER,
        row: 'Get Globy,ownership_stake,2023-02-01,USD,8,own-001',
      }, // illustrative
      manual: {
        kind: 'manual',
        entry: {
          domain: 'ownership',
          measureKey: 'ownership_stake',
          companyName: 'Get Globy',
          effectiveDate: '2023-02-01',
          currency: 'USD',
          ownershipPct: '8', // illustrative
          externalRef: 'own-001',
        },
      },
    },
    assertions: [
      { assert: 'staged', variant: 'csv' },
      { assert: 'staged', variant: 'manual' },
      { assert: 'payloadEqual', left: 'csv', right: 'manual' },
      { assert: 'fingerprintEqual', left: 'csv', right: 'manual' },
      {
        assert: 'payloadPinned',
        variant: 'manual',
        expected: {
          schemaVersion: 1,
          domain: 'ownership',
          measureKey: 'ownership_stake',
          companyIdentity: { kind: 'name', canonicalName: 'get globy' },
          effectiveDate: '2023-02-01',
          currency: 'USD',
          fxRate: '1.000000000000',
          ownershipPct: '8.000000000000',
          externalRef: 'own-001',
        },
      },
    ],
  },

  // 5. Cash-flow event — David Morris SPV Three initial $50,000 call
  {
    id: 5,
    name: 'cash-flow event',
    domain: 'ledger_event',
    profile: LEDGER_PROFILE,
    variants: {
      csv: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'David Morris,capital_contribution,2023-03-01,USD,"50,000.00",call-001,capital call',
      },
      manual: {
        kind: 'manual',
        entry: ledgerManual({
          companyName: 'David Morris',
          measureKey: 'capital_contribution',
          effectiveDate: '2023-03-01',
          amount: '50000',
          externalRef: 'call-001',
          descriptor: { memo: 'capital call' },
        }),
      },
    },
    assertions: [
      { assert: 'staged', variant: 'csv' },
      { assert: 'staged', variant: 'manual' },
      { assert: 'payloadEqual', left: 'csv', right: 'manual' },
      { assert: 'fingerprintEqual', left: 'csv', right: 'manual' },
    ],
  },

  // 6. External identity — same carta id, differing display names
  {
    id: 6,
    name: 'external identity',
    domain: 'ledger_event',
    profile: EXTERNAL_PROFILE,
    variants: {
      csv: {
        kind: 'csv',
        header: EXTERNAL_HEADER,
        row: 'carta,cmp_puzzle,initial_investment,2023-03-01,USD,500000,ref6,Puzzle Medical Devices',
      }, // illustrative
      manual: {
        kind: 'manual',
        entry: {
          domain: 'ledger_event',
          measureKey: 'initial_investment',
          companyExternalId: { system: 'carta', value: 'cmp_puzzle' }, // illustrative
          effectiveDate: '2023-03-01',
          currency: 'USD',
          amount: '500000',
          externalRef: 'ref6',
          descriptor: { sourceLabel: 'Puzzle Medical Devices' },
        },
      },
      altName: {
        kind: 'manual',
        entry: {
          domain: 'ledger_event',
          measureKey: 'initial_investment',
          companyExternalId: { system: 'carta', value: 'cmp_puzzle' }, // illustrative
          effectiveDate: '2023-03-01',
          currency: 'USD',
          amount: '500000',
          externalRef: 'ref6',
          descriptor: { sourceLabel: 'Puzzle Med Inc' },
        },
      },
    },
    assertions: [
      { assert: 'staged', variant: 'csv' },
      { assert: 'staged', variant: 'manual' },
      { assert: 'staged', variant: 'altName' },
      { assert: 'payloadEqual', left: 'csv', right: 'manual' },
      { assert: 'fingerprintEqual', left: 'csv', right: 'manual' },
      // differing display name: same economic identity, different full hash
      { assert: 'fingerprintEqual', left: 'manual', right: 'altName' },
      { assert: 'hashDiffer', left: 'manual', right: 'altName' },
      {
        assert: 'payloadPinned',
        variant: 'manual',
        expected: {
          schemaVersion: 1,
          domain: 'ledger_event',
          measureKey: 'initial_investment',
          companyIdentity: { kind: 'external', system: 'carta', externalId: 'cmp_puzzle' },
          effectiveDate: '2023-03-01',
          currency: 'USD',
          fxRate: '1.000000000000',
          amount: '500000.000000',
          externalRef: 'ref6',
          descriptor: { sourceLabel: 'Puzzle Medical Devices' },
        },
      },
    ],
  },

  // 7. Number formats — three spellings of $100,000 normalize identically
  {
    id: 7,
    name: 'number formats',
    domain: 'ledger_event',
    profile: LEDGER_PROFILE,
    variants: {
      comma: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'Jon Victor SPV Three,initial_investment,2023-01-15,USD,"100,000.00",wire-001,initial check',
      },
      plain: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'Jon Victor SPV Three,initial_investment,2023-01-15,USD,100000,wire-001,initial check',
      },
      dollar: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'Jon Victor SPV Three,initial_investment,2023-01-15,USD,"$100,000.00",wire-001,initial check',
      },
      manual: {
        kind: 'manual',
        entry: ledgerManual({
          companyName: 'Jon Victor SPV Three',
          measureKey: 'initial_investment',
          amount: '100000',
          externalRef: 'wire-001',
          descriptor: { memo: 'initial check' },
        }),
      },
      malformed: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'Jon Victor SPV Three,initial_investment,2023-01-15,USD,"1,23",wire-001,initial check',
      },
    },
    assertions: [
      { assert: 'payloadEqual', left: 'comma', right: 'plain' },
      { assert: 'payloadEqual', left: 'plain', right: 'dollar' },
      { assert: 'payloadEqual', left: 'dollar', right: 'manual' },
      { assert: 'rejected', variant: 'malformed', issueCodes: ['MALFORMED_NUMBER'] },
    ],
  },

  // 8. Explicit USD FX = 1.0 — no warning
  {
    id: 8,
    name: 'explicit usd fx',
    domain: 'ledger_event',
    profile: LEDGER_FX_PROFILE,
    variants: {
      csv: {
        kind: 'csv',
        header: LEDGER_FX_HEADER,
        row: 'David Morris,follow_on_investment,2023-07-01,USD,"12,520.00",fx-001,follow on,1.0',
      },
      manual: {
        kind: 'manual',
        entry: ledgerManual({
          companyName: 'David Morris',
          measureKey: 'follow_on_investment',
          effectiveDate: '2023-07-01',
          amount: '12520',
          externalRef: 'fx-001',
          fxRate: '1.0',
          descriptor: { memo: 'follow on' },
        }),
      },
    },
    assertions: [
      { assert: 'staged', variant: 'csv' },
      { assert: 'noIssues', variant: 'csv' },
      { assert: 'staged', variant: 'manual' },
      { assert: 'noIssues', variant: 'manual' },
      { assert: 'payloadEqual', left: 'csv', right: 'manual' },
      { assert: 'fingerprintEqual', left: 'csv', right: 'manual' },
    ],
  },

  // 9. Non-USD rejection — EUR blocked
  {
    id: 9,
    name: 'non-usd rejection',
    domain: 'ledger_event',
    profile: LEDGER_PROFILE,
    variants: {
      csv: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'David Morris,capital_contribution,2023-03-01,EUR,"50,000.00",call-001,capital call',
      },
      manual: {
        kind: 'manual',
        entry: ledgerManual({
          companyName: 'David Morris',
          measureKey: 'capital_contribution',
          effectiveDate: '2023-03-01',
          currency: 'EUR',
          amount: '50000',
          externalRef: 'call-001',
          descriptor: { memo: 'capital call' },
        }),
      },
    },
    assertions: [
      { assert: 'rejected', variant: 'csv', issueCodes: ['NON_USD_VALUE_UNSUPPORTED'] },
      { assert: 'rejected', variant: 'manual', issueCodes: ['NON_USD_VALUE_UNSUPPORTED'] },
    ],
  },

  // 10. Reordered columns — identical payload, fingerprint, and hash
  {
    id: 10,
    name: 'reordered columns',
    domain: 'ledger_event',
    profile: LEDGER_PROFILE,
    variants: {
      baseline: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'Jon Victor SPV Three,initial_investment,2023-01-15,USD,"100,000.00",wire-001,initial check',
      },
      reordered: {
        kind: 'csv',
        header: 'memo,amount,external_ref,currency,effective_date,measure_key,company_name',
        row: 'initial check,"100,000.00",wire-001,USD,2023-01-15,initial_investment,Jon Victor SPV Three',
      },
    },
    assertions: [
      { assert: 'staged', variant: 'baseline' },
      { assert: 'staged', variant: 'reordered' },
      { assert: 'payloadEqual', left: 'baseline', right: 'reordered' },
      { assert: 'fingerprintEqual', left: 'baseline', right: 'reordered' },
      { assert: 'hashEqual', left: 'baseline', right: 'reordered' },
    ],
  },

  // 11. Description change — same fingerprint, different hash
  {
    id: 11,
    name: 'description change',
    domain: 'ledger_event',
    profile: LEDGER_PROFILE,
    variants: {
      csv: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'Jon Victor SPV Three,initial_investment,2023-01-15,USD,"100,000.00",wire-001,initial check',
      },
      manual: {
        kind: 'manual',
        entry: ledgerManual({
          companyName: 'Jon Victor SPV Three',
          measureKey: 'initial_investment',
          amount: '100000',
          externalRef: 'wire-001',
          descriptor: { memo: 'initial check' },
        }),
      },
      altMemo: {
        kind: 'manual',
        entry: ledgerManual({
          companyName: 'Jon Victor SPV Three',
          measureKey: 'initial_investment',
          amount: '100000',
          externalRef: 'wire-001',
          descriptor: { memo: 'revised note' },
        }),
      },
    },
    assertions: [
      { assert: 'fingerprintEqual', left: 'csv', right: 'altMemo' },
      { assert: 'hashDiffer', left: 'csv', right: 'altMemo' },
      { assert: 'payloadDiffer', left: 'csv', right: 'altMemo' },
    ],
  },

  // 12. Same amount+date, distinct transactions — externalRef discriminates
  {
    id: 12,
    name: 'same amount and date, distinct transactions',
    domain: 'ledger_event',
    profile: LEDGER_PROFILE,
    variants: {
      wireA: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'Jon Victor SPV Three,follow_on_investment,2023-06-01,USD,"25,040.00",wire-A,follow on',
      },
      wireB: {
        kind: 'csv',
        header: LEDGER_HEADER,
        row: 'Jon Victor SPV Three,follow_on_investment,2023-06-01,USD,"25,040.00",wire-B,follow on',
      },
      refBlank: {
        kind: 'manual',
        entry: ledgerManual({
          companyName: 'Jon Victor SPV Three',
          measureKey: 'follow_on_investment',
          effectiveDate: '2023-06-01',
          amount: '25040',
          externalRef: '',
          descriptor: { memo: 'follow on' },
        }),
      },
      refAbsent: {
        kind: 'manual',
        entry: ledgerManual({
          companyName: 'Jon Victor SPV Three',
          measureKey: 'follow_on_investment',
          effectiveDate: '2023-06-01',
          amount: '25040',
          descriptor: { memo: 'follow on' },
        }),
      },
    },
    assertions: [
      { assert: 'staged', variant: 'wireA' },
      { assert: 'staged', variant: 'wireB' },
      { assert: 'fingerprintDiffer', left: 'wireA', right: 'wireB' },
      { assert: 'hashDiffer', left: 'wireA', right: 'wireB' },
      // blank and absent externalRef both normalize to null → identical
      { assert: 'payloadEqual', left: 'refBlank', right: 'refAbsent' },
      { assert: 'fingerprintEqual', left: 'refBlank', right: 'refAbsent' },
    ],
  },
];
