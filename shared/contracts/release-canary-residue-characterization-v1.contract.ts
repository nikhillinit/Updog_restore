import { z } from 'zod';

export const RELEASE_CANARY_RESIDUE_GROUP_KEYS = [
  'portfolioCompany',
  'fund',
  'fundConfig',
  'fundEvent',
  'notification',
  'grant',
  'calculation',
  'mutationReceipt',
  'scenario',
  'reporting',
] as const;

const ResidueCountSchema = z.number().int().min(0).max(10_000);

const ResidueVectorSchema = z
  .object({
    portfolioCompany: ResidueCountSchema,
    fund: ResidueCountSchema,
    fundConfig: ResidueCountSchema,
    fundEvent: ResidueCountSchema,
    notification: ResidueCountSchema,
    grant: ResidueCountSchema,
    calculation: ResidueCountSchema,
    mutationReceipt: ResidueCountSchema,
    scenario: ResidueCountSchema,
    reporting: ResidueCountSchema,
    total: ResidueCountSchema,
  })
  .strict()
  .superRefine((vector, ctx) => {
    const sum = RELEASE_CANARY_RESIDUE_GROUP_KEYS.reduce((acc, key) => acc + vector[key], 0);
    if (vector.total !== sum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['total'],
        message: 'Residue total must equal the sum of the ten group counts',
      });
    }
  });

export type ResidueVector = z.infer<typeof ResidueVectorSchema>;

export const RELEASE_CANARY_RESERVED_RESIDUE: Readonly<ResidueVector> = Object.freeze({
  portfolioCompany: 1,
  fund: 1,
  fundConfig: 1,
  fundEvent: 4,
  notification: 0,
  grant: 1,
  calculation: 12,
  mutationReceipt: 2,
  scenario: 7,
  reporting: 11,
  total: 40,
});

const vectorEquals = (a: ResidueVector, b: ResidueVector): boolean =>
  a.total === b.total && RELEASE_CANARY_RESIDUE_GROUP_KEYS.every((key) => a[key] === b[key]);

const PhaseNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Phase name must be kebab/word-safe');

const NamedResidueSchema = z
  .object({
    name: PhaseNameSchema,
    residue: ResidueVectorSchema,
  })
  .strict();

const SourceShaSchema = z.string().regex(/^[a-f0-9]{40}$/, 'Source SHA must be lowercase SHA-1');

const ProvenanceSchema = z
  .object({
    dataOrigin: z.literal('production'),
    timeZone: z.literal('UTC'),
    expectedRunVersion: z.number().int().safe().min(1),
    flagState: z
      .object({ enableGpEconomicsEngine: z.literal(false), cohortCalculationInvoked: z.literal(false) })
      .strict(),
    snapshotTypes: z
      .object({ RESERVE: z.literal(1), PACING: z.literal(1), scenario: z.literal(1), ECONOMICS: z.literal(0), COHORT: z.literal(0) })
      .strict(),
    directFundForeignKeys: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((provenance, ctx) => {
    if (provenance.directFundForeignKeys.some((key, index, values) => index > 0 && key < values[index - 1]!)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['directFundForeignKeys'], message: 'directFundForeignKeys must be sorted' });
    }
  });

export const ReleaseCanaryResidueCharacterizationV1Schema = z
  .object({
    schemaVersion: z.literal('release-canary-residue-characterization-v1'),
    sourceSha: SourceShaSchema,
    contractVersion: z.string().min(1).max(64),
    reservedResidue: ResidueVectorSchema,
    phases: z.array(NamedResidueSchema).min(1).max(64),
    finalResidue: ResidueVectorSchema,
    failureBoundaries: z.array(NamedResidueSchema).min(1).max(64),
    provenance: ProvenanceSchema,
    result: z.literal('passed'),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (!vectorEquals(record.reservedResidue, RELEASE_CANARY_RESERVED_RESIDUE)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reservedResidue'],
        message: 'reservedResidue must exactly equal the frozen reserved vector',
      });
    }
    if (!vectorEquals(record.finalResidue, RELEASE_CANARY_RESERVED_RESIDUE)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finalResidue'],
        message: 'finalResidue must exactly equal the reserved residue vector',
      });
    }
    for (let i = 1; i < record.phases.length; i += 1) {
      const previous = record.phases[i - 1]!.residue;
      const current = record.phases[i]!.residue;
      const regressed = RELEASE_CANARY_RESIDUE_GROUP_KEYS.some(
        (key) => current[key] < previous[key]
      );
      if (regressed || current.total < previous.total) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phases', i],
          message: 'Phase residue must be monotonic non-decreasing component-wise',
        });
      }
    }
    const lastPhase = record.phases[record.phases.length - 1];
    if (lastPhase !== undefined && !vectorEquals(lastPhase.residue, record.finalResidue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phases', record.phases.length - 1],
        message: 'Last phase residue must deep-equal finalResidue',
      });
    }
    record.failureBoundaries.forEach((boundary, index) => {
      const exceeds = RELEASE_CANARY_RESIDUE_GROUP_KEYS.some(
        (key) => boundary.residue[key] > RELEASE_CANARY_RESERVED_RESIDUE[key]
      );
      if (exceeds || boundary.residue.total > RELEASE_CANARY_RESERVED_RESIDUE.total) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['failureBoundaries', index],
          message: 'Failure boundary residue must be component-wise <= reserved residue',
        });
      }
    });
  });

export type ReleaseCanaryResidueCharacterizationV1 = z.infer<
  typeof ReleaseCanaryResidueCharacterizationV1Schema
>;

const SECRET_KEY_PATTERN = /(password|secret|token|credential)/i;
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /postgres(?:ql)?:\/\//i,
  /rediss?:\/\//i,
  /\bBearer\s+\S+/,
];
// A 40-char lowercase-hex string is the git SHA shape this record legitimately
// carries; any other 40+ char hyphen-free base64-ish run is treated as
// secret-shaped. Kebab-case identifiers (schemaVersion, phase names) break
// such runs with hyphens.
// ponytail: hyphenated base64url blobs evade this; tighten if that ever matters.
const GIT_SHA_SHAPE = /^[a-f0-9]{40}$/;
const BASE64ISH_BLOB_PATTERN = /[A-Za-z0-9+/=_]{40,}/;

function scanForSecretShapedContent(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new Error(`Secret-shaped string value at ${path}`);
    }
    if (BASE64ISH_BLOB_PATTERN.test(value) && !GIT_SHA_SHAPE.test(value)) {
      throw new Error(`Secret-shaped blob value at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForSecretShapedContent(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        throw new Error(`Secret-shaped key "${key}" at ${path}`);
      }
      scanForSecretShapedContent(entry, `${path}.${key}`);
    }
  }
}

export function parseReleaseCanaryResidueCharacterization(
  value: unknown
): ReleaseCanaryResidueCharacterizationV1 {
  scanForSecretShapedContent(value, '$');
  return ReleaseCanaryResidueCharacterizationV1Schema.parse(value);
}
