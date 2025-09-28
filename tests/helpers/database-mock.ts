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
  private constraints: Map<string, any> = new Map();

  constructor() {
    this.setupDefaultData();
    this.setupConstraints();
  }

  /**
   * Setup database constraints for validation
   */
  private setupConstraints(): void {
    // Fund state snapshots constraints
    this.constraints.set('fund_state_snapshots', {
      enums: {
        snapshot_type: ['quarterly', 'annual', 'milestone', 'adhoc', 'checkpoint'],
        trigger_event: ['scheduled', 'manual', 'threshold_breach', 'milestone', 'year_end'],
        status: ['active', 'archived', 'processing', 'failed']
      },
      checks: {
        data_integrity_score: (value: any) => {
          const score = parseFloat(value);
          return score >= 0.0 && score <= 1.0;
        }
      }
    });

    // Snapshot comparisons constraints
    this.constraints.set('snapshot_comparisons', {
      enums: {
        comparison_type: ['period_over_period', 'baseline_comparison', 'peer_analysis', 'scenario_analysis']
      },
      checks: {
        confidence_score: (value: any) => {
          const score = parseFloat(value);
          return score >= 0.0 && score <= 1.0;
        },
        self_comparison: (row: any) => {
          return row.base_snapshot_id !== row.target_snapshot_id;
        }
      }
    });

    // Timeline events constraints
    this.constraints.set('timeline_events', {
      enums: {
        event_type: ['investment', 'exit', 'valuation_change', 'follow_on', 'write_off', 'dividend'],
        severity: ['low', 'medium', 'high', 'critical']
      }
    });

    // State restoration logs constraints
    this.constraints.set('state_restoration_logs', {
      enums: {
        restoration_type: ['full', 'partial', 'metrics_only', 'portfolio_only'],
        status: ['pending', 'in_progress', 'completed', 'failed', 'cancelled']
      },
      checks: {
        restoration_duration_ms: (value: any) => {
          return parseFloat(value) >= 0;
        }
      },
      foreignKeys: {
        fund_id: 'funds',
        snapshot_id: 'fund_state_snapshots'
      }
    });

    // Add foreign keys to other tables
    this.constraints.get('fund_state_snapshots')!.foreignKeys = {
      fund_id: 'funds',
      created_by: 'users'
    };

    this.constraints.get('snapshot_comparisons')!.foreignKeys = {
      base_snapshot_id: 'fund_state_snapshots',
      target_snapshot_id: 'fund_state_snapshots',
      created_by: 'users'
    };

    this.constraints.get('timeline_events')!.foreignKeys = {
      fund_id: 'funds',
      snapshot_id: 'fund_state_snapshots'
    };
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

      // Validate constraints before inserting
      this.validateConstraints(tableName, insertedRow, params || []);

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
      if (normalizedQuery.includes('pg_indexes')) {
        // Handle system table queries for indexes
        result = this.getMockIndexes() as MockExecuteResult;
      } else {
        const tableName = this.extractTableName(normalizedQuery, 'select');
        const tableData = this.mockData.get(tableName) || [];
        result = [...tableData] as MockExecuteResult;
      }

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
   * Parse INSERT values from query and parameters
   */
  private parseInsertValues(query: string, params: any[]): Record<string, any> {
    const row: Record<string, any> = {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Extract column names from INSERT statement
    const columnMatch = query.match(/INSERT INTO\s+\w+\s*\(([^)]+)\)/i);
    if (columnMatch && params.length > 0) {
      const columns = columnMatch[1].split(',').map(col => col.trim());

      // Map parameters to columns
      for (let i = 0; i < Math.min(columns.length, params.length); i++) {
        const columnName = columns[i];
        let value = params[i];

        // Handle JSON strings for JSONB columns
        if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            // Keep as string if not valid JSON
          }
        } else if (typeof value === 'object' && value !== null) {
          // Object passed directly - stringify it first then parse to ensure proper format
          try {
            value = JSON.parse(JSON.stringify(value));
          } catch (e) {
            // Keep as is if can't process
          }
        }

        row[columnName] = value;
      }
    }

    return row;
  }

  /**
   * Validate database constraints
   */
  private validateConstraints(tableName: string, row: Record<string, any>, params: any[]): void {
    const constraints = this.constraints.get(tableName);
    if (!constraints) return;

    // Validate enum constraints
    if (constraints.enums) {
      for (const [column, allowedValues] of Object.entries(constraints.enums)) {
        const value = row[column];
        if (value !== undefined && !allowedValues.includes(value)) {
          throw new Error(`Invalid enum value '${value}' for column '${column}'. Expected one of: ${allowedValues.join(', ')}`);
        }
      }
    }

    // Validate check constraints
    if (constraints.checks) {
      for (const [checkName, checkFn] of Object.entries(constraints.checks)) {
        if (checkName === 'self_comparison') {
          // Special case for self-comparison check
          if (!(checkFn as Function)(row)) {
            throw new Error('Cannot compare snapshot with itself');
          }
        } else if (row[checkName] !== undefined) {
          // Regular column checks
          if (!(checkFn as Function)(row[checkName])) {
            throw new Error(`Check constraint '${checkName}' failed for value '${row[checkName]}'`);
          }
        }
      }
    }

    // Validate foreign key constraints
    if (constraints.foreignKeys) {
      for (const [column, referencedTable] of Object.entries(constraints.foreignKeys)) {
        const value = row[column];
        if (value !== undefined && value !== null) {
          const referencedData = this.mockData.get(referencedTable) || [];
          const exists = referencedData.some(record => record.id === value);
          if (!exists) {
            throw new Error(`Foreign key constraint violation: ${column} '${value}' does not exist in table '${referencedTable}'`);
          }
        }
      }
    }
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
      // Fund state snapshots indexes
      {
        indexname: 'fund_state_snapshots_fund_idx',
        tablename: 'fund_state_snapshots',
        indexdef: 'CREATE INDEX fund_state_snapshots_fund_idx ON fund_state_snapshots (fund_id)',
        schemaname: 'public'
      },
      {
        indexname: 'fund_state_snapshots_captured_idx',
        tablename: 'fund_state_snapshots',
        indexdef: 'CREATE INDEX fund_state_snapshots_captured_idx ON fund_state_snapshots (captured_at)',
        schemaname: 'public'
      },
      {
        indexname: 'fund_state_snapshots_type_idx',
        tablename: 'fund_state_snapshots',
        indexdef: 'CREATE INDEX fund_state_snapshots_type_idx ON fund_state_snapshots (snapshot_type)',
        schemaname: 'public'
      },

      // Snapshot comparisons indexes
      {
        indexname: 'snapshot_comparisons_base_idx',
        tablename: 'snapshot_comparisons',
        indexdef: 'CREATE INDEX snapshot_comparisons_base_idx ON snapshot_comparisons (base_snapshot_id)',
        schemaname: 'public'
      },
      {
        indexname: 'snapshot_comparisons_target_idx',
        tablename: 'snapshot_comparisons',
        indexdef: 'CREATE INDEX snapshot_comparisons_target_idx ON snapshot_comparisons (target_snapshot_id)',
        schemaname: 'public'
      },

      // Timeline events indexes
      {
        indexname: 'timeline_events_fund_idx',
        tablename: 'timeline_events',
        indexdef: 'CREATE INDEX timeline_events_fund_idx ON timeline_events (fund_id)',
        schemaname: 'public'
      },
      {
        indexname: 'timeline_events_date_idx',
        tablename: 'timeline_events',
        indexdef: 'CREATE INDEX timeline_events_date_idx ON timeline_events (event_date)',
        schemaname: 'public'
      },
      {
        indexname: 'timeline_events_type_idx',
        tablename: 'timeline_events',
        indexdef: 'CREATE INDEX timeline_events_type_idx ON timeline_events (event_type)',
        schemaname: 'public'
      },

      // State restoration logs indexes
      {
        indexname: 'state_restoration_logs_fund_idx',
        tablename: 'state_restoration_logs',
        indexdef: 'CREATE INDEX state_restoration_logs_fund_idx ON state_restoration_logs (fund_id)',
        schemaname: 'public'
      },
      {
        indexname: 'state_restoration_logs_snapshot_idx',
        tablename: 'state_restoration_logs',
        indexdef: 'CREATE INDEX state_restoration_logs_snapshot_idx ON state_restoration_logs (snapshot_id)',
        schemaname: 'public'
      },
      {
        indexname: 'state_restoration_logs_status_idx',
        tablename: 'state_restoration_logs',
        indexdef: 'CREATE INDEX state_restoration_logs_status_idx ON state_restoration_logs (status)',
        schemaname: 'public'
      }
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