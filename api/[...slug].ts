/**
 * Vercel Function: Direct Express handler for all API routes
 * No serverless-http needed - Express works directly with Vercel's req/res
 */

import type { VercelRequest, VercelResponse } from './_types';
import type { Express } from 'express';

// Lazy-load the app to handle potential ESM/CJS issues
let app: Express | undefined;

async function getApp() {
  if (!app) {
    // Import the pre-bundled server app (api/_app.generated.mjs), produced by
    // scripts/build-vercel-api.mjs during the Vercel build. We bundle because
    // the raw server source uses extensionless relative imports and @shared/*
    // aliases that fail under Node's ESM resolver when @vercel/node ships the
    // files individually; esbuild resolves both at bundle time.
    const appModule = await import('./_app.generated.mjs');
    const makeApp = appModule.makeApp ?? appModule.default;

    if (!makeApp) {
      throw new Error('Could not find makeApp export from _app.generated.mjs');
    }

    app = makeApp();

    // Additional production optimizations for Vercel
    if (process.env['VERCEL']) {
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
      message:
        process.env.NODE_ENV === 'development'
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};

// Config handled via vercel.json for this runtime
