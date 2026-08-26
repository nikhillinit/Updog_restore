import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { extractRequestCredential } from '../../../server/lib/auth/request-credentials';

function requestWithHeaders(headers: Record<string, string | undefined>): Request {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
  );
  return {
    headers: normalized,
    header(name: string) {
      return normalized[name.toLowerCase()];
    },
  } as unknown as Request;
}

describe('canonical request credentials', () => {
  it('returns none when no user credential is present', () => {
    expect(extractRequestCredential(requestWithHeaders({}))).toEqual({ kind: 'none' });
  });

  it('extracts one strict Bearer credential', () => {
    expect(
      extractRequestCredential(requestWithHeaders({ authorization: 'Bearer machine.jwt.value' }))
    ).toEqual({ kind: 'bearer', token: 'machine.jwt.value' });
  });

  it('extracts one browser session cookie', () => {
    expect(
      extractRequestCredential(
        requestWithHeaders({ cookie: 'theme=dark; updog.session=browser.jwt.value; sidebar=open' })
      )
    ).toEqual({ kind: 'cookie', token: 'browser.jwt.value' });
  });

  it('rejects simultaneous cookie and Bearer credentials even when values match', () => {
    expect(
      extractRequestCredential(
        requestWithHeaders({
          authorization: 'Bearer same.jwt.value',
          cookie: 'updog.session=same.jwt.value',
        })
      )
    ).toEqual({ kind: 'ambiguous' });
  });

  it('rejects duplicate browser session cookie names', () => {
    expect(
      extractRequestCredential(
        requestWithHeaders({ cookie: 'updog.session=first; updog.session=second' })
      )
    ).toMatchObject({ kind: 'invalid' });
  });

  it('rejects malformed cookie percent encoding', () => {
    expect(
      extractRequestCredential(requestWithHeaders({ cookie: 'updog.session=%E0%A4%A' }))
    ).toMatchObject({ kind: 'invalid' });
  });

  it.each([
    'Bearer',
    'Bearer ',
    'Bearer two tokens',
    'bearer lower-case-is-not-the-locked-contract',
    'Basic dXNlcjpwYXNz',
  ])('rejects malformed Bearer syntax: %s', (authorization) => {
    expect(extractRequestCredential(requestWithHeaders({ authorization }))).toMatchObject({
      kind: 'invalid',
    });
  });
});
