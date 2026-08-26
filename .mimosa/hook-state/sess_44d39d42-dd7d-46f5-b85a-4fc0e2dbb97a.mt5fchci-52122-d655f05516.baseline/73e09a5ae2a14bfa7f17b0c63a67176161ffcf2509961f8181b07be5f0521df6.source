/**
 * Zod compatibility layer for resolving TypeScript constraint issues
 * Use this for all schema definitions to ensure consistent typing
 */
import { z, type ZodTypeAny } from 'zod';

export type AnyZod = ZodTypeAny;

/**
 * Identity function to satisfy generic constraints
 * Use when TypeScript complains about ZodType mismatches
 */
export const asObject = <T extends AnyZod>(schema: T): T => schema;

/**
 * Helper for creating object schemas with better type inference
 * Prevents issues with generic constraint mismatches
 */
export function createSchema<T extends Record<string, unknown>>(
  shape: { [K in keyof T]: AnyZod }
): z.ZodObject<{ [K in keyof T]: AnyZod }> {
  return z.object(shape);
}

/**
 * Safe schema composition helper
 * Use for extending schemas without type conflicts
 */
export function extendSchema<T extends z.ZodRawShape, U extends z.ZodRawShape>(
  base: z.ZodObject<T>,
  extension: U
) {
  return base.extend(extension);
}

/**
 * Array schema helper with proper typing
 */
export function arrayOf<T extends AnyZod>(schema: T): z.ZodArray<T> {
  return z.array(schema);
}

/**
 * Optional field helper
 */
export function optional<T extends AnyZod>(schema: T): z.ZodOptional<T> {
  return schema.optional();
}

/**
 * Nullable field helper
 */
export function nullable<T extends AnyZod>(schema: T): z.ZodNullable<T> {
  return schema.nullable();
}