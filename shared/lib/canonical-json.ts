/**
 * Pure canonical JSON serialization and hashing.
 *
 * Moved unchanged from
 * server/services/lp-reporting/report-package-json-export-service.ts so the
 * release canary can recompute stored-artifact content hashes without
 * importing the server service graph. This module must stay side-effect free:
 * no database, environment, network, or file access.
 *
 * @module shared/lib/canonical-json
 */

import { createHash } from 'node:crypto';

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Cannot canonicalize non-finite numbers.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    if (!isPlainObject(value)) {
      throw new TypeError('Cannot canonicalize non-plain objects.');
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        const fieldValue = value[key];
        if (fieldValue === undefined) {
          throw new TypeError(`Cannot canonicalize undefined field "${key}".`);
        }
        return `${JSON.stringify(key)}:${canonicalJson(fieldValue)}`;
      })
      .join(',')}}`;
  }
  throw new TypeError(`Cannot canonicalize ${typeof value} values.`);
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
