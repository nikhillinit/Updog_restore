/**
 * LP Access Authorization Middleware
 *
 * Ensures requests are from authenticated Limited Partners and
 * validates access to specific funds.
 *
 * Security Features:
 * - Validates LP role from JWT claims
 * - Extracts lpId from authenticated user
 * - Verifies LP has commitment to requested fund
 * - Attaches LP profile to request for downstream use
 *
 * @module server/middleware/requireLPAccess
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { limitedPartners, lpFundCommitments } from '@shared/schema-lp-reporting';

// Extend Express Request type to include LP profile
declare global {
  namespace Express {
    interface Request {
      lpProfile?: {
        id: number;
        name: string;
        email: string;
        entityType: string;
        fundIds: number[]; // Cached list of funds LP has access to
      };
    }
  }
}

/**
 * Require user to have LP role
 *
 * Use this after requireAuth() to verify LP access
 */
export async function requireLPAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check if user is authenticated
    if (!req.user?.id) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check if user has LP role
    const hasLPRole =
      req.user.roles?.includes('lp') ||
      req.user.role === 'lp';

    if (!hasLPRole) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'LP access required. This endpoint is only available to Limited Partners.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Extract LP ID from JWT claims
    // SECURITY: lpId must be present in JWT token for LP users
    // See server/lib/auth/jwt.ts for JWTClaims type definition
    const lpId = req.user.lpId;

    if (!lpId) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'No LP profile associated with this user. JWT token missing lpId claim.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Load LP profile
    const lp = await db
      .select({
        id: limitedPartners.id,
        name: limitedPartners.name,
        email: limitedPartners.email,
        entityType: limitedPartners.entityType,
      })
      .from(limitedPartners)
      .where(eq(limitedPartners.id, lpId))
      .limit(1);

    if (lp.length === 0) {
      res.status(404).json({
        error: 'LP_NOT_FOUND',
        message: `LP profile ${lpId} not found`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const lpProfile = lp[0];
    if (!lpProfile) {
      res.status(404).json({
        error: 'LP_NOT_FOUND',
        message: `LP profile ${lpId} not found`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Load all fund commitments for this LP
    // SECURITY: This list is cached in req.lpProfile for the duration of the request
    // to prevent TOCTOU (time-of-check-time-of-use) race conditions where fund access
    // could change between authorization check and resource access
    const commitments = await db
      .select({
        fundId: lpFundCommitments.fundId,
      })
      .from(lpFundCommitments)
      .where(eq(lpFundCommitments.lpId, lpId));

    const fundIds = commitments.map((c) => c.fundId);

    // Attach LP profile with cached fund access list to request
    // All downstream middleware MUST use req.lpProfile.fundIds for authorization checks
    req.lpProfile = {
      id: lpProfile.id,
      name: lpProfile.name,
      email: lpProfile.email,
      entityType: lpProfile.entityType,
      fundIds, // Immutable snapshot of fund access at request time
    };

    next();
  } catch (error) {
    console.error('LP access middleware error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to verify LP access',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Require LP to have access to a specific fund
 *
 * IMPORTANT: This middleware MUST be used after requireLPAccess() in the middleware chain.
 * requireLPAccess() loads and caches the fund access list in req.lpProfile.fundIds to
 * prevent TOCTOU race conditions.
 *
 * Example usage:
 *   router.get('/lp/funds/:fundId', requireAuth(), requireLPAccess, requireLPFundAccess, handler)
 */
export function requireLPFundAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // SECURITY: Verify that requireLPAccess was called first
  if (!req.lpProfile) {
    res.status(500).json({
      error: 'MIDDLEWARE_ERROR',
      message: 'requireLPFundAccess must be called after requireLPAccess in middleware chain',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const fundIdParam = req.params['fundId'];

  if (!fundIdParam) {
    res.status(400).json({
      error: 'INVALID_PARAMETER',
      message: 'Fund ID is required',
      field: 'fundId',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const fundId = parseInt(fundIdParam, 10);

  if (isNaN(fundId) || fundId <= 0) {
    res.status(400).json({
      error: 'INVALID_PARAMETER',
      message: 'Invalid fund ID',
      field: 'fundId',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // SECURITY: Use cached fund access list from req.lpProfile (loaded by requireLPAccess)
  // This prevents TOCTOU race conditions where fund access could change between
  // the initial check and subsequent resource access
  const lpFundIds = req.lpProfile.fundIds;

  if (!lpFundIds.includes(fundId)) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: `You do not have access to fund ${fundId}. LPs can only view funds they have invested in.`,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}
