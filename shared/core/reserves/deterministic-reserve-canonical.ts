/**
 * Canonical serialization and cache-key identity for the
 * DeterministicReserveEngine (Tranche 4, ADR-045).
 *
 * This lives in its own module (rather than inside the substrate adapter, as
 * the tranche plan sketched) because BOTH sides need it and importing in
 * either direction alone would be circular: the engine consumes the cache-key
 * function and the adapter consumes the serializer for its input hash and
 * value projection. The adapter re-exports everything here, so the adapter
 * module still exposes the serializer as planned.
 *
 * Serialization rules (JSON-safe projection):
 * - Date instances become millisecond-precision ISO-8601 UTC strings;
 * - undefined-valued object properties are stripped;
 * - arrays are mapped element-wise; primitives pass through untouched.
 *
 * Cache-key identity: canonicalSha256 (sorted keys, canonical JSON, sha256
 * hex) over a domain-separated envelope of the canonicalized input. This
 * replaces the pre-fix key, which base64-JSONed only 5 coarse fields
 * (portfolioCount/availableReserves/totalFundSize/scenarioType/timeHorizon)
 * so equal-length portfolios with matching scalars collided and the second
 * portfolio silently received the first portfolio's allocations.
 */

import { canonicalSha256 } from '../../lib/canonical-hash';

export const DETERMINISTIC_RESERVE_CACHE_KEY_DOMAIN = 'updog.reserve-deterministic.cache-key';

/**
 * Project a value to JSON-safe form: Dates to ISO-8601 UTC strings,
 * undefined properties stripped, arrays mapped, primitives untouched.
 */
export function serializeDeterministicReserveInput(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeDeterministicReserveInput);
  }
  const record = value as Record<string, unknown>;
  const serialized: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    const child = record[key];
    if (child !== undefined) {
      serialized[key] = serializeDeterministicReserveInput(child);
    }
  }
  return serialized;
}

/** Complete canonical input identity for the engine's calculation cache. */
export function computeDeterministicReserveCacheKey(input: unknown): string {
  return canonicalSha256({
    domain: DETERMINISTIC_RESERVE_CACHE_KEY_DOMAIN,
    input: serializeDeterministicReserveInput(input),
  });
}
