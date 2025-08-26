/**
 * Feature Flag API Routes
 * Client-safe flag exposure and admin management
 */

import { Router, Request, Response } from 'express';
import { getClientFlags, updateFlag, getFlagHistory, getCacheStatus, activateKillSwitch } from '../lib/flags.js';
import { z } from 'zod';

export const flagsRouter = Router();

/**
 * GET /api/flags - Client-safe flags only
 */
flagsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const clientFlags = await getClientFlags();
    
    res.json({
      flags: clientFlags,
      timestamp: new Date().toISOString(),
      _meta: {
        note: 'Only flags marked exposeToClient=true are included'
      }
    });
  } catch (error) {
    console.error('Error fetching client flags:', error);
    res.status(500).json({ 
      error: 'Failed to fetch flags',
      flags: {} // Safe fallback
    });
  }
});

/**
 * GET /api/flags/status - Cache and system status
 */
flagsRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const status = getCacheStatus();
    
    res.json({
      cache: status,
      killSwitchActive: process.env.FLAGS_DISABLED_ALL === '1',
      environment: process.env.NODE_ENV || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching flag status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Admin routes (protected)
const adminRouter = Router();

/**
 * Simple auth middleware for admin routes
 */
adminRouter.use((req: Request, res: Response, next) => {
  // In production, use proper authentication
  const authHeader = req.headers.authorization;
  const isLocal = req.ip === '127.0.0.1' || req.ip === '::1';
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev && isLocal) {
    next();
    return;
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  
  // In production, validate JWT or API key here
  const token = authHeader.replace('Bearer ', '');
  if (token !== process.env.FLAG_ADMIN_TOKEN) {
    res.status(403).json({ error: 'Invalid token' });
    return;
  }
  
  next();
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
  actor: z.string().min(1),
  reason: z.string().optional()
});

/**
 * POST /api/admin/flags/:key - Update flag
 */
adminRouter.post('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const validation = updateFlagSchema.safeParse(req.body);
    
    if (!validation.success) {
      res.status(400).json({ 
        error: 'Invalid request', 
        issues: validation.error.issues 
      });
      return;
    }
    
    const { actor, reason, ...updates } = validation.data;
    
    await updateFlag(key, updates, actor, reason);
    
    res.json({ 
      success: true, 
      key,
      message: `Flag '${key}' updated successfully`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error updating flag:', error);
    res.status(500).json({ error: error.message || 'Failed to update flag' });
  }
});

/**
 * GET /api/admin/flags/:key/history - Get flag history
 */
adminRouter.get('/:key/history', async (req: Request, res: Response) => {
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
    delete process.env.FLAGS_DISABLED_ALL;
    
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