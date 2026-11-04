import { z } from 'zod';
import {
  ACTUALS_LEDGER_MAX_BYTES,
  ActualsPilotCentExactMoneySchema,
  CanonicalBase64Schema,
} from './actuals-pilot.contract';

export const VEHICLE_ONBOARDING_VERSION = 'vehicle-onboarding/1.0.0' as const;
export const VEHICLE_COMMITMENT_ATTESTATION = 'source-supports-commitment/1.0.0' as const;
export const VEHICLE_ONBOARDING_MAX_SOURCE_BYTES = ACTUALS_LEDGER_MAX_BYTES;

const SourceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !/[\p{Cc}\\/]/u.test(value));
const BinarySourceSchema = z
  .object({
    sourceType: z.enum(['csv', 'xlsx']),
    fileName: SourceNameSchema,
    payloadBase64: CanonicalBase64Schema.refine(
      (value) => value.length <= Math.ceil(VEHICLE_ONBOARDING_MAX_SOURCE_BYTES / 3) * 4,
      'Source exceeds the 120 KiB limit.'
    ),
  })
  .strict();
const TextSourceSchema = z
  .object({
    sourceType: z.enum(['manual', 'structured_paste']),
    content: z.string().min(1).max(VEHICLE_ONBOARDING_MAX_SOURCE_BYTES),
  })
  .strict();

export const VehicleOnboardingRequestSchema = z
  .object({
    contractVersion: z.literal(VEHICLE_ONBOARDING_VERSION),
    vehicleSlug: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(1).max(128),
    committedCapital: ActualsPilotCentExactMoneySchema.transform((value) => {
      const [whole, fraction = ''] = value.split('.');
      return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
    }),
    source: z.union([BinarySourceSchema, TextSourceSchema]),
    sourceLocator: z.string().trim().min(1).max(1024),
    attestation: z.literal(VEHICLE_COMMITMENT_ATTESTATION),
  })
  .strict();

export const VehicleOnboardingKeySchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

export const VehicleOnboardingReceiptSchema = z
  .object({
    contractVersion: z.literal(VEHICLE_ONBOARDING_VERSION),
    commandId: z.number().int().positive(),
    fundId: z.number().int().positive(),
    vehicleId: z.number().int().positive(),
    vehicleSlug: z.string(),
    name: z.string(),
    vehicleType: z.literal('main_fund'),
    currency: z.literal('USD'),
    status: z.literal('active'),
    committedCapital: ActualsPilotCentExactMoneySchema,
    sourceArtifactId: z.number().int().positive(),
    sourceArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceLocator: z.string(),
    sourcePurgeAfter: z.string().datetime(),
    attestation: z.literal(VEHICLE_COMMITMENT_ATTESTATION),
    outcome: z.enum(['created', 'existing']),
    actorId: z.number().int().positive(),
    declaredAt: z.string().datetime(),
  })
  .strict();

export type VehicleOnboardingRequest = z.infer<typeof VehicleOnboardingRequestSchema>;
export type VehicleOnboardingReceipt = z.infer<typeof VehicleOnboardingReceiptSchema>;

/** The closed versioned schema fixes field order even after a JSONB round trip. */
export function serializeVehicleOnboardingReceipt(receipt: unknown): string {
  return JSON.stringify(VehicleOnboardingReceiptSchema.parse(receipt));
}
