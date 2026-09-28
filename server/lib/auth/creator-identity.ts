import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { getConfig } from '../../config';
import { getUserFundGrants } from './credentials';
import { getConfiguredJwtAlgorithm } from './jwt';
import { setBrowserSessionCookies } from './csrf';

const MAX_RENEWED_EXP = 8_640_000_000_000;

function numericIdentity(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Return only the verified numeric actor identity used for fund ownership. */
export function creatorUserIdFromRequest(req: Request): number | undefined {
  return (
    numericIdentity(req.authCredential?.claims.sub) ??
    numericIdentity(req.user?.id) ??
    numericIdentity(req.user?.sub) ??
    numericIdentity(req.context?.userId)
  );
}

/**
 * Stable verified subject for idempotency request hashes. Unlike
 * creatorUserIdFromRequest it keeps non-numeric subjects distinct, so two
 * actors never share one receipt identity.
 */
export function actorSubjectFromRequest(req: Request): string | null {
  const subject =
    req.authCredential?.claims.sub ?? req.user?.sub ?? req.user?.id ?? req.context?.userId;
  return subject === undefined || subject === null || subject === '' ? null : String(subject);
}

function claimsRenewedForFund(
  claims: NonNullable<Request['authCredential']>['claims'],
  fundIds: number[]
): Record<string, unknown> {
  return {
    sub: claims.sub,
    ...(claims.email !== undefined && { email: claims.email }),
    ...(claims.role !== undefined && { role: claims.role }),
    ...(claims['orgId'] !== undefined && { orgId: claims['orgId'] }),
    ...(claims['org_id'] !== undefined && { org_id: claims['org_id'] }),
    ...(claims['lpId'] !== undefined && { lpId: claims['lpId'] }),
    fundIds: [...new Set(fundIds)],
  };
}

function signRenewedSessionToken(
  claims: Record<string, unknown>,
  jti: string,
  exp: number
): string {
  const cfg = getConfig();
  return jwt.sign({ ...claims, jti, exp }, cfg.JWT_SECRET!, {
    algorithm: 'HS256',
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
  });
}

export type CredentialRenewal =
  | { renewedAccessToken?: string; credentialRenewal?: never }
  | { renewedAccessToken?: never; credentialRenewal: 'reauth_required' };

/**
 * Renew the credential that authenticated a newly-created fund. Renewal
 * refreshes fund grants inside the presented login session: the token keeps
 * the presented jti and exp, so it never creates a new session identity or
 * extends the session, and revoking that jti at logout revokes every renewal.
 * Renewal is best-effort because creation has already committed; failures
 * become an explicit reauthentication marker rather than changing the 201
 * result.
 */
export async function renewCreationCredential(
  req: Request,
  res: Response,
  fundId: number,
  creatorUserId: number
): Promise<CredentialRenewal> {
  const credential = req.authCredential;
  if (!credential) return {};

  const priorSetCookie = res.getHeader('Set-Cookie');
  try {
    // jwt.ts currently signs both token forms symmetrically. Never attempt that
    // operation when the active verifier is RS256/JWKS-only.
    if (getConfiguredJwtAlgorithm() !== 'HS256') {
      if (credential.source === 'bearer') res.setHeader('Cache-Control', 'no-store');
      return { credentialRenewal: 'reauth_required' };
    }

    const role = credential.claims.role;
    const fundIds =
      role === 'admin' || role === 'service'
        ? []
        : [...(await getUserFundGrants(creatorUserId)), fundId];
    const claims = claimsRenewedForFund(credential.claims, fundIds);
    const { jti, exp } = credential.claims;
    if (
      typeof jti !== 'string' ||
      jti.length === 0 ||
      jti.length > 64 ||
      typeof exp !== 'number' ||
      !Number.isSafeInteger(exp) ||
      exp <= Math.floor(Date.now() / 1000) ||
      exp > MAX_RENEWED_EXP
    ) {
      if (credential.source === 'bearer') res.setHeader('Cache-Control', 'no-store');
      return { credentialRenewal: 'reauth_required' };
    }

    if (credential.source === 'cookie') {
      const token = signRenewedSessionToken(claims, jti, exp);
      setBrowserSessionCookies(res, token, jti);
      return {};
    }

    res.setHeader('Cache-Control', 'no-store');
    return { renewedAccessToken: signRenewedSessionToken(claims, jti, exp) };
  } catch {
    // Do not leave a partially written browser session behind if cookie
    // serialization failed after one of its headers was appended.
    try {
      if (credential.source === 'cookie') {
        if (priorSetCookie === undefined) res.removeHeader('Set-Cookie');
        else res.setHeader('Set-Cookie', priorSetCookie);
      } else {
        res.setHeader('Cache-Control', 'no-store');
      }
    } catch {
      // Response cleanup is best-effort; creation result remains authoritative.
    }
    return { credentialRenewal: 'reauth_required' };
  }
}
