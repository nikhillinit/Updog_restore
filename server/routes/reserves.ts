/**
 * Reserves v1.1 API endpoint
 * Handles reserves calculation requests with metrics and audit logging
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { calculateReservesSafe } from '@shared/lib/reserves-v11';
import { 
  ReservesInputSchema, 
  ReservesConfigSchema,
  CalculateReservesRequestSchema
} from '@shared/schemas/reserves-schemas';
import { idempotency } from '../middleware/idempotency';
import { metrics } from '../metrics/index';

const router = Router();

// POST /api/reserves/calculate
router.post('/reserves/calculate', idempotency, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Validate request
    const validation = CalculateReservesRequestSchema.safeParse(req.body);
    
    if (!validation.success) {
      metrics.recordReservesError('validation_failed');
      return res.status(400).json({
        ok: false,
        error: 'Invalid request',
        details: validation.error.errors
      });
    }
    
    const { input, config, userId } = validation.data;
    
    // Record metrics when available
    metrics.recordReservesRequest({
      companyCount: input.companies.length,
      reservePercent: config.reserve_bps / 100,
      capPolicy: config.cap_policy.kind,
      userId
    });
    
    // Calculate reserves
    const result = await calculateReservesSafe(input as any, config as any);
    
    // Record calculation metrics
    const duration = Date.now() - startTime;
    metrics.recordReservesDuration(duration);
    
    if (result.ok) {
      // Record success metrics
      metrics.recordReservesSuccess({
        companiesFunded: result.data?.metadata.companies_funded || 0,
        utilization: result.data ? 
          (result.data.metadata.total_allocated_cents / result.data.metadata.total_available_cents) : 0
      });
    } else {
      metrics.recordReservesError('calculation_failed');
    }
    
    // Add server metrics to response
    const response = {
      ...result,
      serverMetrics: {
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }
    };
    
    res.json(response);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    metrics.recordReservesError('internal_error');
    metrics.recordReservesDuration(duration);
    
    console.error('Reserves calculation error:', error);
    
    res.status(500).json({
      ok: false,
      error: 'Internal server error',
      serverMetrics: {
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// GET /api/reserves/health
router.get('/reserves/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    version: '1.1.0',
    features: {
      quarterBased: true,
      remainPass: true,
      stageCaps: true,
      shadowCompare: true
    },
    timestamp: new Date().toISOString()
  });
});

// POST /api/reserves/validate
router.post('/reserves/validate', (req: Request, res: Response) => {
  try {
    const inputValidation = ReservesInputSchema.safeParse(req.body.input);
    const configValidation = ReservesConfigSchema.safeParse(req.body.config);
    
    res.json({
      ok: true,
      input: {
        valid: inputValidation.success,
        errors: inputValidation.success ? null : inputValidation.error.errors
      },
      config: {
        valid: configValidation.success,
        errors: configValidation.success ? null : configValidation.error.errors
      }
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: 'Validation failed'
    });
  }
});

export default router;
