/**
 * Authentication Middleware
 *
 * Ensures requests are authenticated before accessing protected routes.
 * For the Unified Metrics Layer, this protects cache invalidation endpoints.
 *
 * @module server/middleware/requireAuth
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Authenticated request with user information
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    orgId?: string;
    fundIds?: number[]; // Funds this user has access to
  };
}

/**
 * Simple authentication middleware
 *
 * For MVP: Checks for a valid session/token
 * For Production: Replace with your actual auth system (JWT, session, etc.)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  // TODO: Replace with your actual auth check
  // This is a placeholder that checks for a user session or API key

  // Option 1: Session-based auth
  if (authReq.user?.id) {
    return next();
  }

  // Option 2: API key auth (temporary for testing)
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && process.env["API_KEY"] && apiKey === process.env.API_KEY) {
    // Mock user for API key auth
    authReq.user = {
      id: 'api-key-user',
      email: 'api@system.local',
      fundIds: [], // API key has access to all funds
    };
    return next();
  }

  // No authentication found
  res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required. Please provide valid credentials.',
  });
}

/**
 * Require user to have access to a specific fund
 *
 * Use this after requireAuth to check fund-level permissions
 */
export function requireFundAccess(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  const fundIdParam = req.params["fundId"];

  if (!fundIdParam) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Fund ID is required',
    });
  }

  const fundId = parseInt(fundIdParam, 10);

  if (isNaN(fundId)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid fund ID',
    });
  }

  // Check if user has access to this fund
  // TODO: Replace with actual permission check from database
  const userFundIds = authReq.user?.fundIds || [];

  // API key users (empty fundIds array) have access to all funds
  if (userFundIds.length === 0 && authReq.user?.id === 'api-key-user') {
    return next();
  }

  if (userFundIds.includes(fundId)) {
    return next();
  }

  // User doesn't have access to this fund
  res.status(403).json({
    error: 'Forbidden',
    message: `You do not have access to fund ${fundId}`,
  });
}

/**
 * Require admin role
 *
 * Use for sensitive operations like cache invalidation
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  // TODO: Replace with actual admin check
  // For now, check if user has admin flag or specific role

  const isAdmin = (authReq.user as any)?.isAdmin === true ||
                  (authReq.user as any)?.role === 'admin';

  if (isAdmin) {
    return next();
  }

  res.status(403).json({
    error: 'Forbidden',
    message: 'Admin access required',
  });
}
