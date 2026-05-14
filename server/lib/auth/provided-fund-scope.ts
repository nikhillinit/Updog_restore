import type { Request, Response } from 'express';

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
