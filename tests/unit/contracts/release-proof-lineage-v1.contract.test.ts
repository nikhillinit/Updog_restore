import { describe, expect, it } from 'vitest';

import {
  ReleaseProofLineageV1Schema,
  parseReleaseProofLineage,
} from '@shared/contracts/release-proof-lineage-v1.contract';

const RUN_ID = '4242424242';
const SOURCE_SHA = 'a'.repeat(40);

function validLineage() {
  return {
    schemaVersion: 'release-proof-lineage-v1',
    repository: 'press-on/updog',
    runId: RUN_ID,
    runAttempt: 1,
    sourceSha: SOURCE_SHA,
    callerWorkflowRef:
      'press-on/updog/.github/workflows/release-production.yml@refs/heads/main',
    proofWorkflowRef: `press-on/updog/.github/workflows/release-proof.yml@${SOURCE_SHA}`,
    conclusion: 'success',
    certificationArtifact: {
      artifactId: '654321',
      artifactName: `release-proof-certification-v1-${RUN_ID}-1-${SOURCE_SHA}`,
      artifactArchiveSha256: 'b'.repeat(64),
      certificationFileSha256: 'c'.repeat(64),
    },
  };
}

function withMutation(mutate: (lineage: ReturnType<typeof validLineage>) => void) {
  const clone = structuredClone(validLineage());
  mutate(clone);
  return clone;
}

describe('release-proof-lineage-v1 contract', { retry: 0 }, () => {
  it('accepts a valid lineage record', () => {
    const lineage = validLineage();
    expect(parseReleaseProofLineage(lineage)).toEqual(lineage);
  });

  it('accepts a failure lineage record', () => {
    const lineage = withMutation((l) => {
      l.conclusion = 'failure';
    });
    expect(parseReleaseProofLineage(lineage)).toEqual(lineage);
  });

  it('rejects a prior-attempt certification artifact name', () => {
    const lineage = withMutation((l) => {
      l.certificationArtifact.artifactName = `release-proof-certification-v1-${RUN_ID}-2-${SOURCE_SHA}`;
    });
    expect(ReleaseProofLineageV1Schema.safeParse(lineage).success).toBe(false);
  });

  it('rejects a certification artifact name bound to a different source SHA', () => {
    const lineage = withMutation((l) => {
      l.certificationArtifact.artifactName = `release-proof-certification-v1-${RUN_ID}-1-${'f'.repeat(40)}`;
    });
    expect(ReleaseProofLineageV1Schema.safeParse(lineage).success).toBe(false);
  });

  it('rejects a proofWorkflowRef that does not bind the repository and source SHA', () => {
    const lineage = withMutation((l) => {
      l.proofWorkflowRef = `other/repo/.github/workflows/release-proof.yml@${SOURCE_SHA}`;
    });
    expect(ReleaseProofLineageV1Schema.safeParse(lineage).success).toBe(false);
  });

  it('rejects conclusions outside success and failure', () => {
    const lineage = withMutation((l) => {
      l.conclusion = 'cancelled';
    });
    expect(ReleaseProofLineageV1Schema.safeParse(lineage).success).toBe(false);
  });

  it('rejects unknown nested keys and any self lineage artifact reference', () => {
    const lineage = withMutation((l) => {
      (l.certificationArtifact as Record<string, unknown>)['lineageArtifactId'] = '1';
    });
    expect(ReleaseProofLineageV1Schema.safeParse(lineage).success).toBe(false);
    expect(
      ReleaseProofLineageV1Schema.safeParse({
        ...validLineage(),
        lineageArtifact: { artifactId: '1' },
      }).success
    ).toBe(false);
  });
});
