import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../lib/auth/jwt';

const router = Router();

// Apply authentication and admin role requirement to all routes
router.use(requireAuth(), requireRole("admin"));

// Simple in-memory state for runtime engine configuration
const engineConfig = {
  enabled: process.env['ENGINE_GUARD_ENABLED'] !== 'false',
  faultRate: parseFloat(process.env['ENGINE_FAULT_RATE'] || '0'),
};

// GET /admin/engine/guard - Get current guard status
router['get']('/guard', (req: Request, res: Response) => {
  res.json({
    enabled: engineConfig.enabled,
    faultRate: engineConfig.faultRate,
    environment: process.env['NODE_ENV'],
  });
});

// POST /admin/engine/guard - Update guard configuration (non-prod only)
router.post('/guard', (req: Request, res: Response) => {
  if (process.env['NODE_ENV'] === 'production') {
    return res.status(403).json({ 
      ok: false, 
      error: 'Engine configuration changes not allowed in production' 
    });
  }

  try {
    const body = z.object({
      enabled: z.boolean().optional(),
      faultRate: z.number().min(0).max(1).optional()
    }).parse(req.body);

    if (typeof body.enabled === 'boolean') {
      engineConfig.enabled = body.enabled;
    }
    
    if (typeof body.faultRate === 'number') {
      engineConfig.faultRate = body.faultRate;
      // Update environment variable so fault injector picks it up
      process.env['ENGINE_FAULT_RATE'] = String(body.faultRate);
    }

    res.json({
      ok: true,
      engineGuard: {
        enabled: engineConfig.enabled,
        faultRate: engineConfig.faultRate,
        environment: process.env['NODE_ENV'],
      }
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: 'Invalid request body',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /admin/engine/status - Overall engine health
router['get']('/status', (req: Request, res: Response) => {
  res.json({
    guard: {
      enabled: engineConfig.enabled,
      faultRate: engineConfig.faultRate,
    },
    environment: process.env['NODE_ENV'],
    faultInjection: {
      enabled: process.env['ENGINE_FAULT_ENABLE'] === '1' || process.env['NODE_ENV'] === 'test',
      rate: parseFloat(process.env['ENGINE_FAULT_RATE'] || '0'),
      seed: parseInt(process.env['ENGINE_FAULT_SEED'] || '1337'),
    },
  });
});

export { router as engineAdminRoutes };