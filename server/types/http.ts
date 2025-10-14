import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * User interface for authenticated requests
 * Adjust properties to match your authentication system
 */
export interface User {
  id: string;
  email?: string;
  name?: string;
  // Add other user properties as needed
}

/**
 * Request type with guaranteed user property
 * Use this instead of global req.user augmentation
 */
export type AuthenticatedRequest = Request & { user: User };

/**
 * Wraps a route handler to ensure authentication.
 * Provides type-safe access to req.user without global augmentation.
 *
 * @example
 * ```typescript
 * import { authed } from '@server/types/http';
 *
 * router.get('/protected', authed((req, res) => {
 *   // req.user is guaranteed to exist and is typed as User
 *   const userId = req.user.id;
 *   res.json({ userId });
 * }));
 * ```
 *
 * @param handler - Route handler that receives AuthenticatedRequest
 * @returns Express RequestHandler that validates authentication
 */
export function authed(
  handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => unknown
): RequestHandler {
  return (req, res, next) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return handler(Object.assign(req, { user }) as AuthenticatedRequest, res, next);
  };
}

/**
 * Type helper for Express route handlers with typed params/body/query
 *
 * @example
 * ```typescript
 * interface FundParams { id: string; }
 * interface FundQuery { includeMetrics?: string; }
 *
 * const getFund: TypedHandler<FundParams, any, any, FundQuery> = async (req, res) => {
 *   const fundId = req.params["id"];  // Typed as string
 *   const metrics = req.query["includeMetrics"] === 'true';  // Typed
 * };
 * ```
 */
export type TypedHandler<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any
> = (
  req: Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction
) => Promise<void> | void;

/**
 * Authenticated typed handler - combines authed() with type parameters
 */
export type AuthedTypedHandler<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any
> = (
  req: Request<P, ResBody, ReqBody, ReqQuery> & { user: User },
  res: Response<ResBody>,
  next: NextFunction
) => Promise<void> | void;
