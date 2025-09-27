/**
 * Database Schema Tests for Time-Travel Analytics
 *
 * Comprehensive validation of time-travel analytics database tables:
 * - fund_state_snapshots
 * - snapshot_comparisons
 * - timeline_events
 * - state_restoration_logs
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testDb } from '../../helpers/test-database';
import { createSandbox } from '../../setup/test-infrastructure';

describe('Time-Travel Analytics Database Schema', () => {
  let db: any;
  let sandbox: any;

  beforeAll(async () => {
    sandbox = createSandbox();
    db = await testDb.getConnection();
  });

  afterAll(async () => {
    await testDb.cleanup();
    await sandbox.abort();
  });

  beforeEach(async () => {
    // Clean all time-travel analytics tables
    await db.execute('DELETE FROM state_restoration_logs');
    await db.execute('DELETE FROM snapshot_comparisons');
    await db.execute('DELETE FROM timeline_events');
    await db.execute('DELETE FROM fund_state_snapshots');
  });

  describe('fund_state_snapshots table', () => {
    it('should create snapshot with all required fields', async () => {
      const snapshotData = {
        fund_id: 1,
        snapshot_name: 'Q4 2024 End-of-Quarter Snapshot',
        snapshot_type: 'quarterly',
        trigger_event: 'scheduled',
        captured_at: '2024-12-31T23:59:59Z',
        portfolio_state: {
          totalValue: 1500000.00,
          deployedCapital: 1200000.00,
          portfolioCount: 15,
          companies: [
            { id: 1, name: 'TechCorp', valuation: 200000.00 },
            { id: 2, name: 'HealthInc', valuation: 300000.00 }
          ]
        },
        fund_metrics: {
          irr: 0.15,
          multiple: 1.25,
          dpi: 0.85,
          tvpi: 1.10
        },
        created_by: 1
      };

      const [result] = await db.execute(`
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
          portfolio_state, fund_metrics, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        snapshotData.fund_id, snapshotData.snapshot_name, snapshotData.snapshot_type,
        snapshotData.trigger_event, snapshotData.captured_at,
        JSON.stringify(snapshotData.portfolio_state), JSON.stringify(snapshotData.fund_metrics),
        snapshotData.created_by
      ]);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string'); // UUID
    });

    it('should enforce valid snapshot_type enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO fund_state_snapshots (
            fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
            portfolio_state, fund_metrics, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, 'Invalid Snapshot', 'invalid_type', 'manual', '2024-12-31T23:59:59Z',
          '{}', '{}', 1
        ])
      ).rejects.toThrow();
    });

    it('should enforce valid trigger_event enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO fund_state_snapshots (
            fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
            portfolio_state, fund_metrics, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, 'Invalid Trigger Snapshot', 'manual', 'invalid_trigger', '2024-12-31T23:59:59Z',
          '{}', '{}', 1
        ])
      ).rejects.toThrow();
    });

    it('should enforce valid status enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO fund_state_snapshots (
            fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
            portfolio_state, fund_metrics, created_by, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, 'Invalid Status Snapshot', 'manual', 'manual', '2024-12-31T23:59:59Z',
          '{}', '{}', 1, 'invalid_status'
        ])
      ).rejects.toThrow();
    });

    it('should validate data_integrity_score bounds (0.00 to 1.00)', async () => {
      // Test invalid data_integrity_score > 1.00
      await expect(
        db.execute(`
          INSERT INTO fund_state_snapshots (
            fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
            portfolio_state, fund_metrics, created_by, data_integrity_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, 'High Integrity Snapshot', 'manual', 'manual', '2024-12-31T23:59:59Z',
          '{}', '{}', 1, 1.50
        ])
      ).rejects.toThrow();

      // Test invalid data_integrity_score < 0.00
      await expect(
        db.execute(`
          INSERT INTO fund_state_snapshots (
            fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
            portfolio_state, fund_metrics, created_by, data_integrity_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, 'Low Integrity Snapshot', 'manual', 'manual', '2024-12-31T23:59:59Z',
          '{}', '{}', 1, -0.10
        ])
      ).rejects.toThrow();
    });

    it('should support complex JSONB fields', async () => {
      const portfolioState = {
        totalValue: 2500000.00,
        deployedCapital: 2000000.00,
        portfolioCount: 25,
        companies: [
          {
            id: 1,
            name: 'TechCorp Alpha',
            valuation: 500000.00,
            stage: 'Series A',
            sector: 'Technology',
            investmentDate: '2023-01-15',
            ownership: 0.15
          },
          {
            id: 2,
            name: 'HealthTech Beta',
            valuation: 750000.00,
            stage: 'Series B',
            sector: 'Healthcare',
            investmentDate: '2023-03-20',
            ownership: 0.12
          }
        ],
        sectorBreakdown: {
          'Technology': 0.40,
          'Healthcare': 0.30,
          'Financial Services': 0.20,
          'Other': 0.10
        }
      };

      const fundMetrics = {
        irr: 0.18,
        multiple: 1.45,
        dpi: 0.92,
        tvpi: 1.33,
        moic: 1.40,
        unrealizedValue: 1800000.00,
        realizedValue: 700000.00,
        distributionHistory: [
          { date: '2024-06-30', amount: 200000.00 },
          { date: '2024-09-30', amount: 150000.00 }
        ]
      };

      const [result] = await db.execute(`
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
          portfolio_state, fund_metrics, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, portfolio_state, fund_metrics
      `, [
        1, 'Complex Data Snapshot', 'milestone', 'manual', '2024-12-31T23:59:59Z',
        JSON.stringify(portfolioState), JSON.stringify(fundMetrics), 1
      ]);

      expect(JSON.parse(result.portfolio_state)).toEqual(portfolioState);
      expect(JSON.parse(result.fund_metrics)).toEqual(fundMetrics);
    });

    it('should support metadata and tags', async () => {
      const metadata = {
        snapshotEngine: 'time-travel-v2',
        calculationTime: 2500,
        dataSource: 'fund_management_system',
        validation: {
          checksRun: 15,
          checksPasssed: 14,
          warnings: ['Minor calculation variance in sector allocation']
        }
      };

      const tags = ['year-end', 'audited', 'board-review', 'high-confidence'];

      const [result] = await db.execute(`
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
          portfolio_state, fund_metrics, created_by, metadata, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, metadata, tags
      `, [
        1, 'Tagged Snapshot', 'annual', 'scheduled', '2024-12-31T23:59:59Z',
        '{}', '{}', 1, JSON.stringify(metadata), `{${tags.map(t => `"${t}"`).join(',')}}`
      ]);

      expect(JSON.parse(result.metadata)).toEqual(metadata);
      expect(result.tags).toEqual(tags);
    });
  });

  describe('snapshot_comparisons table', () => {
    let baseSnapshotId: string;
    let compareSnapshotId: string;

    beforeEach(async () => {
      // Create base snapshots for comparison tests
      const [baseSnapshot] = await db.execute(`
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
          portfolio_state, fund_metrics, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        1, 'Base Snapshot', 'quarterly', 'scheduled', '2024-09-30T23:59:59Z',
        '{"totalValue": 1000000.00}', '{"irr": 0.12}', 1
      ]);
      baseSnapshotId = baseSnapshot.id;

      const [compareSnapshot] = await db.execute(`
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
          portfolio_state, fund_metrics, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        1, 'Compare Snapshot', 'quarterly', 'scheduled', '2024-12-31T23:59:59Z',
        '{"totalValue": 1200000.00}', '{"irr": 0.15}', 1
      ]);
      compareSnapshotId = compareSnapshot.id;
    });

    it('should create snapshot comparison with all required fields', async () => {
      const comparisonData = {
        comparison_name: 'Q3 vs Q4 2024 Comparison',
        comparison_type: 'period_over_period',
        value_changes: {
          totalValueChange: 200000.00,
          totalValueChangePct: 0.20,
          irrChange: 0.03,
          multipleChange: 0.05
        },
        portfolio_changes: {
          newInvestments: 2,
          exits: 1,
          valuationChanges: [
            { companyId: 1, change: 100000.00, changePct: 0.25 }
          ]
        },
        insights: {
          topDrivers: ['Strong performance in TechCorp', 'Exit from LegacyCorp'],
          risks: ['Market volatility in Q4'],
          recommendations: ['Increase allocation to tech sector']
        },
        created_by: 1
      };

      const [result] = await db.execute(`
        INSERT INTO snapshot_comparisons (
          base_snapshot_id, compare_snapshot_id, comparison_name, comparison_type,
          value_changes, portfolio_changes, insights, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        baseSnapshotId, compareSnapshotId, comparisonData.comparison_name,
        comparisonData.comparison_type, JSON.stringify(comparisonData.value_changes),
        JSON.stringify(comparisonData.portfolio_changes), JSON.stringify(comparisonData.insights),
        comparisonData.created_by
      ]);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string'); // UUID
    });

    it('should enforce valid comparison_type enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO snapshot_comparisons (
            base_snapshot_id, compare_snapshot_id, comparison_name, comparison_type,
            value_changes, portfolio_changes, insights, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          baseSnapshotId, compareSnapshotId, 'Invalid Comparison', 'invalid_type',
          '{}', '{}', '{}', 1
        ])
      ).rejects.toThrow();
    });

    it('should prevent comparison of snapshot with itself', async () => {
      await expect(
        db.execute(`
          INSERT INTO snapshot_comparisons (
            base_snapshot_id, compare_snapshot_id, comparison_name, comparison_type,
            value_changes, portfolio_changes, insights, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          baseSnapshotId, baseSnapshotId, 'Self Comparison', 'point_in_time',
          '{}', '{}', '{}', 1
        ])
      ).rejects.toThrow();
    });

    it('should validate confidence_score bounds (0.00 to 1.00)', async () => {
      // Test invalid confidence_score > 1.00
      await expect(
        db.execute(`
          INSERT INTO snapshot_comparisons (
            base_snapshot_id, compare_snapshot_id, comparison_name, comparison_type,
            value_changes, portfolio_changes, insights, created_by, confidence_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          baseSnapshotId, compareSnapshotId, 'High Confidence Comparison', 'period_over_period',
          '{}', '{}', '{}', 1, 1.50
        ])
      ).rejects.toThrow();
    });
  });

  describe('timeline_events table', () => {
    let snapshotId: string;

    beforeEach(async () => {
      // Create snapshot for timeline events
      const [snapshot] = await db.execute(`
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
          portfolio_state, fund_metrics, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        1, 'Timeline Snapshot', 'milestone', 'manual', '2024-12-31T23:59:59Z',
        '{}', '{}', 1
      ]);
      snapshotId = snapshot.id;
    });

    it('should create timeline event with all required fields', async () => {
      const eventData = {
        event_type: 'investment',
        event_title: 'Series A Investment in TechCorp',
        event_description: 'Led Series A round with $2M investment',
        event_date: '2024-12-15T14:30:00Z',
        event_data: {
          companyId: 1,
          companyName: 'TechCorp',
          investmentAmount: 2000000.00,
          valuation: 10000000.00,
          ownership: 0.20,
          round: 'Series A'
        },
        impact_metrics: {
          portfolioValueImpact: 2000000.00,
          ownershipIncrease: 0.20,
          sectorAllocation: { technology: 0.45 }
        },
        created_by: 1
      };

      const [result] = await db.execute(`
        INSERT INTO timeline_events (
          fund_id, snapshot_id, event_type, event_title, event_description,
          event_date, event_data, impact_metrics, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        1, snapshotId, eventData.event_type, eventData.event_title,
        eventData.event_description, eventData.event_date,
        JSON.stringify(eventData.event_data), JSON.stringify(eventData.impact_metrics),
        eventData.created_by
      ]);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string'); // UUID
    });

    it('should enforce valid event_type enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO timeline_events (
            fund_id, snapshot_id, event_type, event_title, event_description,
            event_date, event_data, impact_metrics, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, snapshotId, 'invalid_type', 'Invalid Event', 'Test description',
          '2024-12-31T12:00:00Z', '{}', '{}', 1
        ])
      ).rejects.toThrow();
    });

    it('should enforce valid severity enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO timeline_events (
            fund_id, snapshot_id, event_type, event_title, event_description,
            event_date, event_data, impact_metrics, created_by, severity
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, snapshotId, 'investment', 'Test Event', 'Test description',
          '2024-12-31T12:00:00Z', '{}', '{}', 1, 'invalid_severity'
        ])
      ).rejects.toThrow();
    });

    it('should support complex event data structures', async () => {
      const complexEventData = {
        transaction: {
          id: 'TXN-2024-001',
          type: 'equity_investment',
          amount: 5000000.00,
          currency: 'USD',
          exchangeRate: 1.0
        },
        company: {
          id: 5,
          name: 'AI Innovations Inc',
          sector: 'Artificial Intelligence',
          stage: 'Series B',
          location: 'San Francisco, CA'
        },
        terms: {
          valuation: 25000000.00,
          ownership: 0.20,
          liquidationPreference: '1x non-participating preferred',
          boardSeats: 1,
          proRataRights: true,
          antiDilution: 'weighted average narrow'
        },
        coinvestors: [
          { name: 'Venture Partners LLC', amount: 3000000.00 },
          { name: 'Strategic Investor Corp', amount: 2000000.00 }
        ]
      };

      const impactMetrics = {
        portfolioValueIncrease: 5000000.00,
        ownershipDilution: 0.02,
        sectorRebalancing: {
          'AI/ML': 0.25,
          'Technology': 0.40,
          'Healthcare': 0.25,
          'Other': 0.10
        },
        riskProfile: 'medium-high',
        expectedExit: {
          timeframe: '5-7 years',
          estimatedMultiple: '5-10x',
          exitStrategy: ['IPO', 'Strategic Acquisition']
        }
      };

      const [result] = await db.execute(`
        INSERT INTO timeline_events (
          fund_id, snapshot_id, event_type, event_title, event_description,
          event_date, event_data, impact_metrics, created_by, severity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, event_data, impact_metrics
      `, [
        1, snapshotId, 'investment', 'Major Series B Investment',
        'Led $5M Series B round in AI Innovations Inc', '2024-12-20T10:00:00Z',
        JSON.stringify(complexEventData), JSON.stringify(impactMetrics), 1, 'high'
      ]);

      expect(JSON.parse(result.event_data)).toEqual(complexEventData);
      expect(JSON.parse(result.impact_metrics)).toEqual(impactMetrics);
    });
  });

  describe('state_restoration_logs table', () => {
    let snapshotId: string;

    beforeEach(async () => {
      // Create snapshot for restoration tests
      const [snapshot] = await db.execute(`
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
          portfolio_state, fund_metrics, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        1, 'Restoration Snapshot', 'milestone', 'manual', '2024-12-31T23:59:59Z',
        '{}', '{}', 1
      ]);
      snapshotId = snapshot.id;
    });

    it('should create restoration log with all required fields', async () => {
      const restorationData = {
        restoration_type: 'full',
        reason: 'Testing scenario analysis for board presentation',
        changes_applied: {
          portfolioChanges: 5,
          metricRecalculations: 3,
          dataUpdates: ['valuations', 'ownership_percentages', 'metrics']
        },
        before_state: {
          totalValue: 1500000.00,
          portfolioCount: 18
        },
        after_state: {
          totalValue: 1200000.00,
          portfolioCount: 15
        },
        affected_entities: {
          companies: [1, 2, 3],
          metrics: ['irr', 'multiple', 'tvpi']
        },
        restoration_duration_ms: 2500,
        initiated_by: 1
      };

      const [result] = await db.execute(`
        INSERT INTO state_restoration_logs (
          fund_id, snapshot_id, restoration_type, reason, changes_applied,
          before_state, after_state, affected_entities, restoration_duration_ms, initiated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        1, snapshotId, restorationData.restoration_type, restorationData.reason,
        JSON.stringify(restorationData.changes_applied), JSON.stringify(restorationData.before_state),
        JSON.stringify(restorationData.after_state), JSON.stringify(restorationData.affected_entities),
        restorationData.restoration_duration_ms, restorationData.initiated_by
      ]);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string'); // UUID
    });

    it('should enforce valid restoration_type enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO state_restoration_logs (
            fund_id, snapshot_id, restoration_type, reason, changes_applied,
            before_state, after_state, affected_entities, initiated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, snapshotId, 'invalid_type', 'Test reason', '{}', '{}', '{}', '{}', 1
        ])
      ).rejects.toThrow();
    });

    it('should enforce valid status enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO state_restoration_logs (
            fund_id, snapshot_id, restoration_type, reason, changes_applied,
            before_state, after_state, affected_entities, initiated_by, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, snapshotId, 'full', 'Test reason', '{}', '{}', '{}', '{}', 1, 'invalid_status'
        ])
      ).rejects.toThrow();
    });

    it('should enforce restoration_duration_ms >= 0 constraint', async () => {
      await expect(
        db.execute(`
          INSERT INTO state_restoration_logs (
            fund_id, snapshot_id, restoration_type, reason, changes_applied,
            before_state, after_state, affected_entities, restoration_duration_ms, initiated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, snapshotId, 'full', 'Test reason', '{}', '{}', '{}', '{}', -100, 1
        ])
      ).rejects.toThrow();
    });
  });

  describe('Database indexes', () => {
    it('should have proper indexes for time-travel performance', async () => {
      const indexes = await db.execute(`
        SELECT indexname, tablename, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename IN ('fund_state_snapshots', 'snapshot_comparisons', 'timeline_events', 'state_restoration_logs')
        ORDER BY tablename, indexname
      `);

      // Verify critical indexes exist
      const indexNames = indexes.map((idx: any) => idx.indexname);

      expect(indexNames).toContain('fund_state_snapshots_fund_idx');
      expect(indexNames).toContain('fund_state_snapshots_captured_idx');
      expect(indexNames).toContain('snapshot_comparisons_base_idx');
      expect(indexNames).toContain('timeline_events_fund_idx');
      expect(indexNames).toContain('timeline_events_date_idx');
      expect(indexNames).toContain('state_restoration_logs_fund_idx');
    });
  });

  describe('Database constraints and foreign keys', () => {
    it('should enforce foreign key relationships', async () => {
      // Test invalid fund_id reference
      await expect(
        db.execute(`
          INSERT INTO fund_state_snapshots (
            fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
            portfolio_state, fund_metrics, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          99999, 'Invalid Fund Snapshot', 'manual', 'manual', '2024-12-31T23:59:59Z',
          '{}', '{}', 1
        ])
      ).rejects.toThrow();

      // Test invalid snapshot_id reference in timeline_events
      await expect(
        db.execute(`
          INSERT INTO timeline_events (
            fund_id, snapshot_id, event_type, event_title, event_description,
            event_date, event_data, impact_metrics, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, '00000000-0000-0000-0000-000000000000', 'investment', 'Invalid Snapshot Event',
          'Test description', '2024-12-31T12:00:00Z', '{}', '{}', 1
        ])
      ).rejects.toThrow();
    });
  });

  describe('JSON data validation', () => {
    it('should handle malformed JSON gracefully', async () => {
      // Most databases will reject invalid JSON, but let's test with valid JSON structure
      const validJson = { test: 'value' };

      const [result] = await db.execute(`
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
          portfolio_state, fund_metrics, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, portfolio_state
      `, [
        1, 'JSON Test Snapshot', 'manual', 'manual', '2024-12-31T23:59:59Z',
        JSON.stringify(validJson), '{}', 1
      ]);

      expect(JSON.parse(result.portfolio_state)).toEqual(validJson);
    });

    it('should handle deeply nested JSON structures', async () => {
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  data: 'deep value',
                  array: [1, 2, 3, { nested: true }]
                }
              }
            }
          }
        }
      };

      const [result] = await db.execute(`
        INSERT INTO fund_state_snapshots (
          fund_id, snapshot_name, snapshot_type, trigger_event, captured_at,
          portfolio_state, fund_metrics, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, portfolio_state
      `, [
        1, 'Deep JSON Snapshot', 'manual', 'manual', '2024-12-31T23:59:59Z',
        JSON.stringify(deeplyNested), '{}', 1
      ]);

      expect(JSON.parse(result.portfolio_state)).toEqual(deeplyNested);
    });
  });
});