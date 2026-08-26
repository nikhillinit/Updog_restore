import { describe, expect, it } from 'vitest';

import {
  ReleaseProofCertificationV1Schema,
  parseReleaseProofCertification,
} from '@shared/contracts/release-proof-certification-v1.contract';

const RUN_ID = '4242424242';
const SOURCE_SHA = 'a'.repeat(40);

function validCertification() {
  return {
    schemaVersion: 'release-proof-certification-v1',
    repository: 'press-on/updog',
    runId: RUN_ID,
    runAttempt: 1,
    sourceSha: SOURCE_SHA,
    callerWorkflowRef:
      'press-on/updog/.github/workflows/release-production.yml@refs/heads/main',
    proofWorkflowRef: `press-on/updog/.github/workflows/release-proof.yml@${SOURCE_SHA}`,
    conclusions: {
      fullReleaseProof: 'success',
      providerIdentity: 'success',
      canaryResidueCharacterization: 'success',
      g3ExactShaVerdict: 'success',
    },
    summaries: {
      matrixSummarySha256: 'b'.repeat(64),
      releaseCheckSummarySha256: 'c'.repeat(64),
    },
    characterizationArtifact: {
      artifactId: '123456',
      artifactName: `release-canary-residue-characterization-v1-${RUN_ID}-1-${SOURCE_SHA}`,
      artifactArchiveSha256: 'd'.repeat(64),
      fileSha256: 'e'.repeat(64),
      sourceSha: SOURCE_SHA,
    },
    overallConclusion: 'success',
  };
}

function withMutation(mutate: (certification: ReturnType<typeof validCertification>) => void) {
  const clone = structuredClone(validCertification());
  mutate(clone);
  return clone;
}

describe('release-proof-certification-v1 contract', { retry: 0 }, () => {
  it('accepts a fully successful certification', () => {
    const certification = validCertification();
    expect(parseReleaseProofCertification(certification)).toEqual(certification);
  });

  it('accepts a success certification when providerIdentity is skipped', () => {
    const certification = withMutation((c) => {
      c.conclusions.providerIdentity = 'skipped';
    });
    expect(parseReleaseProofCertification(certification)).toEqual(certification);
  });

  it('accepts a failure certification with failed conclusions and null characterization artifact', () => {
    const certification = withMutation((c) => {
      c.conclusions.fullReleaseProof = 'failure';
      c.conclusions.canaryResidueCharacterization = 'cancelled';
      c.conclusions.g3ExactShaVerdict = 'skipped';
      (c as { characterizationArtifact: unknown }).characterizationArtifact = null;
      c.overallConclusion = 'failure';
    });
    expect(parseReleaseProofCertification(certification)).toEqual(certification);
  });

  it('accepts a failure certification with null summaries when fullReleaseProof did not succeed', () => {
    const certification = withMutation((c) => {
      c.conclusions.fullReleaseProof = 'failure';
      (c as { summaries: unknown }).summaries = null;
      (c as { characterizationArtifact: unknown }).characterizationArtifact = null;
      c.overallConclusion = 'failure';
    });
    expect(parseReleaseProofCertification(certification)).toEqual(certification);
  });

  it('rejects null summaries when fullReleaseProof succeeded', () => {
    const certification = withMutation((c) => {
      (c as { summaries: unknown }).summaries = null;
      c.overallConclusion = 'failure';
    });
    expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
  });

  it('rejects overallConclusion success with null summaries', () => {
    const certification = withMutation((c) => {
      (c as { summaries: unknown }).summaries = null;
    });
    expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
  });

  it('rejects overallConclusion success when fullReleaseProof failed', () => {
    const certification = withMutation((c) => {
      c.conclusions.fullReleaseProof = 'failure';
    });
    expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
  });

  it('rejects overallConclusion success when providerIdentity failed or was cancelled', () => {
    for (const conclusion of ['failure', 'cancelled'] as const) {
      const certification = withMutation((c) => {
        c.conclusions.providerIdentity = conclusion;
      });
      expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
    }
  });

  it('rejects overallConclusion success with a null characterization artifact', () => {
    const certification = withMutation((c) => {
      (c as { characterizationArtifact: unknown }).characterizationArtifact = null;
    });
    expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
  });

  it('rejects overallConclusion success when characterization source SHA mismatches', () => {
    const certification = withMutation((c) => {
      c.characterizationArtifact!.sourceSha = 'f'.repeat(40);
    });
    expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
  });

  it('rejects a prior-attempt characterization artifact name on a success certification', () => {
    const certification = withMutation((c) => {
      c.characterizationArtifact!.artifactName = `release-canary-residue-characterization-v1-${RUN_ID}-2-${SOURCE_SHA}`;
    });
    expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
  });

  it('rejects overallConclusion failure when every success condition holds', () => {
    const certification = withMutation((c) => {
      c.overallConclusion = 'failure';
    });
    expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
  });

  it('rejects a proofWorkflowRef that does not bind the repository and source SHA', () => {
    const certification = withMutation((c) => {
      c.proofWorkflowRef = `press-on/updog/.github/workflows/release-proof.yml@${'f'.repeat(40)}`;
    });
    expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
  });

  it('rejects malformed caller workflow refs', () => {
    const certification = withMutation((c) => {
      c.callerWorkflowRef = 'not-a-workflow-ref';
    });
    expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
  });

  it('rejects unknown top-level and nested keys', () => {
    expect(
      ReleaseProofCertificationV1Schema.safeParse({ ...validCertification(), extra: true }).success
    ).toBe(false);
    const certification = withMutation((c) => {
      (c.conclusions as Record<string, unknown>)['extraJob'] = 'success';
    });
    expect(ReleaseProofCertificationV1Schema.safeParse(certification).success).toBe(false);
  });
});
