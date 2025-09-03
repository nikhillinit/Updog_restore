/**
 * Vercel Function: Direct Express handler for all API routes
 * No serverless-http needed - Express works directly with Vercel's req/res
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makeApp } from '../server/app';

// Initialize Express app once per module (cached across warm invocations)
const app = makeApp();

// Additional production optimizations for Vercel
if (process.env.VERCEL) {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
}

/**
 * Direct Express handler
 * Faster than serverless-http wrapper, works natively with Vercel
 */
export default (req: VercelRequest, res: VercelResponse) => {
  // Strip /api prefix since Express routes don't expect it
  // (Vercel routes /api/* to this function, but Express routes are mounted at /)
  if (req.url?.startsWith('/api')) {
    req.url = req.url.slice(4) || '/';
  }
  
  // Direct Express handling - no wrapper needed
  return app(req as any, res as any);
};

// Export config for Vercel runtime optimization
export const config = {
  runtime: 'nodejs20.x',
  // API routes can take longer than static pages
  maxDuration: 30,
  // Region should match your database
  regions: ['iad1']
};