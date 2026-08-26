#!/usr/bin/env tsx

/**
 * Application entrypoint - invokes bootstrap and starts the server.
 * All npm scripts (dev:api, dev:quick) should point here.
 */

import { bootstrap } from './bootstrap.js';

// This entrypoint is the local development surface (`npm run dev:api`).
// Some Windows environments export NODE_ENV=production globally, which
// unintentionally enables runtime auth gates during local development.
if (!process.env['_EXPLICIT_NODE_ENV']) {
  process.env.NODE_ENV = 'development';
  process.env['_EXPLICIT_NODE_ENV'] = 'development';
}

bootstrap();
