/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import crypto from 'node:crypto';

export function stableStringify(obj: unknown): string {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj as any).sort();
    const o: any = {};
    for (const k of keys) o[k] = (obj as any)[k];
    return JSON.stringify(o);
  }
  return JSON.stringify(obj);
}

export function hashPayload(obj: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(obj)).digest('hex').slice(0, 32);
}
