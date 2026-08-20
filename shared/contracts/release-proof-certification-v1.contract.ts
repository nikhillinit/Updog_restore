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
const ArtifactNameSchema = z.string().min(1).max(2048);
const CallerWorkflowRefSchema = z
  .string()
  .min(1)
  .max(2048)
  .regex(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml@refs\/.+$/,
    'Caller workflow ref must be owner/repo/.github/workflows/<file>.yml@refs/...'
  );

const JobConclusionSchema = z.enum(['success', 'failure', 'cancelled', 'skipped']);

const CharacterizationArtifactSchema = z
  .object({
    artifactId: PositiveDecimalIdSchema,
    artifactName: ArtifactNameSchema,
    artifactArchiveSha256: Sha256HexSchema,
    fileSha256: Sha256HexSchema,
    sourceSha: SourceShaSchema,
  })
  .strict();

export const ReleaseProofCertificationV1Schema = z
  .object({
    schemaVersion: z.literal('release-proof-certification-v1'),
    repository: GitHubRepositorySchema,
    runId: PositiveDecimalIdSchema,
    runAttempt: RunAttemptSchema,
    sourceSha: SourceShaSchema,
    callerWorkflowRef: CallerWorkflowRefSchema,
    proofWorkflowRef: z.string().min(1).max(2048),
    conclusions: z
      .object({
        fullReleaseProof: JobConclusionSchema,
        providerIdentity: JobConclusionSchema,
        canaryResidueCharacterization: JobConclusionSchema,
        g3ExactShaVerdict: JobConclusionSchema,
      })
      .strict(),
    summaries: z
      .object({
        matrixSummarySha256: Sha256HexSchema,
        releaseCheckSummarySha256: Sha256HexSchema,
      })
      .strict()
      .nullable(),
    characterizationArtifact: CharacterizationArtifactSchema.nullable(),
    overallConclusion: z.enum(['success', 'failure']),
  })
  .strict()
  .superRefine((certification, ctx) => {
    const expectedProofRef = `${certification.repository}/.github/workflows/release-proof.yml@${certification.sourceSha}`;
    if (certification.proofWorkflowRef !== expectedProofRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proofWorkflowRef'],
        message: 'proofWorkflowRef must be <repository>/.github/workflows/release-proof.yml@<sourceSha>',
      });
    }
    const expectedCharacterizationName = `release-canary-residue-characterization-v1-${certification.runId}-${certification.runAttempt}-${certification.sourceSha}`;
    const { conclusions, characterizationArtifact, summaries } = certification;
    // Null summaries record an early proof failure that never produced the
    // evidence step; a successful full release proof always has summaries.
    if (summaries === null && conclusions.fullReleaseProof === 'success') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['summaries'],
        message: 'summaries may be null only when fullReleaseProof is not success',
      });
    }
    const eligibleForSuccess =
      summaries !== null &&
      conclusions.fullReleaseProof === 'success' &&
      conclusions.canaryResidueCharacterization === 'success' &&
      conclusions.g3ExactShaVerdict === 'success' &&
      (conclusions.providerIdentity === 'success' || conclusions.providerIdentity === 'skipped') &&
      characterizationArtifact !== null &&
      characterizationArtifact.sourceSha === certification.sourceSha &&
      characterizationArtifact.artifactName === expectedCharacterizationName;
    if (certification.overallConclusion === 'success' && !eligibleForSuccess) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overallConclusion'],
        message:
          'overallConclusion success requires successful proof, characterization, and g3 verdict, providerIdentity success or skipped, and a matching characterization artifact',
      });
    }
    if (certification.overallConclusion === 'failure' && eligibleForSuccess) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overallConclusion'],
        message: 'overallConclusion must be success when every success condition holds',
      });
    }
  });

export type ReleaseProofCertificationV1 = z.infer<typeof ReleaseProofCertificationV1Schema>;

export function parseReleaseProofCertification(value: unknown): ReleaseProofCertificationV1 {
  return ReleaseProofCertificationV1Schema.parse(value);
}
