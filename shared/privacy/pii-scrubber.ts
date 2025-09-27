// shared/privacy/pii-scrubber.ts
const patterns: Record<string, RegExp> = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  ein: /\b\d{2}-\d{7}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
};

export function scrubPII(value: unknown): any {
  if (value == null) return value;
  if (typeof value === 'string') {
    return Object.values(patterns).reduce((s: any, re: any) => s.replace(re, '[REDACTED]'), value);
  }
  if (Array.isArray(value)) return value.map(scrubPII);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubPII(v)]));
  }
  return value;
}
