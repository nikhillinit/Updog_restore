/**
 * CJS Shim for database mock compatibility
 * Delegates to ESM database-mock.ts to avoid split-brain mocking
 *
 * This file exists solely to satisfy require() calls in test setup
 * (specifically db-delegate-link.ts), while keeping the rich TS mock
 * as the source of truth.
 *
 * @see tests/setup/db-delegate-link.ts - Requires this CJS module
 * @see tests/helpers/database-mock.ts - TS source of truth
 */

// Use createRequire pattern (same as db-delegate-link.ts uses)
const { createRequire } = require('node:module');
const req = createRequire(__filename);

// Import from ESM database-mock.ts
// Note: Vitest/Node with ts-node loaders can require() .ts files
const { databaseMock, poolMock } = req('./database-mock.ts');

module.exports = {
  databaseMock,
  poolMock,
};
