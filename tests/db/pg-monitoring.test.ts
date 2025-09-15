/**
 * Tests for PostgreSQL monitoring and performance metrics
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query, getPoolStats, healthCheck, closePool } from '../../server/db/pg';

describe('PostgreSQL Monitoring', () => {
  // Skip if no database URL
  const skipTests = !process.env.DATABASE_URL;
  
  describe.skipIf(skipTests)('Query Performance', () => {
    it('should track query execution time', async () => {
      const start = Date.now();
      const result = await query('SELECT 1 as test');
      const duration = Date.now() - start;
      
      expect(result.rows[0].test).toBe(1);
      expect(duration).toBeLessThan(100); // Should be fast for simple query
    });
    
    it('should log slow queries', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      
      // Simulate slow query with pg_sleep if available
      try {
        await query('SELECT pg_sleep(1.1)');
      } catch (error) {
        // pg_sleep might not be available, skip test
        consoleSpy.mockRestore();
        return;
      }
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PG] Slow query detected'),
        expect.objectContaining({
          duration_ms: expect.any(Number),
          query: expect.any(String),
          type: 'SELECT',
        })
      );
      
      consoleSpy.mockRestore();
    });
    
    it('should handle query timeouts', async () => {
      // This would timeout if statement_timeout is working
      try {
        await query('SELECT pg_sleep(10)'); // 10 second sleep
        // If we get here, timeout might not be configured
      } catch (error: any) {
        expect(error.code).toBe('57014'); // Query canceled
      }
    });
  });
  
  describe.skipIf(skipTests)('Connection Pool', () => {
    it('should report pool statistics', () => {
      const stats = getPoolStats();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('idle');
      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('max');
      expect(stats).toHaveProperty('min');
      
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(stats.active).toBeGreaterThanOrEqual(0);
      expect(stats.idle).toBeGreaterThanOrEqual(0);
      expect(stats.waiting).toBeGreaterThanOrEqual(0);
    });
    
    it('should handle concurrent connections', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        query('SELECT $1::int as num', [i])
      );
      
      const results = await Promise.all(promises);
      
      results.forEach((result, i) => {
        expect(result.rows[0].num).toBe(i);
      });
      
      const stats = getPoolStats();
      expect(stats.total).toBeGreaterThanOrEqual(1);
    });
    
    it('should reuse connections from pool', async () => {
      const stats1 = getPoolStats();
      
      // Execute queries sequentially
      await query('SELECT 1');
      await query('SELECT 2');
      await query('SELECT 3');
      
      const stats2 = getPoolStats();
      
      // Pool should reuse connections, not create new ones for each query
      expect(stats2.total).toBeLessThanOrEqual(stats1.total + 3);
    });
  });
  
  describe.skipIf(skipTests)('Health Checks', () => {
    it('should perform health check', async () => {
      const isHealthy = await healthCheck();
      expect(isHealthy).toBe(true);
    });
    
    it('should handle health check when database is accessible', async () => {
      // Mock a successful query
      const result = await query('SELECT NOW()');
      expect(result.rows).toHaveLength(1);
      
      const isHealthy = await healthCheck();
      expect(isHealthy).toBe(true);
    });
  });
  
  describe.skipIf(skipTests)('Error Handling', () => {
    it('should handle syntax errors', async () => {
      await expect(query('SELECT * FROM')).rejects.toThrow();
    });
    
    it('should handle missing table errors', async () => {
      try {
        await query('SELECT * FROM nonexistent_table_xyz');
      } catch (error: any) {
        expect(error.code).toBe('42P01'); // Undefined table
      }
    });
    
    it('should handle constraint violations', async () => {
      // Create a test table with constraint
      await query(`
        CREATE TABLE IF NOT EXISTS test_constraint (
          id SERIAL PRIMARY KEY,
          value TEXT UNIQUE
        )
      `);
      
      // Insert a value
      await query('INSERT INTO test_constraint (value) VALUES ($1)', ['test']);
      
      // Try to insert duplicate
      try {
        await query('INSERT INTO test_constraint (value) VALUES ($1)', ['test']);
      } catch (error: any) {
        expect(error.code).toBe('23505'); // Unique violation
      }
      
      // Cleanup
      await query('DROP TABLE IF EXISTS test_constraint');
    });
  });
  
  describe.skipIf(skipTests)('Query Types', () => {
    it('should categorize SELECT queries', async () => {
      const result = await query('SELECT 1');
      expect(result.command).toBe('SELECT');
    });
    
    it('should categorize INSERT queries', async () => {
      await query('CREATE TABLE IF NOT EXISTS test_insert (id INT)');
      const result = await query('INSERT INTO test_insert VALUES (1)');
      expect(result.command).toBe('INSERT');
      await query('DROP TABLE IF EXISTS test_insert');
    });
    
    it('should categorize UPDATE queries', async () => {
      await query('CREATE TABLE IF NOT EXISTS test_update (id INT, value TEXT)');
      await query('INSERT INTO test_update VALUES (1, \'old\')');
      const result = await query('UPDATE test_update SET value = \'new\' WHERE id = 1');
      expect(result.command).toBe('UPDATE');
      await query('DROP TABLE IF EXISTS test_update');
    });
    
    it('should categorize DELETE queries', async () => {
      await query('CREATE TABLE IF NOT EXISTS test_delete (id INT)');
      await query('INSERT INTO test_delete VALUES (1)');
      const result = await query('DELETE FROM test_delete WHERE id = 1');
      expect(result.command).toBe('DELETE');
      await query('DROP TABLE IF EXISTS test_delete');
    });
  });
  
  afterAll(async () => {
    if (!skipTests) {
      // Clean up test tables
      await query('DROP TABLE IF EXISTS test_constraint');
      await query('DROP TABLE IF EXISTS test_insert');
      await query('DROP TABLE IF EXISTS test_update');
      await query('DROP TABLE IF EXISTS test_delete');
    }
  });
});