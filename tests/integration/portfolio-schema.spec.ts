/**
 * Integration tests for portfolio route database schema
 *
 * Tests Phase 1: Database schema implementation
 * - investment_lots table
 * - forecast_snapshots table
 * - reserve_allocations table
 * - investments table extensions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../server/db';
import { sql } from 'drizzle-orm';

describe('Portfolio Route Schema - Phase 1', () => {
  describe('investment_lots table', () => {
    it('should exist with correct schema', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'investment_lots'
        ORDER BY ordinal_position
      `);

      const columns = result.rows;

      // Verify table exists
      expect(columns.length).toBeGreaterThan(0);

      // Verify critical columns exist with correct types
      const columnMap = new Map(
        columns.map((col: any) => [col.column_name, col])
      );

      // UUID primary key
      expect(columnMap.has('id')).toBe(true);
      expect(columnMap.get('id')?.data_type).toBe('uuid');
      expect(columnMap.get('id')?.column_default).toContain('gen_random_uuid');

      // Foreign key to investments
      expect(columnMap.has('investment_id')).toBe(true);
      expect(columnMap.get('investment_id')?.data_type).toBe('integer');
      expect(columnMap.get('investment_id')?.is_nullable).toBe('NO');

      // Lot type enum
      expect(columnMap.has('lot_type')).toBe(true);
      expect(columnMap.get('lot_type')?.data_type).toBe('text');
      expect(columnMap.get('lot_type')?.is_nullable).toBe('NO');

      // CRITICAL: share_price_cents (bigint for precision)
      expect(columnMap.has('share_price_cents')).toBe(true);
      expect(columnMap.get('share_price_cents')?.data_type).toBe('bigint');
      expect(columnMap.get('share_price_cents')?.is_nullable).toBe('NO');

      // shares_acquired (decimal for fractional shares)
      expect(columnMap.has('shares_acquired')).toBe(true);
      expect(columnMap.get('shares_acquired')?.data_type).toBe('numeric');

      // cost_basis_cents (bigint for precision)
      expect(columnMap.has('cost_basis_cents')).toBe(true);
      expect(columnMap.get('cost_basis_cents')?.data_type).toBe('bigint');
      expect(columnMap.get('cost_basis_cents')?.is_nullable).toBe('NO');

      // Optimistic locking version
      expect(columnMap.has('version')).toBe(true);
      expect(columnMap.get('version')?.data_type).toBe('integer');
      expect(columnMap.get('version')?.column_default).toBe('1');

      // Idempotency key
      expect(columnMap.has('idempotency_key')).toBe(true);
      expect(columnMap.get('idempotency_key')?.data_type).toBe('text');

      // Timestamps
      expect(columnMap.has('created_at')).toBe(true);
      expect(columnMap.get('created_at')?.data_type).toBe('timestamp with time zone');
      expect(columnMap.has('updated_at')).toBe(true);
      expect(columnMap.get('updated_at')?.data_type).toBe('timestamp with time zone');
    });

    it('should have correct indexes', async () => {
      const result = await db.execute(sql`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'investment_lots'
      `);

      const indexes = result.rows;
      const indexNames = indexes.map((idx: any) => idx.indexname);

      // Primary key index (automatic)
      expect(indexNames.some(name => name.includes('pkey'))).toBe(true);

      // Index on investment_id for FK lookups
      expect(indexNames.some(name => name.includes('investment_id'))).toBe(true);

      // Composite index on (investment_id, lot_type)
      expect(indexNames.some(name => name.includes('lot_type'))).toBe(true);

      // Unique index on idempotency_key
      expect(indexNames.some(name => name.includes('idempotency'))).toBe(true);
    });

    it('should enforce lot_type check constraint', async () => {
      // This will fail until migration is run
      await expect(async () => {
        await db.execute(sql`
          INSERT INTO investment_lots (
            investment_id,
            lot_type,
            share_price_cents,
            shares_acquired,
            cost_basis_cents
          )
          VALUES (1, 'invalid_type', 10000, 1000, 10000000)
        `);
      }).rejects.toThrow(/check constraint/i);
    });

    it('should enforce idempotency_key uniqueness', async () => {
      const idempotencyKey = 'test-key-unique-' + Date.now();

      // First insert should succeed
      await db.execute(sql`
        INSERT INTO investment_lots (
          investment_id,
          lot_type,
          share_price_cents,
          shares_acquired,
          cost_basis_cents,
          idempotency_key
        )
        VALUES (1, 'initial', 10000, 1000, 10000000, ${idempotencyKey})
      `);

      // Duplicate idempotency_key should fail
      await expect(async () => {
        await db.execute(sql`
          INSERT INTO investment_lots (
            investment_id,
            lot_type,
            share_price_cents,
            shares_acquired,
            cost_basis_cents,
            idempotency_key
          )
          VALUES (1, 'initial', 10000, 1000, 10000000, ${idempotencyKey})
        `);
      }).rejects.toThrow(/unique constraint|duplicate key/i);
    });

    it('should cascade delete when investment is deleted', async () => {
      // Create test investment
      const [investment] = await db.execute(sql`
        INSERT INTO investments (
          fund_id,
          company_id,
          investment_date,
          amount,
          round
        )
        VALUES (1, 1, NOW(), 1000000, 'Series A')
        RETURNING id
      `);

      const investmentId = investment.id;

      // Create lot
      await db.execute(sql`
        INSERT INTO investment_lots (
          investment_id,
          lot_type,
          share_price_cents,
          shares_acquired,
          cost_basis_cents
        )
        VALUES (${investmentId}, 'initial', 10000, 10000, 100000000)
      `);

      // Delete investment
      await db.execute(sql`
        DELETE FROM investments WHERE id = ${investmentId}
      `);

      // Verify lot was cascade deleted
      const result = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM investment_lots
        WHERE investment_id = ${investmentId}
      `);

      expect(Number(result.rows[0]?.count)).toBe(0);
    });
  });

  describe('forecast_snapshots table', () => {
    it('should exist with correct schema', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'forecast_snapshots'
        ORDER BY ordinal_position
      `);

      const columns = result.rows;
      expect(columns.length).toBeGreaterThan(0);

      const columnMap = new Map(
        columns.map((col: any) => [col.column_name, col])
      );

      // UUID primary key
      expect(columnMap.has('id')).toBe(true);
      expect(columnMap.get('id')?.data_type).toBe('uuid');

      // Fund FK
      expect(columnMap.has('fund_id')).toBe(true);
      expect(columnMap.get('fund_id')?.data_type).toBe('integer');

      // Name
      expect(columnMap.has('name')).toBe(true);
      expect(columnMap.get('name')?.data_type).toBe('text');

      // Status (pending, calculating, complete, error)
      expect(columnMap.has('status')).toBe(true);
      expect(columnMap.get('status')?.data_type).toBe('text');
      expect(columnMap.get('status')?.column_default).toContain('pending');

      // Integrity hash
      expect(columnMap.has('source_hash')).toBe(true);
      expect(columnMap.get('source_hash')?.data_type).toBe('text');

      // Materialized MOIC results
      expect(columnMap.has('calculated_metrics')).toBe(true);
      expect(columnMap.get('calculated_metrics')?.data_type).toBe('jsonb');

      // Snapshot domains
      expect(columnMap.has('fund_state')).toBe(true);
      expect(columnMap.get('fund_state')?.data_type).toBe('jsonb');
      expect(columnMap.has('portfolio_state')).toBe(true);
      expect(columnMap.get('portfolio_state')?.data_type).toBe('jsonb');
      expect(columnMap.has('metrics_state')).toBe(true);
      expect(columnMap.get('metrics_state')?.data_type).toBe('jsonb');

      // Snapshot time
      expect(columnMap.has('snapshot_time')).toBe(true);
      expect(columnMap.get('snapshot_time')?.data_type).toBe('timestamp with time zone');

      // Timestamps
      expect(columnMap.has('created_at')).toBe(true);
      expect(columnMap.get('created_at')?.data_type).toBe('timestamp with time zone');
      expect(columnMap.has('updated_at')).toBe(true);
      expect(columnMap.get('updated_at')?.data_type).toBe('timestamp with time zone');

      // Optimistic locking
      expect(columnMap.has('version')).toBe(true);
      expect(columnMap.get('version')?.column_default).toBe('1');

      // Idempotency
      expect(columnMap.has('idempotency_key')).toBe(true);
    });

    it('should have indexes for efficient querying', async () => {
      const result = await db.execute(sql`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'forecast_snapshots'
      `);

      const indexes = result.rows;
      const indexDefs = indexes.map((idx: any) => idx.indexdef.toLowerCase());

      // Composite index on (fund_id, snapshot_time DESC) for cursor pagination
      expect(
        indexDefs.some(def =>
          def.includes('fund_id') && def.includes('snapshot_time')
        )
      ).toBe(true);

      // Unique index on idempotency_key
      expect(
        indexDefs.some(def => def.includes('idempotency_key'))
      ).toBe(true);

      // Index on source_hash for integrity verification
      expect(
        indexDefs.some(def => def.includes('source_hash'))
      ).toBe(true);
    });

    it('should enforce status check constraint', async () => {
      await expect(async () => {
        await db.execute(sql`
          INSERT INTO forecast_snapshots (
            fund_id,
            name,
            status,
            snapshot_time
          )
          VALUES (1, 'Test Snapshot', 'invalid_status', NOW())
        `);
      }).rejects.toThrow(/check constraint/i);
    });
  });

  describe('reserve_allocations table', () => {
    it('should exist with correct schema', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'reserve_allocations'
        ORDER BY ordinal_position
      `);

      const columns = result.rows;
      expect(columns.length).toBeGreaterThan(0);

      const columnMap = new Map(
        columns.map((col: any) => [col.column_name, col])
      );

      // UUID primary key
      expect(columnMap.has('id')).toBe(true);
      expect(columnMap.get('id')?.data_type).toBe('uuid');

      // Deterministic FK to snapshot
      expect(columnMap.has('snapshot_id')).toBe(true);
      expect(columnMap.get('snapshot_id')?.data_type).toBe('uuid');
      expect(columnMap.get('snapshot_id')?.is_nullable).toBe('NO');

      // Company FK
      expect(columnMap.has('company_id')).toBe(true);
      expect(columnMap.get('company_id')?.data_type).toBe('integer');

      // Planned reserve amount (bigint for cents precision)
      expect(columnMap.has('planned_reserve_cents')).toBe(true);
      expect(columnMap.get('planned_reserve_cents')?.data_type).toBe('bigint');
      expect(columnMap.get('planned_reserve_cents')?.is_nullable).toBe('NO');

      // Allocation metadata
      expect(columnMap.has('allocation_score')).toBe(true);
      expect(columnMap.get('allocation_score')?.data_type).toBe('numeric');
      expect(columnMap.has('priority')).toBe(true);
      expect(columnMap.get('priority')?.data_type).toBe('integer');
      expect(columnMap.has('rationale')).toBe(true);
      expect(columnMap.get('rationale')?.data_type).toBe('text');
    });

    it('should cascade delete when snapshot is deleted', async () => {
      // Create test snapshot
      const [snapshot] = await db.execute(sql`
        INSERT INTO forecast_snapshots (
          fund_id,
          name,
          snapshot_time
        )
        VALUES (1, 'Test Snapshot for Cascade', NOW())
        RETURNING id
      `);

      const snapshotId = snapshot.id;

      // Create reserve allocation
      await db.execute(sql`
        INSERT INTO reserve_allocations (
          snapshot_id,
          company_id,
          planned_reserve_cents
        )
        VALUES (${snapshotId}, 1, 500000000)
      `);

      // Delete snapshot
      await db.execute(sql`
        DELETE FROM forecast_snapshots WHERE id = ${snapshotId}
      `);

      // Verify allocation was cascade deleted
      const result = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM reserve_allocations
        WHERE snapshot_id = ${snapshotId}
      `);

      expect(Number(result.rows[0]?.count)).toBe(0);
    });
  });

  describe('investments table extensions', () => {
    it('should have new share pricing columns', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'investments'
          AND column_name IN (
            'share_price_cents',
            'shares_acquired',
            'cost_basis_cents',
            'pricing_confidence',
            'version'
          )
      `);

      const columns = result.rows;
      const columnMap = new Map(
        columns.map((col: any) => [col.column_name, col])
      );

      // share_price_cents (nullable for legacy data)
      expect(columnMap.has('share_price_cents')).toBe(true);
      expect(columnMap.get('share_price_cents')?.data_type).toBe('bigint');

      // shares_acquired
      expect(columnMap.has('shares_acquired')).toBe(true);
      expect(columnMap.get('shares_acquired')?.data_type).toBe('numeric');

      // cost_basis_cents
      expect(columnMap.has('cost_basis_cents')).toBe(true);
      expect(columnMap.get('cost_basis_cents')?.data_type).toBe('bigint');

      // pricing_confidence ('calculated' or 'verified')
      expect(columnMap.has('pricing_confidence')).toBe(true);
      expect(columnMap.get('pricing_confidence')?.data_type).toBe('text');
      expect(columnMap.get('pricing_confidence')?.column_default).toContain('calculated');

      // version for optimistic locking
      expect(columnMap.has('version')).toBe(true);
      expect(columnMap.get('version')?.data_type).toBe('integer');
      expect(columnMap.get('version')?.column_default).toBe('1');
    });
  });
});
