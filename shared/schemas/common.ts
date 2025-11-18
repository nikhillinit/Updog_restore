/**
 * Common Reusable Zod Schemas
 *
 * This file provides type-safe helper schemas for consistent validation
 * across the application. These schemas match database column types and
 * prevent common type mismatches (e.g., bigint vs number).
 *
 * Usage:
 * ```typescript
 * import { DbVersionSchema, DbTimestampMillisSchema } from './common';
 *
 * const MySchema = z.object({
 *   version: DbVersionSchema,
 *   createdAtMs: DbTimestampMillisSchema,
 * });
 * ```
 *
 * @module shared/schemas/common
 */

import { z } from 'zod';

/**
 * Database identifier schema (string UUID)
 * Use for primary keys and foreign keys stored as UUIDs
 *
 * Example: `id: DbIdentifierSchema`
 */
export const DbIdentifierSchema = z.string().uuid();

/**
 * Database version field schema (bigint for optimistic locking)
 * Use for all version fields that map to database BIGINT columns
 *
 * Why bigint: Prevents precision loss when JavaScript number exceeds Number.MAX_SAFE_INTEGER
 * (2^53 - 1). Using string representation for JSON transport is safer.
 *
 * Database type: BIGINT (Drizzle: bigint("version", { mode: "bigint" }))
 * Zod type: z.string() for JSON safety, or z.bigint() if native bigint transport supported
 *
 * Example: `version: DbVersionSchema`
 */
export const DbVersionSchema = z.string().transform((s) => BigInt(s));

/**
 * Alternative: Native bigint schema (use if tooling supports bigint in JSON)
 *
 * Example: `version: DbVersionBigIntSchema`
 */
export const DbVersionBigIntSchema = z.bigint().min(1n);

/**
 * Unix timestamp in milliseconds schema (bigint)
 * Use for high-precision timestamps stored as milliseconds since epoch
 *
 * Database type: BIGINT
 * Zod type: z.coerce.bigint() to handle string or number inputs
 *
 * Example: `createdAtMs: DbTimestampMillisSchema`
 */
export const DbTimestampMillisSchema = z.coerce.bigint();

/**
 * Integer ID schema (for serial/integer database columns)
 * Use for auto-increment IDs (fundId, companyId, investmentId)
 *
 * Database type: INTEGER or SERIAL
 * Zod type: z.number().int().positive()
 *
 * Example: `fundId: DbIntegerIdSchema`
 */
export const DbIntegerIdSchema = z.number().int().positive();

/**
 * Defensive BigInt schema for cent-denominated financial values
 * Prevents silent coercion of invalid inputs like "123.45", "abc", "Infinity"
 * Requires non-negative integer strings only
 *
 * Database type: BIGINT (for financial precision)
 * Zod type: String with regex validation + transform to bigint
 *
 * Example: `amountCents: BigIntCentsSchema`
 */
export const BigIntCentsSchema = z
  .string()
  .regex(/^\d+$/, 'Must be non-negative integer string')
  .transform((s) => BigInt(s))
  .pipe(z.bigint().min(0n));

/**
 * Example usage demonstrating all helper schemas
 */
export const ExampleEntitySchema = z.object({
  // UUIDs
  id: DbIdentifierSchema,
  parentId: DbIdentifierSchema.nullable(),

  // Integer IDs (auto-increment)
  fundId: DbIntegerIdSchema,
  companyId: DbIntegerIdSchema.optional(),

  // Version field for optimistic locking
  version: DbVersionBigIntSchema, // Or DbVersionSchema if using string transport

  // Timestamps
  createdAtMs: DbTimestampMillisSchema.optional(),

  // Financial values
  costBasisCents: BigIntCentsSchema,
});

export type ExampleEntity = z.infer<typeof ExampleEntitySchema>;
