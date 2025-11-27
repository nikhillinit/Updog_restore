/**
 * Database Schema Tests for Variance Tracking
 *
 * Comprehensive validation of new variance tracking database tables:
 * - fund_baselines
 * - variance_reports
 * - performance_alerts
 * - alert_rules
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testDb } from '../../helpers/test-database';
import { createSandbox } from '../../setup/test-infrastructure';

describe('Variance Tracking Database Schema', () => {
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
    // Clean all variance tracking tables
    await db.execute('DELETE FROM performance_alerts');
    await db.execute('DELETE FROM variance_reports');
    await db.execute('DELETE FROM alert_rules');
    await db.execute('DELETE FROM fund_baselines');
  });

  describe('fund_baselines table', () => {
    it('should create baseline with all required fields', async () => {
      const baseline = {
        fund_id: 1,
        name: 'Q4 2024 Baseline',
        baseline_type: 'quarterly',
        period_start: '2024-10-01T00:00:00Z',
        period_end: '2024-12-31T23:59:59Z',
        snapshot_date: '2024-12-31T23:59:59Z',
        total_value: '1500000.00',
        deployed_capital: '1200000.00',
        portfolio_count: 15,
        created_by: 1
      };

      const [result] = await db.execute(`
        INSERT INTO fund_baselines (
          fund_id, name, baseline_type, period_start, period_end,
          snapshot_date, total_value, deployed_capital, portfolio_count, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        baseline.fund_id, baseline.name, baseline.baseline_type,
        baseline.period_start, baseline.period_end, baseline.snapshot_date,
        baseline.total_value, baseline.deployed_capital, baseline.portfolio_count,
        baseline.created_by
      ]);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string'); // UUID
    });

    it('should enforce baseline_type enum constraint', async () => {
      const invalidBaseline = {
        fund_id: 1,
        name: 'Invalid Baseline',
        baseline_type: 'invalid_type',
        period_start: '2024-10-01T00:00:00Z',
        period_end: '2024-12-31T23:59:59Z',
        snapshot_date: '2024-12-31T23:59:59Z',
        total_value: '1000000.00',
        deployed_capital: '800000.00',
        portfolio_count: 10,
        created_by: 1
      };

      await expect(
        db.execute(`
          INSERT INTO fund_baselines (
            fund_id, name, baseline_type, period_start, period_end,
            snapshot_date, total_value, deployed_capital, portfolio_count, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          invalidBaseline.fund_id, invalidBaseline.name, invalidBaseline.baseline_type,
          invalidBaseline.period_start, invalidBaseline.period_end, invalidBaseline.snapshot_date,
          invalidBaseline.total_value, invalidBaseline.deployed_capital, invalidBaseline.portfolio_count,
          invalidBaseline.created_by
        ])
      ).rejects.toThrow();
    });

    it('should enforce period_end > period_start constraint', async () => {
      const invalidPeriodBaseline = {
        fund_id: 1,
        name: 'Invalid Period Baseline',
        baseline_type: 'quarterly',
        period_start: '2024-12-31T23:59:59Z',
        period_end: '2024-10-01T00:00:00Z', // End before start
        snapshot_date: '2024-12-31T23:59:59Z',
        total_value: '1000000.00',
        deployed_capital: '800000.00',
        portfolio_count: 10,
        created_by: 1
      };

      await expect(
        db.execute(`
          INSERT INTO fund_baselines (
            fund_id, name, baseline_type, period_start, period_end,
            snapshot_date, total_value, deployed_capital, portfolio_count, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          invalidPeriodBaseline.fund_id, invalidPeriodBaseline.name, invalidPeriodBaseline.baseline_type,
          invalidPeriodBaseline.period_start, invalidPeriodBaseline.period_end, invalidPeriodBaseline.snapshot_date,
          invalidPeriodBaseline.total_value, invalidPeriodBaseline.deployed_capital, invalidPeriodBaseline.portfolio_count,
          invalidPeriodBaseline.created_by
        ])
      ).rejects.toThrow();
    });

    it('should enforce unique default baseline per fund', async () => {
      // Create first default baseline
      await db.execute(`
        INSERT INTO fund_baselines (
          fund_id, name, baseline_type, period_start, period_end,
          snapshot_date, total_value, deployed_capital, portfolio_count,
          created_by, is_default, is_active
        ) VALUES (1, 'Default Baseline 1', 'quarterly', '2024-10-01T00:00:00Z',
                  '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z', '1000000.00',
                  '800000.00', 10, 1, true, true)
      `);

      // Attempt to create second default baseline for same fund
      await expect(
        db.execute(`
          INSERT INTO fund_baselines (
            fund_id, name, baseline_type, period_start, period_end,
            snapshot_date, total_value, deployed_capital, portfolio_count,
            created_by, is_default, is_active
          ) VALUES (1, 'Default Baseline 2', 'quarterly', '2024-10-01T00:00:00Z',
                    '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z', '1200000.00',
                    '900000.00', 12, 1, true, true)
        `)
      ).rejects.toThrow();
    });

    it('should validate confidence bounds (0.00 to 1.00)', async () => {
      // Test invalid confidence > 1.00
      await expect(
        db.execute(`
          INSERT INTO fund_baselines (
            fund_id, name, baseline_type, period_start, period_end,
            snapshot_date, total_value, deployed_capital, portfolio_count,
            created_by, confidence
          ) VALUES (1, 'High Confidence', 'quarterly', '2024-10-01T00:00:00Z',
                    '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z', '1000000.00',
                    '800000.00', 10, 1, 1.50)
        `)
      ).rejects.toThrow();

      // Test invalid confidence < 0.00
      await expect(
        db.execute(`
          INSERT INTO fund_baselines (
            fund_id, name, baseline_type, period_start, period_end,
            snapshot_date, total_value, deployed_capital, portfolio_count,
            created_by, confidence
          ) VALUES (1, 'Negative Confidence', 'quarterly', '2024-10-01T00:00:00Z',
                    '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z', '1000000.00',
                    '800000.00', 10, 1, -0.10)
        `)
      ).rejects.toThrow();
    });

    it('should support JSONB fields for complex data', async () => {
      const sectorDistribution = {
        'Technology': 0.35,
        'Healthcare': 0.25,
        'Financial Services': 0.20,
        'Consumer': 0.15,
        'Other': 0.05
      };

      const pacingMetrics = {
        'deploymentRate': 0.75,
        'quarterlyTarget': 0.80,
        'paceVsTarget': 0.94
      };

      const [result] = await db.execute(`
        INSERT INTO fund_baselines (
          fund_id, name, baseline_type, period_start, period_end,
          snapshot_date, total_value, deployed_capital, portfolio_count,
          created_by, sector_distribution, pacing_metrics
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, sector_distribution, pacing_metrics
      `, [
        1, 'JSONB Test Baseline', 'quarterly', '2024-10-01T00:00:00Z',
        '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z', '1000000.00',
        '800000.00', 10, 1, JSON.stringify(sectorDistribution), JSON.stringify(pacingMetrics)
      ]);

      // Database returns JSONB as parsed JavaScript objects, not strings
      expect(result.sector_distribution).toEqual(sectorDistribution);
      expect(result.pacing_metrics).toEqual(pacingMetrics);
    });

    it('should support tags array field', async () => {
      const tags = ['quarterly', 'approved', 'high-confidence'];

      const [result] = await db.execute(`
        INSERT INTO fund_baselines (
          fund_id, name, baseline_type, period_start, period_end,
          snapshot_date, total_value, deployed_capital, portfolio_count,
          created_by, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, tags
      `, [
        1, 'Tagged Baseline', 'quarterly', '2024-10-01T00:00:00Z',
        '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z', '1000000.00',
        '800000.00', 10, 1, `{${tags.map(t => `"${t}"`).join(',')}}`
      ]);

      // PostgreSQL array handling - tags returned as PostgreSQL array string
      const resultTags = Array.isArray(result.tags) ? result.tags :
        result.tags.replace(/[{}]/g, '').split(',').map((t: string) => t.replace(/"/g, '').trim());
      expect(resultTags).toEqual(expect.arrayContaining(tags));
    });
  });

  describe('variance_reports table', () => {
    let baselineId: string;

    beforeEach(async () => {
      // Create a baseline for testing
      const [baseline] = await db.execute(`
        INSERT INTO fund_baselines (
          fund_id, name, baseline_type, period_start, period_end,
          snapshot_date, total_value, deployed_capital, portfolio_count, created_by
        ) VALUES (1, 'Test Baseline', 'quarterly', '2024-10-01T00:00:00Z',
                  '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z', '1000000.00',
                  '800000.00', 10, 1)
        RETURNING id
      `);
      baselineId = baseline.id;
    });

    it('should create variance report with all required fields', async () => {
      const currentMetrics = {
        totalValue: 1100000.00,
        deployedCapital: 900000.00,
        irr: 0.15,
        multiple: 1.25
      };

      const baselineMetrics = {
        totalValue: 1000000.00,
        deployedCapital: 800000.00,
        irr: 0.12,
        multiple: 1.20
      };

      const [result] = await db.execute(`
        INSERT INTO variance_reports (
          fund_id, baseline_id, report_name, report_type,
          analysis_start, analysis_end, as_of_date,
          current_metrics, baseline_metrics
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        1, baselineId, 'Q4 2024 Variance Report', 'periodic',
        '2024-10-01T00:00:00Z', '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z',
        JSON.stringify(currentMetrics), JSON.stringify(baselineMetrics)
      ]);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string'); // UUID
    });

    it('should enforce valid report_type enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO variance_reports (
            fund_id, baseline_id, report_name, report_type,
            analysis_start, analysis_end, as_of_date,
            current_metrics, baseline_metrics
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, baselineId, 'Invalid Report', 'invalid_type',
          '2024-10-01T00:00:00Z', '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z',
          '{}', '{}'
        ])
      ).rejects.toThrow();
    });

    it('should enforce valid status enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO variance_reports (
            fund_id, baseline_id, report_name, report_type,
            analysis_start, analysis_end, as_of_date,
            current_metrics, baseline_metrics, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, baselineId, 'Invalid Status Report', 'periodic',
          '2024-10-01T00:00:00Z', '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z',
          '{}', '{}', 'invalid_status'
        ])
      ).rejects.toThrow();
    });

    it('should enforce valid risk_level enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO variance_reports (
            fund_id, baseline_id, report_name, report_type,
            analysis_start, analysis_end, as_of_date,
            current_metrics, baseline_metrics, risk_level
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, baselineId, 'Invalid Risk Report', 'periodic',
          '2024-10-01T00:00:00Z', '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z',
          '{}', '{}', 'invalid_risk'
        ])
      ).rejects.toThrow();
    });

    it('should enforce analysis_end >= analysis_start constraint', async () => {
      await expect(
        db.execute(`
          INSERT INTO variance_reports (
            fund_id, baseline_id, report_name, report_type,
            analysis_start, analysis_end, as_of_date,
            current_metrics, baseline_metrics
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, baselineId, 'Invalid Period Report', 'periodic',
          '2024-12-31T23:59:59Z', '2024-10-01T00:00:00Z', '2024-12-31T23:59:59Z',
          '{}', '{}'
        ])
      ).rejects.toThrow();
    });

    it('should validate data_quality_score bounds (0.00 to 1.00)', async () => {
      // Test invalid data_quality_score > 1.00
      await expect(
        db.execute(`
          INSERT INTO variance_reports (
            fund_id, baseline_id, report_name, report_type,
            analysis_start, analysis_end, as_of_date,
            current_metrics, baseline_metrics, data_quality_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, baselineId, 'High Quality Report', 'periodic',
          '2024-10-01T00:00:00Z', '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z',
          '{}', '{}', 1.50
        ])
      ).rejects.toThrow();
    });
  });

  describe('performance_alerts table', () => {
    let baselineId: string;
    let reportId: string;

    beforeEach(async () => {
      // Create baseline and report for testing
      const [baseline] = await db.execute(`
        INSERT INTO fund_baselines (
          fund_id, name, baseline_type, period_start, period_end,
          snapshot_date, total_value, deployed_capital, portfolio_count, created_by
        ) VALUES (1, 'Test Baseline', 'quarterly', '2024-10-01T00:00:00Z',
                  '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z', '1000000.00',
                  '800000.00', 10, 1)
        RETURNING id
      `);
      baselineId = baseline.id;

      const [report] = await db.execute(`
        INSERT INTO variance_reports (
          fund_id, baseline_id, report_name, report_type,
          analysis_start, analysis_end, as_of_date,
          current_metrics, baseline_metrics
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        1, baselineId, 'Test Report', 'periodic',
        '2024-10-01T00:00:00Z', '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z',
        '{}', '{}'
      ]);
      reportId = report.id;
    });

    it('should create performance alert with all required fields', async () => {
      const [result] = await db.execute(`
        INSERT INTO performance_alerts (
          fund_id, baseline_id, variance_report_id, alert_type,
          severity, category, title, description, metric_name, triggered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        1, baselineId, reportId, 'threshold_breach', 'critical', 'performance',
        'IRR Decline Alert', 'IRR has declined by more than 5%', 'irr',
        '2024-12-31T12:00:00Z'
      ]);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string'); // UUID
    });

    it('should enforce valid severity enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO performance_alerts (
            fund_id, alert_type, severity, category, title, description,
            metric_name, triggered_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, 'threshold_breach', 'invalid_severity', 'performance',
          'Test Alert', 'Test description', 'irr', '2024-12-31T12:00:00Z'
        ])
      ).rejects.toThrow();
    });

    it('should enforce valid category enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO performance_alerts (
            fund_id, alert_type, severity, category, title, description,
            metric_name, triggered_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, 'threshold_breach', 'warning', 'invalid_category',
          'Test Alert', 'Test description', 'irr', '2024-12-31T12:00:00Z'
        ])
      ).rejects.toThrow();
    });

    it('should enforce valid status enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO performance_alerts (
            fund_id, alert_type, severity, category, title, description,
            metric_name, triggered_at, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, 'threshold_breach', 'warning', 'performance',
          'Test Alert', 'Test description', 'irr', '2024-12-31T12:00:00Z',
          'invalid_status'
        ])
      ).rejects.toThrow();
    });

    it('should enforce occurrence_count >= 1 constraint', async () => {
      await expect(
        db.execute(`
          INSERT INTO performance_alerts (
            fund_id, alert_type, severity, category, title, description,
            metric_name, triggered_at, occurrence_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, 'threshold_breach', 'warning', 'performance',
          'Test Alert', 'Test description', 'irr', '2024-12-31T12:00:00Z', 0
        ])
      ).rejects.toThrow();
    });

    it('should enforce escalation_level >= 0 constraint', async () => {
      await expect(
        db.execute(`
          INSERT INTO performance_alerts (
            fund_id, alert_type, severity, category, title, description,
            metric_name, triggered_at, escalation_level
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          1, 'threshold_breach', 'warning', 'performance',
          'Test Alert', 'Test description', 'irr', '2024-12-31T12:00:00Z', -1
        ])
      ).rejects.toThrow();
    });
  });

  describe('alert_rules table', () => {
    it('should create alert rule with all required fields', async () => {
      const [result] = await db.execute(`
        INSERT INTO alert_rules (
          name, rule_type, metric_name, operator, threshold_value,
          severity, category, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        'IRR Threshold Rule', 'threshold', 'irr', 'lt', -0.05,
        'critical', 'performance', 1
      ]);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string'); // UUID
    });

    it('should enforce valid rule_type enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO alert_rules (
            name, rule_type, metric_name, operator, threshold_value,
            severity, category, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'Invalid Rule', 'invalid_type', 'irr', 'lt', -0.05,
          'critical', 'performance', 1
        ])
      ).rejects.toThrow();
    });

    it('should enforce valid operator enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO alert_rules (
            name, rule_type, metric_name, operator, threshold_value,
            severity, category, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'Invalid Operator Rule', 'threshold', 'irr', 'invalid_op', -0.05,
          'critical', 'performance', 1
        ])
      ).rejects.toThrow();
    });

    it('should enforce secondary_threshold requirement for between operator', async () => {
      // Test missing secondary_threshold for 'between' operator
      await expect(
        db.execute(`
          INSERT INTO alert_rules (
            name, rule_type, metric_name, operator, threshold_value,
            severity, category, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'Between Rule', 'threshold', 'irr', 'between', 0.10,
          'warning', 'performance', 1
        ])
      ).rejects.toThrow();

      // Test valid 'between' operator with secondary_threshold
      const [result] = await db.execute(`
        INSERT INTO alert_rules (
          name, rule_type, metric_name, operator, threshold_value,
          secondary_threshold, severity, category, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        'Valid Between Rule', 'threshold', 'irr', 'between', 0.10,
        0.20, 'warning', 'performance', 1
      ]);

      expect(result.id).toBeDefined();
    });

    it('should enforce valid check_frequency enum', async () => {
      await expect(
        db.execute(`
          INSERT INTO alert_rules (
            name, rule_type, metric_name, operator, threshold_value,
            severity, category, created_by, check_frequency
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'Invalid Frequency Rule', 'threshold', 'irr', 'lt', -0.05,
          'critical', 'performance', 1, 'invalid_frequency'
        ])
      ).rejects.toThrow();
    });

    it('should enforce suppression_period_minutes >= 1 constraint', async () => {
      await expect(
        db.execute(`
          INSERT INTO alert_rules (
            name, rule_type, metric_name, operator, threshold_value,
            severity, category, created_by, suppression_period_minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'Zero Suppression Rule', 'threshold', 'irr', 'lt', -0.05,
          'critical', 'performance', 1, 0
        ])
      ).rejects.toThrow();
    });

    it('should enforce trigger_count >= 0 constraint', async () => {
      await expect(
        db.execute(`
          INSERT INTO alert_rules (
            name, rule_type, metric_name, operator, threshold_value,
            severity, category, created_by, trigger_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'Negative Trigger Rule', 'threshold', 'irr', 'lt', -0.05,
          'critical', 'performance', 1, -1
        ])
      ).rejects.toThrow();
    });
  });

  describe('Database indexes', () => {
    it('should have proper indexes for performance', async () => {
      const indexes = await db.execute(`
        SELECT indexname, tablename, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename IN ('fund_baselines', 'variance_reports', 'performance_alerts', 'alert_rules')
        ORDER BY tablename, indexname
      `);

      // Verify critical indexes exist
      const indexNames = indexes.map((idx: any) => idx.indexname);

      expect(indexNames).toContain('fund_baselines_fund_idx');
      expect(indexNames).toContain('fund_baselines_default_unique');
      expect(indexNames).toContain('variance_reports_fund_idx');
      expect(indexNames).toContain('variance_reports_baseline_idx');
      expect(indexNames).toContain('performance_alerts_fund_idx');
      expect(indexNames).toContain('performance_alerts_severity_idx');
      expect(indexNames).toContain('alert_rules_fund_idx');
      expect(indexNames).toContain('alert_rules_enabled_idx');
    });
  });

  describe('Database views', () => {
    beforeEach(async () => {
      // Create test data for views
      const [baseline] = await db.execute(`
        INSERT INTO fund_baselines (
          fund_id, name, baseline_type, period_start, period_end,
          snapshot_date, total_value, deployed_capital, portfolio_count,
          created_by, is_active, is_default
        ) VALUES (1, 'Test Baseline', 'quarterly', '2024-10-01T00:00:00Z',
                  '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z', '1000000.00',
                  '800000.00', 10, 1, true, true)
        RETURNING id
      `);

      await db.execute(`
        INSERT INTO performance_alerts (
          fund_id, baseline_id, alert_type, severity, category,
          title, description, metric_name, triggered_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        1, baseline.id, 'threshold_breach', 'critical', 'performance',
        'Critical Alert', 'Test critical alert', 'irr',
        '2024-12-31T12:00:00Z', 'active'
      ]);
    });

    it('should query active_baselines view', async () => {
      const baselines = await db.execute('SELECT * FROM active_baselines WHERE fund_id = 1');

      expect(baselines).toHaveLength(1);
      expect(baselines[0].name).toBe('Test Baseline');
      expect(baselines[0].fund_name).toBeDefined();
      expect(baselines[0].created_by_name).toBeDefined();
    });

    it('should query critical_alerts view', async () => {
      const alerts = await db.execute('SELECT * FROM critical_alerts WHERE fund_id = 1');

      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].fund_name).toBeDefined();
      expect(alerts[0].baseline_name).toBeDefined();
    });

    it('should query variance_summary view', async () => {
      // First create a variance report
      const [baseline] = await db.execute('SELECT id FROM fund_baselines WHERE fund_id = 1 LIMIT 1');

      await db.execute(`
        INSERT INTO variance_reports (
          fund_id, baseline_id, report_name, report_type,
          analysis_start, analysis_end, as_of_date,
          current_metrics, baseline_metrics, risk_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        1, baseline.id, 'Test Report', 'periodic',
        '2024-10-01T00:00:00Z', '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z',
        '{}', '{}', 'medium'
      ]);

      const reports = await db.execute('SELECT * FROM variance_summary WHERE fund_id = 1');

      expect(reports).toHaveLength(1);
      expect(reports[0].report_name).toBe('Test Report');
      expect(reports[0].fund_name).toBeDefined();
      expect(reports[0].baseline_name).toBeDefined();
      expect(reports[0].alert_count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Database triggers', () => {
    it('should auto-update updated_at on record modification', async () => {
      // Create baseline
      const [baseline] = await db.execute(`
        INSERT INTO fund_baselines (
          fund_id, name, baseline_type, period_start, period_end,
          snapshot_date, total_value, deployed_capital, portfolio_count, created_by
        ) VALUES (1, 'Original Name', 'quarterly', '2024-10-01T00:00:00Z',
                  '2024-12-31T23:59:59Z', '2024-12-31T23:59:59Z', '1000000.00',
                  '800000.00', 10, 1)
        RETURNING id, updated_at
      `);

      const originalUpdatedAt = baseline.updated_at;

      // Wait to ensure timestamp difference (500ms for database trigger + network)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update the baseline
      const [updated] = await db.execute(`
        UPDATE fund_baselines
        SET name = 'Updated Name'
        WHERE id = ?
        RETURNING updated_at
      `, [baseline.id]);

      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });
  });
});