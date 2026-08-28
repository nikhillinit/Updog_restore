import { describe, expect, it } from 'vitest';

import { RELEASE_CANARY_RESERVED_RESIDUE } from '@shared/contracts/release-canary-residue-characterization-v1.contract';
import {
  ReleaseEvidenceManifestV1Schema,
  parseReleaseEvidenceManifest,
  scanForSecretShapedContent,
} from '@shared/contracts/release-evidence-manifest-v1.contract';

const RUN_ID = '4242424242';
const ATTEMPT = 1;
const SOURCE_SHA = 'a'.repeat(40);
const PRECURSOR_SHA = 'b'.repeat(40);
const BASELINE_MAIN_SHA = 'c'.repeat(40);
const PLANNED_HEAD_SHA = 'd'.repeat(40);
const PR_HEAD_SHA = 'e'.repeat(40);
const APPROVED_BASE_SHA = 'f'.repeat(40);
const CONTEXT_SHA256 = '6'.repeat(64);
const CHAR_FILE_SHA256 = '5'.repeat(64);
const POLICY_CONFIG_PAYLOAD_SHA256 = '2'.repeat(64);
const POLICY_MEASUREMENT_PAYLOAD_SHA256 = '3'.repeat(64);
const CANARY_RESULT_PAYLOAD_SHA256 = '4'.repeat(64);
const UUID = '123e4567-e89b-12d3-a456-426614174000';

const reservedResidue = () => ({ ...RELEASE_CANARY_RESERVED_RESIDUE });
const tripledCaps = () =>
  Object.fromEntries(
    Object.entries(RELEASE_CANARY_RESERVED_RESIDUE).map(([key, value]) => [key, value * 3])
  );

const vercelIdentity = (sourceSha: string) => ({
  projectId: 'prj_updog',
  deploymentId: 'dpl_12345',
  hostname: 'app.example.com',
  sourceSha,
});

const railwayIdentity = (sourceSha: string) => ({
  projectId: 'railway-project',
  environmentId: 'railway-environment',
  services: [
    {
      serviceName: 'fund-scenario-calc',
      serviceId: 'svc-fund-scenario-calc',
      deploymentId: 'dep-fund-scenario-calc',
      sourceSha,
    },
    {
      serviceName: 'capital-call-status',
      serviceId: 'svc-capital-call-status',
      deploymentId: 'dep-capital-call-status',
      sourceSha,
    },
  ],
});

const fragmentLineageEntry = (kind: string, producerJob: string, payloadSha256: string) => ({
  kind,
  runId: RUN_ID,
  runAttempt: ATTEMPT,
  sourceSha: SOURCE_SHA,
  artifactId: '77',
  artifactName: `release-evidence-fragment-v1-${kind}-${RUN_ID}-${ATTEMPT}-${SOURCE_SHA}`,
  artifactArchiveSha256: '8'.repeat(64),
  fileSha256: '9'.repeat(64),
  payloadSha256,
  producerJob,
});

function validSuccessManifest() {
  return {
    schemaVersion: 'release-evidence-manifest-v1',
    designation: 'infrastructure_only',
    candidate: false,
    source: {
      repository: 'press-on/updog',
      sha: SOURCE_SHA,
      releaseMode: 'primary',
      pullRequest: 1385,
      pullRequestHeadSha: PR_HEAD_SHA,
      planApprovalPullRequest: 1385,
      planPath: 'docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md',
      planSha256: '1'.repeat(64),
    },
    approval: {
      schemaVersion: 'plan-approval-v2',
      repository: 'press-on/updog',
      pullRequest: 1385,
      verifiedPrHeadSha: PR_HEAD_SHA,
      commentId: 900001,
      commentUrl: 'https://github.com/press-on/updog/pull/1385#issuecomment-900001',
      authorLogin: 'repo-owner',
      authorPermission: 'admin',
      createdAt: '2026-08-12T09:00:00Z',
      bodySha256: 'a'.repeat(64),
      planPath: 'docs/superpowers/plans/2026-08-11-pr-1385-release-gate-hardening.md',
      planSha256: '1'.repeat(64),
      approvedBaseHeadSha: APPROVED_BASE_SHA,
      reviewCommentId: 900002,
      reviewCommentUrl: 'https://github.com/press-on/updog/pull/1385',
      reviewAuthorLogin: 'repo-owner',
      reviewCreatedAt: '2026-08-12T09:05:00Z',
      reviewBodySha256: 'b'.repeat(64),
      ciGateCheckRunId: 800001,
      ciGateWorkflowRunId: 800002,
      ciGateRunAttempt: 1,
      finalHeadCiGate: {
        checkRunId: 800003,
        workflowRunId: 800004,
        runAttempt: 1,
        headSha: PR_HEAD_SHA,
      },
      separationModel: 'single-maintainer-owner-attestation',
    },
    certification: {
      schemaVersion: 'release-proof-lineage-v1',
      callerWorkflowRef: 'press-on/updog/.github/workflows/release-production.yml@refs/heads/main',
      proofWorkflowRef: `press-on/updog/.github/workflows/release-proof.yml@${SOURCE_SHA}`,
      runId: RUN_ID,
      runAttempt: ATTEMPT,
      sourceSha: SOURCE_SHA,
      conclusion: 'success',
      certificationArtifact: {
        artifactId: '31',
        artifactName: `release-proof-certification-v1-${RUN_ID}-${ATTEMPT}-${SOURCE_SHA}`,
        artifactArchiveSha256: 'c'.repeat(64),
        certificationFileSha256: 'd'.repeat(64),
      },
      lineageArtifact: {
        artifactId: '32',
        artifactName: `release-proof-lineage-v1-${RUN_ID}-${ATTEMPT}-${SOURCE_SHA}`,
        artifactArchiveSha256: 'e'.repeat(64),
        lineageFileSha256: 'f'.repeat(64),
      },
    },
    workflow: {
      runId: RUN_ID,
      runAttempt: ATTEMPT,
      startedAt: '2026-08-19T10:00:00.000Z',
      manifestBuiltAt: '2026-08-19T11:00:00.000Z',
      preManifestOutcome: 'success',
      failureStage: null,
      manifestArtifactName: `release-evidence-manifest-v1-${RUN_ID}-${ATTEMPT}-${SOURCE_SHA}`,
    },
    schema: {
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
        artifactArchiveSha256: '7'.repeat(64),
        receiptFileSha256: '8'.repeat(64),
      },
      audit: {
        runId: RUN_ID,
        runAttempt: ATTEMPT,
        workflowPath: '.github/workflows/prod-schema-reconcile.yml',
        sourceSha: SOURCE_SHA,
        runUrl: `https://github.com/press-on/updog/actions/runs/${RUN_ID}`,
        result: 'clean',
      },
    },
    policy: {
      reservedPerRun: reservedResidue(),
      stagedMeasuredResidue: reservedResidue(),
      configuredCaps: tripledCaps(),
      retainedRunBudget: 3,
      ttlHours: 24,
      characterizationEvidence: {
        artifactId: '41',
        artifactName: `release-canary-residue-characterization-v1-${RUN_ID}-${ATTEMPT}-${SOURCE_SHA}`,
        artifactArchiveSha256: '0'.repeat(64),
        fileSha256: CHAR_FILE_SHA256,
        sourceSha: SOURCE_SHA,
      },
      ratification: null,
    },
    prechange: {
      baseline: {
        runId: '222',
        runAttempt: 1,
        workflowPath: '.github/workflows/capture-release-baseline.yml',
        baselineMainSha: BASELINE_MAIN_SHA,
        plannedPrHeadSha: PLANNED_HEAD_SHA,
        artifactId: '9',
        artifactName: 'release-baseline-context',
        artifactArchiveSha256: '7'.repeat(64),
        contextFileSha256: CONTEXT_SHA256,
      },
      vercel: vercelIdentity(BASELINE_MAIN_SHA),
      railway: railwayIdentity(BASELINE_MAIN_SHA),
    },
    release: {
      vercel: vercelIdentity(SOURCE_SHA),
      railway: railwayIdentity(SOURCE_SHA),
    },
    operatorEvidence: {
      bundleSha256: 'e'.repeat(64),
      capturedAt: '2026-08-19T10:15:00.000Z',
      verifiedAt: '2026-08-19T10:20:00.000Z',
    },
    canary: {
      execution: {
        fundId: 1,
        canaryRunId: UUID,
        githubRunId: RUN_ID,
        githubRunAttempt: ATTEMPT,
        releaseSha: SOURCE_SHA,
        startedAt: '2026-08-19T10:05:00.000Z',
      },
      status: 'completed',
      residue: reservedResidue(),
    },
    h9Artifact: {
      recordId: 41,
      packageId: 7,
      contentHash: 'a'.repeat(64),
      fingerprint: 'b'.repeat(64),
      sizeBytes: 1024,
    },
    fragmentLineage: {
      baseline: fragmentLineageEntry('baseline', 'baseline-policy-preflight', '9'.repeat(64)),
      schema: fragmentLineageEntry('schema', 'schema-audit', '9'.repeat(64)),
      policyConfig: fragmentLineageEntry(
        'policy-config',
        'baseline-policy-preflight',
        POLICY_CONFIG_PAYLOAD_SHA256
      ),
      policyMeasurement: fragmentLineageEntry(
        'policy-measurement',
        'staged-smoke',
        POLICY_MEASUREMENT_PAYLOAD_SHA256
      ),
      policyRatification: null,
      operatorEvidence: fragmentLineageEntry(
        'operator-evidence',
        'g4-operator-evidence',
        '9'.repeat(64)
      ),
      releaseProvider: fragmentLineageEntry('release-provider', 'promote', '9'.repeat(64)),
      canaryResult: fragmentLineageEntry(
        'canary-result',
        'staged-smoke',
        CANARY_RESULT_PAYLOAD_SHA256
      ),
    },
    rollback: {
      mode: 'primary',
      recoveryContextSha256: CONTEXT_SHA256,
      targetMainSha: BASELINE_MAIN_SHA,
    },
  };
}

type Manifest = ReturnType<typeof validSuccessManifest>;

function withMutation(mutate: (manifest: Manifest) => void): Manifest {
  const clone = structuredClone(validSuccessManifest());
  mutate(clone);
  return clone;
}

function validFailureManifest() {
  return withMutation((m) => {
    m.workflow.preManifestOutcome = 'failure';
    (m.workflow as { failureStage: string | null }).failureStage = 'release-proof';
    m.certification.conclusion = 'failure';
    (m as Record<string, unknown>)['schema'] = null;
    (m as Record<string, unknown>)['release'] = null;
    (m as Record<string, unknown>)['operatorEvidence'] = null;
    (m as Record<string, unknown>)['canary'] = null;
    (m as Record<string, unknown>)['h9Artifact'] = null;
    (m.policy as Record<string, unknown>)['stagedMeasuredResidue'] = null;
    (m.policy as Record<string, unknown>)['characterizationEvidence'] = null;
    (m.policy as Record<string, unknown>)['ratification'] = null;
    const lineage = m.fragmentLineage as Record<string, unknown>;
    for (const key of [
      'schema',
      'policyMeasurement',
      'operatorEvidence',
      'releaseProvider',
      'canaryResult',
    ]) {
      lineage[key] = null;
    }
  });
}

const rejects = (manifest: unknown): void => {
  expect(ReleaseEvidenceManifestV1Schema.safeParse(manifest).success).toBe(false);
};

describe('release-evidence-manifest-v1 contract', { retry: 0 }, () => {
  it('accepts a fully successful infrastructure-only manifest', () => {
    const manifest = validSuccessManifest();
    expect(parseReleaseEvidenceManifest(manifest)).toEqual(manifest);
  });

  it('accepts a proof-stage failure manifest with null downstream sections', () => {
    const manifest = validFailureManifest();
    expect(parseReleaseEvidenceManifest(manifest)).toEqual(manifest);
  });

  it('rejects designation/candidate mismatches in both directions', () => {
    rejects(withMutation((m) => void (m.candidate = true)));
    rejects(
      withMutation((m) => {
        m.designation = 'activation_candidate';
      })
    );
  });

  it('rejects success manifests with null schema, canary, or lineage entries', () => {
    rejects(withMutation((m) => void ((m as Record<string, unknown>)['schema'] = null)));
    rejects(withMutation((m) => void ((m as Record<string, unknown>)['canary'] = null)));
    rejects(
      withMutation(
        (m) => void ((m.fragmentLineage as Record<string, unknown>)['canaryResult'] = null)
      )
    );
    rejects(withMutation((m) => void ((m as Record<string, unknown>)['h9Artifact'] = null)));
    rejects(withMutation((m) => void ((m as Record<string, unknown>)['release'] = null)));
    rejects(withMutation((m) => void ((m as Record<string, unknown>)['operatorEvidence'] = null)));
  });

  it('rejects success manifests whose certification concluded failure', () => {
    rejects(withMutation((m) => void (m.certification.conclusion = 'failure')));
  });

  it('rejects failure stages outside the frozen DAG stage enum', () => {
    const manifest = validFailureManifest();
    (manifest.workflow as { failureStage: string | null }).failureStage = 'mystery-stage';
    rejects(manifest);
  });

  it('accepts historical policy-ratification failure stage', () => {
    const manifest = validFailureManifest();
    (manifest.workflow as { failureStage: string | null }).failureStage = 'policy-ratification';
    expect(parseReleaseEvidenceManifest(manifest)).toEqual(manifest);
  });

  it('rejects failure outcomes without a failure stage and success outcomes with one', () => {
    const failure = validFailureManifest();
    (failure.workflow as { failureStage: string | null }).failureStage = null;
    rejects(failure);
    rejects(
      withMutation(
        (m) => void ((m.workflow as { failureStage: string | null }).failureStage = 'promote')
      )
    );
  });

  it('rejects rollback hashes that mismatch the prechange baseline', () => {
    rejects(withMutation((m) => void (m.rollback.recoveryContextSha256 = '0'.repeat(64))));
    rejects(withMutation((m) => void (m.rollback.targetMainSha = 'f'.repeat(40))));
    rejects(withMutation((m) => void (m.rollback.mode = 'rollback')));
  });

  it('rejects prior-attempt manifest, certification, and fragment artifact names', () => {
    rejects(
      withMutation(
        (m) =>
          void (m.workflow.manifestArtifactName = `release-evidence-manifest-v1-${RUN_ID}-2-${SOURCE_SHA}`)
      )
    );
    rejects(
      withMutation(
        (m) =>
          void (m.certification.certificationArtifact.artifactName = `release-proof-certification-v1-${RUN_ID}-2-${SOURCE_SHA}`)
      )
    );
    rejects(
      withMutation(
        (m) =>
          void (m.fragmentLineage.baseline.artifactName = `release-evidence-fragment-v1-baseline-${RUN_ID}-2-${SOURCE_SHA}`)
      )
    );
  });

  it('rejects fragment lineage recorded by the wrong producer or wrong kind', () => {
    rejects(
      withMutation((m) => void (m.fragmentLineage.policyConfig.producerJob = 'staged-smoke'))
    );
    rejects(withMutation((m) => void (m.fragmentLineage.policyConfig.kind = 'baseline')));
    rejects(withMutation((m) => void (m.fragmentLineage.baseline.sourceSha = 'f'.repeat(40))));
    rejects(withMutation((m) => void (m.fragmentLineage.baseline.runAttempt = 2)));
  });

  it('rejects approval and plan ancestry field mismatches', () => {
    rejects(withMutation((m) => void (m.approval.planSha256 = '0'.repeat(64))));
    rejects(
      withMutation((m) => void (m.approval.planPath = 'docs/superpowers/plans/other-plan.md'))
    );
    rejects(withMutation((m) => void (m.approval.pullRequest = 1384)));
    rejects(withMutation((m) => void (m.approval.repository = 'press-on/other')));
    rejects(withMutation((m) => void (m.approval.verifiedPrHeadSha = APPROVED_BASE_SHA)));
    rejects(withMutation((m) => void (m.approval.finalHeadCiGate.headSha = APPROVED_BASE_SHA)));
    rejects(withMutation((m) => void (m.source.pullRequest = 1400)));
  });

  it('requires approval and source-plan provenance as coherent all-null or all-present groups', () => {
    rejects(withMutation((m) => void (m.source.planPath = null)));
    rejects(withMutation((m) => void (m.source.planApprovalPullRequest = null)));
    rejects(withMutation((m) => void (m.source.planSha256 = null)));
    rejects(
      withMutation((m) => {
        m.source.planApprovalPullRequest = null;
        m.source.planPath = null;
        m.source.planSha256 = null;
      })
    );
    const historical = withMutation((m) => {
      m.source.planApprovalPullRequest = null;
      m.source.planPath = null;
      m.source.planSha256 = null;
      m.approval = null;
    });
    expect(parseReleaseEvidenceManifest(historical)).toEqual(historical);
  });

  it('rejects certification bound to another run, attempt, source SHA, or proof ref', () => {
    rejects(withMutation((m) => void (m.certification.sourceSha = 'f'.repeat(40))));
    rejects(withMutation((m) => void (m.certification.runId = '999')));
    rejects(withMutation((m) => void (m.certification.runAttempt = 2)));
    rejects(
      withMutation(
        (m) =>
          void (m.certification.proofWorkflowRef = `press-on/updog/.github/workflows/release-proof.yml@${'f'.repeat(40)}`)
      )
    );
  });

  it('rejects schema lineage off the historical apply template or wrong audit binding', () => {
    rejects(withMutation((m) => void (m.schema!.apply.sourceSha = SOURCE_SHA)));
    rejects(
      withMutation(
        (m) =>
          void (m.schema!.apply.artifactName = `prod-schema-reconcile-112-1-apply-${PRECURSOR_SHA}`)
      )
    );
    rejects(withMutation((m) => void (m.schema!.audit.runId = '999')));
    rejects(withMutation((m) => void (m.schema!.audit.sourceSha = PRECURSOR_SHA)));
  });

  it('rejects policy caps that are not exactly 3x reserved with total 120', () => {
    rejects(
      withMutation((m) => {
        m.policy.configuredCaps['reporting'] = 99;
        m.policy.configuredCaps['total'] = 186;
      })
    );
    rejects(
      withMutation((m) => {
        m.policy.reservedPerRun.reporting = 33;
        m.policy.reservedPerRun.total = 62;
      })
    );
  });

  it('rejects successful manifests whose staged residue is not the reserved vector', () => {
    rejects(
      withMutation((m) => {
        m.policy.stagedMeasuredResidue!.scenario += 1;
        m.policy.stagedMeasuredResidue!.total += 1;
      })
    );
  });

  it('rejects characterization evidence for another SHA or attempt', () => {
    rejects(
      withMutation((m) => void (m.policy.characterizationEvidence!.sourceSha = PRECURSOR_SHA))
    );
    rejects(
      withMutation(
        (m) =>
          void (m.policy.characterizationEvidence!.artifactName = `release-canary-residue-characterization-v1-${RUN_ID}-2-${SOURCE_SHA}`)
      )
    );
  });

  it('rejects release provider and canary identities disagreeing with source SHA', () => {
    rejects(withMutation((m) => void (m.release!.vercel.sourceSha = PRECURSOR_SHA)));
    rejects(withMutation((m) => void (m.release!.railway.services[0]!.sourceSha = PRECURSOR_SHA)));
    rejects(withMutation((m) => void (m.canary!.execution.releaseSha = PRECURSOR_SHA)));
    rejects(withMutation((m) => void (m.canary!.execution.githubRunId = '999')));
    rejects(withMutation((m) => void (m.canary!.execution.githubRunAttempt = 2)));
  });

  it('accepts a manifest with non-null historical ratification data', () => {
    const manifest = withMutation((m) => {
      (m.policy as Record<string, unknown>)['ratification'] = {
        environmentId: '10001',
        environmentName: 'Production Policy Ratification',
        reviewerLogin: 'repo-owner',
        reviewerPermission: 'admin',
        approvalState: 'approved',
        commentSha256: 'c'.repeat(64),
        policyConfigPayloadSha256: POLICY_CONFIG_PAYLOAD_SHA256,
        policyMeasurementPayloadSha256: POLICY_MEASUREMENT_PAYLOAD_SHA256,
        characterizationFileSha256: CHAR_FILE_SHA256,
        canaryResultPayloadSha256: CANARY_RESULT_PAYLOAD_SHA256,
        verifiedAt: '2026-08-19T10:30:00.000Z',
      };
    });
    expect(parseReleaseEvidenceManifest(manifest)).toEqual(manifest);
  });

  it('rejects manifests built before the workflow started', () => {
    rejects(withMutation((m) => void (m.workflow.manifestBuiltAt = '2026-08-19T09:59:59.000Z')));
  });

  it('rejects unknown top-level and nested keys', () => {
    rejects({ ...validSuccessManifest(), extra: true });
    rejects(withMutation((m) => void ((m.approval as Record<string, unknown>)['note'] = 'x')));
    rejects(
      withMutation((m) => void ((m.fragmentLineage as Record<string, unknown>)['bonus'] = null))
    );
  });

  it('scan reports secret-shaped values, keys, paths, and oversized content with paths', () => {
    expect(scanForSecretShapedContent({ a: 'postgresql://user:pw@host/db' })).toEqual([
      '$.a: secret-shaped string value',
    ]);
    expect(scanForSecretShapedContent({ a: 'ghp_abcdef' })).toHaveLength(1);
    expect(scanForSecretShapedContent({ a: 'Bearer abc' })).toHaveLength(1);
    expect(scanForSecretShapedContent({ a: '/Users/someone/evidence.json' })).toHaveLength(1);
    expect(scanForSecretShapedContent({ a: 'C:\\evidence\\file.json' })).toHaveLength(1);
    expect(scanForSecretShapedContent({ a: '-----BEGIN PRIVATE KEY-----' })).toHaveLength(1);
    expect(scanForSecretShapedContent({ authorizationHeader: 'x' })).toHaveLength(1);
    expect(scanForSecretShapedContent({ myToken: 'x' })).toHaveLength(1);
    expect(scanForSecretShapedContent({ a: 'x'.repeat(2049) })).toContain(
      '$.a: string exceeds 2048 characters'
    );
    expect(scanForSecretShapedContent({ a: 'A'.repeat(600) })).toEqual([
      '$.a: base64 blob exceeds 512 characters',
    ]);
    expect(scanForSecretShapedContent({ a: Number.MAX_SAFE_INTEGER + 2 })).toHaveLength(1);
    expect(scanForSecretShapedContent({ a: Array.from({ length: 65 }, () => 1) })).toHaveLength(1);
    expect(scanForSecretShapedContent(validSuccessManifest())).toEqual([]);
  });

  it('parse refuses secret-shaped content before Zod validation', () => {
    const manifest = withMutation(
      (m) => void (m.prechange.baseline.artifactName = 'postgres://canary:pw@db.internal/updog')
    );
    expect(() => parseReleaseEvidenceManifest(manifest)).toThrow(/Secret-shaped/);
    const withToken = withMutation(
      (m) => void (m.prechange.baseline.artifactName = 'ghp_0123456789abcdef')
    );
    expect(() => parseReleaseEvidenceManifest(withToken)).toThrow(/Secret-shaped/);
    const withBearer = withMutation(
      (m) => void (m.prechange.baseline.artifactName = 'Bearer 0123456789')
    );
    expect(() => parseReleaseEvidenceManifest(withBearer)).toThrow(/Secret-shaped/);
    const withPath = withMutation(
      (m) => void (m.prechange.baseline.artifactName = '/Users/nikhil/evidence.json')
    );
    expect(() => parseReleaseEvidenceManifest(withPath)).toThrow(/Secret-shaped/);
    const oversized = withMutation(
      (m) => void (m.prechange.baseline.artifactName = 'x'.repeat(2049))
    );
    expect(() => parseReleaseEvidenceManifest(oversized)).toThrow(/Secret-shaped/);
  });
});
