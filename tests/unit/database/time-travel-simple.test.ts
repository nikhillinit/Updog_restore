/**
 * Time-Travel Analytics Migration Test (Real Database)
 * Uses Testcontainers for actual PostgreSQL validation
 * Replaces mock-based test with real SQL execution
 *
 * @group integration
 * FIXME: Skipped - requires Docker/Testcontainers
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, stopTestDb, seedTestData } from '../../helpers/testcontainers-db';
import type { Client } from 'pg';

let db: Client;
let testData: { userId: number; fundId: number };

beforeAll(async () => {
  db = await startTestDb();
  testData = await seedTestData(db);
}, 60000); // 60s timeout for container startup

afterAll(async () => {
  await stopTestDb();
});

describe.skip('Time-Travel Analytics Migration (Real DB)', () => {
  describe('Table Creation', () => {
    test('fund_state_snapshots table exists with correct structure', async () => {
      const result = await db.query(`
        SELECT
          column_name,
          data_type,
          is_nullable
        FROM information_schema.columns
        WHERE table_name = 'fund_state_snapshots'
        ORDER BY ordinal_position
      `);

      expect(result.rows.length).toBeGreaterThan(0);

      // Verify key columns
      const columns = result.rows.map((r) => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('fund_id');
      expect(columns).toContain('snapshot_type');
      expect(columns).toContain('portfolio_state');
    });

    test('snapshot_comparisons table exists with constraint', async () => {
      const result = await db.query(`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'snapshot_comparisons'::regclass
          AND conname = 'snapshot_comparisons_different_snapshots'
      `);

      expect(result.rows).toHaveLength(1);
    });

    test('timeline_events table exists', async () => {
      const result = await db.query(`
        SELECT to_regclass('public.timeline_events') AS table_name
      `);

      expect(result.rows[0].table_name).toBe('timeline_events');
    });

    test('state_restoration_logs table exists', async () => {
      const result = await db.query(`
        SELECT to_regclass('public.state_restoration_logs') AS table_name
      `);

      expect(result.rows[0].table_name).toBe('state_restoration_logs');
    });
  });

  describe('Index Creation', () => {
    test('fund_state_snapshots has required indexes', async () => {
      const result = await db.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'fund_state_snapshots'
      `);

      const indexes = result.rows.map((r) => r.indexname);
      expect(indexes).toContain('fund_state_snapshots_fund_idx');
      expect(indexes).toContain('fund_state_snapshots_captured_idx');
      expect(indexes).toContain('fund_state_snapshots_portfolio_state_gin');
    });
  });

  describe('View Creation', () => {
    test('active_snapshots view exists', async () => {
      const result = await db.query(`
        SELECT to_regclass('public.active_snapshots') AS view_name
      `);

      expect(result.rows[0].view_name).toBe('active_snapshots');
    });

    test('recent_timeline_events view exists', async () => {
      const result = await db.query(`
        SELECT to_regclass('public.recent_timeline_events') AS view_name
      `);

      expect(result.rows[0].view_name).toBe('recent_timeline_events');
    });

    test('restoration_history view exists', async () => {
      const result = await db.query(`
        SELECT to_regclass('public.restoration_history') AS view_name
      `);

      expect(result.rows[0].view_name).toBe('restoration_history');
    });
  });

  describe('Functional Tests', () => {
    test('can insert snapshot with valid data', async () => {
      const result = await db.query(
        `
        INSERT INTO fund_state_snapshots (
          fund_id,
          snapshot_name,
          snapshot_type,
          trigger_event,
          portfolio_state,
          fund_metrics,
          created_by
        ) VALUES (
          $1,
          'Q4 2024 Snapshot',
          'quarterly',
          'scheduled',
          '{"investments": []}',
          '{"tvpi": 1.25}',
          $2
        )
        RETURNING id
      `,
        [testData.fundId, testData.userId]
      );

      expect(result.rows[0].id).toBeDefined();
    });

    test('snapshot_comparisons constraint prevents same snapshot comparison', async () => {
      // Create snapshot
      const snap1 = await db.query(
        `
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event,
          portfolio_state, fund_metrics, created_by
        ) VALUES ($1, 'Snap 1', 'adhoc', 'manual', '{}', '{}', $2)
        RETURNING id
      `,
        [testData.fundId, testData.userId]
      );

      const snapId = snap1.rows[0].id;

      // Attempt to compare snapshot to itself (should fail)
      await expect(
        db.query(
          `
          INSERT INTO snapshot_comparisons (
            base_snapshot_id,
            compare_snapshot_id,
            comparison_name,
            comparison_type,
            value_changes,
            created_by
          ) VALUES ($1, $1, 'Invalid', 'baseline_comparison', '{}', $2)
        `,
          [snapId, testData.userId]
        )
      ).rejects.toThrow();
    });

    test('timeline_events references snapshot with ON DELETE SET NULL', async () => {
      // Create snapshot
      const snap = await db.query(
        `
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event,
          portfolio_state, fund_metrics, created_by
        ) VALUES ($1, 'Snap', 'milestone', 'milestone', '{}', '{}', $2)
        RETURNING id
      `,
        [testData.fundId, testData.userId]
      );

      const snapId = snap.rows[0].id;

      // Create timeline event referencing snapshot
      await db.query(
        `
        INSERT INTO timeline_events (
          fund_id, snapshot_id, event_type, event_title,
          event_date, event_data, created_by
        ) VALUES ($1, $2, 'investment', 'Test Investment', NOW(), '{}', $3)
      `,
        [testData.fundId, snapId, testData.userId]
      );

      // Delete snapshot
      await db.query('DELETE FROM fund_state_snapshots WHERE id = $1', [snapId]);

      // Verify timeline event still exists with NULL snapshot_id
      const result = await db.query(`
        SELECT snapshot_id
        FROM timeline_events
        WHERE event_title = 'Test Investment'
      `);

      expect(result.rows[0].snapshot_id).toBeNull();
    });
  });

  describe('Trigger Tests', () => {
    test('updated_at timestamp updates automatically', async () => {
      // Insert snapshot
      const insert = await db.query(
        `
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event,
          portfolio_state, fund_metrics, created_by
        ) VALUES ($1, 'Trigger Test', 'adhoc', 'manual', '{}', '{}', $2)
        RETURNING id, updated_at
      `,
        [testData.fundId, testData.userId]
      );

      const snapId = insert.rows[0].id;
      const originalUpdatedAt = insert.rows[0].updated_at;

      // Wait 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Update snapshot
      await db.query(
        `
        UPDATE fund_state_snapshots
        SET snapshot_name = 'Trigger Test Updated'
        WHERE id = $1
      `,
        [snapId]
      );

      // Verify updated_at changed
      const result = await db.query(
        `
        SELECT updated_at
        FROM fund_state_snapshots
        WHERE id = $1
      `,
        [snapId]
      );

      expect(new Date(result.rows[0].updated_at).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });
  });
});
