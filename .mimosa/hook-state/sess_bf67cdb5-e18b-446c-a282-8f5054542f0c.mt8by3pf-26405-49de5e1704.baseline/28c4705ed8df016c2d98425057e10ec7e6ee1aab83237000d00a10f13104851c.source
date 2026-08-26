import { describe, expect, it } from 'vitest';

import {
  CONSUMER_DEFAULT_SELECTION_RULES,
  DEFAULT_SELECTION_RULE,
  FINANCIAL_FACTS_CONSUMER_KEYS,
} from '@shared/contracts/financial-facts-consumer-policies';
import {
  FINANCIAL_OBSERVATION_DOMAINS,
  FINANCIAL_OBSERVATION_SOURCES,
  IDENTITY_LINK_TYPES,
  IMPORT_BATCH_STATUSES,
  SOURCE_OBSERVATION_STATUSES,
  CompanyExternalIdentityV1Schema,
  CompanyIdentityV1Schema,
  PortfolioCompanyIdentityLinkV1Schema,
  Sha256HexSchema,
  SourceObservationV1Schema,
  WorkingValueSelectionV1Schema,
  resolveIdentityMergeChain,
} from '@shared/contracts/financial-observations/financial-observation.contract';
import {
  ALLOWED_MAPPING_TRANSFORMS,
  IDENTITY_TARGET_FIELDS,
  ImportMappingProfileV1Schema,
  MappingRuleV1Schema,
  buildIdentitySemanticsHash,
} from '@shared/contracts/financial-observations/import-profile.contract';
import {
  RECONCILIATION_CASE_STATUSES,
  RECONCILIATION_CASE_TYPES,
  RECONCILIATION_RESOLUTION_ACTIONS,
  TERMINAL_RECONCILIATION_CASE_STATUSES,
  ReconciliationCaseHistoryEntryV1Schema,
  ReconciliationCaseV1Schema,
  ReconciliationResolutionV1Schema,
} from '@shared/contracts/financial-observations/reconciliation.contract';
import { canonicalSha256 } from '@shared/lib/canonical-hash';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const sourceObservation = {
  id: 1,
  fundId: 2,
  importBatchId: 3,
  sourceArtifactId: 4,
  mappingProfileId: 5,
  companyIdentityId: 6,
  domain: 'valuation',
  sourceType: 'csv',
  effectiveDate: '2026-07-23',
  normalizedPayload: { fairValue: '1250000.00' },
  observationHash: HASH_A,
  candidateFingerprint: HASH_B,
  sourceLocator: 'Sheet1!A2:D2',
  dependencyGroupKey: null,
  status: 'accepted',
  createdAt: '2026-07-23T20:39:41.006Z',
} as const;

const workingValueSelection = {
  id: 7,
  fundId: 2,
  consumer: 'forecast',
  companyIdentityId: 6,
  domain: 'valuation',
  measureKey: 'fair_value',
  asOfDate: '2026-07-23',
  selectedObservationId: 1,
  isDefault: false,
  reason: 'IC-approved valuation override',
  version: 1,
  supersededBySelectionId: null,
  createdBy: 8,
  createdAt: '2026-07-23T20:39:41.006Z',
} as const;

const companyIdentity = {
  id: 6,
  fundId: 2,
  canonicalName: 'Example Co',
  mergedIntoIdentityId: null,
  sourcePortfolioCompanyId: 9,
  createdBy: 8,
  createdAt: '2026-07-23T20:39:41.006Z',
} as const;

const companyExternalIdentity = {
  id: 10,
  fundId: 2,
  companyIdentityId: 6,
  system: 'carta',
  value: 'company-123',
  createdBy: 8,
  createdAt: '2026-07-23T20:39:41.006Z',
} as const;

const portfolioCompanyIdentityLink = {
  id: 11,
  fundId: 2,
  portfolioCompanyId: 9,
  companyIdentityId: 6,
  linkType: 'operator_resolution',
  active: true,
  deactivatedAt: null,
  createdBy: 8,
  createdAt: '2026-07-23T20:39:41.006Z',
} as const;

const mappingRule = {
  sourceColumn: 'Company Name',
  targetField: 'company_name',
  transforms: ['trim', 'normalize_whitespace'],
} as const;

const importMappingProfile = {
  name: 'Carta valuation export',
  sourceType: 'csv',
  domain: 'valuation',
  version: 1,
  mappings: [mappingRule],
  identitySemanticsHash: HASH_A,
} as const;

const reconciliationResolution = {
  action: 'confirm_match',
  targetCompanyIdentityId: 6,
  memo: 'Matched durable external identifier',
} as const;

const reconciliationHistoryEntry = {
  at: '2026-07-23T20:39:41.006Z',
  event: 'resolved',
} as const;

const reconciliationCase = {
  id: 12,
  fundId: 2,
  importBatchId: 3,
  sourceObservationId: 1,
  caseType: 'identity_resolution',
  status: 'resolved',
  observationHash: HASH_A,
  candidateFingerprint: HASH_B,
  resolution: reconciliationResolution,
  resolvedBy: 8,
  resolvedAt: '2026-07-23T20:39:41.006Z',
  history: [reconciliationHistoryEntry],
  version: 1,
  createdAt: '2026-07-23T20:39:41.006Z',
} as const;

describe('financial-observation contract constants', () => {
  it('pins every persisted enum to its exact wire value list', () => {
    expect(FINANCIAL_OBSERVATION_SOURCES).toEqual(['csv', 'xlsx', 'structured_paste', 'manual']);
    expect(FINANCIAL_OBSERVATION_DOMAINS).toEqual(['ledger_event', 'valuation', 'ownership']);
    expect(SOURCE_OBSERVATION_STATUSES).toEqual(['staged', 'accepted', 'purged']);
    expect(IMPORT_BATCH_STATUSES).toEqual([
      'staged',
      'partially_committed',
      'committed',
      'expired',
    ]);
    expect(IDENTITY_LINK_TYPES).toEqual(['backfill', 'operator_resolution', 'import_resolution']);
    expect(ALLOWED_MAPPING_TRANSFORMS).toEqual([
      'trim',
      'normalize_whitespace',
      'parse_decimal',
      'parse_date_iso',
      'parse_date_us',
      'negate',
    ]);
    expect(IDENTITY_TARGET_FIELDS).toEqual([
      'company_name',
      'company_external_system',
      'company_external_value',
      'source_label',
    ]);
    expect(RECONCILIATION_CASE_TYPES).toEqual(['identity_resolution', 'observation_match']);
    expect(RECONCILIATION_CASE_STATUSES).toEqual(['open', 'resolved', 'expired_unresolved']);
    expect(TERMINAL_RECONCILIATION_CASE_STATUSES).toEqual(['resolved', 'expired_unresolved']);
    expect(RECONCILIATION_RESOLUTION_ACTIONS).toEqual([
      'confirm_match',
      'create_identity',
      'merge_identities',
      'reject',
    ]);
  });

  it('accepts only lowercase 64-character SHA-256 hex strings', () => {
    expect(Sha256HexSchema.parse(HASH_A)).toBe(HASH_A);
    expect(Sha256HexSchema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(Sha256HexSchema.safeParse('a'.repeat(63)).success).toBe(false);
    expect(Sha256HexSchema.safeParse(`${'a'.repeat(63)}g`).success).toBe(false);
  });
});

describe('financial-observation object schemas', () => {
  it('accepts the documented version-one objects', () => {
    expect(SourceObservationV1Schema.parse(sourceObservation)).toEqual(sourceObservation);
    expect(WorkingValueSelectionV1Schema.parse(workingValueSelection)).toEqual(
      workingValueSelection
    );
    expect(CompanyIdentityV1Schema.parse(companyIdentity)).toEqual(companyIdentity);
    expect(CompanyExternalIdentityV1Schema.parse(companyExternalIdentity)).toEqual(
      companyExternalIdentity
    );
    expect(PortfolioCompanyIdentityLinkV1Schema.parse(portfolioCompanyIdentityLink)).toEqual(
      portfolioCompanyIdentityLink
    );
    expect(MappingRuleV1Schema.parse(mappingRule)).toEqual(mappingRule);
    expect(ImportMappingProfileV1Schema.parse(importMappingProfile)).toEqual(importMappingProfile);
    expect(ReconciliationResolutionV1Schema.parse(reconciliationResolution)).toEqual(
      reconciliationResolution
    );
    expect(ReconciliationCaseHistoryEntryV1Schema.parse(reconciliationHistoryEntry)).toEqual(
      reconciliationHistoryEntry
    );
    expect(ReconciliationCaseV1Schema.parse(reconciliationCase)).toEqual(reconciliationCase);
  });

  it('rejects unknown keys on every object schema', () => {
    const cases: ReadonlyArray<
      readonly [{ safeParse(value: unknown): { success: boolean } }, object]
    > = [
      [SourceObservationV1Schema, sourceObservation],
      [WorkingValueSelectionV1Schema, workingValueSelection],
      [CompanyIdentityV1Schema, companyIdentity],
      [CompanyExternalIdentityV1Schema, companyExternalIdentity],
      [PortfolioCompanyIdentityLinkV1Schema, portfolioCompanyIdentityLink],
      [MappingRuleV1Schema, mappingRule],
      [ImportMappingProfileV1Schema, importMappingProfile],
      [ReconciliationResolutionV1Schema, reconciliationResolution],
      [ReconciliationCaseHistoryEntryV1Schema, reconciliationHistoryEntry],
      [ReconciliationCaseV1Schema, reconciliationCase],
    ];

    for (const [schema, value] of cases) {
      expect(schema.safeParse({ ...value, unexpected: true }).success).toBe(false);
    }
  });
});

describe('identity mapping semantics', () => {
  const identityRule = {
    sourceColumn: 'Company Name',
    targetField: 'company_name',
    transforms: ['trim', 'normalize_whitespace'],
  } as const;
  const externalIdRule = {
    sourceColumn: 'Carta Company ID',
    targetField: 'company_external_id',
    transforms: ['trim'],
  } as const;
  const nonIdentityRule = {
    sourceColumn: 'Fair Value',
    targetField: 'fair_value',
    transforms: ['trim', 'parse_decimal'],
  } as const;

  it('is stable under mapping-rule reorder', () => {
    expect(buildIdentitySemanticsHash([identityRule, externalIdRule, nonIdentityRule])).toBe(
      buildIdentitySemanticsHash([nonIdentityRule, externalIdRule, identityRule])
    );
  });

  it('changes only when identity-bearing rules change', () => {
    const baseline = buildIdentitySemanticsHash([identityRule, externalIdRule, nonIdentityRule]);
    const identityChanged = buildIdentitySemanticsHash([
      { ...identityRule, sourceColumn: 'Legal Company Name' },
      externalIdRule,
      nonIdentityRule,
    ]);
    const nonIdentityChanged = buildIdentitySemanticsHash([
      identityRule,
      externalIdRule,
      { ...nonIdentityRule, sourceColumn: 'Current Fair Value' },
    ]);

    expect(identityChanged).not.toBe(baseline);
    expect(nonIdentityChanged).toBe(baseline);
  });

  it('hashes SHA-like source strings directly without decimal-leaf mangling', () => {
    const hexSourceRule = {
      sourceColumn: 'e'.repeat(64),
      targetField: 'company_external_value',
      transforms: ['trim'],
    } as const;

    expect(buildIdentitySemanticsHash([hexSourceRule])).toBe(canonicalSha256([hexSourceRule]));
  });
});

describe('company identity merge-chain resolution', () => {
  it('returns the starting identity when it is already canonical', () => {
    expect(resolveIdentityMergeChain(new Map([[1, { mergedIntoIdentityId: null }]]), 1)).toBe(1);
  });

  it('walks a merge chain to its canonical identity', () => {
    expect(
      resolveIdentityMergeChain(
        new Map([
          [1, { mergedIntoIdentityId: 2 }],
          [2, { mergedIntoIdentityId: 3 }],
          [3, { mergedIntoIdentityId: null }],
        ]),
        1
      )
    ).toBe(3);
  });

  it('throws on a merge cycle', () => {
    expect(() =>
      resolveIdentityMergeChain(
        new Map([
          [1, { mergedIntoIdentityId: 2 }],
          [2, { mergedIntoIdentityId: 1 }],
        ]),
        1
      )
    ).toThrow(/cycle/i);
  });
});

describe('financial-facts consumer selection defaults', () => {
  it('keeps the frozen consumer key list and covers every key', () => {
    expect(FINANCIAL_FACTS_CONSUMER_KEYS).toEqual([
      'forecast',
      'reserve',
      'economics',
      'periodic_analysis',
    ]);
    expect(CONSUMER_DEFAULT_SELECTION_RULES).toEqual({
      forecast: DEFAULT_SELECTION_RULE,
      reserve: DEFAULT_SELECTION_RULE,
      economics: DEFAULT_SELECTION_RULE,
      periodic_analysis: DEFAULT_SELECTION_RULE,
    });
    expect(DEFAULT_SELECTION_RULE).toBe('latest_effective_dated_accepted_at_or_before_as_of');
  });
});
