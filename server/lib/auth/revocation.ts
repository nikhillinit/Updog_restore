import { eq } from 'drizzle-orm';

import { revokedTokens, users } from '@shared/schema/user';
import { db } from '../../db';

export class TokenRevokedError extends Error {
  constructor() {
    super('Token has been revoked');
    this.name = 'TokenRevokedError';
  }
}

export class UserInactiveError extends Error {
  constructor() {
    super('User is inactive');
    this.name = 'UserInactiveError';
  }
}

export class TokenUsabilityCheckError extends Error {
  constructor() {
    super('Token usability check failed');
    this.name = 'TokenUsabilityCheckError';
  }
}

function parseUserId(sub: string | undefined): number | null {
  if (typeof sub !== 'string' || !/^[1-9]\d*$/.test(sub)) {
    return null;
  }

  const userId = Number(sub);
  return Number.isSafeInteger(userId) ? userId : null;
}

export async function assertTokenUsable(claims: {
  sub?: string | undefined;
  jti?: string | undefined;
}): Promise<void> {
  if (typeof claims.jti === 'string' && claims.jti.length > 0) {
    let revoked: Array<{ jti: string }>;
    try {
      revoked = await db
        .select({ jti: revokedTokens.jti })
        .from(revokedTokens)
        .where(eq(revokedTokens.jti, claims.jti))
        .limit(1);
    } catch {
      // Drizzle errors include bound parameters; replace them before auth
      // boundaries log the message so a jti can never reach application logs.
      throw new TokenUsabilityCheckError();
    }

    if (revoked.length > 0) {
      throw new TokenRevokedError();
    }
  }

  const userId = parseUserId(claims.sub);
  if (userId === null) {
    return;
  }

  let matchingUsers: Array<{ isActive: boolean }>;
  try {
    matchingUsers = await db
      .select({ isActive: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
  } catch {
    throw new TokenUsabilityCheckError();
  }

  // Missing users are allowed for legacy/synthetic subjects. A present,
  // explicitly inactive identity is denied on its next verified request.
  if (matchingUsers[0]?.isActive === false) {
    throw new UserInactiveError();
  }
}

export async function revokeToken(input: {
  jti: string;
  userId: number;
  expiresAt: Date;
  reason?: string;
}): Promise<void> {
  await db.insert(revokedTokens).values(input).onConflictDoNothing();
}
