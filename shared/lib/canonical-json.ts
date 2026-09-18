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

import { canonicalJson } from './canonical-json-serialization';
export { canonicalJson } from './canonical-json-serialization';

export function sha256CanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
