#!/usr/bin/env tsx

/**
 * Application entrypoint - invokes bootstrap and starts the server.
 * All npm scripts (dev:api, dev:quick) should point here.
 */

import { bootstrap } from './bootstrap.js';

bootstrap();
