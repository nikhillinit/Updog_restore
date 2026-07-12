import jwt, { type JwtPayload } from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { signToken } from '../../../server/lib/auth/jwt';

function decodeClaims(token: string): JwtPayload {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string') {
    throw new Error('Expected an object JWT payload');
  }
  return decoded;
}

describe('signToken jti', () => {
  it('mints a non-empty jti claim', () => {
    const claims = decodeClaims(signToken({ sub: 'jti-test-user' }));

    expect(claims.jti).toEqual(expect.any(String));
    expect(claims.jti).not.toBe('');
  });

  it('mints a unique jti for each token', () => {
    const firstClaims = decodeClaims(signToken({ sub: 'jti-test-user' }));
    const secondClaims = decodeClaims(signToken({ sub: 'jti-test-user' }));

    expect(firstClaims.jti).not.toBe(secondClaims.jti);
  });
});
