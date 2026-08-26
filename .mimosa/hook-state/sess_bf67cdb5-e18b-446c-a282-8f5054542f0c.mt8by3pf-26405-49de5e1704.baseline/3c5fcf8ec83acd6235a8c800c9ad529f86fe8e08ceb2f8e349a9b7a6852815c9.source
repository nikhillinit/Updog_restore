import { z } from 'zod';

export const QUARTERLY_REVIEW_CONTRACT_VERSION = 'quarterly-review-v1' as const;

export const QUARTERLY_REVIEW_CATEGORIES = [
  'cases_probabilities',
  'kpis',
  'valuation_fmv',
  'reserve_plan',
  'qualitative_risks',
] as const;
export const QuarterlyReviewCategorySchema = z.enum(QUARTERLY_REVIEW_CATEGORIES);
export type QuarterlyReviewCategory = z.infer<typeof QuarterlyReviewCategorySchema>;

export const QUARTERLY_REVIEW_ITEM_STATES = ['pending', 'changed', 'reviewed_no_change'] as const;
export const QuarterlyReviewItemStateSchema = z.enum(QUARTERLY_REVIEW_ITEM_STATES);
export type QuarterlyReviewItemState = z.infer<typeof QuarterlyReviewItemStateSchema>;

export const QUARTERLY_REVIEW_OPERATIONS = [
  'draft_refresh',
  'economics_reference_replace',
  'review_item_update',
  'company_waive',
  'draft_save',
] as const;
export const QuarterlyReviewOperationSchema = z.enum(QUARTERLY_REVIEW_OPERATIONS);
export type QuarterlyReviewOperation = z.infer<typeof QuarterlyReviewOperationSchema>;

export const POSTGRES_INT_MAX = 2_147_483_647;
export const PostgresPositiveIntSchema = z.number().int().min(1).max(POSTGRES_INT_MAX);
const PositiveIntSchema = PostgresPositiveIntSchema;
const NonnegativeIntSchema = z.number().int().nonnegative();
const PROTOCOL_OR_AUTHORITY = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const TRAVERSAL_SEGMENT = /(?:^|\/)\.\.(?:\/|$)/;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

const normalizedText = (maximum: number, field: string) =>
  z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .min(1, `${field} must not be blank.`)
        .max(maximum)
        .refine((value) => !containsControlCharacter(value), `${field} must not contain controls.`)
    );

export const QuarterlyReviewChangeReferenceSchema = z
  .object({
    kind: z.literal('internal_route'),
    path: z
      .string()
      .min(1)
      .max(512)
      .refine((path) => path.startsWith('/'), 'path must be relative to this application.')
      .refine((path) => !PROTOCOL_OR_AUTHORITY.test(path), 'path must not contain a scheme.')
      .refine((path) => !TRAVERSAL_SEGMENT.test(path), 'path must not traverse directories.')
      .refine((path) => !containsControlCharacter(path), 'path must not contain controls.'),
    label: normalizedText(120, 'label'),
  })
  .strict();
export type QuarterlyReviewChangeReference = z.infer<typeof QuarterlyReviewChangeReferenceSchema>;

export const QuarterlyReviewFollowUpSchema = z
  .object({
    availability: z.literal('linked'),
    target: z.object({ kind: z.literal('task'), id: PositiveIntSchema }).strict(),
  })
  .strict();
export type QuarterlyReviewFollowUp = z.infer<typeof QuarterlyReviewFollowUpSchema>;

export const QuarterlyReviewCapabilitiesSchema = z
  .object({
    operatingDecision: z
      .object({
        availability: z.literal('unavailable'),
        reason: z.literal('dependency_not_available'),
      })
      .strict(),
  })
  .strict();

export const QuarterlyReviewItemMutationSchema = z.discriminatedUnion('state', [
  z
    .object({
      state: z.literal('changed'),
      note: normalizedText(4_000, 'note'),
      changeReference: QuarterlyReviewChangeReferenceSchema,
      followUpTaskId: PositiveIntSchema.optional(),
    })
    .strict(),
  z
    .object({
      state: z.literal('reviewed_no_change'),
      note: normalizedText(4_000, 'note'),
    })
    .strict(),
]);
export type QuarterlyReviewItemMutation = z.infer<typeof QuarterlyReviewItemMutationSchema>;

export const QuarterlyReviewWaiverMutationSchema = z
  .object({ reason: normalizedText(2_000, 'reason') })
  .strict();
export type QuarterlyReviewWaiverMutation = z.infer<typeof QuarterlyReviewWaiverMutationSchema>;

const QuarterlyReviewItemIdentityShape = {
  id: PositiveIntSchema,
  category: QuarterlyReviewCategorySchema,
  version: PositiveIntSchema,
  etag: z.string().min(1),
} as const;

export const QuarterlyReviewItemSchema = z.discriminatedUnion('state', [
  z
    .object({
      ...QuarterlyReviewItemIdentityShape,
      state: z.literal('pending'),
      note: z.null(),
      reviewedBy: z.null(),
      reviewedAt: z.null(),
      changeReference: z.null(),
      followUp: z.null(),
    })
    .strict(),
  z
    .object({
      ...QuarterlyReviewItemIdentityShape,
      state: z.literal('reviewed_no_change'),
      note: z.string().min(1),
      reviewedBy: PositiveIntSchema,
      reviewedAt: z.string().datetime(),
      changeReference: z.null(),
      followUp: z.null(),
    })
    .strict(),
  z
    .object({
      ...QuarterlyReviewItemIdentityShape,
      state: z.literal('changed'),
      note: z.string().min(1),
      reviewedBy: PositiveIntSchema,
      reviewedAt: z.string().datetime(),
      changeReference: QuarterlyReviewChangeReferenceSchema,
      followUp: QuarterlyReviewFollowUpSchema.nullable(),
    })
    .strict(),
]);

export const QuarterlyReviewCompanySchema = z
  .object({
    id: PositiveIntSchema,
    portfolioCompanyId: PositiveIntSchema,
    companyName: z.string().min(1),
    waivedAt: z.string().datetime().nullable(),
    waivedBy: PositiveIntSchema.nullable(),
    waiverReason: z.string().nullable(),
    version: PositiveIntSchema,
    etag: z.string().min(1),
    items: z.array(QuarterlyReviewItemSchema).length(QUARTERLY_REVIEW_CATEGORIES.length),
  })
  .strict();

export const QuarterlyReviewCompletionSchema = z
  .object({
    companyCount: NonnegativeIntSchema,
    completedCompanyCount: NonnegativeIntSchema,
    pendingCompanyCount: NonnegativeIntSchema,
    pendingItemCount: NonnegativeIntSchema,
  })
  .strict();

export const QuarterlyReviewCurrentBasisResponseSchema = z
  .object({
    contractVersion: z.literal(QUARTERLY_REVIEW_CONTRACT_VERSION),
    fundId: PositiveIntSchema,
    draftId: PositiveIntSchema,
    draftVersion: PositiveIntSchema,
    financialFactsSnapshotId: PositiveIntSchema,
    draftEtag: z.string().min(1),
    requiresRefresh: z.boolean(),
    rosterId: PositiveIntSchema.nullable(),
    companies: z.array(QuarterlyReviewCompanySchema),
    completion: QuarterlyReviewCompletionSchema,
    canFinalize: z.boolean(),
    capabilities: QuarterlyReviewCapabilitiesSchema,
  })
  .strict();
export type QuarterlyReviewCurrentBasisResponse = z.infer<
  typeof QuarterlyReviewCurrentBasisResponseSchema
>;

export const QuarterlyReviewIncompleteDetailsSchema = z
  .object({
    draftId: PositiveIntSchema,
    draftVersion: PositiveIntSchema,
    financialFactsSnapshotId: PositiveIntSchema,
    pendingCompanyCount: NonnegativeIntSchema,
    pendingItemCount: NonnegativeIntSchema,
    companies: z.array(
      z
        .object({
          companyId: PositiveIntSchema,
          pendingCategories: z.array(QuarterlyReviewCategorySchema),
        })
        .strict()
    ),
  })
  .strict();

export const QuarterlyReviewIncompleteErrorSchema = z
  .object({
    error: z.literal('QUARTERLY_REVIEW_INCOMPLETE'),
    message: z.string().min(1).optional(),
    details: QuarterlyReviewIncompleteDetailsSchema,
  })
  .strict();

export const QuarterlyReviewCorruptDetailsSchema = z
  .object({
    draftId: PositiveIntSchema,
    draftVersion: PositiveIntSchema,
    financialFactsSnapshotId: PositiveIntSchema,
    expectedCompanyCount: NonnegativeIntSchema,
    actualCompanyCount: NonnegativeIntSchema,
  })
  .strict();
export const QuarterlyReviewCorruptErrorSchema = z
  .object({
    error: z.literal('QUARTERLY_REVIEW_ROSTER_CORRUPT'),
    message: z.string().min(1).optional(),
    details: QuarterlyReviewCorruptDetailsSchema,
  })
  .strict();

export const QuarterlyReviewCommandResultSchema = z
  .object({
    receiptId: PositiveIntSchema,
    operation: QuarterlyReviewOperationSchema,
    draftId: PositiveIntSchema,
    targetId: PositiveIntSchema,
    resultingDraftVersion: PositiveIntSchema.optional(),
    resultingRowVersion: PositiveIntSchema.optional(),
  })
  .strict();
export type QuarterlyReviewCommandResult = z.infer<typeof QuarterlyReviewCommandResultSchema>;

export const QuarterlyReviewCommandReceiptResponseSchema = z
  .object({ result: QuarterlyReviewCommandResultSchema })
  .strict();

export function isQuarterlyReviewChangeReferenceAllowed(input: {
  category: QuarterlyReviewCategory;
  fundId: number;
  portfolioCompanyId: number;
  path: string;
}): boolean {
  const encodedFundId = String(input.fundId);
  const encodedCompanyId = String(input.portfolioCompanyId);
  switch (input.category) {
    case 'cases_probabilities':
      return input.path === `/fund-model-results/${encodedFundId}/scenarios`;
    case 'kpis':
    case 'valuation_fmv':
      return input.path === `/portfolio/company/${encodedCompanyId}`;
    case 'reserve_plan':
      return input.path === `/portfolio?tab=reserve-planning&fundId=${encodedFundId}`;
    case 'qualitative_risks':
      return input.path === `/fund-model-results/${encodedFundId}/internal-analysis`;
  }
}

export function parseQuarterlyReviewChangeReference(input: {
  category: QuarterlyReviewCategory;
  fundId: number;
  portfolioCompanyId: number;
  value: unknown;
}): QuarterlyReviewChangeReference {
  const parsed = QuarterlyReviewChangeReferenceSchema.parse(input.value);
  if (!isQuarterlyReviewChangeReferenceAllowed({ ...input, path: parsed.path })) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ['path'],
        message: 'Internal route does not match review category, fund, and company.',
      },
    ]);
  }
  return parsed;
}
