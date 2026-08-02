import { describe, expect, it } from 'vitest';

import { parseInternalEconomicsIdempotencyKey } from '../../../server/lib/internal-economics-idempotency-key';

describe('internal-economics canonical Idempotency-Key parser', () => {
  it('distinguishes a missing header from a valid trimmed stored identity', () => {
    expect(parseInternalEconomicsIdempotencyKey(undefined)).toEqual({ kind: 'missing' });
    expect(parseInternalEconomicsIdempotencyKey(' \tretry-key_1\t ')).toEqual({
      kind: 'valid',
      value: 'retry-key_1',
    });
  });

  it('accepts every RFC-token-safe ASCII character and measures the trimmed identity', () => {
    const token = "AZaz09!#$%&'*+-.^_`|~";
    const maxLengthToken = 'a'.repeat(128);

    expect(parseInternalEconomicsIdempotencyKey(token)).toEqual({ kind: 'valid', value: token });
    expect(parseInternalEconomicsIdempotencyKey(` \t${maxLengthToken}\t `)).toEqual({
      kind: 'valid',
      value: maxLengthToken,
    });
    expect(Buffer.byteLength(maxLengthToken, 'utf8')).toBe(maxLengthToken.length);
  });

  it.each([
    ['', 'empty'],
    [' \t ', 'empty after HTTP whitespace trimming'],
    ['key with space', 'internal whitespace'],
    ['key\twith-tab', 'internal HTTP whitespace'],
    ['key\r', 'control character'],
    ['\nkey', 'control character'],
    ['clé', 'non-ASCII character'],
    ['key,other', 'duplicate header join separator'],
    ['"quoted"', 'quote separator'],
    ['path/key', 'slash separator'],
    ['path\\key', 'backslash separator'],
    ['a'.repeat(129), 'overlong trimmed identity'],
  ])('rejects %s (%s)', (raw) => {
    expect(parseInternalEconomicsIdempotencyKey(raw)).toEqual({ kind: 'invalid' });
  });

  it('rejects duplicate and non-string raw header values rather than choosing one', () => {
    expect(parseInternalEconomicsIdempotencyKey(['retry-one', 'retry-two'])).toEqual({
      kind: 'invalid',
    });
    expect(parseInternalEconomicsIdempotencyKey([])).toEqual({ kind: 'invalid' });
    expect(parseInternalEconomicsIdempotencyKey(null)).toEqual({ kind: 'invalid' });
  });
});
