import type { Request, Response } from 'express';

import { verifyAccessTokenAsync } from './jwt';

function bearerToken(req: Request): string | undefined {
  const header = req.header('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : undefined;
}

function numericFundIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (fundId): fundId is number => typeof fundId === 'number' && Number.isInteger(fundId)
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export async function enforceProvidedFundScope(
  req: Request,
  res: Response,
  fundId: number
): Promise<boolean> {
  const token = bearerToken(req);
  if (token === undefined) {
    return true;
  }

  try {
    const claims = await verifyAccessTokenAsync(token);
    const claimRecord = asRecord(claims);
    const fundIds = numericFundIds(claims.fundIds);

    req.user = {
      id: claims.sub,
      sub: claims.sub,
      email: claims.email ?? claims.sub,
      ...(typeof claims.role === 'string' ? { role: claims.role } : {}),
      roles: typeof claims.role === 'string' ? [claims.role] : [],
      ...(typeof claimRecord['orgId'] === 'string' ? { orgId: claimRecord['orgId'] } : {}),
      fundIds,
      ...(claims.lpId !== undefined ? { lpId: claims.lpId } : {}),
      ip: req.ip || 'unknown',
      userAgent: req.header('user-agent') || 'unknown',
    };

    if (fundIds.length === 0 || !fundIds.includes(fundId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `You do not have access to fund ${fundId}`,
      });
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
