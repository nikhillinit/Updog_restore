/**
 * CommonJS wrapper for database-mock.ts
 * Used by server/db.ts during test initialization
 *
 * This file enables ESM-to-CJS compatibility for the database mock
 * in environments where require() is used with createRequire.
 */

// Re-export the database mock from the TypeScript implementation
// In Vitest environment, load .ts directly (Vite transpiles on-the-fly)
module.exports = require('./database-mock.ts');
