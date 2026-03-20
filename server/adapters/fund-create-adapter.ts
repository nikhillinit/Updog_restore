/**
 * Fund Create Adapter
 *
 * Detects POST /api/funds payload format and parses accordingly.
 * Two formats are supported:
 *   - 'canonical': FundCreateV1 shape (name, size, managementFee, ...)
 *   - 'legacy-basics': Legacy wizard format with { basics: { name, size, ... } }
 *   - 'unknown': Neither marker present
 *
 * Precedence: `basics` key -> legacy-basics, `name` key -> canonical, else unknown.
 */

import { FundCreateV1Schema } from '@shared/contracts/fund-create-v1.contract';
import { z } from 'zod';

export type PostFormat = 'canonical' | 'legacy-basics' | 'unknown';

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: z.ZodError };

/**
 * Detect POST body format by inspecting top-level keys.
 * If both `basics` and `name` are present, defaults to legacy-basics
 * (documented precedence) and emits a telemetry warning.
 */
export function detectPostFormat(body: unknown): PostFormat {
  if (body == null || typeof body !== 'object') return 'unknown';
  const keys = Object.keys(body as Record<string, unknown>);

  const hasBasics = keys.includes('basics');
  const hasName = keys.includes('name');

  if (hasBasics && hasName) {
    // Both markers -- legacy-basics takes precedence
    console.warn('create-both-markers', { keys });
    return 'legacy-basics';
  }

  if (hasBasics) return 'legacy-basics';
  if (hasName) return 'canonical';
  return 'unknown';
}

/**
 * Parse body as canonical FundCreateV1 format.
 */
export function parseCanonical(body: unknown): ParseResult<z.infer<typeof FundCreateV1Schema>> {
  const result = FundCreateV1Schema.safeParse(body);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, error: result.error };
}

/**
 * Parse body as legacy-basics format.
 * Uses the existing CreateFundSchema shape (accepts .passthrough() for legacy compat).
 */
export function parseLegacyBasics(body: unknown): ParseResult<Record<string, unknown>> {
  // Legacy format: { basics: { name, size }, strategy?: { stages }, ... }
  // Minimal validation -- just ensure basics.name exists
  const LegacyBasicsSchema = z
    .object({
      basics: z.object({
        name: z.string().min(1),
        size: z.number().optional(),
        modelVersion: z.string().optional(),
      }),
      strategy: z
        .object({
          stages: z.array(
            z.object({
              name: z.string().min(1),
              graduate: z.number(),
              exit: z.number(),
              months: z.number().int().min(1),
            })
          ),
        })
        .optional(),
    })
    .passthrough();

  const result = LegacyBasicsSchema.safeParse(body);
  if (result.success) {
    return { ok: true, data: result.data as Record<string, unknown> };
  }
  return { ok: false, error: result.error };
}
