import { z } from 'zod';

export const PublicMetricAvailabilitySchema = z.enum(['available', 'unavailable']);
export type PublicMetricAvailability = z.infer<typeof PublicMetricAvailabilitySchema>;

export const PublicMetricValueSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().nullable(),
  unit: z.enum(['currency', 'percent', 'multiple', 'count']),
  availability: PublicMetricAvailabilitySchema,
  source: z.string(),
  asOfDate: z.string(),
  calculationVersion: z.string(),
  unavailableReason: z.string().optional(),
});

export type PublicMetricValue = z.infer<typeof PublicMetricValueSchema>;

export const PublicPortfolioCompanySchema = z.object({
  name: z.string(),
  stage: z.string().nullable(),
  moic: z.number().nullable(),
  status: z.string().nullable(),
});

export type PublicPortfolioCompany = z.infer<typeof PublicPortfolioCompanySchema>;

export const PublicShareSnapshotPayloadSchema = z.object({
  payloadVersion: z.literal('public-share-snapshot.v1'),
  snapshotId: z.string(),
  shareId: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  asOfDate: z.string(),
  generatedAt: z.string(),
  metrics: z.array(PublicMetricValueSchema),
  portfolioCompanies: z.array(PublicPortfolioCompanySchema),
  hiddenMetricPolicy: z.object({
    requested: z.array(z.string()),
    applied: z.array(z.string()),
  }),
  sourceCalculationRunIds: z.array(z.string()),
});

export type PublicShareSnapshotPayload = z.infer<typeof PublicShareSnapshotPayloadSchema>;

export const PublicShareResponseSchema = z.object({
  success: z.literal(true),
  share: z.object({
    id: z.string(),
    requirePasskey: z.boolean(),
    customTitle: z.string().nullable(),
    customMessage: z.string().nullable(),
    expiresAt: z.string().nullable(),
    snapshot: PublicShareSnapshotPayloadSchema.optional(),
  }),
});

export type PublicShareResponse = z.infer<typeof PublicShareResponseSchema>;
