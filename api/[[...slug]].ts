/**
 * Vercel Function: Direct Express handler for all API routes
 * No serverless-http needed - Express works directly with Vercel's req/res
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Lazy-load the app to handle potential ESM/CJS issues
let app: any;

async function getApp() {
  if (!app) {
    // Register path aliases before importing app
    await import('tsconfig-paths/register');
    
    // Dynamic import for ESM compatibility
    const appModule = await import('../server/app.js');
    const makeApp = appModule.makeApp || appModule.default?.makeApp;
    
    if (!makeApp) {
      throw new Error('Could not find makeApp export from server/app.js');
    }
    
    app = makeApp();
    
    // Additional production optimizations for Vercel
    if (process.env.VERCEL) {
      app.disable('x-powered-by');
      app.set('trust proxy', 1);
    }
  }
  return app;
}

/**
 * Direct Express handler
 * Faster than serverless-http wrapper, works natively with Vercel
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    const expressApp = await getApp();
    
    // IMPORTANT: Our Express routes ARE mounted at /api/* 
    // Do NOT strip the prefix - routes expect it
    // Example: app.get('/api/funds/:id') expects the full path
    
    // Direct Express handling - no wrapper needed
    return expressApp(req as any, res as any);
  } catch (error) {
    console.error('Failed to initialize Express app:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

// Config handled via vercel.json for this runtime