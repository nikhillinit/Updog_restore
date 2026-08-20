import { describe, expect, it } from 'vitest';

import { RELEASE_CANARY_RESERVED_RESIDUE } from '@shared/contracts/release-canary-residue-characterization-v1.contract';
import {
  RELEASE_EVIDENCE_FRAGMENT_KINDS,
  RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS,
  ReleaseEvidenceFragmentV1Schema,
  parseReleaseEvidenceFragment,
  sha256CanonicalJsonOfPayload,
  type ReleaseEvidenceFragmentKind,
} from '@shared/contracts/release-evidence-fragment-v1.contract';

const RUN_ID = '4242424242';
const SOURCE_SHA = 'a'.repeat(40);
const PRECURSOR_SHA = 'b'.repeat(40);
const BASELINE_MAIN_SHA = 'c'.repeat(40);
const CONTEXT_SHA256 = '6'.repeat(64);
const UUID = '123e4567-e89b-12d3-a456-426614174000';

const reservedResidue = () => ({ ...RELEASE_CANARY_RESERVED_RESIDUE });
const tripledCaps = () =>
  Object.fromEntries(
    Object.entries(RELEASE_CANARY_RESERVED_RESIDUE).map(([key, value]) => [key, value * 3])
  );

const vercelIdentity = () => ({
  projectId: 'prj_updog',
  deploymentId: 'dpl_12345',
  hostname: 'app.example.com',
  sourceSha: SOURCE_SHA,
});

const railwayIdentity = () => ({
  projectId: 'railway-project',
  environmentId: 'railway-environment',
  services: [
    {
      serviceName: 'fund-scenario-calc',
      serviceId: 'svc-fund-scenario-calc',
      deploymentId: 'dep-fund-scenario-calc',
      sourceSha: SOURCE_SHA,
    },
    {
      serviceName: 'capital-call-status',
      serviceId: 'svc-capital-call-status',
      deploymentId: 'dep-capital-call-status',
      sourceSha: SOURCE_SHA,
    },
  ],
});

const baselinePayload = () => ({
  prechange: { vercel: vercelIdentity(), railway: railwayIdentity() },
  rollback: { targetMainSha: BASELINE_MAIN_SHA, recoveryContextSha256: CONTEXT_SHA256 },
  baselineArtifact: {
    runId: '222',
    runAttempt: 1,
    workflowPath: '.github/workflows/capture-release-baseline.yml',
    baselineMainSha: BASELINE_MAIN_SHA,
    plannedPrHeadSha: 'd'.repeat(40),
    artifactId: '9',
    artifactName: 'release-baseline-context',
    artifactArchiveSha256: '7'.repeat(64),
    contextFileSha256: CONTEXT_SHA256,
  },
});

const schemaPayload = () => ({
  migration: '0053',
  precursorSha: PRECURSOR_SHA,
  apply: {
    runId: '111',
    runAttempt: 1,
    workflowPath: '.github/workflows/prod-schema-reconcile.yml',
    sourceSha: PRECURSOR_SHA,
    runUrl: 'https://github.com/press-on/updog/actions/runs/111',
    artifactId: '5',
    artifactName: `prod-schema-reconcile-111-1-apply-${PRECURSOR_SHA}`,
    artifactArchiveSha256: '8'.repeat(64),
    receiptFileSha256: '9'.repeat(64),
  },
  audit: {
    runId: RUN_ID,
    runAttempt: 1,
    workflowPath: '.github/workflows/prod-schema-reconcile.yml',
    sourceSha: SOURCE_SHA,
    runUrl: `https://github.com/press-on/updog/actions/runs/${RUN_ID}`,
    result: 'clean',
  },
});

const policyConfigPayload = () => ({
  reservedPerRun: reservedResidue(),
  configuredCaps: tripledCaps(),
  retainedRunBudget: 3,
  ttlHours: 24,
});

const policyMeasurementPayload = () => ({ residue: reservedResidue() });

const policyRatificationPayload = () => ({
  environmentId: '99',
  environmentName: 'Production Policy Ratification',
  reviewerLogin: 'repo-owner',
  reviewerPermission: 'admin',
  approvalState: 'approved',
  commentSha256: '1'.repeat(64),
  policyConfigPayloadSha256: '2'.repeat(64),
  policyMeasurementPayloadSha256: '3'.repeat(64),
  characterizationFileSha256: '5'.repeat(64),
  canaryResultPayloadSha256: '4'.repeat(64),
  verifiedAt: '2026-08-19T10:30:00.000Z',
});

const operatorEvidencePayload = () => ({
  bundleSha256: 'e'.repeat(64),
  capturedAt: '2026-08-19T10:15:00.000Z',
  verifiedAt: '2026-08-19T10:20:00.000Z',
});

const releaseProviderPayload = () => ({
  vercel: vercelIdentity(),
  railway: railwayIdentity(),
});

const canaryResultPayload = () => ({
  execution: {
    fundId: 1,
    canaryRunId: UUID,
    githubRunId: RUN_ID,
    githubRunAttempt: 1,
    releaseSha: SOURCE_SHA,
    startedAt: '2026-08-19T10:05:00.000Z',
  },
  status: 'completed',
  residue: reservedResidue(),
  h9Artifact: {
    recordId: 41,
    packageId: 7,
    contentHash: 'a'.repeat(64),
    fingerprint: 'b'.repeat(64),
    sizeBytes: 1024,
  },
});

const PAYLOADS: Record<ReleaseEvidenceFragmentKind, () => unknown> = {
  baseline: baselinePayload,
  schema: schemaPayload,
  'policy-config': policyConfigPayload,
  'policy-measurement': policyMeasurementPayload,
  'policy-ratification': policyRatificationPayload,
  'operator-evidence': operatorEvidencePayload,
  'release-provider': releaseProviderPayload,
  'canary-result': canaryResultPayload,
};

function fragment(kind: ReleaseEvidenceFragmentKind, payloadOverride?: unknown) {
  const payload = payloadOverride ?? PAYLOADS[kind]();
  return {
    schemaVersion: 'release-evidence-fragment-v1',
    kind,
    runId: RUN_ID,
    runAttempt: 1,
    sourceSha: SOURCE_SHA,
    producerJob: RELEASE_EVIDENCE_FRAGMENT_PRODUCER_JOBS[kind],
    createdAt: '2026-08-19T10:00:00.000Z',
    payloadSha256: sha256CanonicalJsonOfPayload(payload),
    payload,
  };
}

describe('release-evidence-fragment-v1 contract', { retry: 0 }, () => {
  it('accepts a valid fragment of every kind with its mapped producer job', () => {
    for (const kind of RELEASE_EVIDENCE_FRAGMENT_KINDS) {
      const envelope = fragment(kind);
      expect(parseReleaseEvidenceFragment(envelope)).toEqual(envelope);
    }
  });

  it('rejects a fragment produced by the wrong job for its kind', () => {
    const envelope = { ...fragment('baseline'), producerJob: 'staged-smoke' };
    expect(ReleaseEvidenceFragmentV1Schema.safeParse(envelope).success).toBe(false);
  });

  it('rejects unknown kinds', () => {
    const envelope = { ...fragment('baseline'), kind: 'mystery' };
    expect(ReleaseEvidenceFragmentV1Schema.safeParse(envelope).success).toBe(false);
  });

  it('rejects a payloadSha256 that does not hash the payload', () => {
    const envelope = { ...fragment('policy-measurement'), payloadSha256: '0'.repeat(64) };
    expect(ReleaseEvidenceFragmentV1Schema.safeParse(envelope).success).toBe(false);
  });

  it('rejects unknown envelope and nested payload keys', () => {
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse({ ...fragment('baseline'), extra: 1 }).success
    ).toBe(false);
    const payload = baselinePayload() as Record<string, unknown>;
    (payload['rollback'] as Record<string, unknown>)['note'] = 'x';
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('baseline', payload)).success
    ).toBe(false);
  });

  it('rejects policy-config caps that are not component-wise exactly 3x reserved', () => {
    const payload = policyConfigPayload();
    payload.configuredCaps['scenario'] = RELEASE_CANARY_RESERVED_RESIDUE.scenario * 3 + 3;
    payload.configuredCaps['total'] =
      RELEASE_CANARY_RESERVED_RESIDUE.total * 3 + 3;
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('policy-config', payload)).success
    ).toBe(false);
  });

  it('rejects policy-config caps whose total is not 120', () => {
    const payload = policyConfigPayload();
    payload.configuredCaps['total'] = 99;
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('policy-config', payload)).success
    ).toBe(false);
  });

  it('rejects a policy-config reserved vector that drifts from the frozen vector', () => {
    const payload = policyConfigPayload();
    payload.reservedPerRun.reporting = 33;
    payload.reservedPerRun.total = 62;
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('policy-config', payload)).success
    ).toBe(false);
  });

  it('rejects a staged measurement that differs from the reserved vector', () => {
    const payload = policyMeasurementPayload();
    payload.residue.notification = 1;
    payload.residue.total += 1;
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('policy-measurement', payload)).success
    ).toBe(false);
  });

  it('rejects a residue vector whose total is not the group sum', () => {
    const payload = policyMeasurementPayload();
    payload.residue.total += 5;
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('policy-measurement', payload)).success
    ).toBe(false);
  });

  it('rejects baseline rollback targets that mismatch the baseline artifact', () => {
    const target = baselinePayload();
    target.rollback.targetMainSha = 'f'.repeat(40);
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('baseline', target)).success
    ).toBe(false);
    const context = baselinePayload();
    context.rollback.recoveryContextSha256 = '0'.repeat(64);
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('baseline', context)).success
    ).toBe(false);
  });

  it('rejects a schema apply whose source SHA is not the precursor SHA', () => {
    const payload = schemaPayload();
    payload.apply.sourceSha = SOURCE_SHA;
    expect(ReleaseEvidenceFragmentV1Schema.safeParse(fragment('schema', payload)).success).toBe(
      false
    );
  });

  it('rejects a schema apply artifact name off the historical template', () => {
    const payload = schemaPayload();
    payload.apply.artifactName = `prod-schema-reconcile-111-2-apply-${PRECURSOR_SHA}`;
    expect(ReleaseEvidenceFragmentV1Schema.safeParse(fragment('schema', payload)).success).toBe(
      false
    );
  });

  it('rejects a schema apply on any attempt other than 1', () => {
    const payload = schemaPayload() as { apply: { runAttempt: number } };
    payload.apply.runAttempt = 2;
    expect(ReleaseEvidenceFragmentV1Schema.safeParse(fragment('schema', payload)).success).toBe(
      false
    );
  });

  it('rejects operator evidence verified before it was captured', () => {
    const payload = operatorEvidencePayload();
    payload.verifiedAt = '2026-08-19T10:10:00.000Z';
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('operator-evidence', payload)).success
    ).toBe(false);
  });

  it('rejects Railway services out of canonical order', () => {
    const payload = releaseProviderPayload();
    payload.railway.services.reverse();
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('release-provider', payload)).success
    ).toBe(false);
  });

  it('rejects H9 metadata with a non-positive size', () => {
    const payload = canaryResultPayload();
    payload.h9Artifact.sizeBytes = 0;
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('canary-result', payload)).success
    ).toBe(false);
  });

  it('rejects secret-shaped or oversized payload strings via field bounds', () => {
    const payload = baselinePayload();
    payload.baselineArtifact.artifactName = 'x'.repeat(2049);
    expect(
      ReleaseEvidenceFragmentV1Schema.safeParse(fragment('baseline', payload)).success
    ).toBe(false);
  });
});
