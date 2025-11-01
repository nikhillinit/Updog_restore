/**
 * Database SQL helper for server/lib modules
 * Re-exports the database connection from parent server/db.ts
 */

import { db } from '../db';

// Export as default 'sql' for compatibility with existing code
export default db;
