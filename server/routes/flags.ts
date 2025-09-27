/**
 * Feature Flag API Routes
 * Production-grade flag management with security and versioning
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getClientFlags, getFlags, getFlagsVersion, getFlagsHash, updateFlag, getFlagHistory, getCacheStatus, activateKillSwitch } from '../lib/flags.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../lib/auth/jwt.js';
import { z } from 'zod';

export const flagsRouter = Router();

/**
 * GET /api/flags - Client-safe flags with ETag support
 */
flagsRouter['get']('/', async (req: Request, res: Response) => {
  try {
    // Extract user context for targeting (optional)
    const userId = req.headers['x-user-id'] as string;
    const userContext = userId ? { id: userId } : undefined;
    
    const result = await getClientFlags(userContext);
    const timestamp = new Date().toISOString();
    
    // ETag support for conditional requests
    const etag = `W/"${result.hash}"`;
    res['setHeader']('ETag', etag);
    res['setHeader']('Cache-Control', 'max-age=15, must-revalidate');
    
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
        hash: result.hash
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching client flags:', error);
    res.status(500).json({ 
      error: 'Failed to fetch flags',
      flags: {}, // Safe fallback
      version: '0',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/flags/status - Cache and system status
 */
flagsRouter['get']('/status', async (req: Request, res: Response) => {
  try {
    const status = getCacheStatus();
    
    res.json({
      cache: status,
      killSwitchActive: process.env['FLAGS_DISABLED_ALL'] === '1',
      environment: process.env['NODE_ENV'] || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching flag status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Admin routes with JWT authentication and RBAC
const adminRouter = Router();

// Rate limiting for admin operations (stricter than client routes)
const adminRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many admin requests. Limit: 10 per minute.'
  }
});

// Security headers for admin routes
adminRouter.use((req: Request, res: Response, next) => {
  // Never cache admin responses
  res['setHeader']('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res['setHeader']('Pragma', 'no-cache');
  res['setHeader']('Expires', '0');
  res['setHeader']('Surrogate-Control', 'no-store');
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
        note: 'Admin view - includes all flags regardless of exposeToClient'
      }
    });
  } catch (error) {
    console.error('Error fetching admin flags:', error);
    res.status(500).json({ error: 'Failed to fetch admin flags' });
  }
});

const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  exposeToClient: z.boolean().optional(),
  targeting: z.object({
    enabled: z.boolean(),
    rules: z.array(z.object({
      attribute: z.string(),
      operator: z.string(),
      value: z.union([z.string(), z.array(z.string())]),
      percentage: z.number().min(0).max(100).optional()
    }))
  }).optional(),
  reason: z.string().min(1, 'Reason is required for audit trail'),
  dryRun: z.boolean().optional()
});

/**
 * PATCH /api/admin/flags/:key - Update flag with versioning
 */
adminRouter.patch('/:key', requireRole('flag_admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { key } = req.params;
    const validation = updateFlagSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'invalid_request', 
        issues: validation.error.issues 
      });
    }
    
    // Version-based concurrency control
    const expectedVersion = req.headers['if-match'] as string;
    if (!expectedVersion) {
      return res.status(400).json({
        error: 'version_required',
        message: 'If-Match header with current version required'
      });
    }
    
    const currentVersion = await getFlagsVersion();
    if (expectedVersion !== currentVersion) {
      return res.status(409).json({
        error: 'version_conflict',
        message: 'Flag version has changed since last read',
        currentVersion,
        expectedVersion
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
          actor: req.user.email,
          timestamp: new Date().toISOString()
        }
      });
    }
    
    await updateFlag(key, updates, req.user, reason);
    
    const newVersion = await getFlagsVersion();
    
    res.json({ 
      success: true, 
      key,
      version: newVersion,
      message: `Flag '${key}' updated successfully`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error updating flag:', error);
    res.status(500).json({ 
      error: 'update_failed',
      message: error.message || 'Failed to update flag' 
    });
  }
});

/**
 * GET /api/admin/flags/:key/history - Get flag history
 */
adminRouter['get']('/:key/history', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const history = await getFlagHistory(key);
    
    res.json({
      key,
      history,
      count: history.length
    });
    
  } catch (error) {
    console.error('Error fetching flag history:', error);
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
      message: '🚨 Kill switch activated - all flags disabled',
      timestamp: new Date().toISOString(),
      warning: 'This action disables ALL feature flags immediately'
    });
    
  } catch (error) {
    console.error('Error activating kill switch:', error);
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
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error deactivating kill switch:', error);
    res.status(500).json({ error: 'Failed to deactivate kill switch' });
  }
});

// Mount admin routes
flagsRouter.use('/admin', adminRouter);

export default flagsRouter;