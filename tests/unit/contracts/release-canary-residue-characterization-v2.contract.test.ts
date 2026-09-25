import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { sha256CanonicalJson } from '@shared/lib/canonical-json';
import {
  RELEASE_CANARY_RESERVED_RESIDUE,
  RELEASE_CANARY_RESIDUE_GROUP_KEYS,
  parseReleaseCanaryResidueCharacterization,
  type ReleaseCanaryResidueCharacterizationV1,
  type ResidueVector,
} from '@shared/contracts/release-canary-residue-characterization-v1.contract';
import {
  RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE,
  RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
  ReleaseCanaryHttpFundProofV2Schema,
  parseReleaseCanaryHttpFundProofV2,
  parseReleaseCanaryCharacterizationEvidenceV2,
  parseReleaseCanaryResidueCharacterizationV2,
  releaseCanaryCharacterizationEvidenceV2,
  releaseCanaryResidueCharacterizationV2ArtifactName,
  composeReleaseCanaryResidueCharacterizationV2,
} from '@shared/contracts/release-canary-residue-characterization-v2.contract';

type GroupKey = (typeof RELEASE_CANARY_RESIDUE_GROUP_KEYS)[number];

const SOURCE_SHA = 'a'.repeat(40);
const WORKFLOW_RUN_ID = '4242424242';
const WORKFLOW_RUN_ATTEMPT = 3;
const DATABASE_CANARY_RUN_ID = '123e4567-e89b-12d3-a456-426614174000';

function vector(groups: Partial<Record<GroupKey, number>>, totalOverride?: number): ResidueVector {
  const base = Object.fromEntries(
    RELEASE_CANARY_RESIDUE_GROUP_KEYS.map((key) => [key, groups[key] ?? 0])
  ) as Record<GroupKey, number>;
  const total =
    totalOverride ?? RELEASE_CANARY_RESIDUE_GROUP_KEYS.reduce((acc, key) => acc + base[key], 0);
  return { ...base, total };
}

const serviceSeedResidue = vector({
  portfolioCompany: 1,
  fund: 1,
  fundConfig: 1,
  fundEvent: 2,
  calculation: 2,
  mutationReceipt: 1,
  scenario: 3,
  reporting: 5,
});

function serviceCharacterization(): ReleaseCanaryResidueCharacterizationV1 {
  return parseReleaseCanaryResidueCharacterization({
    schemaVersion: 'release-canary-residue-characterization-v1',
    sourceSha: SOURCE_SHA,
    contractVersion: 'canary-residue-2026-08',
    reservedResidue: { ...RELEASE_CANARY_RESERVED_RESIDUE },
    phases: [
      { name: 'seed-and-run', residue: serviceSeedResidue },
      { name: 'publish', residue: { ...RELEASE_CANARY_RESERVED_RESIDUE } },
    ],
    finalResidue: { ...RELEASE_CANARY_RESERVED_RESIDUE },
    failureBoundaries: [{ name: 'inject-fee-failure', residue: serviceSeedResidue }],
    provenance: {
      executionPath: 'FundPersistenceService.createFundWithInitialDraft',
      databaseTimeZone: 'Etc/UTC',
      storedRun: { releaseSha: SOURCE_SHA, status: 'completed', version: 2 },
      fundDataOrigins: ['release_canary'],
      flagState: { enableGpEconomicsEngine: false, cohortCalculationInvoked: false },
      snapshotTypeCounts: [
        { type: 'COHORT', count: 0 },
        { type: 'ECONOMICS', count: 0 },
        { type: 'PACING', count: 1 },
        { type: 'RESERVE', count: 1 },
        { type: 'SCENARIOS', count: 1 },
      ],
      directFundForeignKeys: [
        { table: 'public.fundconfigs', column: 'fund_id' },
        { table: 'public.portfoliocompanies', column: 'fund_id' },
      ],
    },
    result: 'passed',
  });
}

function httpFundProof(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'release-canary-http-fund-proof-v2',
    sourceSha: SOURCE_SHA,
    workflowRunId: WORKFLOW_RUN_ID,
    workflowRunAttempt: WORKFLOW_RUN_ATTEMPT,
    databaseCanaryRunId: DATABASE_CANARY_RUN_ID,
    reservationIdentity: RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
    observedFundPhaseResidue: { ...RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE },
    replayZeroGrowth: true,
    overCapZeroGrowth: true,
    result: 'passed',
    ...overrides,
  };
}

function composedArtifact(overrides: Record<string, unknown> = {}) {
  const service = serviceCharacterization();
  const servicePayloadSha256 = sha256CanonicalJson(service);
  const httpPayloadSha256 = sha256CanonicalJson(httpFundProof());
  const delta = vector({ fundEvent: 1, mutationReceipt: 3 }, 4);
  const finalResidue = { ...RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE };
  const bindingSha256 = sha256CanonicalJson([
    SOURCE_SHA,
    WORKFLOW_RUN_ID,
    WORKFLOW_RUN_ATTEMPT,
    RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
    servicePayloadSha256,
    httpPayloadSha256,
    service.finalResidue,
    delta,
    finalResidue,
  ]);

  return {
    schemaVersion: 'release-canary-residue-characterization-v2',
    sourceSha: SOURCE_SHA,
    contractVersion: 'release-canary-residue-characterization-v2',
    reservationIdentity: RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
    reservedResidue: { ...RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE },
    phases: [...service.phases, { name: 'http-command-delta', residue: finalResidue }],
    finalResidue,
    failureBoundaries: service.failureBoundaries,
    provenance: {
      ...service.provenance,
      workflowRunId: WORKFLOW_RUN_ID,
      workflowRunAttempt: WORKFLOW_RUN_ATTEMPT,
      databaseCanaryRunId: DATABASE_CANARY_RUN_ID,
      serviceCharacterizationPayloadSha256: servicePayloadSha256,
      httpFundProofPayloadSha256: httpPayloadSha256,
      bindingSha256,
    },
    result: 'passed',
    ...overrides,
  };
}

describe('release-canary-residue-characterization-v2 contract', { retry: 0 }, () => {
  it('validates frozen v1 and HTTP v2 residue artifacts without widening either vector', () => {
    const exact = composedArtifact();
    expect(parseReleaseCanaryResidueCharacterizationV2(exact)).toEqual(exact);
    expect(RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE).toEqual({
      portfolioCompany: 1,
      fund: 1,
      fundConfig: 1,
      fundEvent: 5,
      notification: 0,
      grant: 1,
      calculation: 12,
      mutationReceipt: 5,
      scenario: 7,
      reporting: 11,
      total: 44,
    });
    expect(() =>
      parseReleaseCanaryResidueCharacterizationV2({ ...exact, reservationIdentity: undefined })
    ).toThrow();
    expect(() => parseReleaseCanaryResidueCharacterizationV2(serviceCharacterization())).toThrow();

    const widened = composedArtifact({
      reservedResidue: { ...exact.reservedResidue, reporting: 12, total: 45 },
      finalResidue: { ...exact.finalResidue, reporting: 12, total: 45 },
      phases: [
        ...exact.phases.slice(0, -1),
        {
          name: 'http-command-delta',
          residue: { ...exact.finalResidue, reporting: 12, total: 45 },
        },
      ],
    });
    expect(() => parseReleaseCanaryResidueCharacterizationV2(widened)).toThrow();

    const shiftedServicePhase = composedArtifact({
      phases: [
        ...exact.phases.slice(0, -2),
        { name: 'publish', residue: vector({ ...RELEASE_CANARY_RESERVED_RESIDUE, reporting: 10 }) },
        exact.phases.at(-1),
      ],
    });
    expect(() => parseReleaseCanaryResidueCharacterizationV2(shiftedServicePhase)).toThrow();
  });

  it('keeps the v1 characterization contract byte-frozen', async () => {
    const bytes = await readFile(
      new URL(
        '../../../shared/contracts/release-canary-residue-characterization-v1.contract.ts',
        import.meta.url
      )
    );
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '52e22dce82ad660c8e0910233eed77645cd56ef3e3ed9ead980c412294d30f61'
    );
  });

  it('validates the bound HTTP fund result shape', () => {
    expect(parseReleaseCanaryHttpFundProofV2(httpFundProof())).toEqual(httpFundProof());
    expect(
      ReleaseCanaryHttpFundProofV2Schema.safeParse(httpFundProof({ workflowRunId: '0' })).success
    ).toBe(false);
    expect(
      ReleaseCanaryHttpFundProofV2Schema.safeParse(
        httpFundProof({
          observedFundPhaseResidue: {
            ...RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE,
            fund: undefined,
          },
        })
      ).success
    ).toBe(false);
    for (const field of ['delta', 'baselineResidue', 'finalResidue', 'phases']) {
      expect(
        ReleaseCanaryHttpFundProofV2Schema.safeParse(httpFundProof({ [field]: {} })).success
      ).toBe(false);
    }
    expect(
      ReleaseCanaryHttpFundProofV2Schema.safeParse(httpFundProof({ replayZeroGrowth: false }))
        .success
    ).toBe(false);
  });

  it('composes the bound HTTP v2 characterization deterministically', () => {
    const service = serviceCharacterization();
    const proof = parseReleaseCanaryHttpFundProofV2(httpFundProof());
    const first = composeReleaseCanaryResidueCharacterizationV2(
      service,
      proof,
      SOURCE_SHA,
      WORKFLOW_RUN_ID,
      WORKFLOW_RUN_ATTEMPT
    );
    const second = composeReleaseCanaryResidueCharacterizationV2(
      service,
      proof,
      SOURCE_SHA,
      WORKFLOW_RUN_ID,
      WORKFLOW_RUN_ATTEMPT
    );

    expect(first.finalResidue).toEqual(RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE);
    expect(first.provenance.serviceCharacterizationPayloadSha256).toBe(
      sha256CanonicalJson(service)
    );
    expect(first.provenance.httpFundProofPayloadSha256).toBe(sha256CanonicalJson(proof));
    expect(first.provenance.bindingSha256).toBe(
      sha256CanonicalJson([
        SOURCE_SHA,
        WORKFLOW_RUN_ID,
        WORKFLOW_RUN_ATTEMPT,
        RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
        first.provenance.serviceCharacterizationPayloadSha256,
        first.provenance.httpFundProofPayloadSha256,
        service.finalResidue,
        vector({ fundEvent: 1, mutationReceipt: 3 }, 4),
        RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE,
      ])
    );
    expect(first.phases.slice(0, -1)).toEqual(service.phases);
    expect(first.phases.at(-1)).toEqual({
      name: 'http-command-delta',
      residue: RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE,
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    const unexpectedCalculation = parseReleaseCanaryHttpFundProofV2(
      httpFundProof({
        observedFundPhaseResidue: {
          ...RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE,
          calculation: RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE.calculation + 1,
          total: RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE.total + 1,
        },
      })
    );
    expect(() =>
      composeReleaseCanaryResidueCharacterizationV2(
        service,
        unexpectedCalculation,
        SOURCE_SHA,
        WORKFLOW_RUN_ID,
        WORKFLOW_RUN_ATTEMPT
      )
    ).toThrow();

    expect(() =>
      composeReleaseCanaryResidueCharacterizationV2(
        service,
        proof,
        'b'.repeat(40),
        WORKFLOW_RUN_ID,
        WORKFLOW_RUN_ATTEMPT
      )
    ).toThrow();
    expect(() =>
      composeReleaseCanaryResidueCharacterizationV2(
        service,
        parseReleaseCanaryHttpFundProofV2(httpFundProof({ workflowRunId: '999' })),
        SOURCE_SHA,
        WORKFLOW_RUN_ID,
        WORKFLOW_RUN_ATTEMPT
      )
    ).toThrow();
    expect(() =>
      composeReleaseCanaryResidueCharacterizationV2(
        service,
        proof,
        SOURCE_SHA,
        WORKFLOW_RUN_ID,
        WORKFLOW_RUN_ATTEMPT + 1
      )
    ).toThrow();
  });

  it('projects HTTP v2 characterization evidence and binds its artifact name', () => {
    const artifact = parseReleaseCanaryResidueCharacterizationV2(composedArtifact());
    const evidence = releaseCanaryCharacterizationEvidenceV2(artifact);

    expect(evidence).toEqual({
      reservationIdentity: RELEASE_CANARY_HTTP_WORKFLOW_RESERVATION_IDENTITY,
      baselineResidue: RELEASE_CANARY_RESERVED_RESIDUE,
      deltaResidue: vector({ fundEvent: 1, mutationReceipt: 3 }, 4),
      finalResidue: RELEASE_CANARY_HTTP_WORKFLOW_RESERVED_RESIDUE,
      workflowRunId: WORKFLOW_RUN_ID,
      workflowRunAttempt: WORKFLOW_RUN_ATTEMPT,
      databaseCanaryRunId: DATABASE_CANARY_RUN_ID,
      serviceCharacterizationPayloadSha256:
        artifact.provenance.serviceCharacterizationPayloadSha256,
      httpFundProofPayloadSha256: artifact.provenance.httpFundProofPayloadSha256,
      bindingSha256: artifact.provenance.bindingSha256,
    });
    expect(parseReleaseCanaryCharacterizationEvidenceV2(evidence)).toEqual(evidence);
    expect(
      releaseCanaryResidueCharacterizationV2ArtifactName(
        WORKFLOW_RUN_ID,
        WORKFLOW_RUN_ATTEMPT,
        SOURCE_SHA
      )
    ).toBe(
      `release-canary-residue-characterization-v2-${WORKFLOW_RUN_ID}-${WORKFLOW_RUN_ATTEMPT}-${SOURCE_SHA}`
    );
  });
});
