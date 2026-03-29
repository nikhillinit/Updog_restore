/**
 * Fund Create Adapter
 *
 * Detects POST /api/funds payload format and parses accordingly.
 * Runtime handling:
 *   - 'canonical': FundCreateV1 shape (name, size, managementFee, ...)
 *   - 'legacy-basics': detected only so the route can reject it explicitly
 *   - 'unknown': Neither marker present
 *
 * Precedence: `basics` key -> legacy-basics, `name` key -> canonical, else unknown.
 */

import { FundCreateV1Schema } from '@shared/contracts/fund-create-v1.contract';
import { z } from 'zod';
import { logger } from '../lib/logger';

export type PostFormat = 'canonical' | 'legacy-basics' | 'unknown';

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: z.ZodError };

/**
 * Detect POST body format by inspecting top-level keys.
 * If both `basics` and `name` are present, defaults to legacy-basics
 * (documented precedence) so the route can reject the legacy marker.
 */
export function detectPostFormat(body: unknown): PostFormat {
  if (body == null || typeof body !== 'object') return 'unknown';
  const keys = Object.keys(body as Record<string, unknown>);

  const hasBasics = keys.includes('basics');
  const hasName = keys.includes('name');

  if (hasBasics && hasName) {
    // Both markers -- legacy-basics takes precedence
    logger.warn({ keys }, 'Fund create payload included both canonical and legacy markers');
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
