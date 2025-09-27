/**
 * Database Connection Module
 *
 * Provides database connection utilities for the application
 */

import { db } from '../db';

export interface DatabaseConnection {
  query: (sql: string, params?: any[]) => Promise<any>;
  close: () => Promise<void>;
}

/**
 * Create a database connection for testing
 */
export function createConnection(): DatabaseConnection {
  return {
    query: async (sql: string, params?: any[]) => {
      // For testing, we just return the db instance
      return db;
    },
    close: async () => {
      // No-op for in-memory/mock databases
    }
  };
}

/**
 * Create a test database connection
 */
export function createTestConnection(): DatabaseConnection {
  return createConnection();
}