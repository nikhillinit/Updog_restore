import type { NextFunction, Request, Response } from 'express';

import { parseFundIdParam } from '@shared/number';

import { resolveFundScope } from './fund-scope';
import { userFromClaims, verifyRequestCredential } from './jwt';
import { principalFromUser } from './principal';
import { RequestCredentialError } from './request-credentials';

function assertTokenRequiredOutsideDevelopment(): void {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(`Missing auth credential while enforcing provided fund scope in ${nodeEnv}`);
  }
}

function denyFundAccess(res: Response, fundId: number): void {
  res.status(403).json({
    error: 'Forbidden',
    code: 'FUND_ACCESS_DENIED',
    message: `You do not have access to fund ${fundId}`,
  });
}

export async function enforceProvidedFundScope(
  req: Request,
  res: Response,
  fundId: number
): Promise<boolean> {
  try {
    const verified = await verifyRequestCredential(req);
    if (verified === null) {
      assertTokenRequiredOutsideDevelopment();
      if (req.user && resolveFundScope(principalFromUser(req.user), fundId) === 'deny') {
        denyFundAccess(res, fundId);
        return false;
      }
      return true;
    }

    const existingUser = req.user;
    const verifiedUser = userFromClaims(req, verified.claims);

    req.user = {
      ...existingUser,
      ...verifiedUser,
    };

    if (resolveFundScope(principalFromUser(req.user), fundId) !== 'allow') {
      denyFundAccess(res, fundId);
      return false;
    }

    return true;
  } catch (error) {
    if (error instanceof RequestCredentialError) {
      res.status(401).json({ error: error.code });
      return false;
    }
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authentication credential',
    });
    return false;
  }
}

/*
 * The no-credential development fallback is intentionally retained for direct
 * route tests and the configured local bypass. Production remains fail-closed.
 */
function developmentVerifiedFundScope(req: Request): VerifiedFundScope {
  if (req.user) {
    const fundIds = req.user.fundIds ?? [];
    const principal = principalFromUser(req.user);
    const unrestricted = principal.kind === 'admin' || principal.kind === 'service';
    return { unrestricted, fundIds };
  }
  return { unrestricted: true, fundIds: [] };
}

/*
 * Keep the implementation below close to enforceProvidedFundScope so both
 * callers share the exact credential verifier and role-aware user projection.
 */
async function verifiedFundScopeFromCredential(
  req: Request
): Promise<VerifiedFundScope | null | undefined> {
  const verified = await verifyRequestCredential(req);
  if (verified === null) {
    assertTokenRequiredOutsideDevelopment();
    return developmentVerifiedFundScope(req);
  }

  const verifiedUser = userFromClaims(req, verified.claims);
  req.user = { ...req.user, ...verifiedUser };
  const fundIds = verifiedUser.fundIds ?? [];
  const principal = principalFromUser(verifiedUser);
  const unrestricted = principal.kind === 'admin' || principal.kind === 'service';
  return { unrestricted, fundIds };
}

/**
 * Canonical fund-id parse for body/query sources. Strings must be canonical
 * positive integers (parseFundIdParam: /^[1-9]\d*$/), matching the params-source
 * contract hardened in #748/#749; JSON numbers must be safe positive integers.
 * Arrays, floats, '1e1', and '0123' all return null. The typeof gate also blocks
 * the Number(['1']) === 1 array-coercion hole.
 */
function parseProvidedFundId(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw >= 1 ? raw : null;
  }
  if (typeof raw === 'string') {
    return parseFundIdParam(raw);
  }
  return null;
}

/**
 * Middleware: read fundId from req.body or req.query and enforce fund scope via
 * enforceProvidedFundScope, which verifies the request credential and builds its own
 * req.user. It deliberately never delegates to requireFundAccess: on the
 * registerRoutes surface global auth sets req.context (not req.user), so this
 * middleware must verify the request credential itself before making a role-aware
 * fund-scope decision.
 */
export function requireProvidedFundScopeFrom(source: 'body' | 'query') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const container = req[source] as Record<string, unknown> | undefined;
    const fundId = parseProvidedFundId(container?.['fundId']);
    if (fundId === null) {
      res.status(400).json({
        error: 'invalid_fund_id',
        message: 'Fund ID must be a positive integer',
      });
      return;
    }
    if (await enforceProvidedFundScope(req, res, fundId)) {
      next();
    }
    // on deny, enforceProvidedFundScope already wrote 401/403
  };
}

export interface VerifiedFundScope {
  unrestricted: boolean;
  fundIds: number[];
}

/**
 * Return the caller's VERIFIED fund scope by verifying the request credential; never
 * trusts an upstream-set req.user for a restricted decision. Mirrors
 * enforceProvidedFundScope's no-token contract: throws outside development/test,
 * and in development/test falls back to the upstream user (or an unrestricted dev
 * bypass when none is present). Returns null only for an invalid or expired token
 * so the caller can respond 401. unrestricted === true means an admin/service
 * role; a non-admin with empty grants is not unrestricted and is denied.
 */
export async function getVerifiedFundScope(req: Request): Promise<VerifiedFundScope | null> {
  try {
    return (await verifiedFundScopeFromCredential(req)) ?? null;
  } catch {
    return null;
  }
}
