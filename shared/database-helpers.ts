/**
 * Type-Safe Database Payload Helpers
 *
 * These helpers eliminate the need for 'as any' when working with JSONB columns.
 * They provide proper type inference and validation for database payloads.
 */

import { z } from 'zod';

/**
 * Generic JSONB column type that preserves type information
 */
export type JsonbColumn<T> = T;

/**
 * Type-safe JSONB serializer with validation
 */
export function toJsonb<T>(schema: z.ZodSchema<T>, data: T): JsonbColumn<T> {
  // Validate the data matches the schema
  const validated = schema.parse(data);
  // Return the validated data (Drizzle will handle JSON serialization)
  return validated as JsonbColumn<T>;
}

/**
 * Type-safe JSONB deserializer with validation
 */
export function fromJsonb<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Type-safe JSONB deserializer without validation (for trusted data)
 */
export function unsafeFromJsonb<T>(data: unknown): T {
  return data as T;
}

/**
 * Helper to create a typed JSONB column value
 * Use when you want type safety but don't need runtime validation
 */
export function typedJsonb<T>(data: T): JsonbColumn<T> {
  return data as JsonbColumn<T>;
}

// Example schemas for common JSONB payloads

// Reserve calculation payload schema
export const reservePayloadSchema = z.object({
  totalAllocation: z.number(),
  avgConfidence: z.number(),
  byCompany: z.array(z.object({
    companyId: z.string(),
    allocation: z.number(),
    confidence: z.number(),
  })),
});

export type ReservePayload = z.infer<typeof reservePayloadSchema>;

// Pacing calculation payload schema
export const pacingPayloadSchema = z.object({
  totalQuarters: z.number(),
  avgQuarterlyDeployment: z.number(),
  marketCondition: z.enum(['bull', 'bear', 'neutral']),
  deployments: z.array(z.object({
    quarter: z.number(),
    deployment: z.number(),
    cumulative: z.number(),
  })),
});

export type PacingPayload = z.infer<typeof pacingPayloadSchema>;

// Fund snapshot metadata schema
export const snapshotMetadataSchema = z.object({
  portfolioCount: z.number().optional(),
  totalQuarters: z.number().optional(),
  avgQuarterlyDeployment: z.number().optional(),
  marketCondition: z.string().optional(),
  engineRuntime: z.number().optional(),
}).passthrough(); // Allow additional fields

export type SnapshotMetadata = z.infer<typeof snapshotMetadataSchema>;

// Fund config schema (simplified example)
export const fundConfigSchema = z.object({
  fundId: z.number(),
  name: z.string(),
  size: z.string(),
  strategy: z.string().optional(),
  // Add more fields as needed
}).passthrough();

export type FundConfigPayload = z.infer<typeof fundConfigSchema>;

/**
 * Helper function to safely extract and validate JSONB data
 */
export function validateJsonbPayload<T>(
  schema: z.ZodSchema<T>,
  payload: unknown,
  fieldName: string = 'payload'
): T {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid ${fieldName}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    throw error;
  }
}

/**
 * Helper to safely access nested JSONB properties
 */
export function getJsonbProperty<T>(
  obj: unknown,
  path: string[],
  defaultValue?: T
): T | undefined {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== 'object') {
      return defaultValue;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return (current as T) ?? defaultValue;
}