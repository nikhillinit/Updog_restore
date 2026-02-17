import crypto from 'node:crypto';

export function stableStringify(obj: unknown): string {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const rec = obj as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    const o: Record<string, unknown> = {};
    for (const k of keys) o[k] = rec[k];
    return JSON.stringify(o);
  }
  return JSON.stringify(obj);
}

export function hashPayload(obj: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(obj)).digest('hex').slice(0, 32);
}
