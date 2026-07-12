/**
 * Feature Flag API Routes
 * Production-grade flag management with security and versioning
 */

import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getClientFlags,
  getFlags,
  getFlagsVersion,
  getFlagsHash,
  updateFlag,
  getFlagHistory,
  getCacheStatus,
  activateKillSwitch,
  type FlagValue,
} from '../lib/flags.js';
import { requireAuth, requireRole } from '../lib/auth/jwt.js';
import { extractRequestCredential } from '../lib/auth/request-credentials.js';
import { z } from 'zod';
import { firstString } from '../lib/request-values';
import { createRouteLogger } from '../lib/route-logger.js';

const routeLog = createRouteLogger('flags');

/**
 * Best-effort user identity from the canonical optional user credential.
 * Invalid tokens remain anonymous for this public route, but structurally
 * invalid or ambiguous sources are rejected instead of applying precedence.
 */
async function deriveUserFromCredential(
  req: Request
): Promise<{ user?: { id: string }; credentialError?: string }> {
  const credential = extractRequestCredential(req);
  if (credential.kind === 'none') return {};
  if (credential.kind === 'ambiguous') return { credentialError: 'ambiguous_credentials' };
  if (credential.kind === 'invalid') return { credentialError: 'invalid_credentials' };

  try {
    const { verifyAccessTokenAsync } = await import('../lib/auth/jwt.js');
    const claims = await verifyAccessTokenAsync(credential.token);
    return claims.sub ? { user: { id: claims.sub } } : {};
  } catch {
    return {};
  }
}

/**
 * GET /api/flags - Client-safe flags with ETag support
 */
function registerClientFlagRoutes(router: Router): void {
  router['get']('/', async (req: Request, res: Response) => {
    try {
      // Derive user identity from a cookie or Bearer credential.
      // x-user-id header is deliberately ignored to prevent spoofing
      const derived = await deriveUserFromCredential(req);
      if (derived.credentialError) {
        return res.status(401).json({ error: derived.credentialError });
      }
      const userContext = derived.user;
      const isTargeted = !!userContext;

      const result = await getClientFlags(userContext);
      const timestamp = new Date().toISOString();

      // For targeted responses, compute user-specific ETag from sorted payload
      let etag: string;
      if (isTargeted) {
        const { createHash } = await import('node:crypto');
        const sortedPayload = JSON.stringify(result.flags, Object.keys(result.flags).sort());
        etag = `W/"${createHash('sha256').update(sortedPayload).digest('hex').slice(0, 16)}"`;
      } else {
        etag = `W/"${result.hash}"`;
      }

      res.setHeader('ETag', etag);

      // Targeted: private cache with Vary; Anonymous: public shared cache
      if (isTargeted) {
        res.setHeader('Cache-Control', 'private, max-age=15, must-revalidate');
        res.setHeader('Vary', 'Cookie, Authorization');
      } else {
        res.setHeader('Cache-Control', 'max-age=15, must-revalidate');
      }

      // Handle conditional GET
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      const response = {
        flags: result.flags,
        version: result.version,
        timestamp,
        _meta: {
          note: 'Only flags marked exposeToClient=true are included',
          hash: result.hash,
        },
      };

      res.json(response);
    } catch (error) {
      routeLog.error('Error fetching client flags:', error);
      res.status(500).json({
        error: 'Failed to fetch flags',
        flags: {}, // Safe fallback
        version: '0',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /api/flags/status - Cache and system status
   */
  router['get']('/status', async (req: Request, res: Response) => {
    try {
      const status = getCacheStatus();

      res.json({
        cache: status,
        killSwitchActive: process.env['FLAGS_DISABLED_ALL'] === '1',
        environment: process.env['NODE_ENV'] || 'unknown',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      routeLog.error('Error fetching flag status:', error);
      res.status(500).json({ error: 'Failed to fetch status' });
    }
  });
}

const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  exposeToClient: z.boolean().optional(),
  targeting: z
    .object({
      enabled: z.boolean(),
      rules: z.array(
        z.object({
          attribute: z.string(),
          operator: z.string(),
          value: z.union([z.string(), z.array(z.string())]),
          percentage: z.number().min(0).max(100).optional(),
        })
      ),
    })
    .optional(),
  reason: z.string().min(1, 'Reason is required for audit trail'),
  dryRun: z.boolean().optional(),
});

function createAdminRouter(): Router {
  const adminRouter = Router();

  // Rate limiting for admin operations (stricter than client routes)
  const adminRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'rate_limit_exceeded',
      message: 'Too many admin requests. Limit: 10 per minute.',
    },
  });

  // Security headers for admin routes
  adminRouter.use((req: Request, res: Response, next: NextFunction) => {
    // Never cache admin responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  // Apply rate limiting and authentication to all admin routes
  adminRouter.use(adminRateLimit);
  adminRouter.use(requireAuth());

  /**
   * GET /api/admin/flags - Get all flags with version for admin
   */
  adminRouter['get']('/', requireRole('flag_read'), async (req: Request, res: Response) => {
    try {
      const version = await getFlagsVersion();
      const hash = await getFlagsHash();
      const snapshot = await getFlags();

      res.json({
        version,
        hash,
        flags: snapshot.flags,
        environment: snapshot.environment,
        timestamp: new Date().toISOString(),
        _meta: {
          note: 'Admin view - includes all flags regardless of exposeToClient',
        },
      });
    } catch (error) {
      routeLog.error('Error fetching admin flags:', error);
      res.status(500).json({ error: 'Failed to fetch admin flags' });
    }
  });

  adminRouter.patch('/:key', requireRole('flag_admin'), async (req: Request, res: Response) => {
    try {
      const key = firstString(req.params['key']);
      const validation = updateFlagSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'invalid_request',
          issues: validation.error.issues,
        });
      }

      // Version-based concurrency control
      const expectedVersion = req.headers['if-match'] as string;
      if (!expectedVersion) {
        return res.status(400).json({
          error: 'version_required',
          message: 'If-Match header with current version required',
        });
      }

      const currentVersion = await getFlagsVersion();
      if (expectedVersion !== currentVersion) {
        return res.status(409).json({
          error: 'version_conflict',
          message: 'Flag version has changed since last read',
          currentVersion,
          expectedVersion,
        });
      }

      const { reason, dryRun, ...updates } = validation.data;

      // Dry run support
      if (dryRun) {
        // TODO: Preview changes without committing
        return res.json({
          dryRun: true,
          preview: {
            key,
            updates,
            actor: req.user?.email ?? 'unknown',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Construct user context for audit trail
      const userContext = {
        sub: req.user?.id?.toString() ?? req.user?.sub ?? 'unknown',
        email: req.user?.email ?? 'unknown',
        ip: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'] ?? 'unknown',
      };
      const targeting =
        updates.targeting === undefined
          ? undefined
          : {
              enabled: updates.targeting.enabled,
              rules: updates.targeting.rules.map((rule) => ({
                attribute: rule.attribute,
                operator: rule.operator,
                value: rule.value,
                ...(rule.percentage !== undefined ? { percentage: rule.percentage } : {}),
              })),
            };

      const flagUpdates: Partial<FlagValue> = {
        ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
        ...(updates.exposeToClient !== undefined ? { exposeToClient: updates.exposeToClient } : {}),
        ...(targeting !== undefined ? { targeting } : {}),
      };
      await updateFlag(key ?? '', flagUpdates, userContext, reason!);

      const newVersion = await getFlagsVersion();

      res.json({
        success: true,
        key,
        version: newVersion,
        message: `Flag '${key}' updated successfully`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      routeLog.error('Error updating flag:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update flag';
      res.status(500).json({
        error: 'update_failed',
        message: errorMessage,
      });
    }
  });

  /**
   * GET /api/admin/flags/:key/history - Get flag history
   */
  adminRouter['get']('/:key/history', async (req: Request, res: Response) => {
    try {
      const key = firstString(req.params['key']);
      if (!key) {
        return res.status(400).json({ error: 'Flag key is required' });
      }
      const history = await getFlagHistory(key);

      res.json({
        key,
        history,
        count: history.length,
      });
    } catch (error) {
      routeLog.error('Error fetching flag history:', error);
      res.status(500).json({ error: 'Failed to fetch flag history' });
    }
  });

  /**
   * POST /api/admin/flags/kill-switch - Emergency kill switch
   */
  adminRouter.post('/kill-switch', (req: Request, res: Response) => {
    try {
      activateKillSwitch();

      res.json({
        success: true,
        message: '[CRITICAL] Kill switch activated - all flags disabled',
        timestamp: new Date().toISOString(),
        warning: 'This action disables ALL feature flags immediately',
      });
    } catch (error) {
      routeLog.error('Error activating kill switch:', error);
      res.status(500).json({ error: 'Failed to activate kill switch' });
    }
  });

  /**
   * DELETE /api/admin/flags/kill-switch - Deactivate kill switch
   */
  adminRouter.delete('/kill-switch', (req: Request, res: Response) => {
    try {
      delete process.env['FLAGS_DISABLED_ALL'];

      res.json({
        success: true,
        message: 'Kill switch deactivated - flags restored',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      routeLog.error('Error deactivating kill switch:', error);
      res.status(500).json({ error: 'Failed to deactivate kill switch' });
    }
  });

  return adminRouter;
}

export function createFlagsRouter(): Router {
  const router = Router();
  registerClientFlagRoutes(router);
  router.use('/admin', createAdminRouter());
  return router;
}

export const flagsRouter = createFlagsRouter();

export default flagsRouter;
