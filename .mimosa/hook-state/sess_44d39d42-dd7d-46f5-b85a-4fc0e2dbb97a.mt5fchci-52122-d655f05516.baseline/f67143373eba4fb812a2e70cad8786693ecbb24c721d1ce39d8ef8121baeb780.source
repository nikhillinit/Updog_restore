/**
 * Test Database Helper
 *
 * Provides isolated database connections and cleanup utilities for tests
 */

import { databaseMock, setupDatabaseMock } from './database-mock';

export interface TestDatabase {
  getConnection(): Promise<any>;
  cleanup(): Promise<void>;
  createIsolatedTransaction(): Promise<any>;
  getMockData(tableName: string): any[];
  setMockData(tableName: string, data: any[]): void;
  clearMockData(): void;
}

class TestDatabaseImpl implements TestDatabase {
  private connection: any = null;
  private transactions: any[] = [];
  private isSetup = false;

  async getConnection(): Promise<any> {
    if (!this.connection) {
      // Setup the database mock if not already done
      if (!this.isSetup) {
        setupDatabaseMock();
        this.isSetup = true;
      }
      this.connection = databaseMock;
    }
    return this.connection;
  }

  async createIsolatedTransaction(): Promise<any> {
    const conn = await this.getConnection();
    // Create a mock transaction that behaves like the database mock
    const transaction = {
      execute: conn.execute,
      select: conn.select,
      insert: conn.insert,
      update: conn.update,
      delete: conn.delete,
      rollback: async () => {
        // Reset mock data on rollback
        conn.clearMockData();
      },
      commit: async () => {
        // No-op for mock
      }
    };
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

    // Reset the database mock
    if (this.connection) {
      try {
        this.connection.reset();
      } catch (e) {
        console.warn('Failed to reset database mock:', e);
      }
      this.connection = null;
    }
  }

  /**
   * Get mock data for a table
   */
  getMockData(tableName: string): any[] {
    return databaseMock.getMockData(tableName);
  }

  /**
   * Set mock data for a table
   */
  setMockData(tableName: string, data: any[]): void {
    databaseMock.setMockData(tableName, data);
  }

  /**
   * Clear all mock data
   */
  clearMockData(): void {
    databaseMock.clearMockData();
  }
}

export const testDb = new TestDatabaseImpl();