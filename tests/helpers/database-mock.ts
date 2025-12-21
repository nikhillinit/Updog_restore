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

    // Variance tracking constraints - fund_baselines
    this.constraints.set('fund_baselines', {
      enums: {
        baseline_type: ['initial', 'quarterly', 'annual', 'milestone', 'custom']
      },
      checks: {
        period_ordering: (row: any) => {
          if (row.period_start && row.period_end) {
            return new Date(row.period_end) > new Date(row.period_start);
          }
          return true;
        },
        confidence_bounds: (row: any) => {
          if (row.confidence !== undefined && row.confidence !== null) {
            const conf = parseFloat(row.confidence);
            return conf >= 0.0 && conf <= 1.0;
          }
          return true;
        }
      },
      unique: {
        default_baseline: (row: any, existingData: any[]) => {
          // Only one default baseline per fund
          const isDefault = row.is_default === true || row.is_default === 'true' || row.is_default === 1;
          if (isDefault) {
            const existingDefault = existingData.find(
              (r: any) => {
                const rIsDefault = r.is_default === true || r.is_default === 'true' || r.is_default === 1;
                return r.fund_id === row.fund_id && rIsDefault;
              }
            );
            if (existingDefault) {
              throw new Error('Violates unique constraint: only one default baseline per fund');
            }
          }
          return true;
        }
      },
      foreignKeys: {
        fund_id: 'funds',
        created_by: 'users'
      }
    });

    // Variance tracking constraints - variance_reports
    this.constraints.set('variance_reports', {
      enums: {
        report_type: ['periodic', 'milestone', 'ad_hoc', 'alert_triggered'],
        status: ['draft', 'pending_review', 'approved', 'archived'],
        risk_level: ['low', 'medium', 'high', 'critical']
      },
      checks: {
        analysis_ordering: (row: any) => {
          if (row.analysis_start && row.analysis_end) {
            return new Date(row.analysis_end) >= new Date(row.analysis_start);
          }
          return true;
        },
        data_quality_bounds: (row: any) => {
          if (row.data_quality_score !== undefined && row.data_quality_score !== null) {
            const score = parseFloat(row.data_quality_score);
            return score >= 0.0 && score <= 1.0;
          }
          return true;
        }
      },
      foreignKeys: {
        fund_id: 'funds',
        baseline_id: 'fund_baselines'
      }
    });

    // Variance tracking constraints - performance_alerts
    this.constraints.set('performance_alerts', {
      enums: {
        severity: ['info', 'warning', 'critical', 'urgent'],
        category: ['performance', 'risk', 'operational', 'compliance'],
        status: ['active', 'acknowledged', 'resolved', 'dismissed']
      },
      checks: {
        occurrence_count_min: (row: any) => {
          if (row.occurrence_count !== undefined && row.occurrence_count !== null) {
            return parseInt(row.occurrence_count) >= 1;
          }
          return true;
        },
        escalation_level_min: (row: any) => {
          if (row.escalation_level !== undefined && row.escalation_level !== null) {
            return parseInt(row.escalation_level) >= 0;
          }
          return true;
        }
      },
      foreignKeys: {
        fund_id: 'funds',
        baseline_id: 'fund_baselines',
        variance_report_id: 'variance_reports'
      }
    });

    // Variance tracking constraints - alert_rules
    this.constraints.set('alert_rules', {
      enums: {
        rule_type: ['threshold', 'trend', 'deviation', 'pattern'],
        operator: ['gt', 'lt', 'eq', 'gte', 'lte', 'between'],
        check_frequency: ['realtime', 'hourly', 'daily', 'weekly']
      },
      checks: {
        suppression_period_min: (row: any) => {
          if (row.suppression_period_minutes !== undefined && row.suppression_period_minutes !== null) {
            return parseInt(row.suppression_period_minutes) >= 1;
          }
          return true;
        },
        trigger_count_min: (row: any) => {
          if (row.trigger_count !== undefined && row.trigger_count !== null) {
            return parseInt(row.trigger_count) >= 0;
          }
          return true;
        },
        between_operator_requires_secondary: (row: any) => {
          if (row.operator === 'between') {
            return row.secondary_threshold !== undefined && row.secondary_threshold !== null;
          }
          return true;
        }
      },
      foreignKeys: {
        created_by: 'users'
      }
    });

    // Investment lots constraints
    this.constraints.set('investment_lots', {
      enums: {
        lot_type: ['initial', 'follow_on', 'secondary']
      },
      checks: {
        idempotency_key_length: (row: any) => {
          if (row.idempotency_key !== undefined && row.idempotency_key !== null) {
            const len = row.idempotency_key.length;
            return len >= 1 && len <= 128;
          }
          return true;
        }
      },
      foreignKeys: {
        investment_id: 'investments'
      }
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
        createdAt: '2022-01-15T00:00:00Z'
      },
      {
        id: 2,
        fundId: 1,
        companyId: 1,
        investmentDate: '2022-02-15T00:00:00Z',
        amount: '500000.00',
        round: 'Series A',
        createdAt: '2022-02-15T00:00:00Z'
      },
      {
        id: 3,
        fundId: 1,
        companyId: 1,
        investmentDate: '2022-03-15T00:00:00Z',
        amount: '250000.00',
        round: 'Series B',
        createdAt: '2022-03-15T00:00:00Z'
      },
      {
        id: 4,
        fundId: 1,
        companyId: 1,
        investmentDate: '2022-04-15T00:00:00Z',
        amount: '100000.00',
        round: 'Series B',
        createdAt: '2022-04-15T00:00:00Z'
      },
      {
        id: 5,
        fundId: 2,
        companyId: 1,
        investmentDate: '2022-05-15T00:00:00Z',
        amount: '750000.00',
        round: 'Series A',
        createdAt: '2022-05-15T00:00:00Z'
      }
    ]);

    // Mock investment_lots (initially empty, populated by tests)
    this.mockData.set('investment_lots', []);

    // Mock forecast_snapshots (initially empty, populated by tests)
    this.mockData.set('forecast_snapshots', []);
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
        tableData.forEach((row: any) => {
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
   * Pattern: db.insert(table).values(data).returning()
   */
  insert = vi.fn((table) => {
    const tableName = this.getTableNameFromObject(table);
    return {
      values: vi.fn((data) => {
        // Generate ID if not provided (for UUID tables)
        const id = data.id || this.generateId();
        const result = { ...data, id };

        // Add to mock data
        const tableData = this.mockData.get(tableName) || [];
        tableData.push(result);
        this.mockData.set(tableName, tableData);

        const chain = {
          returning: vi.fn(() => Promise.resolve([result])),
          execute: vi.fn(() => Promise.resolve([result]))
        };

        return {
          ...chain,
          onConflictDoUpdate: vi.fn((config) => chain)
        };
      }),
      execute: vi.fn(() => Promise.resolve([{ id: this.generateId() }]))
    };
  });

  /**
   * Mock the update method (Drizzle query builder)
   */
  update = vi.fn((table) => {
    const tableName = this.getTableNameFromObject(table);
    return {
      set: vi.fn((updateData: Record<string, any>) => ({
        where: vi.fn((condition: any) => {
          // Get existing data
          const tableData = this.mockData.get(tableName) || [];

          // Update the first matching row (simplified - real implementation would parse condition)
          if (tableData.length > 0) {
            const updated = { ...tableData[0], ...updateData };
            tableData[0] = updated;
            this.mockData.set(tableName, tableData);

            return {
              returning: vi.fn(() => Promise.resolve([updated])),
              execute: vi.fn(() => Promise.resolve([updated]))
            };
          }

          return {
            returning: vi.fn(() => Promise.resolve([])),
            execute: vi.fn(() => Promise.resolve([]))
          };
        }),
        execute: vi.fn(() => Promise.resolve([]))
      }))
    };
  });

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
      commit: vi.fn(),
      query: this.createQueryInterface()
    };

    try {
      const result = await callback(tx);
      return result;
    } catch (error) {
      throw error;
    }
  });

  /**
   * Drizzle-style relational query interface
   */
  private createQueryInterface() {
    const createTableQuery = (tableName: string) => ({
      findFirst: vi.fn(async (options?: any) => {
        const data = this.mockData.get(tableName) || [];
        if (data.length === 0) return null;

        // If there's a where clause, try to match it (improved filtering)
        if (options?.where) {
          // Try to extract filter criteria from Drizzle where clause
          const filtered = this.filterData(data, options.where);

          // Debug logging (can be removed later)
          if (process.env.DEBUG_MOCK) {
            console.log(`[Mock findFirst] Table: ${tableName}, Data count: ${data.length}, Filtered count: ${filtered.length}`);
          }

          return filtered[0] || null;
        }
        return data[0] || null;
      }),
      findMany: vi.fn(async (options?: any) => {
        const data = this.mockData.get(tableName) || [];

        // Apply where filter if provided
        let filtered = data;
        if (options?.where) {
          filtered = this.filterData(data, options.where);
        }

        // Apply orderBy if provided
        if (options?.orderBy) {
          // Simplified - just reverse for DESC ordering
          filtered = [...filtered].reverse();
        }

        // Apply limit if provided
        if (options?.limit && typeof options.limit === 'number') {
          return filtered.slice(0, options.limit);
        }

        return filtered;
      })
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
      investmentLots: createTableQuery('investment_lots')
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
      delete: /delete\s+from\s+(\w+)/i
    };

    const pattern = patterns[operation as keyof typeof patterns];
    const match = query.match(pattern);

    return match ? match[1] : 'unknown_table';
  }

  /**
   * Get table name from Drizzle table object
   * Simplified version - assumes table object has dbName property or falls back to checking property names
   */
  private getTableNameFromObject(table: any): string {
    // Check common table name patterns
    if (table && typeof table === 'object') {
      // Try to get the table name from the object structure
      if (table[Symbol.for('drizzle:Name')]) {
        return table[Symbol.for('drizzle:Name')];
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
  private validateConstraints(tableName: string, row: Record<string, any>, params: any[], existingData: any[] = []): void {
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
        // All check functions now receive the entire row
        if (!(checkFn as Function)(row)) {
          throw new Error(`Check constraint '${checkName}' failed`);
        }
      }
    }

    // Validate unique constraints
    if (constraints.unique) {
      for (const [uniqueName, uniqueFn] of Object.entries(constraints.unique)) {
        (uniqueFn as Function)(row, existingData);
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
   * Generate mock ID (UUID format for compatibility)
   */
  private generateId(): string {
    // Generate a UUID v4 format for compatibility with tests
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Filter data based on Drizzle where clause
   * Simple matcher for eq() and and() patterns
   */
  private filterData(data: any[], whereClause: any): any[] {
    if (!whereClause) return data;

    return data.filter((row: any) => this.matchesWhereClause(row, whereClause));
  }

  /**
   * Check if a row matches the where clause
   * Simplified implementation for testing - extracts filter values and compares
   */
  private matchesWhereClause(row: any, whereClause: any): boolean {
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
  private extractFiltersFromClause(clause: any, filters: Record<string, any> = {}, depth: number = 0): Record<string, any> {
    if (!clause || typeof clause !== 'object' || depth > 10) return filters;

    // Debug: Try to call toSQL if available
    if (process.env.DEBUG_MOCK && typeof clause.toSQL === 'function') {
      try {
        const sql = clause.toSQL();
        console.log('[extractFilters] SQL:', sql);
      } catch (e) {
        console.log('[extractFilters] toSQL failed:', e);
      }
    }

    // Special handling for Drizzle SQL bindings - collect column-value pairs
    const values: any[] = [];
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
      const idIdx = columns.findIndex(c => c === 'id' || c.endsWith('Id'));
      const idemIdx = columns.findIndex(c => c === 'idempotencyKey' || c.includes('idempotency'));

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
  private collectValuesAndColumns(obj: any, values: any[], columns: string[], depth: number = 0): void {
    if (!obj || typeof obj !== 'object' || depth > 10) return;

    // Collect bind values (have encoder property)
    if (obj.encoder && obj.value !== undefined) {
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
      const value = obj[key];
      if (value && typeof value === 'object') {
        this.collectValuesAndColumns(value, values, columns, depth + 1);
      }
    }
  }

  /**
   * Try to find column name in an object tree
   */
  private findColumnInTree(obj: any): string | null {
    if (!obj || typeof obj !== 'object') return null;

    // Look for column indicators in order of specificity
    if (obj.fieldName && typeof obj.fieldName === 'string') return obj.fieldName;
    if (obj.column?.name && typeof obj.column.name === 'string') return obj.column.name;
    if (obj.column?.fieldName && typeof obj.column.fieldName === 'string') return obj.column.fieldName;

    // Check for 'name' property (but be careful - lots of things have 'name')
    if (obj.name && typeof obj.name === 'string' && !obj.name.includes(' ') && obj.name.length < 50) {
      // Additional check: if it has an 'encoder' sibling, it's likely a column
      if (obj.encoder || obj.dataType) {
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
      },

      // Variance tracking indexes - fund_baselines
      {
        indexname: 'fund_baselines_fund_idx',
        tablename: 'fund_baselines',
        indexdef: 'CREATE INDEX fund_baselines_fund_idx ON fund_baselines (fund_id)',
        schemaname: 'public'
      },
      {
        indexname: 'fund_baselines_default_unique',
        tablename: 'fund_baselines',
        indexdef: 'CREATE UNIQUE INDEX fund_baselines_default_unique ON fund_baselines (fund_id) WHERE (is_default = true)',
        schemaname: 'public'
      },

      // Variance tracking indexes - variance_reports
      {
        indexname: 'variance_reports_fund_idx',
        tablename: 'variance_reports',
        indexdef: 'CREATE INDEX variance_reports_fund_idx ON variance_reports (fund_id)',
        schemaname: 'public'
      },
      {
        indexname: 'variance_reports_baseline_idx',
        tablename: 'variance_reports',
        indexdef: 'CREATE INDEX variance_reports_baseline_idx ON variance_reports (baseline_id)',
        schemaname: 'public'
      },

      // Variance tracking indexes - performance_alerts
      {
        indexname: 'performance_alerts_fund_idx',
        tablename: 'performance_alerts',
        indexdef: 'CREATE INDEX performance_alerts_fund_idx ON performance_alerts (fund_id)',
        schemaname: 'public'
      },
      {
        indexname: 'performance_alerts_severity_idx',
        tablename: 'performance_alerts',
        indexdef: 'CREATE INDEX performance_alerts_severity_idx ON performance_alerts (severity)',
        schemaname: 'public'
      },

      // Variance tracking indexes - alert_rules
      {
        indexname: 'alert_rules_fund_idx',
        tablename: 'alert_rules',
        indexdef: 'CREATE INDEX alert_rules_fund_idx ON alert_rules (fund_id)',
        schemaname: 'public'
      },
      {
        indexname: 'alert_rules_enabled_idx',
        tablename: 'alert_rules',
        indexdef: 'CREATE INDEX alert_rules_enabled_idx ON alert_rules (is_enabled)',
        schemaname: 'public'
      }
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
      .filter((baseline: any) => {
        // Handle multiple boolean representations
        const isActive = baseline.is_active === true || baseline.is_active === 'true' || baseline.is_active === 1;
        return isActive;
      })
      .map((baseline: any) => {
        const fund = funds.find((f: any) => f.id === baseline.fund_id);
        const user = users.find((u: any) => u.id === baseline.created_by);

        return {
          ...baseline,
          fund_name: fund?.name || 'Unknown Fund',
          created_by_name: user?.name || 'Unknown User'
        };
      });
  }

  private getCriticalAlertsView(): MockQueryResult[] {
    const alerts = this.mockData.get('performance_alerts') || [];
    const funds = this.mockData.get('funds') || [];
    const baselines = this.mockData.get('fund_baselines') || [];

    return alerts
      .filter((alert: any) => alert.severity === 'critical' && alert.status === 'active')
      .map((alert: any) => {
        const fund = funds.find((f: any) => f.id === alert.fund_id);
        const baseline = baselines.find((b: any) => b.id === alert.baseline_id);

        return {
          ...alert,
          fund_name: fund?.name || 'Unknown Fund',
          baseline_name: baseline?.name || null
        };
      });
  }

  private getVarianceSummaryView(): MockQueryResult[] {
    const reports = this.mockData.get('variance_reports') || [];
    const funds = this.mockData.get('funds') || [];
    const baselines = this.mockData.get('fund_baselines') || [];
    const alerts = this.mockData.get('performance_alerts') || [];

    return reports.map((report: any) => {
      const fund = funds.find((f: any) => f.id === report.fund_id);
      const baseline = baselines.find((b: any) => b.id === report.baseline_id);
      const alertCount = alerts.filter((a: any) => a.variance_report_id === report.id).length;

      return {
        ...report,
        fund_name: fund?.name || 'Unknown Fund',
        baseline_name: baseline?.name || 'Unknown Baseline',
        alert_count: alertCount
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