/**
 * Test Database Helper
 *
 * Provides isolated database connections and cleanup utilities for tests
 */

import { createConnection } from '../../server/database/connection';

export interface TestDatabase {
  getConnection(): Promise<any>;
  cleanup(): Promise<void>;
  createIsolatedTransaction(): Promise<any>;
}

class TestDatabaseImpl implements TestDatabase {
  private connection: any = null;
  private transactions: any[] = [];

  async getConnection(): Promise<any> {
    if (!this.connection) {
      // Use test database configuration
      this.connection = await createConnection({
        database: process.env.TEST_DATABASE_NAME || 'updog_test',
        host: process.env.TEST_DATABASE_HOST || 'localhost',
        port: parseInt(process.env.TEST_DATABASE_PORT || '5432'),
        username: process.env.TEST_DATABASE_USER || 'postgres',
        password: process.env.TEST_DATABASE_PASSWORD || 'postgres',
      });
    }
    return this.connection;
  }

  async createIsolatedTransaction(): Promise<any> {
    const conn = await this.getConnection();
    const transaction = await conn.transaction();
    this.transactions.push(transaction);
    return transaction;
  }

  async cleanup(): Promise<void> {
    // Rollback all transactions
    for (const transaction of this.transactions) {
      try {
        await transaction.rollback();
      } catch (e) {
        console.warn('Failed to rollback transaction:', e);
      }
    }
    this.transactions = [];

    // Close connection
    if (this.connection) {
      try {
        await this.connection.close();
      } catch (e) {
        console.warn('Failed to close database connection:', e);
      }
      this.connection = null;
    }
  }
}

export const testDb = new TestDatabaseImpl();