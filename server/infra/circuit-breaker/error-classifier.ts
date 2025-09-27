export type ErrorClass = 'system' | 'logical';

export function classifyError(err: unknown): ErrorClass {
  if (!(err instanceof Error)) return 'logical';
  const msg = (err.message || '').toLowerCase();
  const code = (err as any).code || '';
  const patterns = [/timeout/, /etimedout/, /econnreset/, /econnrefused/, /ehostunreach/, /epipe/, /network/];
  return patterns.some((p: any) => p.test(msg) || p.test(String(code).toLowerCase())) ? 'system' : 'logical';
}
