/**
 * Metrics endpoint for Prometheus scraping
 */

import { Router, Request, Response } from 'express';
import { getMetrics, getContentType } from '../observability/production-metrics.js';

export const metricsRouter = Router();

/**
 * GET /metrics
 * Prometheus metrics endpoint
 */
metricsRouter['get']('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await getMetrics();
    
    res['set']({
      'Content-Type': getContentType(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.send(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).send('Error generating metrics');
  }
});

export default metricsRouter;