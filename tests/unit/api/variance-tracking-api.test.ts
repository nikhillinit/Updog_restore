/**
 * Variance Tracking API Tests
 *
 * Comprehensive unit tests for variance tracking API endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { varianceTrackingFixtures } from '../../fixtures/variance-tracking-fixtures';
import { createSandbox } from '../../setup/test-infrastructure';

// Mock the service module (mock object inside factory to avoid hoisting violations)
vi.mock('../../../server/services/variance-tracking', () => ({
  varianceTrackingService: {
    baselines: {
      createBaseline: vi.fn(),
      getBaselines: vi.fn(),
      setDefaultBaseline: vi.fn(),
      deactivateBaseline: vi.fn(),
    },
    calculations: {
      generateVarianceReport: vi.fn(),
    },
    alerts: {
      createAlertRule: vi.fn(),
      getActiveAlerts: vi.fn(),
      acknowledgeAlert: vi.fn(),
      resolveAlert: vi.fn(),
    },
    performCompleteVarianceAnalysis: vi.fn(),
  },
}));

// Mock middleware
vi.mock('../../../server/middleware/idempotency', () => ({
  idempotency: (req: any, res: any, next: any) => next(),
}));

// Mock shared utilities
vi.mock('@shared/number', () => ({
  toNumber: (value: string, name: string, _options?: any) => {
    const num = parseInt(value);
    if (isNaN(num)) throw new Error(`Invalid ${name}`);
    return num;
  },
  NumberParseError: class NumberParseError extends Error {},
}));

// Import the mocked service and router after mocking
import { varianceTrackingService as mockVarianceTrackingService } from '../../../server/services/variance-tracking';
import varianceRouter from '../../../server/routes/variance';

describe('Variance Tracking API', () => {
  let app: express.Express;
  let sandbox: any;

  beforeEach(() => {
    sandbox = createSandbox();

    // Create Express app with variance router
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req: any, res, next) => {
      req.user = { id: '1' };
      next();
    });

    app.use(varianceRouter);

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await sandbox.abort();
  });

  describe('Baseline Management', () => {
    describe('POST /api/funds/:id/baselines', () => {
      it('should create a new baseline successfully', async () => {
        const mockBaseline = { id: 'baseline-id', ...varianceTrackingFixtures.baselines.quarterly };
        mockVarianceTrackingService.baselines.createBaseline.mockResolvedValue(mockBaseline);

        const baselineData = {
          name: 'Q4 2024 Baseline',
          description: 'End of year baseline',
          baselineType: 'quarterly',
          periodStart: '2024-10-01T00:00:00Z',
          periodEnd: '2024-12-31T23:59:59Z',
          tags: ['quarterly', 'high-confidence'],
        };

        const response = await request(app)
          .post('/api/funds/1/baselines')
          .send(baselineData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockBaseline);
        expect(response.body.message).toBe('Baseline created successfully');

        expect(mockVarianceTrackingService.baselines.createBaseline).toHaveBeenCalledWith({
          fundId: 1,
          name: 'Q4 2024 Baseline',
          description: 'End of year baseline',
          baselineType: 'quarterly',
          periodStart: new Date('2024-10-01T00:00:00Z'),
          periodEnd: new Date('2024-12-31T23:59:59Z'),
          createdBy: 1,
          tags: ['quarterly', 'high-confidence'],
        });
      });

      it('should validate required fields', async () => {
        const invalidData = {
          // Missing name
          baselineType: 'quarterly',
          periodStart: '2024-10-01T00:00:00Z',
          periodEnd: '2024-12-31T23:59:59Z',
        };

        const response = await request(app)
          .post('/api/funds/1/baselines')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
        expect(response.body.message).toBe('Invalid baseline data');
        expect(response.body.details).toBeDefined();
      });

      it('should validate baseline type enum', async () => {
        const invalidData = {
          name: 'Test Baseline',
          baselineType: 'invalid_type',
          periodStart: '2024-10-01T00:00:00Z',
          periodEnd: '2024-12-31T23:59:59Z',
        };

        const response = await request(app)
          .post('/api/funds/1/baselines')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate date formats', async () => {
        const invalidData = {
          name: 'Test Baseline',
          baselineType: 'quarterly',
          periodStart: 'invalid-date',
          periodEnd: '2024-12-31T23:59:59Z',
        };

        const response = await request(app)
          .post('/api/funds/1/baselines')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should handle invalid fund ID', async () => {
        const baselineData = {
          name: 'Test Baseline',
          baselineType: 'quarterly',
          periodStart: '2024-10-01T00:00:00Z',
          periodEnd: '2024-12-31T23:59:59Z',
        };

        const response = await request(app)
          .post('/api/funds/invalid/baselines')
          .send(baselineData)
          .expect(400);

        expect(response.body.error).toBe('Invalid fund ID');
      });

      it('should handle service errors gracefully', async () => {
        mockVarianceTrackingService.baselines.createBaseline.mockRejectedValue(
          new Error('Database connection failed')
        );

        const baselineData = {
          name: 'Test Baseline',
          baselineType: 'quarterly',
          periodStart: '2024-10-01T00:00:00Z',
          periodEnd: '2024-12-31T23:59:59Z',
        };

        const response = await request(app)
          .post('/api/funds/1/baselines')
          .send(baselineData)
          .expect(500);

        expect(response.body.error).toBe('Failed to create baseline');
        expect(response.body.message).toBe('Database connection failed');
      });
    });

    describe('GET /api/funds/:id/baselines', () => {
      it('should retrieve baselines for a fund', async () => {
        const mockBaselines = [
          varianceTrackingFixtures.baselines.quarterly,
          varianceTrackingFixtures.baselines.annual,
        ];
        mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue(mockBaselines);

        const response = await request(app).get('/api/funds/1/baselines').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockBaselines);
        expect(response.body.count).toBe(2);

        expect(mockVarianceTrackingService.baselines.getBaselines).toHaveBeenCalledWith(1, {
          baselineType: undefined,
          isDefault: undefined,
          limit: undefined,
        });
      });

      it('should filter baselines by type', async () => {
        const mockBaselines = [varianceTrackingFixtures.baselines.quarterly];
        mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue(mockBaselines);

        const response = await request(app)
          .get('/api/funds/1/baselines?baselineType=quarterly&isDefault=true&limit=10')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockBaselines);

        expect(mockVarianceTrackingService.baselines.getBaselines).toHaveBeenCalledWith(1, {
          baselineType: 'quarterly',
          isDefault: true,
          limit: 10,
        });
      });

      it('should handle invalid fund ID', async () => {
        const response = await request(app).get('/api/funds/invalid/baselines').expect(400);

        expect(response.body.error).toBe('Invalid fund ID');
      });
    });

    describe('POST /api/funds/:id/baselines/:baselineId/set-default', () => {
      it('should set default baseline successfully', async () => {
        mockVarianceTrackingService.baselines.setDefaultBaseline.mockResolvedValue(undefined);

        const response = await request(app)
          .post('/api/funds/1/baselines/baseline-123/set-default')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Default baseline updated successfully');

        expect(mockVarianceTrackingService.baselines.setDefaultBaseline).toHaveBeenCalledWith(
          'baseline-123',
          1
        );
      });

      it('should handle missing baseline ID', async () => {
        const _response = await request(app)
          .post('/api/funds/1/baselines//set-default')
          .expect(404); // Express router would return 404 for empty path segment
      });
    });

    describe('DELETE /api/funds/:id/baselines/:baselineId', () => {
      it('should deactivate baseline successfully', async () => {
        mockVarianceTrackingService.baselines.deactivateBaseline.mockResolvedValue(undefined);

        const response = await request(app)
          .delete('/api/funds/1/baselines/baseline-123')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Baseline deactivated successfully');

        expect(mockVarianceTrackingService.baselines.deactivateBaseline).toHaveBeenCalledWith(
          'baseline-123'
        );
      });
    });
  });

  describe('Variance Report Management', () => {
    describe('POST /api/funds/:id/variance-reports', () => {
      it('should generate variance report successfully', async () => {
        const mockReport = { id: 'report-id', ...varianceTrackingFixtures.reports.periodicReport };
        mockVarianceTrackingService.calculations.generateVarianceReport.mockResolvedValue(
          mockReport
        );

        const reportData = {
          reportName: 'December 2024 Variance Analysis',
          reportType: 'periodic',
          reportPeriod: 'monthly',
          asOfDate: '2024-12-31T23:59:59Z',
        };

        const response = await request(app)
          .post('/api/funds/1/variance-reports')
          .send(reportData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockReport);
        expect(response.body.message).toBe('Variance report generated successfully');

        expect(
          mockVarianceTrackingService.calculations.generateVarianceReport
        ).toHaveBeenCalledWith({
          fundId: 1,
          baselineId: '',
          reportName: 'December 2024 Variance Analysis',
          reportType: 'periodic',
          reportPeriod: 'monthly',
          asOfDate: new Date('2024-12-31T23:59:59Z'),
          generatedBy: 1,
        });
      });

      it('should validate report type enum', async () => {
        const invalidData = {
          reportName: 'Test Report',
          reportType: 'invalid_type',
        };

        const response = await request(app)
          .post('/api/funds/1/variance-reports')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate baseline ID format when provided', async () => {
        const invalidData = {
          baselineId: 'invalid-uuid',
          reportName: 'Test Report',
          reportType: 'periodic',
        };

        const response = await request(app)
          .post('/api/funds/1/variance-reports')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('GET /api/funds/:id/variance-reports', () => {
      it('should retrieve variance reports list', async () => {
        const response = await request(app).get('/api/funds/1/variance-reports').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
        expect(response.body.count).toBe(0);
        expect(response.body.message).toBe('Variance reports endpoint implemented');
      });
    });

    describe('GET /api/funds/:id/variance-reports/:reportId', () => {
      it('should retrieve specific variance report', async () => {
        const response = await request(app)
          .get('/api/funds/1/variance-reports/report-123')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeNull();
        expect(response.body.message).toBe('Specific variance report endpoint implemented');
      });

      it('should handle missing report ID', async () => {
        const _response = await request(app).get('/api/funds/1/variance-reports/').expect(404); // Express router would return 404
      });
    });
  });

  describe('Alert Management', () => {
    describe('POST /api/funds/:id/alert-rules', () => {
      it('should create alert rule successfully', async () => {
        const mockRule = { id: 'rule-id', ...varianceTrackingFixtures.alertRules.irrDeclineRule };
        mockVarianceTrackingService.alerts.createAlertRule.mockResolvedValue(mockRule);

        const ruleData = {
          name: 'IRR Decline Alert',
          description: 'Alert when IRR drops significantly',
          ruleType: 'threshold',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: -0.05,
          severity: 'critical',
          category: 'performance',
          checkFrequency: 'daily',
        };

        const response = await request(app)
          .post('/api/funds/1/alert-rules')
          .send(ruleData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockRule);
        expect(response.body.message).toBe('Alert rule created successfully');

        expect(mockVarianceTrackingService.alerts.createAlertRule).toHaveBeenCalledWith({
          fundId: 1,
          name: 'IRR Decline Alert',
          description: 'Alert when IRR drops significantly',
          ruleType: 'threshold',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: -0.05,
          secondaryThreshold: undefined,
          severity: 'critical',
          category: 'performance',
          checkFrequency: 'daily',
          createdBy: 1,
        });
      });

      it('should use default values for optional fields', async () => {
        const mockRule = { id: 'rule-id' };
        mockVarianceTrackingService.alerts.createAlertRule.mockResolvedValue(mockRule);

        const minimalRuleData = {
          name: 'Basic Alert Rule',
          ruleType: 'threshold',
          metricName: 'totalValue',
          operator: 'lt',
          thresholdValue: -0.1,
        };

        const response = await request(app)
          .post('/api/funds/1/alert-rules')
          .send(minimalRuleData)
          .expect(201);

        expect(response.body.success).toBe(true);

        const createCallArgs = mockVarianceTrackingService.alerts.createAlertRule.mock.calls[0][0];
        expect(createCallArgs.severity).toBe('warning');
        expect(createCallArgs.category).toBe('performance');
        expect(createCallArgs.checkFrequency).toBe('daily');
      });

      it('should validate operator enum', async () => {
        const invalidData = {
          name: 'Test Rule',
          ruleType: 'threshold',
          metricName: 'irr',
          operator: 'invalid_operator',
          thresholdValue: -0.05,
        };

        const response = await request(app)
          .post('/api/funds/1/alert-rules')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('GET /api/funds/:id/alerts', () => {
      it('should retrieve active alerts', async () => {
        const mockAlerts = [
          varianceTrackingFixtures.alerts.irrDeclineAlert,
          varianceTrackingFixtures.alerts.criticalValueAlert,
        ];
        mockVarianceTrackingService.alerts.getActiveAlerts.mockResolvedValue(mockAlerts);

        const response = await request(app).get('/api/funds/1/alerts').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockAlerts);
        expect(response.body.count).toBe(2);

        expect(mockVarianceTrackingService.alerts.getActiveAlerts).toHaveBeenCalledWith(1, {
          severity: undefined,
          category: undefined,
          limit: undefined,
        });
      });

      it('should filter alerts by severity and category', async () => {
        const mockAlerts = [varianceTrackingFixtures.alerts.criticalValueAlert];
        mockVarianceTrackingService.alerts.getActiveAlerts.mockResolvedValue(mockAlerts);

        const response = await request(app)
          .get('/api/funds/1/alerts?severity=critical,warning&category=performance&limit=20')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockAlerts);

        expect(mockVarianceTrackingService.alerts.getActiveAlerts).toHaveBeenCalledWith(1, {
          severity: ['critical', 'warning'],
          category: ['performance'],
          limit: 20,
        });
      });
    });

    describe('POST /api/alerts/:alertId/acknowledge', () => {
      it('should acknowledge alert successfully', async () => {
        mockVarianceTrackingService.alerts.acknowledgeAlert.mockResolvedValue(undefined);

        const acknowledgeData = {
          notes: 'Investigating the issue',
        };

        const response = await request(app)
          .post('/api/alerts/alert-123/acknowledge')
          .send(acknowledgeData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Alert acknowledged successfully');

        expect(mockVarianceTrackingService.alerts.acknowledgeAlert).toHaveBeenCalledWith(
          'alert-123',
          1,
          'Investigating the issue'
        );
      });

      it('should acknowledge alert without notes', async () => {
        mockVarianceTrackingService.alerts.acknowledgeAlert.mockResolvedValue(undefined);

        const response = await request(app)
          .post('/api/alerts/alert-123/acknowledge')
          .send({})
          .expect(200);

        expect(response.body.success).toBe(true);

        expect(mockVarianceTrackingService.alerts.acknowledgeAlert).toHaveBeenCalledWith(
          'alert-123',
          1,
          undefined
        );
      });

      it('should validate notes length', async () => {
        const longNotes = 'a'.repeat(1001); // Exceed 1000 character limit
        const acknowledgeData = { notes: longNotes };

        const response = await request(app)
          .post('/api/alerts/alert-123/acknowledge')
          .send(acknowledgeData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('POST /api/alerts/:alertId/resolve', () => {
      it('should resolve alert successfully', async () => {
        mockVarianceTrackingService.alerts.resolveAlert.mockResolvedValue(undefined);

        const resolveData = {
          notes: 'Issue resolved after portfolio rebalancing',
        };

        const response = await request(app)
          .post('/api/alerts/alert-123/resolve')
          .send(resolveData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Alert resolved successfully');

        expect(mockVarianceTrackingService.alerts.resolveAlert).toHaveBeenCalledWith(
          'alert-123',
          1,
          'Issue resolved after portfolio rebalancing'
        );
      });
    });
  });

  describe('Comprehensive Variance Analysis', () => {
    describe('POST /api/funds/:id/variance-analysis', () => {
      it('should perform complete variance analysis', async () => {
        const mockResult = {
          report: { id: 'report-id', ...varianceTrackingFixtures.reports.periodicReport },
          alertsGenerated: [
            { id: 'alert-1', severity: 'warning' },
            { id: 'alert-2', severity: 'critical' },
          ],
        };
        mockVarianceTrackingService.performCompleteVarianceAnalysis.mockResolvedValue(mockResult);

        const analysisData = {
          baselineId: 'baseline-123',
          reportName: 'Complete Analysis Report',
        };

        const response = await request(app)
          .post('/api/funds/1/variance-analysis')
          .send(analysisData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.report).toEqual(mockResult.report);
        expect(response.body.data.alertsGenerated).toEqual(mockResult.alertsGenerated);
        expect(response.body.data.alertCount).toBe(2);
        expect(response.body.message).toBe('Variance analysis completed successfully');

        expect(mockVarianceTrackingService.performCompleteVarianceAnalysis).toHaveBeenCalledWith({
          fundId: 1,
          baselineId: 'baseline-123',
          reportName: 'Complete Analysis Report',
          userId: 1,
        });
      });

      it('should perform analysis without baseline ID (use default)', async () => {
        const mockResult = {
          report: { id: 'report-id' },
          alertsGenerated: [],
        };
        mockVarianceTrackingService.performCompleteVarianceAnalysis.mockResolvedValue(mockResult);

        const analysisData = {
          reportName: 'Default Baseline Analysis',
        };

        const response = await request(app)
          .post('/api/funds/1/variance-analysis')
          .send(analysisData)
          .expect(201);

        expect(response.body.success).toBe(true);

        const callArgs =
          mockVarianceTrackingService.performCompleteVarianceAnalysis.mock.calls[0][0];
        expect(callArgs.baselineId).toBeUndefined();
        expect(callArgs.reportName).toBe('Default Baseline Analysis');
      });

      it('should validate baseline ID format when provided', async () => {
        const invalidData = {
          baselineId: 'invalid-uuid',
          reportName: 'Test Analysis',
        };

        const response = await request(app)
          .post('/api/funds/1/variance-analysis')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('GET /api/funds/:id/variance-dashboard', () => {
      it('should retrieve variance dashboard data', async () => {
        const mockBaselines = [
          { ...varianceTrackingFixtures.baselines.quarterly, isDefault: true },
          varianceTrackingFixtures.baselines.annual,
        ];
        const mockAlerts = [
          { ...varianceTrackingFixtures.alerts.irrDeclineAlert, severity: 'warning' },
          { ...varianceTrackingFixtures.alerts.criticalValueAlert, severity: 'critical' },
        ];

        mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue(mockBaselines);
        mockVarianceTrackingService.alerts.getActiveAlerts.mockResolvedValue(mockAlerts);

        const response = await request(app).get('/api/funds/1/variance-dashboard').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.defaultBaseline).toEqual(mockBaselines[0]);
        expect(response.body.data.recentBaselines).toHaveLength(2);
        expect(response.body.data.activeAlerts).toEqual(mockAlerts);
        expect(response.body.data.alertsByseverity).toEqual({
          critical: 1,
          warning: 1,
          info: 0,
        });
        expect(response.body.data.summary.totalBaselines).toBe(2);
        expect(response.body.data.summary.totalActiveAlerts).toBe(2);

        expect(mockVarianceTrackingService.baselines.getBaselines).toHaveBeenCalledWith(1, {
          limit: 5,
        });
        expect(mockVarianceTrackingService.alerts.getActiveAlerts).toHaveBeenCalledWith(1, {
          limit: 10,
        });
      });

      it('should handle no default baseline', async () => {
        const mockBaselines = [varianceTrackingFixtures.baselines.annual]; // No default
        const mockAlerts: any[] = [];

        mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue(mockBaselines);
        mockVarianceTrackingService.alerts.getActiveAlerts.mockResolvedValue(mockAlerts);

        const response = await request(app).get('/api/funds/1/variance-dashboard').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.defaultBaseline).toBeUndefined();
        expect(response.body.data.summary.lastAnalysisDate).toBeNull();
      });
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for creating baselines', async () => {
      // Override middleware to simulate no auth
      app.use((req: any, res, next) => {
        req.user = undefined;
        next();
      });

      const baselineData = {
        name: 'Test Baseline',
        baselineType: 'quarterly',
        periodStart: '2024-10-01T00:00:00Z',
        periodEnd: '2024-12-31T23:59:59Z',
      };

      const response = await request(app)
        .post('/api/funds/1/baselines')
        .send(baselineData)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should require authentication for alert operations', async () => {
      // Override middleware to simulate no auth
      app.use((req: any, res, next) => {
        req.user = undefined;
        next();
      });

      const response = await request(app)
        .post('/api/alerts/alert-123/acknowledge')
        .send({})
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('Error Handling', () => {
    it('should handle service unavailable errors', async () => {
      mockVarianceTrackingService.baselines.createBaseline.mockRejectedValue(
        new Error('Service temporarily unavailable')
      );

      const baselineData = {
        name: 'Test Baseline',
        baselineType: 'quarterly',
        periodStart: '2024-10-01T00:00:00Z',
        periodEnd: '2024-12-31T23:59:59Z',
      };

      const response = await request(app)
        .post('/api/funds/1/baselines')
        .send(baselineData)
        .expect(500);

      expect(response.body.error).toBe('Failed to create baseline');
      expect(response.body.message).toBe('Service temporarily unavailable');
    });

    it('should handle unknown errors gracefully', async () => {
      mockVarianceTrackingService.alerts.getActiveAlerts.mockRejectedValue('Unexpected error');

      const response = await request(app).get('/api/funds/1/alerts').expect(500);

      expect(response.body.error).toBe('Failed to fetch alerts');
      expect(response.body.message).toBe('Unknown error');
    });

    it('should validate numeric fund IDs in all endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/funds/abc/baselines' },
        { method: 'post', path: '/api/funds/abc/variance-reports' },
        { method: 'get', path: '/api/funds/abc/alerts' },
        { method: 'get', path: '/api/funds/abc/variance-dashboard' },
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method as keyof typeof request](endpoint.path);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid fund ID');
      }
    });
  });

  describe('Input Validation Edge Cases', () => {
    it('should handle empty request bodies gracefully', async () => {
      const response = await request(app).post('/api/funds/1/baselines').send({}).expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate tags array limits', async () => {
      const baselineData = {
        name: 'Test Baseline',
        baselineType: 'quarterly',
        periodStart: '2024-10-01T00:00:00Z',
        periodEnd: '2024-12-31T23:59:59Z',
        tags: Array(11).fill('tag'), // Exceed 10 tag limit
      };

      const response = await request(app)
        .post('/api/funds/1/baselines')
        .send(baselineData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate string length limits', async () => {
      const baselineData = {
        name: 'a'.repeat(101), // Exceed 100 character limit
        baselineType: 'quarterly',
        periodStart: '2024-10-01T00:00:00Z',
        periodEnd: '2024-12-31T23:59:59Z',
      };

      const response = await request(app)
        .post('/api/funds/1/baselines')
        .send(baselineData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle malformed JSON gracefully', async () => {
      const _response = await request(app)
        .post('/api/funds/1/baselines')
        .type('json')
        .send('{"invalid": json}')
        .expect(400);

      // Express would handle this at a higher level, but we test the concept
    });
  });

  describe('Query Parameter Validation', () => {
    it('should handle invalid limit parameters', async () => {
      const _response = await request(app).get('/api/funds/1/baselines?limit=abc').expect(200); // Service would handle this, not the route validation

      // The service would receive NaN and handle it appropriately
    });

    it('should handle boolean query parameters correctly', async () => {
      mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue([]);

      await request(app).get('/api/funds/1/baselines?isDefault=true').expect(200);

      expect(mockVarianceTrackingService.baselines.getBaselines).toHaveBeenCalledWith(1, {
        baselineType: undefined,
        isDefault: true,
        limit: undefined,
      });

      await request(app).get('/api/funds/1/baselines?isDefault=false').expect(200);

      expect(mockVarianceTrackingService.baselines.getBaselines).toHaveBeenCalledWith(1, {
        baselineType: undefined,
        isDefault: false,
        limit: undefined,
      });
    });
  });
});
