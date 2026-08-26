import { z } from 'zod';

const GitHubRepositorySchema = z
  .string()
  .max(256)
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Repository must be owner/name');
const PositiveDecimalIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,31}$/, 'Identifier must be a positive decimal string');
const RunAttemptSchema = z.number().int().min(1).max(100);
const SourceShaSchema = z.string().regex(/^[a-f0-9]{40}$/, 'Source SHA must be lowercase SHA-1');
const Sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Digest must be lowercase 64-hex SHA-256');
const CallerWorkflowRefSchema = z
  .string()
  .min(1)
  .max(2048)
  .regex(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml@refs\/.+$/,
    'Caller workflow ref must be owner/repo/.github/workflows/<file>.yml@refs/...'
  );

export const ReleaseProofLineageV1Schema = z
  .object({
    schemaVersion: z.literal('release-proof-lineage-v1'),
    repository: GitHubRepositorySchema,
    runId: PositiveDecimalIdSchema,
    runAttempt: RunAttemptSchema,
    sourceSha: SourceShaSchema,
    callerWorkflowRef: CallerWorkflowRefSchema,
    proofWorkflowRef: z.string().min(1).max(2048),
    conclusion: z.enum(['success', 'failure']),
    certificationArtifact: z
      .object({
        artifactId: PositiveDecimalIdSchema,
        artifactName: z.string().min(1).max(2048),
        artifactArchiveSha256: Sha256HexSchema,
        certificationFileSha256: Sha256HexSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((lineage, ctx) => {
    const expectedProofRef = `${lineage.repository}/.github/workflows/release-proof.yml@${lineage.sourceSha}`;
    if (lineage.proofWorkflowRef !== expectedProofRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proofWorkflowRef'],
        message: 'proofWorkflowRef must be <repository>/.github/workflows/release-proof.yml@<sourceSha>',
      });
    }
    const expectedCertificationName = `release-proof-certification-v1-${lineage.runId}-${lineage.runAttempt}-${lineage.sourceSha}`;
    if (lineage.certificationArtifact.artifactName !== expectedCertificationName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['certificationArtifact', 'artifactName'],
        message:
          'certificationArtifact.artifactName must be release-proof-certification-v1-<runId>-<runAttempt>-<sourceSha>',
      });
    }
  });

export type ReleaseProofLineageV1 = z.infer<typeof ReleaseProofLineageV1Schema>;

export function parseReleaseProofLineage(value: unknown): ReleaseProofLineageV1 {
  return ReleaseProofLineageV1Schema.parse(value);
}
