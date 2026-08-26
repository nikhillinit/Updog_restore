import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { getUserFundGrants } from './credentials';
import {
  getConfiguredJwtAlgorithm,
  signBrowserSessionToken,
  signToken,
} from './jwt';
import { setBrowserSessionCookies } from './csrf';

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

export type CredentialRenewal =
  | { renewedAccessToken?: string; credentialRenewal?: never }
  | { renewedAccessToken?: never; credentialRenewal: 'reauth_required' };

/**
 * Renew the credential that authenticated a newly-created fund. Renewal is
 * best-effort because creation has already committed; failures become an
 * explicit reauthentication marker rather than changing the 201 result.
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

    if (credential.source === 'cookie') {
      const token = signBrowserSessionToken(claims);
      const decoded = jwt.decode(token);
      if (!decoded || typeof decoded === 'string' || typeof decoded.jti !== 'string') {
        throw new Error('Failed to create renewed browser session');
      }
      setBrowserSessionCookies(res, token, decoded.jti);
      return {};
    }

    res.setHeader('Cache-Control', 'no-store');
    return { renewedAccessToken: signToken(claims) };
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
