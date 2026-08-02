const HTTP_WHITESPACE_AT_EDGES = /^[\t ]+|[\t ]+$/g;
const RFC_TOKEN_SAFE_ASCII = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export type InternalEconomicsIdempotencyKeyParseResult =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'valid'; value: string }>;

/**
 * Parses the raw Node/Express header value for the internal-economics command.
 *
 * Only SP and HTAB are trimmed because those are HTTP optional whitespace. The
 * accepted grammar is ASCII-only, so JavaScript character length and UTF-8 byte
 * length are identical for every persistable key.
 */
export function parseInternalEconomicsIdempotencyKey(
  rawHeader: unknown
): InternalEconomicsIdempotencyKeyParseResult {
  if (rawHeader === undefined) return { kind: 'missing' };
  if (typeof rawHeader !== 'string') return { kind: 'invalid' };

  const value = rawHeader.replace(HTTP_WHITESPACE_AT_EDGES, '');
  if (
    value.length === 0 ||
    value.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    !RFC_TOKEN_SAFE_ASCII.test(value)
  ) {
    return { kind: 'invalid' };
  }

  return { kind: 'valid', value };
}
