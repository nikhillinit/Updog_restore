import { createHash } from 'node:crypto';

export const INTERNAL_ECONOMICS_TEST_ORACLE_VERSION = 'internal-economics-test-oracle/1.0.0';

function canonicalizeSorted(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeSorted);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) result[key] = canonicalizeSorted(child);
  }
  return result;
}

export function oracleHash(value: unknown): string {
  const canonical = canonicalizeSorted(value);
  return createHash('sha256').update(JSON.stringify(canonical), 'utf-8').digest('hex');
}

export interface RefusalShape {
  ok: false;
  refusal: {
    ok: false;
    code: string;
    stage: string;
    message: string;
  };
}

export function isValidRefusal(result: unknown): result is RefusalShape {
  if (typeof result !== 'object' || result === null) return false;
  const r = result as Record<string, unknown>;
  if (r['ok'] !== false) return false;
  if (typeof r['refusal'] !== 'object' || r['refusal'] === null) return false;
  const ref = r['refusal'] as Record<string, unknown>;
  return (
    ref['ok'] === false &&
    typeof ref['code'] === 'string' &&
    typeof ref['stage'] === 'string' &&
    typeof ref['message'] === 'string'
  );
}
