import type { NextFunction, Request, Response } from 'express';

import { parseFundIdParam } from '@shared/number';

import { hasFundAccess, userFromClaims, verifyAccessTokenAsync } from './jwt';

function bearerToken(req: Request): string | undefined {
  const header = req.header('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : undefined;
}

function assertTokenRequiredOutsideDevelopment(): void {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(`Missing bearer token while enforcing provided fund scope in ${nodeEnv}`);
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
  const token = bearerToken(req);
  if (token === undefined) {
    assertTokenRequiredOutsideDevelopment();
    if (req.user && !hasFundAccess(req.user.fundIds, fundId)) {
      denyFundAccess(res, fundId);
      return false;
    }
    return true;
  }

  try {
    const claims = await verifyAccessTokenAsync(token);
    const existingUser = req.user;
    const verifiedUser = userFromClaims(req, claims);

    req.user = {
      ...existingUser,
      ...verifiedUser,
    };

    if (!hasFundAccess(req.user.fundIds, fundId)) {
      denyFundAccess(res, fundId);
      return false;
    }

    return true;
  } catch {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authorization token',
    });
    return false;
  }
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
 * enforceProvidedFundScope, which re-verifies the bearer token and builds its own
 * req.user. It deliberately never delegates to requireFundAccess: on the
 * registerRoutes surface global auth sets req.context (not req.user), so a guard
 * that reads req.user?.fundIds sees undefined and hasFundAccess(undefined, ...)
 * returns true -- a silent fail-open.
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
 * Return the caller's VERIFIED fund scope by re-verifying the bearer token; never
 * trusts an upstream-set req.user for a restricted decision. Mirrors
 * enforceProvidedFundScope's no-token contract: throws outside development/test,
 * and in development/test falls back to the upstream user (or an unrestricted dev
 * bypass when none is present). Returns null only for an invalid or expired token
 * so the caller can respond 401. unrestricted === true means empty fundIds
 * (privileged admin/service scope).
 */
export async function getVerifiedFundScope(req: Request): Promise<VerifiedFundScope | null> {
  const token = bearerToken(req);
  if (token === undefined) {
    assertTokenRequiredOutsideDevelopment();
    if (req.user) {
      const fundIds = req.user.fundIds ?? [];
      return { unrestricted: fundIds.length === 0, fundIds };
    }
    return { unrestricted: true, fundIds: [] };
  }

  try {
    const claims = await verifyAccessTokenAsync(token);
    const verifiedUser = userFromClaims(req, claims);
    req.user = {
      ...req.user,
      ...verifiedUser,
    };
    const fundIds = verifiedUser.fundIds ?? [];
    return { unrestricted: fundIds.length === 0, fundIds };
  } catch {
    return null;
  }
}
