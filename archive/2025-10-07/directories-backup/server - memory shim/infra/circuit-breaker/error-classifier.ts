export function isSystemError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as any).code || '';
  const patterns = [/timeout/i, /ETIMEDOUT/, /ECONNRESET/, /ECONNREFUSED/, /EHOSTUNREACH/, /EPIPE/, /network/i];
  return patterns.some((p) => p.test(error.message) || p.test(code));
}

export function classifyError(err: unknown): 'system'|'logical' {
  return isSystemError(err) ? 'system' : 'logical';
}
