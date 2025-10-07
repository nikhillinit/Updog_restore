/**
 * Example: How to wire engine guards into Express routes
 * 
 * This shows how to protect simulation endpoints from NaN/Infinity leaks
 */

import type { Request, Response } from 'express';
import { assertFiniteDeep } from '../middleware/engine-guards';
// TODO: Import your actual engine/simulation functions
// import { runMonteCarlo, runSimulation } from '../engine/simulations';

// Example simulation endpoint with guard
export async function simulationHandler(req: Request, res: Response) {
  try {
    // Run your simulation/calculation
    // const result = await runMonteCarlo(req.body);
    const result = mockSimulation(req.body); // Replace with real engine
    
    // Guard against non-finite values
    const guard = assertFiniteDeep(result);
    if (!guard.ok) {
      // Log for debugging (include correlation ID if available)
      const correlationId = req.headers['x-correlation-id'] || 'unknown';
      const failure = guard as { ok: false; path: string; value: unknown; reason: string };
      console.error(`[ENGINE_NONFINITE] Correlation: ${correlationId}, Path: ${failure.path}, Reason: ${failure.reason}`);
      
      // Return 422 with error details
      return res.status(422).json({
        error: 'ENGINE_NONFINITE',
        path: failure.path,
        reason: failure.reason,
        correlationId,
        message: 'Calculation produced invalid numeric values'
      });
    }
    
    // Safe to return - no NaN/Infinity will leak
    res.json(result);
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ error: 'SIMULATION_FAILED' });
  }
}

// Mock simulation for example (replace with real engine)
function mockSimulation(params: any) {
  return {
    fundSize: params.fundSize || 50000000,
    irr: 0.15,
    moic: 1.8,
    tvpi: 1.5,
    dpi: 0.3,
    percentiles: {
      '5': 0.8,
      '25': 1.2,
      '50': 1.5,
      '75': 2.0,
      '95': 3.5
    },
    simulations: [
      { year: 1, value: 45000000 },
      { year: 2, value: 42000000 },
      { year: 3, value: 48000000 },
      { year: 4, value: 65000000 },
      { year: 5, value: 90000000 }
    ]
  };
}

// Example: Wire into Express app
export function registerGuardedRoutes(app: any) {
  // Protected simulation endpoints
  app.post('/api/v2/simulate', simulationHandler);
  app.post('/api/v2/monte-carlo', simulationHandler);
  app.post('/api/v2/calculate', simulationHandler);
  
  // You can also add middleware for all routes
  app.use('/api/v2/*', (req: Request, res: Response, next: any) => {
    const originalJson = res.json;
    res.json = function(data: any) {
      const guard = assertFiniteDeep(data);
      if (!guard.ok) {
        const failure = guard as { ok: false; path: string; value: unknown; reason: string };
        console.error(`[ENGINE_NONFINITE] Response guard triggered at ${failure.path}`);
        return res.status(422).json({
          error: 'ENGINE_NONFINITE',
          path: failure.path,
          reason: failure.reason
        });
      }
      return originalJson.call(this, data);
    };
    next();
  });
}