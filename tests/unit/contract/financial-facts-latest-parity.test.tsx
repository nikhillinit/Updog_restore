/**
 * Local client-ingress schema parity pin (F_1.9.0).
 *
 * The client validates GET /api/funds/:fundId/financial-facts/latest with a
 * LOCAL schema inside FundWorkspaceContext (the shared financial-facts
 * contract is Node-only at runtime for the client bundle, so it may be
 * imported type-only there). This suite pins the local schema against the
 * shared PersistedFinancialFactsSnapshotV1 contract at test runtime (safe
 * under vitest): a shared-contract-valid response for EVERY persisted policy
 * version MUST parse through the client ingress and expose the fields the
 * workspace context reads. Contract drift on either side fails here.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
  FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
  FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4,
  FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
  PersistedFinancialFactsSnapshotV1Schema,
  type PersistedFinancialFactsSnapshotV1,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import {
  fetchLatestFinancialFactsSnapshot,
  type FinancialFactsLatestRead,
} from '@/contexts/FundWorkspaceContext';

const SNAPSHOT_ENVELOPE = {
  fundId: 10,
  asOfDate: '2026-01-31',
  knowledgeCutoff: '2026-01-31T23:59:59.000Z',
  vehicleScope: 'fund_all',
  vehicleIds: [7],
  selectionSetHash: 'b'.repeat(64),
  sourceFactsInputHash: 'c'.repeat(64),
  snapshotInputHash: 'a1b2c3d4'.repeat(8),
  consumerEvaluations: [],
  actorId: 1,
  createdAt: '2026-01-31T23:59:59.000Z',
};

const PAYLOAD_V1_BASE = {
  companyActuals: {
    fundId: 10,
    asOfDate: '2026-01-31',
    facts: [],
    inputHash: 'a'.repeat(64),
  },
  cashFlowSeries: {
    series: [],
    totals: {
      contributions: '0.000000',
      distributions: '0.000000',
      recallableDistributions: '0.000000',
    },
    warnings: [],
  },
  marksSeries: { marks: [], periodNav: [], warnings: [] },
  vehicleRoster: [
    {
      vehicleId: 7,
      vehicleType: 'main_fund',
      vehicleSlug: 'main-fund',
      name: 'Main Fund',
      currency: 'USD',
    },
  ],
};

// Policy 1.1.0+ payloads carry STRUCTURED participation-term refs — the shape
// that used to be rejected by the client ingress when it only accepted strings.
const STRUCTURED_TERM_REF = {
  participationId: 5,
  participationVersion: 1,
  financingTrancheId: 9,
  trancheVersion: 2,
};

const PAYLOAD_V2 = {
  ...PAYLOAD_V1_BASE,
  sourceObservationIds: [11, 'obs-12'],
  workingValueSelectionIds: [],
  participationTermRefs: [STRUCTURED_TERM_REF],
  positionRefs: [],
  positionComponentRefs: [],
  ownershipRefs: [],
  valuationRefs: [],
  observationRefs: [],
};

const unavailable = (reason: string) => ({
  value: null,
  availability: 'unavailable',
  reasonCodes: [reason],
  sourceRefs: [],
});
const CAPITAL_ACTUALS_V5 = Object.fromEntries(
  [
    'committedCapital',
    'calledCapitalIssued',
    'paidInCapital',
    'deployedCapital',
    'initialDeployedCapital',
    'followOnDeployedCapital',
    'secondaryDeployedCapital',
    'otherDeployedCapital',
    'managementFeesPaid',
    'otherExpensesPaid',
    'realizedFundProceeds',
    'distributionsToPartners',
    'recallableDistributions',
    'netCalledCapital',
    'uncalledCapital',
    'availableRecallCapacity',
    'portfolioFmv',
    'fundCash',
    'otherAssets',
    'liabilities',
    'nav',
    'dpi',
    'rvpi',
    'tvpi',
  ].map((field) => [field, unavailable('SOURCE_NOT_SUPPLIED')])
);
const PAYLOAD_V5 = {
  ...PAYLOAD_V2,
  openingAccountingState: null,
  capitalActuals: { ledgerCoverage: 'partial', ...CAPITAL_ACTUALS_V5 },
  valuationActuals: {
    valuationDate: null,
    roster: [],
    marks: [],
    coverage: 'not_supplied',
    missingCompanyIds: [],
  },
  admissionReceiptCore: {
    contractVersion: 'actuals-pilot-publish-receipt/1.0.0',
    operationHash: 'd'.repeat(64),
    fundId: 10,
    asOfDate: '2026-01-31',
    coverage: { ledger: 'inception_to_date', priorFactsSnapshotId: null, evidenceNote: 'fixture' },
    admitted: {
      ledger: {
        sourceArtifactId: 1,
        payloadSha256: 'e'.repeat(64),
        canonicalRowsHash: 'f'.repeat(64),
        previewHash: '1'.repeat(64),
        approvedRowIds: [],
        approvedCount: 0,
      },
      valuation: null,
      importBatchId: '11111111-2222-3333-4444-555555555555',
    },
    facts: {
      policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
      payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
      supersedesSnapshotId: null,
      knowledgeCutoff: '2026-01-31T23:59:59.000Z',
    },
    actor: { userId: 1 },
  },
};

const PERSISTED_FIXTURES: Record<string, unknown> = {
  [FINANCIAL_FACTS_POLICY_VERSION_1_0_0]: {
    ...SNAPSHOT_ENVELOPE,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_0,
    payload: {
      ...PAYLOAD_V1_BASE,
      sourceObservationIds: [],
      workingValueSelectionIds: [],
      participationTermRefs: [],
    },
  },
  [FINANCIAL_FACTS_POLICY_VERSION_1_0_1]: {
    ...SNAPSHOT_ENVELOPE,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_0_1,
    payload: {
      ...PAYLOAD_V1_BASE,
      sourceObservationIds: [11, 'obs-12'],
      workingValueSelectionIds: [],
      participationTermRefs: [],
    },
  },
  [FINANCIAL_FACTS_POLICY_VERSION_1_1_0]: {
    ...SNAPSHOT_ENVELOPE,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_1_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2,
    payload: PAYLOAD_V2,
  },
  [FINANCIAL_FACTS_POLICY_VERSION_1_2_0]: {
    ...SNAPSHOT_ENVELOPE,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_2_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3,
    payload: { ...PAYLOAD_V2, openingAccountingState: null },
  },
  [FINANCIAL_FACTS_POLICY_VERSION_1_3_0]: {
    ...SNAPSHOT_ENVELOPE,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_3_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4,
    payload: { ...PAYLOAD_V2, openingAccountingState: null },
  },
  [FINANCIAL_FACTS_POLICY_VERSION_1_4_0]: {
    ...SNAPSHOT_ENVELOPE,
    policyVersion: FINANCIAL_FACTS_POLICY_VERSION_1_4_0,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5,
    payload: PAYLOAD_V5,
  },
};

function parsePersisted(policyVersion: string): PersistedFinancialFactsSnapshotV1 {
  return PersistedFinancialFactsSnapshotV1Schema.parse(PERSISTED_FIXTURES[policyVersion]);
}

const SHARED_VALID_SNAPSHOT = parsePersisted(FINANCIAL_FACTS_POLICY_VERSION_1_0_1);

// Compile-time direction of the pin: every persisted shared snapshot satisfies
// the local read type. (Runtime parse below is the enforced gate — test files
// are not part of the typecheck.)
const _typePin: FinancialFactsLatestRead = SHARED_VALID_SNAPSHOT;
void _typePin;

describe('financial-facts latest client-ingress parity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('covers every variant of the persisted discriminated union with a fixture', () => {
    // A new persisted policy version MUST land with a fixture here so the
    // client ingress is proven against it before it can reach production.
    expect(PersistedFinancialFactsSnapshotV1Schema.options.length).toBe(
      Object.keys(PERSISTED_FIXTURES).length
    );
  });

  it.each(Object.keys(PERSISTED_FIXTURES))(
    'accepts a shared-contract-valid %s response through the client ingress',
    async (policyVersion) => {
      const persisted = parsePersisted(policyVersion);
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify(persisted), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
        )
      );

      const read = await fetchLatestFinancialFactsSnapshot(10);

      expect(read).not.toBeNull();
      expect(read!.asOfDate).toBe('2026-01-31');
      expect(read!.snapshotInputHash).toBe('a1b2c3d4'.repeat(8));
      expect(read!.payload.participationTermRefs).toEqual(persisted.payload.participationTermRefs);
      expect(read!.payload.vehicleRoster).toEqual([
        expect.objectContaining({ vehicleId: 7, vehicleType: 'main_fund' }),
      ]);
    }
  );

  it('exposes structured policy 1.1.0+ participation-term refs unaltered', async () => {
    const persisted = parsePersisted(FINANCIAL_FACTS_POLICY_VERSION_1_3_0);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(persisted), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    );

    const read = await fetchLatestFinancialFactsSnapshot(10);

    expect(read!.payload.participationTermRefs).toEqual([STRUCTURED_TERM_REF]);
    expect(read!.payload.sourceObservationIds).toEqual([11, 'obs-12']);
  });

  it('mirrors the route 404 (no accepted snapshot) as null, never a fabricated read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'No accepted snapshot' }), { status: 404 })
      )
    );

    await expect(fetchLatestFinancialFactsSnapshot(10)).resolves.toBeNull();
  });

  it('rejects a response missing the roster instead of silently degrading', async () => {
    const { payload, ...rest } = SHARED_VALID_SNAPSHOT;
    const { vehicleRoster: _dropped, ...strippedPayload } = payload as Record<string, unknown> & {
      vehicleRoster: unknown;
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...rest, payload: strippedPayload }), { status: 200 })
      )
    );

    await expect(fetchLatestFinancialFactsSnapshot(10)).rejects.toThrow();
  });
});
