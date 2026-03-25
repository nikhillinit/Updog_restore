export type ErrorClass = 'system' | 'logical';

function getErrorCode(err: Error): string {
  if (!('code' in err)) {
    return '';
  }

  const code = err.code;
  return typeof code === 'string' ? code.toLowerCase() : '';
}

export function classifyError(err: unknown): ErrorClass {
  if (!(err instanceof Error)) return 'logical';
  const msg = (err.message || '').toLowerCase();
  const code = getErrorCode(err);
  const patterns: readonly RegExp[] = [
    /timeout/,
    /etimedout/,
    /econnreset/,
    /econnrefused/,
    /ehostunreach/,
    /epipe/,
    /network/,
  ];
  return patterns.some((pattern) => pattern.test(msg) || pattern.test(code)) ? 'system' : 'logical';
}
