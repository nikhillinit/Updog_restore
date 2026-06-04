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
import {
  VarianceAnalysisResponseSchema,
  VarianceDashboardResponseSchema,
  VarianceReportClientResponseSchema,
} from '../../../shared/variance-validation';

function buildBaselineResponse(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: '00000000-0000-0000-0000-000000000101',
    fundId: 1,
    name: 'Q4 2024 Quarterly Baseline',
    description: 'End of year quarterly baseline with strong performance metrics',
    baselineType: 'quarterly',
    periodStart: '2024-10-01T00:00:00.000Z',
    periodEnd: '2024-12-31T23:59:59.000Z',
    snapshotDate: '2024-12-31T23:59:59.000Z',
    totalValue: '2500000.00',
    deployedCapital: '2000000.00',
    irr: '0.1850',
    multiple: '1.4500',
    dpi: '0.9200',
    tvpi: '1.3800',
    portfolioCount: 18,
    averageInvestment: '138888.89',
    topPerformers: { companies: [] },
    companySnapshots: null,
    sectorDistribution: { Technology: 0.35 },
    stageDistribution: { Seed: 0.15 },
    reserveAllocation: { totalReserves: 500000 },
    pacingMetrics: { deploymentRate: 0.8 },
    isActive: true,
    isDefault: false,
    confidence: '0.92',
    version: '1.0',
    parentBaselineId: null,
    sourceSnapshotId: null,
    sourceRunId: null,
    createdBy: 1,
    approvedBy: null,
    tags: ['quarterly'],
    createdAt: '2024-12-31T12:00:00.000Z',
    updatedAt: '2024-12-31T12:00:00.000Z',
    ...overrides,
  };
}

// Mock the service module (mock object inside factory to avoid hoisting violations)
vi.mock('../../../server/services/variance-tracking', () => ({
  varianceTrackingService: {
    baselines: {
      createBaseline: vi.fn(),
      getBaselines: vi.fn(),
      getBaselineById: vi.fn(),
      setDefaultBaseline: vi.fn(),
      deactivateBaseline: vi.fn(),
    },
    calculations: {
      generateVarianceReport: vi.fn(),
      getVarianceReports: vi.fn(),
      getVarianceReportById: vi.fn(),
    },
    alerts: {
      createAlertRule: vi.fn(),
      getActiveAlerts: vi.fn(),
      acknowledgeAlert: vi.fn(),
      resolveAlert: vi.fn(),
    },
    performCompleteVarianceAnalysis: vi.fn(),
    setDefaultBaselineAndCleanup: vi.fn(),
    cleanupSupersededAlertsForCurrentDefaultBaseline: vi.fn(),
  },
}));

// Mock middleware
vi.mock('../../../server/middleware/idempotency', () => ({
  idempotency: (req: any, res: any, next: any) => next(),
}));

// Mock shared utilities
vi.mock('@shared/number', () => {
  class NumberParseErrorMock extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NumberParseError';
    }
  }

  return {
    toNumber: (value: string, name: string, _options?: any) => {
      const num = parseInt(value);
      if (isNaN(num)) throw new NumberParseErrorMock(`Invalid ${name}`);
      return num;
    },
    NumberParseError: NumberParseErrorMock,
  };
});

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

      it('should reject baselines whose end date is before the start date', async () => {
        const invalidData = {
          name: 'Test Baseline',
          baselineType: 'quarterly',
          periodStart: '2024-12-31T23:59:59Z',
          periodEnd: '2024-10-01T00:00:00Z',
        };

        const response = await request(app)
          .post('/api/funds/1/baselines')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
        expect(response.body.message).toBe('Invalid baseline data');
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
        mockVarianceTrackingService.setDefaultBaselineAndCleanup.mockResolvedValue({
          baseline: { id: 'baseline-123' },
          resolvedSupersededAlerts: 2,
        });

        const response = await request(app)
          .post('/api/funds/1/baselines/baseline-123/set-default')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Default baseline updated successfully');
        expect(response.body.data).toEqual({
          baselineId: 'baseline-123',
          resolvedSupersededAlerts: 2,
        });

        expect(mockVarianceTrackingService.setDefaultBaselineAndCleanup).toHaveBeenCalledWith({
          fundId: 1,
          baselineId: 'baseline-123',
          userId: 1,
        });
      });

      it('should omit userId when setting a default baseline without an attached user', async () => {
        const unauthenticatedApp = express();
        unauthenticatedApp.use(express.json());
        unauthenticatedApp.use(varianceRouter);

        mockVarianceTrackingService.setDefaultBaselineAndCleanup.mockResolvedValue({
          baseline: { id: 'baseline-123' },
          resolvedSupersededAlerts: 0,
        });

        await request(unauthenticatedApp)
          .post('/api/funds/1/baselines/baseline-123/set-default')
          .expect(200);

        expect(mockVarianceTrackingService.setDefaultBaselineAndCleanup).toHaveBeenCalledWith({
          fundId: 1,
          baselineId: 'baseline-123',
        });
      });

      it('should handle missing baseline ID', async () => {
        const _response = await request(app)
          .post('/api/funds/1/baselines//set-default')
          .expect(404); // Express router would return 404 for empty path segment
      });

      it('should return 404 when the baseline does not belong to the fund', async () => {
        mockVarianceTrackingService.setDefaultBaselineAndCleanup.mockRejectedValue(
          new Error('Baseline not found for fund')
        );

        const response = await request(app)
          .post('/api/funds/1/baselines/baseline-404/set-default')
          .expect(404);

        expect(response.body.error).toBe('Failed to set default baseline');
        expect(response.body.message).toBe('Baseline not found for fund');
      });
    });

    describe('POST /api/funds/:id/alerts/cleanup-superseded', () => {
      it('should resolve superseded alerts for the current default baseline', async () => {
        mockVarianceTrackingService.cleanupSupersededAlertsForCurrentDefaultBaseline.mockResolvedValue(
          {
            baseline: { id: 'current-baseline-id' },
            resolvedSupersededAlerts: 3,
          }
        );

        const response = await request(app)
          .post('/api/funds/1/alerts/cleanup-superseded')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Superseded alerts cleaned up successfully');
        expect(response.body.data).toEqual({
          baselineId: 'current-baseline-id',
          resolvedSupersededAlerts: 3,
        });
        expect(
          mockVarianceTrackingService.cleanupSupersededAlertsForCurrentDefaultBaseline
        ).toHaveBeenCalledWith({
          fundId: 1,
          userId: 1,
        });
      });

      it('should return 404 when the fund has no current default baseline', async () => {
        mockVarianceTrackingService.cleanupSupersededAlertsForCurrentDefaultBaseline.mockRejectedValue(
          new Error('No default baseline found for fund')
        );

        const response = await request(app)
          .post('/api/funds/1/alerts/cleanup-superseded')
          .expect(404);

        expect(response.body.error).toBe('Failed to clean up superseded alerts');
        expect(response.body.message).toBe('No default baseline found for fund');
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
        // Route resolves default baseline when baselineId omitted
        mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue([
          { id: '00000000-0000-0000-0000-000000000111', isDefault: true },
        ]);

        const rawDbReport = {
          id: '00000000-0000-0000-0000-000000000211',
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000111',
          reportName: 'December 2024 Variance Analysis',
          reportType: 'periodic',
          reportPeriod: 'monthly',
          asOfDate: new Date('2024-12-31T23:59:59Z'),
          totalValueVariance: '150000.00',
          totalValueVariancePct: '0.06',
          irrVariance: '-0.013',
          multipleVariance: null,
          dpiVariance: null,
          tvpiVariance: null,
          significantVariances: [{ metric: 'irr', severity: 'medium' }],
          createdAt: new Date('2024-12-31T12:00:00Z'),
        };
        mockVarianceTrackingService.calculations.generateVarianceReport.mockResolvedValue(
          rawDbReport
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
        expect(response.body.data.summary).toBeDefined();
        expect(response.body.data.variances).toBeDefined();
        expect(response.body.data.generatedAt).toBeDefined();
        expect(response.body.message).toBe('Variance report generated successfully');

        expect(
          mockVarianceTrackingService.calculations.generateVarianceReport
        ).toHaveBeenCalledWith({
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000111',
          reportName: 'December 2024 Variance Analysis',
          reportType: 'periodic',
          reportPeriod: 'monthly',
          asOfDate: new Date('2024-12-31T23:59:59Z'),
          generatedBy: 1,
        });
      });

      it('should resolve default baseline when baselineId omitted', async () => {
        mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue([
          { id: '00000000-0000-0000-0000-000000000112', isDefault: true },
        ]);

        const rawDbReport = {
          id: '00000000-0000-0000-0000-000000000212',
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000112',
          reportName: 'Test Report',
          reportType: 'ad_hoc',
          asOfDate: new Date('2024-12-31'),
          totalValueVariance: '100.00',
          totalValueVariancePct: '0.01',
          irrVariance: null,
          multipleVariance: null,
          dpiVariance: null,
          tvpiVariance: null,
          significantVariances: [],
          createdAt: new Date('2024-12-31T12:00:00Z'),
        };
        mockVarianceTrackingService.calculations.generateVarianceReport.mockResolvedValue(
          rawDbReport
        );

        await request(app)
          .post('/api/funds/1/variance-reports')
          .send({ reportName: 'Test Report', reportType: 'ad_hoc' })
          .expect(201);

        expect(mockVarianceTrackingService.baselines.getBaselines).toHaveBeenCalledWith(1, {
          isDefault: true,
        });
        expect(
          mockVarianceTrackingService.calculations.generateVarianceReport
        ).toHaveBeenCalledWith(
          expect.objectContaining({ baselineId: '00000000-0000-0000-0000-000000000112' })
        );
      });

      it('should return 400 when no default baseline exists and baselineId omitted', async () => {
        mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue([]);

        const response = await request(app)
          .post('/api/funds/1/variance-reports')
          .send({ reportName: 'Test Report', reportType: 'ad_hoc' })
          .expect(400);

        expect(response.body.error).toBe('No baseline available');
        expect(
          mockVarianceTrackingService.calculations.generateVarianceReport
        ).not.toHaveBeenCalled();
      });

      it('should return client-shaped response with summary and variances', async () => {
        mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue([
          { id: '00000000-0000-0000-0000-000000000113', isDefault: true },
        ]);

        const rawDbReport = {
          id: '00000000-0000-0000-0000-000000000213',
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000113',
          reportName: 'Test',
          reportType: 'ad_hoc',
          asOfDate: new Date('2024-12-31'),
          totalValueVariance: '150000.00',
          totalValueVariancePct: '0.06',
          irrVariance: '-0.013',
          multipleVariance: null,
          dpiVariance: null,
          tvpiVariance: null,
          significantVariances: [{ metric: 'irr', severity: 'medium' }],
          createdAt: new Date('2024-12-31T12:00:00Z'),
        };
        mockVarianceTrackingService.calculations.generateVarianceReport.mockResolvedValue(
          rawDbReport
        );

        const response = await request(app)
          .post('/api/funds/1/variance-reports')
          .send({ reportName: 'Test', reportType: 'ad_hoc' })
          .expect(201);

        const data = response.body.data;
        expect(VarianceReportClientResponseSchema.parse(data).summary.totalVariances).toBe(2);
        expect(data.summary.totalVariances).toBe(2);
        expect(data.summary.significantVariances).toBe(1);
        expect(data.summary.criticalVariances).toBe(0);
        expect(typeof data.generatedAt).toBe('string');
        expect(Array.isArray(data.variances)).toBe(true);
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

      it('should return 404 when explicit baselineId does not belong to fund', async () => {
        // The baseline exists but belongs to a different fund
        mockVarianceTrackingService.baselines.getBaselineById.mockResolvedValue(undefined);

        const reportData = {
          baselineId: '00000000-0000-0000-0000-000000000999',
          reportName: 'Cross-fund attempt',
          reportType: 'ad_hoc',
        };

        const response = await request(app)
          .post('/api/funds/1/variance-reports')
          .send(reportData)
          .expect(404);

        expect(response.body.error).toBe('Baseline not found');
        expect(response.body.message).toBe('The specified baseline does not belong to this fund.');
        expect(
          mockVarianceTrackingService.calculations.generateVarianceReport
        ).not.toHaveBeenCalled();
      });

      it('should accept explicit baselineId that belongs to fund', async () => {
        const ownedBaseline = {
          id: '00000000-0000-0000-0000-000000000123',
          fundId: 1,
          isDefault: false,
        };
        mockVarianceTrackingService.baselines.getBaselineById.mockResolvedValue(ownedBaseline);

        const mockReport = {
          id: '00000000-0000-0000-0000-000000000215',
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000123',
          reportName: 'Explicit Baseline Report',
          reportType: 'periodic',
          asOfDate: new Date('2024-12-31'),
          createdAt: new Date('2024-12-31T12:00:00Z'),
          totalValueVariance: '100.00',
          irrVariance: null,
          multipleVariance: null,
          dpiVariance: null,
          tvpiVariance: null,
          significantVariances: [],
        };
        mockVarianceTrackingService.calculations.generateVarianceReport.mockResolvedValue(
          mockReport
        );

        const reportData = {
          baselineId: '00000000-0000-0000-0000-000000000123',
          reportName: 'Explicit Baseline Report',
          reportType: 'periodic',
        };

        const response = await request(app)
          .post('/api/funds/1/variance-reports')
          .send(reportData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(
          mockVarianceTrackingService.calculations.generateVarianceReport
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            baselineId: '00000000-0000-0000-0000-000000000123',
          })
        );
      });
    });

    describe('GET /api/funds/:id/variance-reports', () => {
      it('should retrieve variance reports list', async () => {
        const rawReports = [
          {
            id: '00000000-0000-0000-0000-000000000214',
            fundId: 1,
            baselineId: '00000000-0000-0000-0000-000000000123',
            reportName: 'December 2024 Variance Analysis',
            reportType: 'periodic',
            reportPeriod: 'monthly',
            asOfDate: new Date('2024-12-31T23:59:59Z'),
            totalValueVariance: '150000.00',
            totalValueVariancePct: '0.06',
            irrVariance: '-0.013',
            multipleVariance: null,
            dpiVariance: null,
            tvpiVariance: null,
            significantVariances: [{ metric: 'irr', severity: 'high' }],
            createdAt: new Date('2024-12-31T12:00:00Z'),
          },
        ];
        mockVarianceTrackingService.calculations.getVarianceReports.mockResolvedValue(rawReports);

        const response = await request(app).get('/api/funds/1/variance-reports').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.count).toBe(1);
        expect(
          VarianceReportClientResponseSchema.parse(response.body.data[0]).summary.totalVariances
        ).toBe(2);
        expect(response.body.data[0].id).toBe('00000000-0000-0000-0000-000000000214');
        expect(response.body.data[0].summary.totalVariances).toBe(2);
        expect(response.body.data[0].summary.criticalVariances).toBe(1);
        expect(mockVarianceTrackingService.calculations.getVarianceReports).toHaveBeenCalledWith(1);
      });
    });

    describe('GET /api/funds/:id/variance-reports/:reportId', () => {
      it('should retrieve specific variance report', async () => {
        const rawReport = {
          id: '00000000-0000-0000-0000-000000000214',
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000123',
          reportName: 'December 2024 Variance Analysis',
          reportType: 'periodic',
          reportPeriod: 'monthly',
          asOfDate: new Date('2024-12-31T23:59:59Z'),
          totalValueVariance: '150000.00',
          totalValueVariancePct: '0.06',
          irrVariance: '-0.013',
          multipleVariance: null,
          dpiVariance: null,
          tvpiVariance: null,
          significantVariances: [{ metric: 'irr', severity: 'medium' }],
          createdAt: new Date('2024-12-31T12:00:00Z'),
        };
        mockVarianceTrackingService.calculations.getVarianceReportById.mockResolvedValue(rawReport);

        const response = await request(app)
          .get('/api/funds/1/variance-reports/00000000-0000-0000-0000-000000000214')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(VarianceReportClientResponseSchema.parse(response.body.data).id).toBe(
          '00000000-0000-0000-0000-000000000214'
        );
        expect(response.body.data.id).toBe('00000000-0000-0000-0000-000000000214');
        expect(response.body.data.summary.totalVariances).toBe(2);
        expect(mockVarianceTrackingService.calculations.getVarianceReportById).toHaveBeenCalledWith(
          1,
          '00000000-0000-0000-0000-000000000214'
        );
      });

      it('should return 404 when report does not belong to fund', async () => {
        mockVarianceTrackingService.calculations.getVarianceReportById.mockResolvedValue(undefined);

        const response = await request(app)
          .get('/api/funds/1/variance-reports/00000000-0000-0000-0000-000000000214')
          .expect(404);

        expect(response.body.error).toBe('Variance report not found');
        expect(response.body.message).toBe(
          'The specified variance report does not belong to this fund.'
        );
      });

      it('should handle missing report ID', async () => {
        // Test that trailing slash matches the list endpoint (GET /api/funds/:id/variance-reports)
        // instead of the specific report endpoint
        mockVarianceTrackingService.calculations.getVarianceReports.mockResolvedValue([]);
        const response = await request(app).get('/api/funds/1/variance-reports/').expect(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
        expect(response.body.count).toBe(0);
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
          suppressionPeriod: 1440,
          notificationChannels: ['email', 'slack'],
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
          suppressionPeriod: 1440,
          notificationChannels: ['email', 'slack'],
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
        expect(createCallArgs.suppressionPeriod).toBe(60);
        expect(createCallArgs.notificationChannels).toEqual(['email']);
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

      it('should require secondaryThreshold when operator is between', async () => {
        const invalidData = {
          name: 'Range Rule',
          ruleType: 'threshold',
          metricName: 'irr',
          operator: 'between',
          thresholdValue: -0.05,
        };

        const response = await request(app)
          .post('/api/funds/1/alert-rules')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
        expect(response.body.message).toBe('Invalid alert rule data');
      });

      it('should reject unsupported rule extensions for Phase 1C.1', async () => {
        const invalidData = {
          name: 'Conditional Rule',
          ruleType: 'threshold',
          metricName: 'irr',
          operator: 'lt',
          thresholdValue: -0.05,
          conditions: {
            minimumVariance: 0.01,
          },
        };

        const response = await request(app)
          .post('/api/funds/1/alert-rules')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
        expect(mockVarianceTrackingService.alerts.createAlertRule).not.toHaveBeenCalled();
      });
    });

    describe('GET /api/funds/:id/alerts', () => {
      it('should retrieve active alerts', async () => {
        const mockAlerts = [
          {
            id: '00000000-0000-0000-0000-000000000301',
            fundId: 1,
            baselineId: '00000000-0000-0000-0000-000000000201',
            ruleId: '00000000-0000-0000-0000-000000000401',
            title: 'IRR Decline Detected',
            description:
              'Fund IRR has declined by 1.3% from the quarterly baseline, falling below the warning threshold of 1%.',
            severity: 'warning',
            category: 'performance',
            status: 'active',
            triggeredAt: '2024-12-31T15:30:00.000Z',
            contextData: {
              baselineDate: '2024-12-31T23:59:59Z',
              baselineName: 'Q4 2024 Baseline',
            },
          },
          {
            id: '00000000-0000-0000-0000-000000000302',
            fundId: 1,
            baselineId: '00000000-0000-0000-0000-000000000202',
            ruleId: '00000000-0000-0000-0000-000000000402',
            title: 'Critical Portfolio Value Decline',
            description:
              'Total portfolio value has declined by 12% in the last 24 hours, exceeding the critical threshold of 10%.',
            severity: 'critical',
            category: 'risk',
            status: 'acknowledged',
            triggeredAt: '2024-12-31T09:15:00.000Z',
            contextData: { marketConditions: 'High volatility' },
          },
        ];
        mockVarianceTrackingService.alerts.getActiveAlerts.mockResolvedValue(mockAlerts);

        const response = await request(app).get('/api/funds/1/alerts').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([
          {
            id: '00000000-0000-0000-0000-000000000301',
            fundId: 1,
            baselineId: '00000000-0000-0000-0000-000000000201',
            baselineName: 'Q4 2024 Baseline',
            ruleId: '00000000-0000-0000-0000-000000000401',
            ruleName: 'IRR Decline Detected',
            severity: 'warning',
            category: 'performance',
            message:
              'Fund IRR has declined by 1.3% from the quarterly baseline, falling below the warning threshold of 1%.',
            details: {
              baselineDate: '2024-12-31T23:59:59Z',
              baselineName: 'Q4 2024 Baseline',
            },
            status: 'active',
            triggeredAt: '2024-12-31T15:30:00.000Z',
            acknowledgedAt: null,
            acknowledgedBy: null,
            resolvedAt: null,
            resolvedBy: null,
            notes: null,
          },
          {
            id: '00000000-0000-0000-0000-000000000302',
            fundId: 1,
            baselineId: '00000000-0000-0000-0000-000000000202',
            baselineName: null,
            ruleId: '00000000-0000-0000-0000-000000000402',
            ruleName: 'Critical Portfolio Value Decline',
            severity: 'critical',
            category: 'risk',
            message:
              'Total portfolio value has declined by 12% in the last 24 hours, exceeding the critical threshold of 10%.',
            details: { marketConditions: 'High volatility' },
            status: 'acknowledged',
            triggeredAt: '2024-12-31T09:15:00.000Z',
            acknowledgedAt: null,
            acknowledgedBy: null,
            resolvedAt: null,
            resolvedBy: null,
            notes: null,
          },
        ]);
        expect(response.body.count).toBe(2);

        expect(mockVarianceTrackingService.alerts.getActiveAlerts).toHaveBeenCalledWith(1, {
          severity: undefined,
          category: undefined,
          limit: undefined,
        });
      });

      it('should filter alerts by severity and category', async () => {
        const mockAlerts = [
          {
            id: '00000000-0000-0000-0000-000000000302',
            fundId: 1,
            ruleId: '00000000-0000-0000-0000-000000000402',
            title: 'Critical Portfolio Value Decline',
            description:
              'Total portfolio value has declined by 12% in the last 24 hours, exceeding the critical threshold of 10%.',
            severity: 'critical',
            category: 'performance',
            status: 'acknowledged',
            triggeredAt: '2024-12-31T09:15:00.000Z',
            contextData: { marketConditions: 'High volatility' },
          },
        ];
        mockVarianceTrackingService.alerts.getActiveAlerts.mockResolvedValue(mockAlerts);

        const response = await request(app)
          .get('/api/funds/1/alerts?severity=critical,warning&category=performance&limit=20')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data[0]).toMatchObject({
          id: '00000000-0000-0000-0000-000000000302',
          ruleName: 'Critical Portfolio Value Decline',
          severity: 'critical',
          category: 'performance',
        });

        expect(mockVarianceTrackingService.alerts.getActiveAlerts).toHaveBeenCalledWith(1, {
          severity: ['critical', 'warning'],
          category: ['performance'],
          limit: 20,
        });
      });

      it('should forward status filters and prefer contextData.ruleName', async () => {
        mockVarianceTrackingService.alerts.getActiveAlerts.mockResolvedValue([
          {
            id: '00000000-0000-0000-0000-000000000303',
            fundId: 1,
            baselineId: '00000000-0000-0000-0000-000000000203',
            ruleId: '00000000-0000-0000-0000-000000000403',
            title: 'Stored Incident Title',
            description: 'IRR variance remains outside the configured threshold.',
            severity: 'warning',
            category: 'performance',
            status: 'investigating',
            triggeredAt: '2024-12-31T10:00:00.000Z',
            contextData: {
              ruleName: 'Canonical IRR Rule Name',
            },
          },
        ]);

        const response = await request(app)
          .get('/api/funds/1/alerts?status=active,investigating')
          .expect(200);

        expect(response.body.data[0]).toMatchObject({
          ruleName: 'Canonical IRR Rule Name',
          status: 'investigating',
        });
        expect(mockVarianceTrackingService.alerts.getActiveAlerts).toHaveBeenCalledWith(1, {
          status: ['active', 'investigating'],
        });
      });

      it('should forward current-baseline scope filtering', async () => {
        mockVarianceTrackingService.alerts.getActiveAlerts.mockResolvedValue([
          {
            id: '00000000-0000-0000-0000-000000000304',
            fundId: 1,
            baselineId: '00000000-0000-0000-0000-000000000204',
            ruleId: '00000000-0000-0000-0000-000000000404',
            title: 'Current Baseline Alert',
            description: 'Variance remains outside threshold for the current baseline.',
            severity: 'warning',
            category: 'performance',
            status: 'active',
            triggeredAt: '2024-12-31T11:00:00.000Z',
            contextData: {
              baselineName: 'Current Baseline',
            },
          },
        ]);

        const response = await request(app)
          .get('/api/funds/1/alerts?baselineScope=current')
          .expect(200);

        expect(response.body.data[0]).toMatchObject({
          baselineId: '00000000-0000-0000-0000-000000000204',
          baselineName: 'Current Baseline',
        });
        expect(mockVarianceTrackingService.alerts.getActiveAlerts).toHaveBeenCalledWith(1, {
          currentBaselineOnly: true,
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
        const rawDbReport = {
          id: '00000000-0000-0000-0000-000000000311',
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000123',
          reportName: 'Complete Analysis Report',
          reportType: 'ad_hoc',
          asOfDate: new Date('2024-12-31T23:59:59Z'),
          totalValueVariance: '150000.00',
          totalValueVariancePct: '0.06',
          irrVariance: '-0.013',
          multipleVariance: null,
          dpiVariance: null,
          tvpiVariance: null,
          significantVariances: [{ metric: 'irr', severity: 'medium' }],
          createdAt: new Date('2024-12-31T12:00:00Z'),
        };
        const mockResult = {
          report: rawDbReport,
          alertsGenerated: [
            {
              id: '00000000-0000-0000-0000-000000000401',
              fundId: 1,
              baselineId: '00000000-0000-0000-0000-000000000123',
              ruleId: '00000000-0000-0000-0000-000000000501',
              title: 'IRR Warning',
              description: 'IRR variance exceeded threshold.',
              severity: 'warning',
              category: 'performance',
              status: 'active',
              triggeredAt: '2024-12-31T12:05:00.000Z',
              contextData: {
                ruleName: 'IRR Alert',
                baselineName: 'Default Baseline',
              },
            },
            {
              id: '00000000-0000-0000-0000-000000000402',
              fundId: 1,
              baselineId: '00000000-0000-0000-0000-000000000123',
              ruleId: '00000000-0000-0000-0000-000000000502',
              title: 'TVPI Critical',
              description: 'TVPI variance breached the critical threshold.',
              severity: 'critical',
              category: 'performance',
              status: 'active',
              triggeredAt: '2024-12-31T12:06:00.000Z',
              contextData: {
                ruleName: 'TVPI Alert',
                baselineName: 'Default Baseline',
              },
            },
          ],
        };
        mockVarianceTrackingService.baselines.getBaselineById.mockResolvedValue({
          id: '00000000-0000-0000-0000-000000000123',
        });
        mockVarianceTrackingService.performCompleteVarianceAnalysis.mockResolvedValue(mockResult);

        const analysisData = {
          baselineId: '00000000-0000-0000-0000-000000000123',
          reportName: 'Complete Analysis Report',
        };

        const response = await request(app)
          .post('/api/funds/1/variance-analysis')
          .send(analysisData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(VarianceAnalysisResponseSchema.parse(response.body.data).alertCount).toBe(2);
        expect(VarianceReportClientResponseSchema.parse(response.body.data.report).id).toBe(
          rawDbReport.id
        );
        expect(response.body.data.report.summary.totalVariances).toBe(2);
        expect(response.body.data.report.summary.significantVariances).toBe(1);
        expect(response.body.data.report.summary.criticalVariances).toBe(0);
        expect(response.body.data.alertsGenerated).toEqual([
          {
            id: '00000000-0000-0000-0000-000000000401',
            fundId: 1,
            baselineId: '00000000-0000-0000-0000-000000000123',
            baselineName: 'Default Baseline',
            ruleId: '00000000-0000-0000-0000-000000000501',
            ruleName: 'IRR Alert',
            severity: 'warning',
            category: 'performance',
            message: 'IRR variance exceeded threshold.',
            details: {
              ruleName: 'IRR Alert',
              baselineName: 'Default Baseline',
            },
            status: 'active',
            triggeredAt: '2024-12-31T12:05:00.000Z',
            acknowledgedAt: null,
            acknowledgedBy: null,
            resolvedAt: null,
            resolvedBy: null,
            notes: null,
          },
          {
            id: '00000000-0000-0000-0000-000000000402',
            fundId: 1,
            baselineId: '00000000-0000-0000-0000-000000000123',
            baselineName: 'Default Baseline',
            ruleId: '00000000-0000-0000-0000-000000000502',
            ruleName: 'TVPI Alert',
            severity: 'critical',
            category: 'performance',
            message: 'TVPI variance breached the critical threshold.',
            details: {
              ruleName: 'TVPI Alert',
              baselineName: 'Default Baseline',
            },
            status: 'active',
            triggeredAt: '2024-12-31T12:06:00.000Z',
            acknowledgedAt: null,
            acknowledgedBy: null,
            resolvedAt: null,
            resolvedBy: null,
            notes: null,
          },
        ]);
        expect(response.body.data.alertCount).toBe(2);
        expect(response.body.message).toBe('Variance analysis completed successfully');

        expect(mockVarianceTrackingService.performCompleteVarianceAnalysis).toHaveBeenCalledWith({
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000123',
          reportName: 'Complete Analysis Report',
          userId: 1,
          includeAlertGeneration: true,
        });
      });

      it('should perform analysis without baseline ID (use default)', async () => {
        const rawDbReport = {
          id: '00000000-0000-0000-0000-000000000312',
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000123',
          reportName: 'Default Baseline Analysis',
          reportType: 'ad_hoc',
          asOfDate: new Date('2024-12-31T23:59:59Z'),
          totalValueVariance: '0.00',
          totalValueVariancePct: null,
          irrVariance: null,
          multipleVariance: null,
          dpiVariance: null,
          tvpiVariance: null,
          significantVariances: [],
          createdAt: new Date('2024-12-31T12:00:00Z'),
        };
        const mockResult = {
          report: rawDbReport,
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
        expect(VarianceAnalysisResponseSchema.parse(response.body.data).report.id).toBe(
          rawDbReport.id
        );

        const callArgs =
          mockVarianceTrackingService.performCompleteVarianceAnalysis.mock.calls[0][0];
        expect(callArgs.baselineId).toBeUndefined();
        expect(callArgs.reportName).toBe('Default Baseline Analysis');
        expect(callArgs.includeAlertGeneration).toBe(true);
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

      it('should respect includeAlertGeneration=false', async () => {
        const rawDbReport = {
          id: '00000000-0000-0000-0000-000000000313',
          fundId: 1,
          baselineId: '00000000-0000-0000-0000-000000000123',
          reportName: 'No Alerts Analysis',
          reportType: 'ad_hoc',
          asOfDate: new Date('2024-12-31T23:59:59Z'),
          totalValueVariance: null,
          totalValueVariancePct: null,
          irrVariance: null,
          multipleVariance: null,
          dpiVariance: null,
          tvpiVariance: null,
          significantVariances: [],
          createdAt: new Date('2024-12-31T12:00:00Z'),
        };
        mockVarianceTrackingService.performCompleteVarianceAnalysis.mockResolvedValue({
          report: rawDbReport,
          alertsGenerated: [],
        });

        const response = await request(app)
          .post('/api/funds/1/variance-analysis')
          .send({
            reportName: 'No Alerts Analysis',
            includeAlertGeneration: false,
          })
          .expect(201);

        expect(VarianceAnalysisResponseSchema.parse(response.body.data).alertCount).toBe(0);
        expect(mockVarianceTrackingService.performCompleteVarianceAnalysis).toHaveBeenCalledWith({
          fundId: 1,
          reportName: 'No Alerts Analysis',
          userId: 1,
          includeAlertGeneration: false,
        });
      });

      it('should reject foreign baseline IDs before analysis', async () => {
        mockVarianceTrackingService.baselines.getBaselineById.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/funds/1/variance-analysis')
          .send({
            baselineId: '00000000-0000-0000-0000-000000000123',
            reportName: 'Foreign Baseline Analysis',
          })
          .expect(404);

        expect(response.body.error).toBe('Baseline not found');
        expect(response.body.message).toBe('The specified baseline does not belong to this fund.');
        expect(mockVarianceTrackingService.performCompleteVarianceAnalysis).not.toHaveBeenCalled();
      });
    });

    describe('GET /api/funds/:id/variance-dashboard', () => {
      it('should retrieve variance dashboard data', async () => {
        const mockBaselines = [
          buildBaselineResponse({
            id: '00000000-0000-0000-0000-000000000121',
            isDefault: true,
          }),
          buildBaselineResponse({
            id: '00000000-0000-0000-0000-000000000122',
            name: '2024 Annual Baseline',
            description: 'Full year baseline including all quarterly data',
            baselineType: 'annual',
            periodStart: '2024-01-01T00:00:00.000Z',
            confidence: '0.95',
            tags: ['annual', 'audited', 'final'],
          }),
        ];
        const mockAlerts = [
          {
            id: '00000000-0000-0000-0000-000000000301',
            fundId: 1,
            ruleId: '00000000-0000-0000-0000-000000000401',
            title: 'IRR Decline Detected',
            description: 'Fund IRR has declined by 1.3% from baseline.',
            severity: 'warning',
            category: 'performance',
            status: 'active',
            triggeredAt: '2026-03-31T17:00:00.000Z',
            contextData: {},
          },
          {
            id: '00000000-0000-0000-0000-000000000302',
            fundId: 1,
            ruleId: '00000000-0000-0000-0000-000000000402',
            title: 'Critical Portfolio Value Decline',
            description: 'Total portfolio value has declined by 12% in the last 24 hours.',
            severity: 'critical',
            category: 'risk',
            status: 'acknowledged',
            triggeredAt: '2026-03-31T16:00:00.000Z',
            contextData: {},
          },
        ];
        const latestReport = [
          {
            id: '00000000-0000-0000-0000-000000000501',
            fundId: 1,
            reportName: 'Latest Variance Report',
            createdAt: new Date('2026-03-31T18:00:00Z'),
            riskLevel: 'high',
            overallVarianceScore: '0.42',
          },
          {
            id: '00000000-0000-0000-0000-000000000502',
            fundId: 1,
            reportName: 'Previous Variance Report',
            createdAt: new Date('2026-03-30T18:00:00Z'),
            riskLevel: 'medium',
            overallVarianceScore: '0.55',
          },
        ];

        mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue(mockBaselines);
        mockVarianceTrackingService.alerts.getActiveAlerts.mockResolvedValue(mockAlerts);
        mockVarianceTrackingService.calculations.getVarianceReports.mockResolvedValue(latestReport);

        const response = await request(app).get('/api/funds/1/variance-dashboard').expect(200);

        expect(response.body.success).toBe(true);
        expect(
          VarianceDashboardResponseSchema.parse(response.body.data).summary.overallRiskLevel
        ).toBe('high');
        expect(response.body.data.defaultBaseline).toEqual(mockBaselines[0]);
        expect(response.body.data.recentBaselines).toHaveLength(2);
        expect(response.body.data.activeAlerts[0]).toMatchObject({
          ruleName: 'IRR Decline Detected',
          message: 'Fund IRR has declined by 1.3% from baseline.',
          severity: 'warning',
        });
        expect(response.body.data.alertsBySeverity).toEqual({
          critical: 1,
          warning: 1,
          info: 0,
          urgent: 0,
        });
        expect(response.body.data.alertsByseverity).toEqual({
          critical: 1,
          warning: 1,
          info: 0,
          urgent: 0,
        });
        expect(response.body.data.summary.totalBaselines).toBe(2);
        expect(response.body.data.summary.totalActiveAlerts).toBe(2);
        expect(response.body.data.summary.lastAnalysisDate).toBe('2026-03-31T18:00:00.000Z');
        expect(response.body.data.summary.overallRiskLevel).toBe('high');
        expect(response.body.data.summary.trendDirection).toBe('improving');
        expect(response.body.data.recentReports).toEqual([
          {
            id: '00000000-0000-0000-0000-000000000501',
            name: 'Latest Variance Report',
            riskLevel: 'high',
            createdAt: '2026-03-31T18:00:00.000Z',
            overallVarianceScore: '0.42',
          },
          {
            id: '00000000-0000-0000-0000-000000000502',
            name: 'Previous Variance Report',
            riskLevel: 'medium',
            createdAt: '2026-03-30T18:00:00.000Z',
            overallVarianceScore: '0.55',
          },
        ]);

        expect(mockVarianceTrackingService.baselines.getBaselines).toHaveBeenCalledWith(1, {
          limit: 5,
        });
        expect(mockVarianceTrackingService.alerts.getActiveAlerts).toHaveBeenCalledWith(1, {
          limit: 10,
          currentBaselineOnly: true,
        });
        expect(mockVarianceTrackingService.calculations.getVarianceReports).toHaveBeenCalledWith(
          1,
          {
            limit: 5,
          }
        );
      });

      it('should return null lastAnalysisDate when no reports exist', async () => {
        const mockBaselines = [
          buildBaselineResponse({
            id: '00000000-0000-0000-0000-000000000123',
            name: '2024 Annual Baseline',
            description: 'Full year baseline including all quarterly data',
            baselineType: 'annual',
            periodStart: '2024-01-01T00:00:00.000Z',
            isDefault: false,
            confidence: '0.95',
            tags: ['annual', 'audited', 'final'],
          }),
        ]; // No default
        const mockAlerts: any[] = [];

        mockVarianceTrackingService.baselines.getBaselines.mockResolvedValue(mockBaselines);
        mockVarianceTrackingService.alerts.getActiveAlerts.mockResolvedValue(mockAlerts);
        mockVarianceTrackingService.calculations.getVarianceReports.mockResolvedValue([]);

        const response = await request(app).get('/api/funds/1/variance-dashboard').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.defaultBaseline).toBeNull();
        expect(response.body.data.summary.lastAnalysisDate).toBeNull();
        expect(response.body.data.summary.overallRiskLevel).toBe('low');
        expect(response.body.data.summary.trendDirection).toBe('stable');
        expect(response.body.data.recentReports).toEqual([]);
      });
    });
  });

  describe('Authentication and Authorization', () => {
    let unauthApp: express.Express;

    beforeEach(() => {
      // Create app without authentication middleware
      unauthApp = express();
      unauthApp.use(express.json());
      // Don't add req.user middleware
      unauthApp.use(varianceRouter);
    });

    it('should require authentication for creating baselines', async () => {
      const baselineData = {
        name: 'Test Baseline',
        baselineType: 'quarterly',
        periodStart: '2024-10-01T00:00:00Z',
        periodEnd: '2024-12-31T23:59:59Z',
      };

      const response = await request(unauthApp)
        .post('/api/funds/1/baselines')
        .send(baselineData)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should require authentication for alert operations', async () => {
      const response = await request(unauthApp)
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
      const response = await request(app).get('/api/funds/1/baselines?limit=abc').expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.message).toBe('Invalid baseline query parameters');
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

    it('should reject invalid alert query parameters', async () => {
      const response = await request(app).get('/api/funds/1/alerts?severity=bogus').expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.message).toBe('Invalid alert query parameters');
    });
  });
});
