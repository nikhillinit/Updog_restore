/**
 * Database Mock for Testing
 *
 * Provides a mock implementation of the database connection
 * that matches the Drizzle ORM interface for consistent testing.
 */

import { vi } from 'vitest';

// Mock result types
interface MockQueryResult {
  id?: string | number;
  [key: string]: any;
}

interface MockExecuteResult extends Array<MockQueryResult> {
  insertId?: string | number;
  affectedRows?: number;
}

class DatabaseMock {
  private mockData = new Map<string, MockQueryResult[]>();
  private callHistory: Array<{ method: string; query: string; params?: any[]; result: any }> = [];

  constructor() {
    this.setupDefaultData();
  }

  /**
   * Setup default mock data for common tables
   */
  private setupDefaultData(): void {
    // Mock funds
    this.mockData.set('funds', [
      {
        id: 1,
        name: 'Test Fund I',
        fund_size: 100000000,
        vintage: 2022,
        created_at: '2022-01-01T00:00:00Z',
        updated_at: '2022-01-01T00:00:00Z'
      }
    ]);

    // Mock users
    this.mockData.set('users', [
      {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        created_at: '2022-01-01T00:00:00Z'
      }
    ]);

    // Mock companies
    this.mockData.set('companies', [
      {
        id: 1,
        name: 'Test Company',
        sector: 'Technology',
        stage: 'Series A',
        fund_id: 1,
        created_at: '2022-01-01T00:00:00Z'
      }
    ]);
  }

  /**
   * Mock the execute method (raw SQL)
   */
  execute = vi.fn(async (query: string, params?: any[]): Promise<MockExecuteResult> => {
    const normalizedQuery = query.toLowerCase().trim();

    let result: MockExecuteResult = [];

    if (normalizedQuery.startsWith('insert')) {
      // Handle INSERT queries
      const tableName = this.extractTableName(normalizedQuery, 'insert');
      const id = this.generateId();

      const insertedRow = {
        id,
        ...this.parseInsertValues(query, params || [])
      };

      // Add to mock data
      if (!this.mockData.has(tableName)) {
        this.mockData.set(tableName, []);
      }
      this.mockData.get(tableName)!.push(insertedRow);

      result = [insertedRow] as MockExecuteResult;
      result.insertId = id;
      result.affectedRows = 1;

    } else if (normalizedQuery.startsWith('select')) {
      // Handle SELECT queries
      const tableName = this.extractTableName(normalizedQuery, 'select');
      const tableData = this.mockData.get(tableName) || [];

      result = [...tableData] as MockExecuteResult;

    } else if (normalizedQuery.startsWith('update')) {
      // Handle UPDATE queries
      const tableName = this.extractTableName(normalizedQuery, 'update');
      const tableData = this.mockData.get(tableName) || [];

      result = [...tableData] as MockExecuteResult;
      result.affectedRows = tableData.length;

    } else if (normalizedQuery.startsWith('delete')) {
      // Handle DELETE queries
      const tableName = this.extractTableName(normalizedQuery, 'delete');

      if (this.mockData.has(tableName)) {
        const beforeCount = this.mockData.get(tableName)!.length;
        this.mockData.set(tableName, []);
        result = [] as MockExecuteResult;
        result.affectedRows = beforeCount;
      }

    } else if (normalizedQuery.includes('pg_indexes') || normalizedQuery.includes('indexname')) {
      // Handle index queries
      result = this.getMockIndexes() as MockExecuteResult;

    } else {
      // Default empty result
      result = [] as MockExecuteResult;
    }

    // Record the call
    this.callHistory.push({
      method: 'execute',
      query,
      params,
      result: JSON.parse(JSON.stringify(result))
    });

    return result;
  });

  /**
   * Mock the select method (Drizzle query builder)
   */
  select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
        execute: vi.fn(() => Promise.resolve([]))
      })),
      limit: vi.fn(() => Promise.resolve([])),
      execute: vi.fn(() => Promise.resolve([]))
    }))
  }));

  /**
   * Mock the insert method (Drizzle query builder)
   */
  insert = vi.fn(() => ({
    into: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: this.generateId() }])),
        execute: vi.fn(() => Promise.resolve([{ id: this.generateId() }]))
      })),
      execute: vi.fn(() => Promise.resolve([{ id: this.generateId() }]))
    }))
  }));

  /**
   * Mock the update method (Drizzle query builder)
   */
  update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
        execute: vi.fn(() => Promise.resolve([]))
      })),
      execute: vi.fn(() => Promise.resolve([]))
    }))
  }));

  /**
   * Mock the delete method (Drizzle query builder)
   */
  delete = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        execute: vi.fn(() => Promise.resolve({ affectedRows: 1 }))
      })),
      execute: vi.fn(() => Promise.resolve({ affectedRows: 1 }))
    }))
  }));

  /**
   * Mock transaction method
   */
  transaction = vi.fn(async (callback: (tx: any) => Promise<any>) => {
    // Create a transaction-like object that behaves like the main db
    const tx = {
      execute: this.execute,
      select: this.select,
      insert: this.insert,
      update: this.update,
      delete: this.delete,
      rollback: vi.fn(),
      commit: vi.fn()
    };

    try {
      const result = await callback(tx);
      return result;
    } catch (error) {
      throw error;
    }
  });

  /**
   * Additional helper methods
   */
  run = this.execute; // Alias for execute
  query = this.execute; // Alias for execute

  /**
   * Close connection (no-op for mock)
   */
  close = vi.fn(async () => {
    // No-op for mock
  });

  /**
   * Extract table name from SQL query
   */
  private extractTableName(query: string, operation: string): string {
    const patterns = {
      insert: /insert\s+into\s+(\w+)/i,
      select: /from\s+(\w+)/i,
      update: /update\s+(\w+)/i,
      delete: /delete\s+from\s+(\w+)/i
    };

    const pattern = patterns[operation as keyof typeof patterns];
    const match = query.match(pattern);

    return match ? match[1] : 'unknown_table';
  }

  /**
   * Parse INSERT values (simplified)
   */
  private parseInsertValues(query: string, params: any[]): Record<string, any> {
    // Simplified parsing - just return basic data
    return {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Generate mock ID
   */
  private generateId(): string {
    return `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get mock index data
   */
  private getMockIndexes(): MockQueryResult[] {
    return [
      { indexname: 'fund_state_snapshots_fund_idx', tablename: 'fund_state_snapshots', indexdef: 'CREATE INDEX ...' },
      { indexname: 'fund_state_snapshots_captured_idx', tablename: 'fund_state_snapshots', indexdef: 'CREATE INDEX ...' },
      { indexname: 'snapshot_comparisons_base_idx', tablename: 'snapshot_comparisons', indexdef: 'CREATE INDEX ...' },
      { indexname: 'timeline_events_fund_idx', tablename: 'timeline_events', indexdef: 'CREATE INDEX ...' },
      { indexname: 'timeline_events_date_idx', tablename: 'timeline_events', indexdef: 'CREATE INDEX ...' },
      { indexname: 'state_restoration_logs_fund_idx', tablename: 'state_restoration_logs', indexdef: 'CREATE INDEX ...' }
    ];
  }

  /**
   * Utility methods for testing
   */

  /**
   * Add mock data for a table
   */
  setMockData(tableName: string, data: MockQueryResult[]): void {
    this.mockData.set(tableName, data);
  }

  /**
   * Get mock data for a table
   */
  getMockData(tableName: string): MockQueryResult[] {
    return this.mockData.get(tableName) || [];
  }

  /**
   * Clear all mock data
   */
  clearMockData(): void {
    this.mockData.clear();
    this.setupDefaultData();
  }

  /**
   * Get call history for debugging
   */
  getCallHistory(): typeof this.callHistory {
    return this.callHistory;
  }

  /**
   * Clear call history
   */
  clearCallHistory(): void {
    this.callHistory = [];
  }

  /**
   * Reset all mocks
   */
  reset(): void {
    this.clearMockData();
    this.clearCallHistory();
    vi.clearAllMocks();
  }
}

/**
 * Create and export singleton database mock
 */
export const databaseMock = new DatabaseMock();

/**
 * Setup database mock for tests
 */
export function setupDatabaseMock() {
  // Mock the database module
  vi.mock('../../server/db', () => ({
    db: databaseMock,
    pool: {
      connect: vi.fn(),
      end: vi.fn()
    }
  }));

  return databaseMock;
}

/**
 * Cleanup database mock after tests
 */
export function cleanupDatabaseMock() {
  databaseMock.reset();
}

export default databaseMock;