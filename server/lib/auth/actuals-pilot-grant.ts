import type { NextFunction, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { sendApiError, createErrorBody } from '../apiError';
import { parseFundIdParam } from '@shared/number';
import { userFundGrants, users } from '@shared/schema/user';
import { logSecurity } from '../../utils/logger';

type GrantDatabase = typeof db;
type ReadPilotFundId = () => number | null;

const RESOURCE_NOT_FOUND_MESSAGE = 'Resource not found';
const INSUFFICIENT_ROLE_MESSAGE = 'Insufficient role';

function requestUserId(req: Request): number | null {
  const raw = req.user?.id ?? req.user?.sub;
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw)) return null;

  const userId = Number(raw);
  return Number.isSafeInteger(userId) && userId <= 2_147_483_647 ? userId : null;
}

function hasRole(req: Request, role: string): boolean {
  const claimedRole = req.user?.role;
  return (
    claimedRole === role ||
    (Array.isArray(claimedRole) && claimedRole.includes(role)) ||
    req.user?.roles?.includes(role) === true
  );
}

function deny(
  req: Request,
  res: Response,
  status: 404 | 403,
  code: 'RESOURCE_NOT_FOUND' | 'INSUFFICIENT_ROLE'
): void {
  logSecurity('Actuals pilot grant denied', {
    securityEvent: 'actuals_pilot_grant_denied',
    severity: 'medium',
  });
  const message = code === 'RESOURCE_NOT_FOUND' ? RESOURCE_NOT_FOUND_MESSAGE : INSUFFICIENT_ROLE_MESSAGE;
  sendApiError(res, status, createErrorBody(message, req.requestId, code));
}

export function requireActualsPilotGrant(
  readPilotFundId: ReadPilotFundId,
  database: GrantDatabase = db
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawFundId = req.params['fundId'];
    const fundId = parseFundIdParam(typeof rawFundId === 'string' ? rawFundId : undefined);
    const configuredFundId = readPilotFundId();
    const userId = requestUserId(req);

    if (
      configuredFundId === null ||
      fundId === null ||
      fundId !== configuredFundId ||
      userId === null ||
      hasRole(req, 'service')
    ) {
      deny(req, res, 404, 'RESOURCE_NOT_FOUND');
      return;
    }

    const [user] = await database
      .select({
        isActive: users.isActive,
        role: users.role,
        isReleaseCanaryPrincipal: users.isReleaseCanaryPrincipal,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (
      user === undefined ||
      !user.isActive ||
      user.isReleaseCanaryPrincipal ||
      user.role === 'service'
    ) {
      deny(req, res, 404, 'RESOURCE_NOT_FOUND');
      return;
    }

    const [grant] = await database
      .select({ userId: userFundGrants.userId })
      .from(userFundGrants)
      .where(and(eq(userFundGrants.userId, userId), eq(userFundGrants.fundId, fundId)))
      .limit(1);

    if (grant === undefined) {
      deny(req, res, 404, 'RESOURCE_NOT_FOUND');
      return;
    }

    if (user.role !== 'admin' || !hasRole(req, 'admin')) {
      deny(req, res, 403, 'INSUFFICIENT_ROLE');
      return;
    }

    next();
  };
}
