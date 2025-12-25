/**
 * Database Mock for Testing
 *
 * Provides a mock implementation of the database connection
 * that matches the Drizzle ORM interface for consistent testing.
 */

import { vi } from 'vitest';
import type { SQL } from 'drizzle-orm';

// Mock result types
interface MockQueryResult {
  id?: string | number;
  [key: string]: unknown;
}

interface MockExecuteResult extends Array<MockQueryResult> {
  insertId?: string | number;
  affectedRows?: number;
}

// Constraint validation types
type ConstraintCheckFn = (row: Record<string, unknown>) => boolean;
type ConstraintUniqueFn = (
  row: Record<string, unknown>,
  existingData: Record<string, unknown>[]
) => boolean;

interface TableConstraints {
  enums?: Record<string, string[]>;
  checks?: Record<string, ConstraintCheckFn>;
  unique?: Record<string, ConstraintUniqueFn>;
  foreignKeys?: Record<string, string>;
}

// Drizzle query option types
interface QueryOptions {
  where?: SQL<unknown> | Record<string, unknown>;
  orderBy?:
    | SQL<unknown>
    | Record<string, unknown>
    | Array<SQL<unknown> | Record<string, unknown>>
    | ((...args: unknown[]) => unknown);
  limit?: number;
}

interface OrderByClause {
  column: string;
  direction: 'asc' | 'desc';
  nulls?: 'first' | 'last';
}

// Call history entry type
interface CallHistoryEntry {
  method: string;
  query: string;
  params?: unknown[];
  result: unknown;
}

class DatabaseMock {
  private mockData = new Map<string, MockQueryResult[]>();
  private callHistory: CallHistoryEntry[] = [];
  private constraints = new Map<string, TableConstraints>();

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
        status: ['active', 'archived', 'processing', 'failed'],
      },
      checks: {
        data_integrity_score: (row: Record<string, unknown>) => {
          if (row.data_integrity_score === undefined || row.data_integrity_score === null)
            return true;
          const score = parseFloat(String(row.data_integrity_score));
          return score >= 0.0 && score <= 1.0;
        },
      },
    });

    // Snapshot comparisons constraints
    this.constraints.set('snapshot_comparisons', {
      enums: {
        comparison_type: [
          'period_over_period',
          'baseline_comparison',
          'peer_analysis',
          'scenario_analysis',
        ],
      },
      checks: {
        confidence_score: (row: Record<string, unknown>) => {
          if (row.confidence_score === undefined || row.confidence_score === null) return true;
          const score = parseFloat(String(row.confidence_score));
          return score >= 0.0 && score <= 1.0;
        },
        self_comparison: (row: Record<string, unknown>) => {
          return row.base_snapshot_id !== row.target_snapshot_id;
        },
      },
    });

    // Timeline events constraints
    this.constraints.set('timeline_events', {
      enums: {
        event_type: [
          'investment',
          'exit',
          'valuation_change',
          'follow_on',
          'write_off',
          'dividend',
        ],
        severity: ['low', 'medium', 'high', 'critical'],
      },
    });

    // State restoration logs constraints
    this.constraints.set('state_restoration_logs', {
      enums: {
        restoration_type: ['full', 'partial', 'metrics_only', 'portfolio_only'],
        status: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
      },
      checks: {
        restoration_duration_ms: (row: Record<string, unknown>) => {
          if (row.restoration_duration_ms === undefined || row.restoration_duration_ms === null)
            return true;
          return parseFloat(String(row.restoration_duration_ms)) >= 0;
        },
      },
      foreignKeys: {
        fund_id: 'funds',
        snapshot_id: 'fund_state_snapshots',
      },
    });

    // Add foreign keys to other tables
    this.constraints.get('fund_state_snapshots')!.foreignKeys = {
      fund_id: 'funds',
      created_by: 'users',
    };

    this.constraints.get('snapshot_comparisons')!.foreignKeys = {
      base_snapshot_id: 'fund_state_snapshots',
      target_snapshot_id: 'fund_state_snapshots',
      created_by: 'users',
    };

    this.constraints.get('timeline_events')!.foreignKeys = {
      fund_id: 'funds',
      snapshot_id: 'fund_state_snapshots',
    };

    // Variance tracking constraints - fund_baselines
    this.constraints.set('fund_baselines', {
      enums: {
        baseline_type: ['initial', 'quarterly', 'annual', 'milestone', 'custom'],
      },
      checks: {
        period_ordering: (row: Record<string, unknown>) => {
          if (row.period_start && row.period_end) {
            return new Date(String(row.period_end)) > new Date(String(row.period_start));
          }
          return true;
        },
        confidence_bounds: (row: Record<string, unknown>) => {
          if (row.confidence !== undefined && row.confidence !== null) {
            const conf = parseFloat(String(row.confidence));
            return conf >= 0.0 && conf <= 1.0;
          }
          return true;
        },
      },
      unique: {
        default_baseline: (
          row: Record<string, unknown>,
          existingData: Record<string, unknown>[]
        ) => {
          // Only one default baseline per fund
          const isDefault =
            row.is_default === true || row.is_default === 'true' || row.is_default === 1;
          if (isDefault) {
            const existingDefault = existingData.find((r: Record<string, unknown>) => {
              const rIsDefault =
                r.is_default === true || r.is_default === 'true' || r.is_default === 1;
              return r.fund_id === row.fund_id && rIsDefault;
            });
            if (existingDefault) {
              throw new Error('Violates unique constraint: only one default baseline per fund');
            }
          }
          return true;
        },
      },
      foreignKeys: {
        fund_id: 'funds',
        created_by: 'users',
      },
    });

    // Variance tracking constraints - variance_reports
    this.constraints.set('variance_reports', {
      enums: {
        report_type: ['periodic', 'milestone', 'ad_hoc', 'alert_triggered'],
        status: ['draft', 'pending_review', 'approved', 'archived'],
        risk_level: ['low', 'medium', 'high', 'critical'],
      },
      checks: {
        analysis_ordering: (row: Record<string, unknown>) => {
          if (row.analysis_start && row.analysis_end) {
            return new Date(String(row.analysis_end)) >= new Date(String(row.analysis_start));
          }
          return true;
        },
        data_quality_bounds: (row: Record<string, unknown>) => {
          if (row.data_quality_score !== undefined && row.data_quality_score !== null) {
            const score = parseFloat(String(row.data_quality_score));
            return score >= 0.0 && score <= 1.0;
          }
          return true;
        },
      },
      foreignKeys: {
        fund_id: 'funds',
        baseline_id: 'fund_baselines',
      },
    });

    // Variance tracking constraints - performance_alerts
    this.constraints.set('performance_alerts', {
      enums: {
        severity: ['info', 'warning', 'critical', 'urgent'],
        category: ['performance', 'risk', 'operational', 'compliance'],
        status: ['active', 'acknowledged', 'resolved', 'dismissed'],
      },
      checks: {
        occurrence_count_min: (row: Record<string, unknown>) => {
          if (row.occurrence_count !== undefined && row.occurrence_count !== null) {
            return parseInt(String(row.occurrence_count)) >= 1;
          }
          return true;
        },
        escalation_level_min: (row: Record<string, unknown>) => {
          if (row.escalation_level !== undefined && row.escalation_level !== null) {
            return parseInt(String(row.escalation_level)) >= 0;
          }
          return true;
        },
      },
      foreignKeys: {
        fund_id: 'funds',
        baseline_id: 'fund_baselines',
        variance_report_id: 'variance_reports',
      },
    });

    // Variance tracking constraints - alert_rules
    this.constraints.set('alert_rules', {
      enums: {
        rule_type: ['threshold', 'trend', 'deviation', 'pattern'],
        operator: ['gt', 'lt', 'eq', 'gte', 'lte', 'between'],
        check_frequency: ['realtime', 'hourly', 'daily', 'weekly'],
      },
      checks: {
        suppression_period_min: (row: Record<string, unknown>) => {
          if (
            row.suppression_period_minutes !== undefined &&
            row.suppression_period_minutes !== null
          ) {
            return parseInt(String(row.suppression_period_minutes)) >= 1;
          }
          return true;
        },
        trigger_count_min: (row: Record<string, unknown>) => {
          if (row.trigger_count !== undefined && row.trigger_count !== null) {
            return parseInt(String(row.trigger_count)) >= 0;
          }
          return true;
        },
        between_operator_requires_secondary: (row: Record<string, unknown>) => {
          if (row.operator === 'between') {
            return row.secondary_threshold !== undefined && row.secondary_threshold !== null;
          }
          return true;
        },
      },
      foreignKeys: {
        created_by: 'users',
      },
    });

    // Investment lots constraints
    this.constraints.set('investment_lots', {
      enums: {
        lot_type: ['initial', 'follow_on', 'secondary'],
      },
      checks: {
        idempotency_key_length: (row: Record<string, unknown>) => {
          if (row.idempotency_key !== undefined && row.idempotency_key !== null) {
            const len = String(row.idempotency_key).length;
            return len >= 1 && len <= 128;
          }
          return true;
        },
      },
      foreignKeys: {
        investment_id: 'investments',
      },
    });
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
        updated_at: '2022-01-01T00:00:00Z',
      },
    ]);

    // Mock users
    this.mockData.set('users', [
      {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        created_at: '2022-01-01T00:00:00Z',
      },
    ]);

    // Mock companies
    this.mockData.set('companies', [
      {
        id: 1,
        name: 'Test Company',
        sector: 'Technology',
        stage: 'Series A',
        fund_id: 1,
        created_at: '2022-01-01T00:00:00Z',
      },
    ]);

    // Mock investments - fund 1 has investments 1-4, fund 2 has investment 5
    // Using camelCase for Drizzle ORM compatibility
    this.mockData.set('investments', [
      {
        id: 1,
        fundId: 1,
        companyId: 1,
        investmentDate: '2022-01-15T00:00:00Z',
        amount: '1000000.00',
        round: 'Series A',
        createdAt: '2022-01-15T00:00:00Z',
      },
      {
        id: 2,
        fundId: 1,
        companyId: 1,
        investmentDate: '2022-02-15T00:00:00Z',
        amount: '500000.00',
        round: 'Series A',
        createdAt: '2022-02-15T00:00:00Z',
      },
      {
        id: 3,
        fundId: 1,
        companyId: 1,
        investmentDate: '2022-03-15T00:00:00Z',
        amount: '250000.00',
        round: 'Series B',
        createdAt: '2022-03-15T00:00:00Z',
      },
      {
        id: 4,
        fundId: 1,
        companyId: 1,
        investmentDate: '2022-04-15T00:00:00Z',
        amount: '100000.00',
        round: 'Series B',
        createdAt: '2022-04-15T00:00:00Z',
      },
      {
        id: 5,
        fundId: 2,
        companyId: 1,
        investmentDate: '2022-05-15T00:00:00Z',
        amount: '750000.00',
        round: 'Series A',
        createdAt: '2022-05-15T00:00:00Z',
      },
    ]);

    // Mock investment_lots (initially empty, populated by tests)
    this.mockData.set('investment_lots', []);

    // Mock forecast_snapshots (initially empty, populated by tests)
    this.mockData.set('forecast_snapshots', []);
  }

  /**
   * Mock the execute method (raw SQL)
   */
  execute = vi.fn(async (query: string, params?: unknown[]): Promise<MockExecuteResult> => {
    const normalizedQuery = query.toLowerCase().trim();

    let result: MockExecuteResult = [];

    if (normalizedQuery.startsWith('insert')) {
      // Handle INSERT queries
      const tableName = this.extractTableName(normalizedQuery, 'insert');
      const id = this.generateId();

      const insertedRow = {
        id,
        ...this.parseInsertValues(query, params || []),
      };

      // Validate constraints before inserting
      const existingData = this.mockData.get(tableName) || [];
      this.validateConstraints(tableName, insertedRow, params || [], existingData);

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

        // Check if it's a database view
        if (tableName === 'active_baselines') {
          result = this.getActiveBaselinesView() as MockExecuteResult;
        } else if (tableName === 'critical_alerts') {
          result = this.getCriticalAlertsView() as MockExecuteResult;
        } else if (tableName === 'variance_summary') {
          result = this.getVarianceSummaryView() as MockExecuteResult;
        } else {
          const tableData = this.mockData.get(tableName) || [];
          result = [...tableData] as MockExecuteResult;
        }
      }
    } else if (normalizedQuery.startsWith('update')) {
      // Handle UPDATE queries
      const tableName = this.extractTableName(normalizedQuery, 'update');
      const tableData = this.mockData.get(tableName) || [];

      // Auto-update updated_at timestamp (trigger simulation)
      if (tableData.length > 0 && tableData[0].updated_at !== undefined) {
        tableData.forEach((row: MockQueryResult) => {
          row.updated_at = new Date().toISOString();
        });
      }

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
      result: JSON.parse(JSON.stringify(result)),
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
        execute: vi.fn(() => Promise.resolve([])),
      })),
      limit: vi.fn(() => Promise.resolve([])),
      execute: vi.fn(() => Promise.resolve([])),
    })),
  }));

  /**
   * Mock the insert method (Drizzle query builder)
   * Pattern: db.insert(table).values(data).returning()
   */
  insert = vi.fn((table: unknown) => {
    const tableName = this.getTableNameFromObject(table);
    return {
      values: vi.fn((data: Record<string, unknown>) => {
        // Generate ID if not provided (for UUID tables)
        const id = data.id || this.generateId();
        const result = { ...data, id };

        // Add to mock data
        const tableData = this.mockData.get(tableName) || [];
        tableData.push(result);
        this.mockData.set(tableName, tableData);

        const chain = {
          returning: vi.fn(() => Promise.resolve([result])),
          execute: vi.fn(() => Promise.resolve([result])),
        };

        return {
          ...chain,
          onConflictDoUpdate: vi.fn((_config: unknown) => chain),
        };
      }),
      execute: vi.fn(() => Promise.resolve([{ id: this.generateId() }])),
    };
  });

  /**
   * Mock the update method (Drizzle query builder)
   */
  update = vi.fn((table: unknown) => {
    const tableName = this.getTableNameFromObject(table);
    return {
      set: vi.fn((updateData: Record<string, unknown>) => ({
        where: vi.fn((_condition: SQL<unknown> | undefined) => {
          // Get existing data
          const tableData = this.mockData.get(tableName) || [];

          // Update the first matching row (simplified - real implementation would parse condition)
          if (tableData.length > 0) {
            const updated = { ...tableData[0], ...updateData };
            tableData[0] = updated;
            this.mockData.set(tableName, tableData);

            return {
              returning: vi.fn(() => Promise.resolve([updated])),
              execute: vi.fn(() => Promise.resolve([updated])),
            };
          }

          return {
            returning: vi.fn(() => Promise.resolve([])),
            execute: vi.fn(() => Promise.resolve([])),
          };
        }),
        execute: vi.fn(() => Promise.resolve([])),
      })),
    };
  });

  /**
   * Mock the delete method (Drizzle query builder)
   */
  delete = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        execute: vi.fn(() => Promise.resolve({ affectedRows: 1 })),
      })),
      execute: vi.fn(() => Promise.resolve({ affectedRows: 1 })),
    })),
  }));

  /**
   * Mock transaction method
   */
  transaction = vi.fn(async <T>(callback: (tx: DatabaseMock) => Promise<T>): Promise<T> => {
    // Create a transaction-like object that behaves like the main db
    const tx = {
      execute: this.execute,
      select: this.select,
      insert: this.insert,
      update: this.update,
      delete: this.delete,
      rollback: vi.fn(),
      commit: vi.fn(),
      query: this.createQueryInterface(),
    } as unknown as DatabaseMock;

    // Execute callback with transaction context
    return await callback(tx);
  });

  /**
   * Drizzle-style relational query interface
   */
  private createQueryInterface() {
    const createTableQuery = (tableName: string) => ({
      findFirst: vi.fn(async (options?: QueryOptions): Promise<MockQueryResult | null> => {
        const data = this.mockData.get(tableName) || [];
        if (data.length === 0) return null;

        // If there's a where clause, try to match it (improved filtering)
        if (options?.where) {
          // Try to extract filter criteria from Drizzle where clause
          const filtered = this.filterData(data, options.where);

          // Debug logging (can be removed later)
          if (process.env.DEBUG_MOCK) {
            console.log(
              `[Mock findFirst] Table: ${tableName}, Data count: ${data.length}, Filtered count: ${filtered.length}`
            );
          }

          return filtered[0] || null;
        }
        return data[0] || null;
      }),
      findMany: vi.fn(async (options?: QueryOptions): Promise<MockQueryResult[]> => {
        const data = this.mockData.get(tableName) || [];

        // Apply where filter if provided
        let filtered = data;
        if (options?.where) {
          filtered = this.filterData(data, options.where);
        }

        // Apply orderBy if provided
        if (options?.orderBy) {
          filtered = this.applyOrderBy(filtered, options.orderBy);
        }

        // Apply limit if provided
        if (options?.limit && typeof options.limit === 'number') {
          return filtered.slice(0, options.limit);
        }

        return filtered;
      }),
    });

    return {
      funds: createTableQuery('funds'),
      forecastSnapshots: createTableQuery('forecast_snapshots'),
      portfolioCompanies: createTableQuery('portfoliocompanies'),
      fundMetrics: createTableQuery('fund_metrics'),
      fundSnapshots: createTableQuery('fund_snapshots'),
      fundBaselines: createTableQuery('fund_baselines'),
      alertRules: createTableQuery('alert_rules'),
      performanceAlerts: createTableQuery('performance_alerts'),
      varianceReports: createTableQuery('variance_reports'),
      users: createTableQuery('users'),
      investments: createTableQuery('investments'),
      investmentLots: createTableQuery('investment_lots'),
    };
  }

  /**
   * Additional helper methods
   */
  run = this.execute; // Alias for execute
  query = this.createQueryInterface(); // Drizzle relational query interface

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
      delete: /delete\s+from\s+(\w+)/i,
    };

    const pattern = patterns[operation as keyof typeof patterns];
    const match = query.match(pattern);

    return match ? match[1] : 'unknown_table';
  }

  /**
   * Get table name from Drizzle table object
   * Simplified version - assumes table object has dbName property or falls back to checking property names
   */
  private getTableNameFromObject(table: unknown): string {
    // Check common table name patterns
    if (table && typeof table === 'object') {
      // Try to get the table name from the object structure
      const symbolName = table[Symbol.for('drizzle:Name') as keyof typeof table];
      if (typeof symbolName === 'string') {
        return symbolName;
      }
      // Fallback to checking toString or hardcoded mapping
      const tableStr = table.toString?.() || '';
      if (tableStr.includes('forecast_snapshots')) return 'forecast_snapshots';
      if (tableStr.includes('forecastSnapshots')) return 'forecast_snapshots';
      if (tableStr.includes('investment_lots')) return 'investment_lots';
      if (tableStr.includes('investmentLots')) return 'investment_lots';
      if (tableStr.includes('investments')) return 'investments';
      if (tableStr.includes('funds')) return 'funds';
      if (tableStr.includes('users')) return 'users';
      if (tableStr.includes('companies')) return 'companies';
      if (tableStr.includes('portfolioCompanies')) return 'portfoliocompanies';
    }
    return 'unknown_table';
  }

  /**
   * Parse INSERT values from query and parameters
   */
  private parseInsertValues(query: string, params: unknown[]): Record<string, unknown> {
    const row: Record<string, unknown> = {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Extract column names from INSERT statement
    const columnMatch = query.match(/INSERT INTO\s+\w+\s*\(([^)]+)\)/i);
    if (columnMatch && params.length > 0) {
      const columns = columnMatch[1].split(',').map((col) => col.trim());

      // Map parameters to columns
      for (let i = 0; i < Math.min(columns.length, params.length); i++) {
        const columnName = columns[i];
        let value = params[i];

        // Handle JSON strings for JSONB columns
        if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string if not valid JSON
          }
        } else if (typeof value === 'object' && value !== null) {
          // Object passed directly - stringify it first then parse to ensure proper format
          try {
            value = JSON.parse(JSON.stringify(value));
          } catch {
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
  private validateConstraints(
    tableName: string,
    row: Record<string, unknown>,
    params: unknown[],
    existingData: Record<string, unknown>[] = []
  ): void {
    const constraints = this.constraints.get(tableName);
    if (!constraints) return;

    // Validate enum constraints
    if (constraints.enums) {
      for (const [column, allowedValues] of Object.entries(constraints.enums)) {
        const value = row[column];
        if (value !== undefined && !allowedValues.includes(String(value))) {
          throw new Error(
            `Invalid enum value '${String(value)}' for column '${column}'. Expected one of: ${allowedValues.join(', ')}`
          );
        }
      }
    }

    // Validate check constraints
    if (constraints.checks) {
      for (const [checkName, checkFn] of Object.entries(constraints.checks)) {
        // All check functions now receive the entire row
        if (!checkFn(row)) {
          throw new Error(`Check constraint '${checkName}' failed`);
        }
      }
    }

    // Validate unique constraints
    if (constraints.unique) {
      for (const [_uniqueName, uniqueFn] of Object.entries(constraints.unique)) {
        uniqueFn(row, existingData);
      }
    }

    // Validate foreign key constraints
    if (constraints.foreignKeys) {
      for (const [column, referencedTable] of Object.entries(constraints.foreignKeys)) {
        const value = row[column];
        if (value !== undefined && value !== null) {
          const referencedData = this.mockData.get(referencedTable) || [];
          const exists = referencedData.some((record) => record.id === value);
          if (!exists) {
            throw new Error(
              `Foreign key constraint violation: ${column} '${value}' does not exist in table '${referencedTable}'`
            );
          }
        }
      }
    }
  }

  /**
   * Generate mock ID (UUID format for compatibility)
   */
  private generateId(): string {
    // Generate a UUID v4 format for compatibility with tests
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Filter data based on Drizzle where clause
   * Simple matcher for eq() and and() patterns
   */
  private filterData(
    data: MockQueryResult[],
    whereClause: SQL<unknown> | Record<string, unknown>
  ): MockQueryResult[] {
    if (!whereClause) return data;

    return data.filter((row: MockQueryResult) => this.matchesWhereClause(row, whereClause));
  }

  /**
   * Apply orderBy clauses to mock results
   */
  private applyOrderBy(
    data: MockQueryResult[],
    orderBy: QueryOptions['orderBy']
  ): MockQueryResult[] {
    const clauses = this.parseOrderByClauses(orderBy);
    if (clauses.length === 0) return data;

    return [...data].sort((a, b) => this.compareOrderBy(a, b, clauses));
  }

  private parseOrderByClauses(orderBy: QueryOptions['orderBy']): OrderByClause[] {
    if (!orderBy) return [];

    const rawClauses = Array.isArray(orderBy) ? orderBy : [orderBy];
    const clauses: OrderByClause[] = [];

    for (const clause of rawClauses) {
      if (!clause || typeof clause !== 'object') continue;

      if (!this.looksLikeSqlObject(clause)) {
        const mapClauses = this.extractOrderByFromMap(clause as Record<string, unknown>);
        if (mapClauses.length > 0) {
          clauses.push(...mapClauses);
          continue;
        }
      }

      const sqlClause = this.extractOrderByFromSql(clause);
      if (sqlClause) clauses.push(sqlClause);
    }

    return clauses;
  }

  private extractOrderByFromMap(clause: Record<string, unknown>): OrderByClause[] {
    const entries = Object.entries(clause).filter(
      ([, value]) => typeof value === 'string' || typeof value === 'number'
    );
    if (entries.length === 0) return [];

    return entries.map(([column, value]) => ({
      column,
      direction: String(value).toLowerCase() === 'desc' ? 'desc' : 'asc',
    }));
  }

  private extractOrderByFromSql(clause: unknown): OrderByClause | null {
    const column = this.extractOrderByColumn(clause);
    if (!column) return null;

    const { direction, nulls } = this.extractOrderByDirection(clause);
    return { column, direction, nulls };
  }

  private extractOrderByColumn(clause: unknown): string | null {
    const columns: string[] = [];
    this.collectValuesAndColumns(clause, [], columns);
    if (columns.length > 0) return columns[0];

    const sqlText = this.extractSqlText(clause);
    return this.extractColumnNameFromSqlText(sqlText);
  }

  private extractOrderByDirection(clause: unknown): {
    direction: 'asc' | 'desc';
    nulls?: 'first' | 'last';
  } {
    const sqlText = this.extractSqlText(clause);
    const text = sqlText ? sqlText.toLowerCase() : '';

    let direction: 'asc' | 'desc' = 'asc';
    if (/\bdesc\b/i.test(text)) direction = 'desc';
    else if (/\basc\b/i.test(text)) direction = 'asc';

    let nulls: 'first' | 'last' | undefined;
    if (/\bnulls\s+first\b/i.test(text)) nulls = 'first';
    else if (/\bnulls\s+last\b/i.test(text)) nulls = 'last';

    if (!sqlText && clause && typeof clause === 'object') {
      const fallback = this.extractDirectionFromObject(clause as Record<string, unknown>);
      if (fallback) direction = fallback;
    }

    return { direction, nulls };
  }

  private extractDirectionFromObject(clause: Record<string, unknown>): 'asc' | 'desc' | null {
    const candidates = ['direction', 'order', 'sort', 'sortOrder'];
    for (const key of candidates) {
      const value = clause[key];
      if (typeof value === 'string') {
        const lowered = value.toLowerCase();
        if (lowered === 'asc' || lowered === 'desc') return lowered;
      }
    }

    if (typeof clause.desc === 'boolean') return clause.desc ? 'desc' : 'asc';
    if (typeof clause.asc === 'boolean') return clause.asc ? 'asc' : 'desc';

    return null;
  }

  private looksLikeSqlObject(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    return (
      'toSQL' in value || 'queryChunks' in value || 'sql' in value || 'shouldInlineParams' in value
    );
  }

  private extractSqlText(clause: unknown): string | null {
    if (!clause || typeof clause !== 'object') return null;

    const clauseRecord = clause as Record<string, unknown>;

    if (typeof clauseRecord.sql === 'string') return clauseRecord.sql;

    if (Array.isArray(clauseRecord.queryChunks)) {
      const text = clauseRecord.queryChunks
        .map((chunk: unknown) => {
          if (typeof chunk === 'string') return chunk;
          if (!chunk || typeof chunk !== 'object') return '';
          const chunkRecord = chunk as Record<string, unknown>;
          if (typeof chunkRecord.sql === 'string') return chunkRecord.sql;
          if (typeof chunkRecord.text === 'string') return chunkRecord.text;
          if (typeof chunkRecord.name === 'string') return chunkRecord.name;
          if (typeof chunkRecord.fieldName === 'string') return chunkRecord.fieldName;
          return '';
        })
        .join(' ');
      if (text.trim()) return text;
    }

    if (typeof clauseRecord.toSQL === 'function') {
      try {
        const result = clauseRecord.toSQL();
        if (result && typeof result === 'object') {
          const resultRecord = result as Record<string, unknown>;
          if (typeof resultRecord.sql === 'string') return resultRecord.sql;
        }
      } catch {
        // Ignore SQL rendering failures in the mock
      }
    }

    if ('_' in clauseRecord) {
      const internal = clauseRecord._;
      if (typeof internal === 'string') return internal;
      if (internal && typeof internal === 'object') {
        const internalRecord = internal as Record<string, unknown>;
        if (typeof internalRecord.sql === 'string') return internalRecord.sql;
      }
    }

    const text = (clause as { toString?: () => string }).toString?.();
    if (typeof text === 'string' && text !== '[object Object]') return text;

    return null;
  }

  private extractColumnNameFromSqlText(sqlText: string | null): string | null {
    if (!sqlText) return null;

    const cleaned = sqlText.replace(/["`]/g, ' ').replace(/\s+/g, ' ').trim();
    const directionMatch = cleaned.match(/\b(asc|desc)\b/i);
    if (directionMatch && directionMatch.index !== undefined) {
      const before = cleaned.slice(0, directionMatch.index).trim();
      const parts = before.split(' ');
      const last = parts[parts.length - 1];
      if (last) {
        const column = last.split('.').pop();
        if (column) return column;
      }
    }

    const identifiers = cleaned.match(/\b[a-zA-Z_][\w]*\b/g);
    if (!identifiers || identifiers.length === 0) return null;

    const blacklist = new Set(['nulls', 'first', 'last', 'asc', 'desc']);
    for (let i = identifiers.length - 1; i >= 0; i--) {
      const candidate = identifiers[i];
      if (!blacklist.has(candidate.toLowerCase())) return candidate;
    }

    return null;
  }

  private compareOrderBy(a: MockQueryResult, b: MockQueryResult, clauses: OrderByClause[]): number {
    for (const clause of clauses) {
      const aValue = this.getOrderByValue(a, clause.column);
      const bValue = this.getOrderByValue(b, clause.column);

      const comparison = this.compareOrderByValues(aValue, bValue, clause.direction, clause.nulls);
      if (comparison !== 0) return comparison;
    }

    return 0;
  }

  private getOrderByValue(row: MockQueryResult, column: string): unknown {
    if (column in row) return row[column];

    const camel = this.toCamelCase(column);
    if (camel in row) return row[camel];

    const snake = this.toSnakeCase(column);
    if (snake in row) return row[snake];

    return row[column];
  }

  private compareOrderByValues(
    aValue: unknown,
    bValue: unknown,
    direction: 'asc' | 'desc',
    nulls?: 'first' | 'last'
  ): number {
    const aNull = aValue === null || aValue === undefined;
    const bNull = bValue === null || bValue === undefined;
    if (aNull || bNull) {
      if (aNull && bNull) return 0;
      const placement = nulls ?? (direction === 'desc' ? 'last' : 'first');
      return aNull ? (placement === 'first' ? -1 : 1) : placement === 'first' ? 1 : -1;
    }

    const comparison = this.basicCompare(aValue, bValue);
    if (comparison === 0) return 0;
    return direction === 'desc' ? -comparison : comparison;
  }

  private basicCompare(aValue: unknown, bValue: unknown): number {
    const aNormalized = this.normalizeOrderValue(aValue);
    const bNormalized = this.normalizeOrderValue(bValue);

    if (typeof aNormalized === 'number' && typeof bNormalized === 'number') {
      return aNormalized === bNormalized ? 0 : aNormalized < bNormalized ? -1 : 1;
    }

    if (typeof aNormalized === 'bigint' && typeof bNormalized === 'bigint') {
      return aNormalized === bNormalized ? 0 : aNormalized < bNormalized ? -1 : 1;
    }

    const aString = typeof aNormalized === 'string' ? aNormalized : String(aNormalized);
    const bString = typeof bNormalized === 'string' ? bNormalized : String(bNormalized);
    const result = aString.localeCompare(bString);
    return result < 0 ? -1 : result > 0 ? 1 : 0;
  }

  private normalizeOrderValue(value: unknown): unknown {
    if (value instanceof Date) return value.getTime();

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== '') {
        const numberValue = Number(trimmed);
        if (!Number.isNaN(numberValue)) return numberValue;
      }
      return value;
    }

    return value;
  }

  private toCamelCase(value: string): string {
    if (!value.includes('_')) return value;
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }

  private toSnakeCase(value: string): string {
    return value
      .replace(/([A-Z])/g, '_$1')
      .replace(/__/g, '_')
      .toLowerCase();
  }

  /**
   * Check if a row matches the where clause
   * Simplified implementation for testing - extracts filter values and compares
   */
  private matchesWhereClause(
    row: MockQueryResult,
    whereClause: SQL<unknown> | Record<string, unknown>
  ): boolean {
    if (!whereClause) return true;

    // Extract filters from the where clause by walking its structure
    const filters = this.extractFiltersFromClause(whereClause);

    // Debug logging
    if (process.env.DEBUG_MOCK && Object.keys(filters).length > 0) {
      console.log(`[Mock matchesWhereClause] Extracted filters:`, filters);
      console.log(`[Mock matchesWhereClause] Row:`, row);
    }

    // If no filters were extracted, the where clause couldn't be parsed
    // Be conservative: only match if this is a simple empty-table check
    // Otherwise return false to avoid incorrect matches
    if (Object.keys(filters).length === 0) {
      // For safety, don't match when we can't parse the WHERE clause
      // This prevents returning wrong records for complex queries
      return false;
    }

    // Match all extracted filters
    for (const [key, value] of Object.entries(filters)) {
      if (row[key] !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Walk the where clause tree and extract filter key-value pairs
   * Simplified parser for common Drizzle patterns: eq(), and()
   */
  private extractFiltersFromClause(
    clause: SQL<unknown> | Record<string, unknown>,
    filters: Record<string, unknown> = {},
    depth: number = 0
  ): Record<string, unknown> {
    if (!clause || typeof clause !== 'object' || depth > 10) return filters;

    // Debug: Try to call toSQL if available
    if (
      process.env.DEBUG_MOCK &&
      typeof clause === 'object' &&
      clause !== null &&
      'toSQL' in clause
    ) {
      const toSQLMethod = clause.toSQL;
      if (typeof toSQLMethod === 'function') {
        try {
          const sql: unknown = toSQLMethod.call(clause);
          console.log('[extractFilters] SQL:', sql);
        } catch (e) {
          console.log('[extractFilters] toSQL failed:', e);
        }
      }
    }

    // Special handling for Drizzle SQL bindings - collect column-value pairs
    const values: unknown[] = [];
    const columns: string[] = [];

    // Walk the entire tree to find all values and column names
    this.collectValuesAndColumns(clause, values, columns);

    // Debug logging
    if (process.env.DEBUG_MOCK) {
      console.log('[extractFilters] Columns:', columns);
      console.log('[extractFilters] Values:', values);
    }

    // Match columns with values
    // Heuristic: pair them sequentially, but handle special cases
    if (columns.length === values.length) {
      // Perfect match - pair sequentially
      for (let i = 0; i < columns.length; i++) {
        if (columns[i] && values[i] !== undefined) {
          filters[columns[i]] = values[i];
        }
      }
    } else {
      // Mismatch - try to be smart about common patterns
      // For idempotency: look for 'id' or 'idempotencyKey' columns
      const idIdx = columns.findIndex((c) => c === 'id' || c.endsWith('Id'));
      const idemIdx = columns.findIndex((c) => c === 'idempotencyKey' || c.includes('idempotency'));

      if (idIdx >= 0 && idIdx < values.length) {
        filters[columns[idIdx]] = values[idIdx];
      }
      if (idemIdx >= 0 && idemIdx < values.length) {
        filters[columns[idemIdx]] = values[idemIdx];
      }

      // Fallback: sequential matching for remaining
      for (let i = 0; i < Math.min(columns.length, values.length); i++) {
        if (columns[i] && values[i] !== undefined && !(columns[i] in filters)) {
          filters[columns[i]] = values[i];
        }
      }
    }

    return filters;
  }

  /**
   * Recursively collect all values and column names from WHERE clause
   */
  private collectValuesAndColumns(
    obj: unknown,
    values: unknown[],
    columns: string[],
    depth: number = 0
  ): void {
    if (!obj || typeof obj !== 'object' || depth > 10) return;

    // Collect bind values (have encoder property)
    if ('encoder' in obj && 'value' in obj && obj.value !== undefined) {
      values.push(obj.value);
    }

    // Collect column names
    const colName = this.findColumnInTree(obj);
    if (colName && !columns.includes(colName)) {
      columns.push(colName);
    }

    // Handle arrays (like expressions in and())
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.collectValuesAndColumns(item, values, columns, depth + 1);
      }
      return;
    }

    // Recurse into nested objects
    for (const key of Object.keys(obj)) {
      if (key === 'table' || key === 'tableConfig') continue; // Skip to avoid circular refs
      const value = obj[key as keyof typeof obj];
      if (value && typeof value === 'object') {
        this.collectValuesAndColumns(value, values, columns, depth + 1);
      }
    }
  }

  /**
   * Try to find column name in an object tree
   */
  private findColumnInTree(obj: unknown): string | null {
    if (!obj || typeof obj !== 'object') return null;

    // Look for column indicators in order of specificity
    if ('fieldName' in obj && typeof obj.fieldName === 'string') return obj.fieldName;
    if ('column' in obj && obj.column && typeof obj.column === 'object') {
      const col = obj.column as Record<string, unknown>;
      if ('name' in col && typeof col.name === 'string') return col.name;
      if ('fieldName' in col && typeof col.fieldName === 'string') return col.fieldName;
    }

    // Check for 'name' property (but be careful - lots of things have 'name')
    if (
      'name' in obj &&
      typeof obj.name === 'string' &&
      !obj.name.includes(' ') &&
      obj.name.length < 50
    ) {
      // Additional check: if it has an 'encoder' sibling, it's likely a column
      if ('encoder' in obj || 'dataType' in obj) {
        return obj.name;
      }
    }

    return null;
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
        schemaname: 'public',
      },
      {
        indexname: 'fund_state_snapshots_captured_idx',
        tablename: 'fund_state_snapshots',
        indexdef:
          'CREATE INDEX fund_state_snapshots_captured_idx ON fund_state_snapshots (captured_at)',
        schemaname: 'public',
      },
      {
        indexname: 'fund_state_snapshots_type_idx',
        tablename: 'fund_state_snapshots',
        indexdef:
          'CREATE INDEX fund_state_snapshots_type_idx ON fund_state_snapshots (snapshot_type)',
        schemaname: 'public',
      },

      // Snapshot comparisons indexes
      {
        indexname: 'snapshot_comparisons_base_idx',
        tablename: 'snapshot_comparisons',
        indexdef:
          'CREATE INDEX snapshot_comparisons_base_idx ON snapshot_comparisons (base_snapshot_id)',
        schemaname: 'public',
      },
      {
        indexname: 'snapshot_comparisons_target_idx',
        tablename: 'snapshot_comparisons',
        indexdef:
          'CREATE INDEX snapshot_comparisons_target_idx ON snapshot_comparisons (target_snapshot_id)',
        schemaname: 'public',
      },

      // Timeline events indexes
      {
        indexname: 'timeline_events_fund_idx',
        tablename: 'timeline_events',
        indexdef: 'CREATE INDEX timeline_events_fund_idx ON timeline_events (fund_id)',
        schemaname: 'public',
      },
      {
        indexname: 'timeline_events_date_idx',
        tablename: 'timeline_events',
        indexdef: 'CREATE INDEX timeline_events_date_idx ON timeline_events (event_date)',
        schemaname: 'public',
      },
      {
        indexname: 'timeline_events_type_idx',
        tablename: 'timeline_events',
        indexdef: 'CREATE INDEX timeline_events_type_idx ON timeline_events (event_type)',
        schemaname: 'public',
      },

      // State restoration logs indexes
      {
        indexname: 'state_restoration_logs_fund_idx',
        tablename: 'state_restoration_logs',
        indexdef:
          'CREATE INDEX state_restoration_logs_fund_idx ON state_restoration_logs (fund_id)',
        schemaname: 'public',
      },
      {
        indexname: 'state_restoration_logs_snapshot_idx',
        tablename: 'state_restoration_logs',
        indexdef:
          'CREATE INDEX state_restoration_logs_snapshot_idx ON state_restoration_logs (snapshot_id)',
        schemaname: 'public',
      },
      {
        indexname: 'state_restoration_logs_status_idx',
        tablename: 'state_restoration_logs',
        indexdef:
          'CREATE INDEX state_restoration_logs_status_idx ON state_restoration_logs (status)',
        schemaname: 'public',
      },

      // Variance tracking indexes - fund_baselines
      {
        indexname: 'fund_baselines_fund_idx',
        tablename: 'fund_baselines',
        indexdef: 'CREATE INDEX fund_baselines_fund_idx ON fund_baselines (fund_id)',
        schemaname: 'public',
      },
      {
        indexname: 'fund_baselines_default_unique',
        tablename: 'fund_baselines',
        indexdef:
          'CREATE UNIQUE INDEX fund_baselines_default_unique ON fund_baselines (fund_id) WHERE (is_default = true)',
        schemaname: 'public',
      },

      // Variance tracking indexes - variance_reports
      {
        indexname: 'variance_reports_fund_idx',
        tablename: 'variance_reports',
        indexdef: 'CREATE INDEX variance_reports_fund_idx ON variance_reports (fund_id)',
        schemaname: 'public',
      },
      {
        indexname: 'variance_reports_baseline_idx',
        tablename: 'variance_reports',
        indexdef: 'CREATE INDEX variance_reports_baseline_idx ON variance_reports (baseline_id)',
        schemaname: 'public',
      },

      // Variance tracking indexes - performance_alerts
      {
        indexname: 'performance_alerts_fund_idx',
        tablename: 'performance_alerts',
        indexdef: 'CREATE INDEX performance_alerts_fund_idx ON performance_alerts (fund_id)',
        schemaname: 'public',
      },
      {
        indexname: 'performance_alerts_severity_idx',
        tablename: 'performance_alerts',
        indexdef: 'CREATE INDEX performance_alerts_severity_idx ON performance_alerts (severity)',
        schemaname: 'public',
      },

      // Variance tracking indexes - alert_rules
      {
        indexname: 'alert_rules_fund_idx',
        tablename: 'alert_rules',
        indexdef: 'CREATE INDEX alert_rules_fund_idx ON alert_rules (fund_id)',
        schemaname: 'public',
      },
      {
        indexname: 'alert_rules_enabled_idx',
        tablename: 'alert_rules',
        indexdef: 'CREATE INDEX alert_rules_enabled_idx ON alert_rules (is_enabled)',
        schemaname: 'public',
      },
    ];
  }

  /**
   * Mock database views for variance tracking
   */
  private getActiveBaselinesView(): MockQueryResult[] {
    const baselines = this.mockData.get('fund_baselines') || [];
    const funds = this.mockData.get('funds') || [];
    const users = this.mockData.get('users') || [];

    return baselines
      .filter((baseline: MockQueryResult) => {
        // Handle multiple boolean representations
        const isActive =
          baseline.is_active === true || baseline.is_active === 'true' || baseline.is_active === 1;
        return isActive;
      })
      .map((baseline: MockQueryResult) => {
        const fund = funds.find((f: MockQueryResult) => f.id === baseline.fund_id);
        const user = users.find((u: MockQueryResult) => u.id === baseline.created_by);

        return {
          ...baseline,
          fund_name: fund?.name || 'Unknown Fund',
          created_by_name: user?.name || 'Unknown User',
        };
      });
  }

  private getCriticalAlertsView(): MockQueryResult[] {
    const alerts = this.mockData.get('performance_alerts') || [];
    const funds = this.mockData.get('funds') || [];
    const baselines = this.mockData.get('fund_baselines') || [];

    return alerts
      .filter(
        (alert: MockQueryResult) => alert.severity === 'critical' && alert.status === 'active'
      )
      .map((alert: MockQueryResult) => {
        const fund = funds.find((f: MockQueryResult) => f.id === alert.fund_id);
        const baseline = baselines.find((b: MockQueryResult) => b.id === alert.baseline_id);

        return {
          ...alert,
          fund_name: fund?.name || 'Unknown Fund',
          baseline_name: baseline?.name || null,
        };
      });
  }

  private getVarianceSummaryView(): MockQueryResult[] {
    const reports = this.mockData.get('variance_reports') || [];
    const funds = this.mockData.get('funds') || [];
    const baselines = this.mockData.get('fund_baselines') || [];
    const alerts = this.mockData.get('performance_alerts') || [];

    return reports.map((report: MockQueryResult) => {
      const fund = funds.find((f: MockQueryResult) => f.id === report.fund_id);
      const baseline = baselines.find((b: MockQueryResult) => b.id === report.baseline_id);
      const alertCount = alerts.filter(
        (a: MockQueryResult) => a.variance_report_id === report.id
      ).length;

      return {
        ...report,
        fund_name: fund?.name || 'Unknown Fund',
        baseline_name: baseline?.name || 'Unknown Baseline',
        alert_count: alertCount,
      };
    });
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
  getCallHistory(): CallHistoryEntry[] {
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
      end: vi.fn(),
    },
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
