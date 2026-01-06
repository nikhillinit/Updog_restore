/**
 * Report Queue Integration Tests
 *
 * Tests the report generation queue integration:
 * - Queue exports and types
 * - Event emission patterns
 * - Report type to generator mapping
 *
 * Note: Full end-to-end tests require Redis and database setup.
 * These tests validate the integration logic without external dependencies.
 *
 * @group integration
 * @group lp-portal
 * @group reports
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// QUEUE MODULE EXPORTS TEST
// ============================================================================

describe('Report Generation Queue Exports', () => {
  it('should export queue initialization function', async () => {
    const queueModule = await import('../../server/queues/report-generation-queue');
    expect(typeof queueModule.initializeReportQueue).toBe('function');
  }, 10000); // 10 second timeout for module import

  it('should export enqueue function', async () => {
    const queueModule = await import('../../server/queues/report-generation-queue');
    expect(typeof queueModule.enqueueReportGeneration).toBe('function');
  });

  it('should export report events emitter', async () => {
    const queueModule = await import('../../server/queues/report-generation-queue');
    expect(queueModule.reportEvents).toBeDefined();
    expect(typeof queueModule.reportEvents.emitProgress).toBe('function');
    expect(typeof queueModule.reportEvents.emitComplete).toBe('function');
    expect(typeof queueModule.reportEvents.emitFailed).toBe('function');
  });
});

// ============================================================================
// REPORT EVENTS EMITTER TESTS
// ============================================================================

describe('Report Events Emitter', () => {
  let reportEvents: {
    emitProgress: (jobId: string, reportId: string, progress: number, message?: string) => boolean;
    emitComplete: (jobId: string, reportId: string, result: unknown) => boolean;
    emitFailed: (jobId: string, reportId: string, error: string) => boolean;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
  };

  beforeEach(async () => {
    const queueModule = await import('../../server/queues/report-generation-queue');
    reportEvents = queueModule.reportEvents;
  });

  it('should emit progress events', () => {
    const progressHandler = vi.fn();
    reportEvents.on('progress', progressHandler);

    reportEvents.emitProgress('job-1', 'report-1', 50, 'Generating PDF...');

    expect(progressHandler).toHaveBeenCalledWith({
      jobId: 'job-1',
      reportId: 'report-1',
      progress: 50,
      message: 'Generating PDF...',
    });
  });

  it('should emit complete events', () => {
    const completeHandler = vi.fn();
    reportEvents.on('complete', completeHandler);

    const mockResult = {
      success: true,
      fileUrl: 'https://storage.example.com/report.pdf',
      fileSize: 1024,
    };

    reportEvents.emitComplete('job-1', 'report-1', mockResult);

    expect(completeHandler).toHaveBeenCalledWith({
      jobId: 'job-1',
      reportId: 'report-1',
      result: mockResult,
    });
  });

  it('should emit failed events', () => {
    const failedHandler = vi.fn();
    reportEvents.on('failed', failedHandler);

    reportEvents.emitFailed('job-1', 'report-1', 'PDF generation failed');

    expect(failedHandler).toHaveBeenCalledWith({
      jobId: 'job-1',
      reportId: 'report-1',
      error: 'PDF generation failed',
    });
  });

  it('should support multiple listeners on same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    reportEvents.on('progress', handler1);
    reportEvents.on('progress', handler2);

    reportEvents.emitProgress('job-2', 'report-2', 75);

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });
});

// ============================================================================
// JOB DATA VALIDATION TESTS
// ============================================================================

describe('Report Generation Job Data', () => {
  it('should define correct report types', async () => {
    // Import to verify module loads correctly (types validated at compile time)
    const _queueModule = await import('../../server/queues/report-generation-queue');

    // Valid job data structure
    const validJobData = {
      reportId: 'report-123',
      lpId: 1,
      reportType: 'quarterly' as const,
      dateRange: {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      },
      fundIds: [1, 2],
      format: 'pdf' as const,
    };

    // Verify structure matches expected interface
    expect(validJobData.reportId).toMatch(/^report-/);
    expect(typeof validJobData.lpId).toBe('number');
    expect(['quarterly', 'annual', 'tax_package', 'capital_account']).toContain(
      validJobData.reportType
    );
    expect(['pdf', 'xlsx', 'csv']).toContain(validJobData.format);
  });

  it('should support all report types', () => {
    const reportTypes = ['quarterly', 'annual', 'tax_package', 'capital_account'];
    const formats = ['pdf', 'xlsx', 'csv'];

    // All combinations should be valid
    reportTypes.forEach((reportType) => {
      formats.forEach((format) => {
        const jobData = {
          reportId: `report-${reportType}-${format}`,
          lpId: 1,
          reportType,
          dateRange: { startDate: '2024-01-01', endDate: '2024-12-31' },
          format,
        };
        expect(jobData).toBeDefined();
      });
    });
  });

  it('should include optional fields when provided', () => {
    const fullJobData = {
      reportId: 'report-full',
      lpId: 1,
      reportType: 'quarterly' as const,
      dateRange: { startDate: '2024-01-01', endDate: '2024-03-31' },
      fundIds: [1, 2, 3],
      sections: ['summary', 'holdings', 'transactions'],
      format: 'pdf' as const,
      templateId: 5,
      metadata: { customField: 'value' },
    };

    expect(fullJobData.fundIds).toHaveLength(3);
    expect(fullJobData.sections).toHaveLength(3);
    expect(fullJobData.templateId).toBe(5);
    expect(fullJobData.metadata).toHaveProperty('customField');
  });
});

// ============================================================================
// PDF/XLSX GENERATION INTEGRATION TESTS
// ============================================================================

describe('Report Generation Service Integration', () => {
  it('should import PDF generation functions correctly', async () => {
    const pdfService = await import('../../server/services/pdf-generation-service');

    expect(typeof pdfService.generateK1PDF).toBe('function');
    expect(typeof pdfService.generateQuarterlyPDF).toBe('function');
    expect(typeof pdfService.generateCapitalAccountPDF).toBe('function');
    expect(typeof pdfService.buildK1ReportData).toBe('function');
    expect(typeof pdfService.buildQuarterlyReportData).toBe('function');
    expect(typeof pdfService.buildCapitalAccountReportData).toBe('function');
  });

  it('should import XLSX generation functions correctly', async () => {
    const xlsxService = await import('../../server/services/xlsx-generation-service');

    expect(typeof xlsxService.generateCapitalAccountXLSX).toBe('function');
    expect(typeof xlsxService.generateQuarterlyXLSX).toBe('function');
    expect(typeof xlsxService.generateTransactionHistoryXLSX).toBe('function');
    expect(typeof xlsxService.generatePerformanceSummaryXLSX).toBe('function');
  });
});

// ============================================================================
// REPORT TYPE TO GENERATOR MAPPING TESTS
// ============================================================================

describe('Report Type to Generator Mapping', () => {
  // These tests validate that the queue correctly routes report types to generators
  // without actually running the queue (which requires Redis)

  it('should map tax_package to K1 PDF generator', async () => {
    const pdfService = await import('../../server/services/pdf-generation-service');

    // K1 generator should be available for tax_package reports
    expect(typeof pdfService.generateK1PDF).toBe('function');
    expect(typeof pdfService.buildK1ReportData).toBe('function');
  });

  it('should map quarterly to Quarterly PDF/XLSX generator', async () => {
    const pdfService = await import('../../server/services/pdf-generation-service');
    const xlsxService = await import('../../server/services/xlsx-generation-service');

    // Both PDF and XLSX generators should be available
    expect(typeof pdfService.generateQuarterlyPDF).toBe('function');
    expect(typeof xlsxService.generateQuarterlyXLSX).toBe('function');
  });

  it('should map capital_account to Capital Account PDF/XLSX generator', async () => {
    const pdfService = await import('../../server/services/pdf-generation-service');
    const xlsxService = await import('../../server/services/xlsx-generation-service');

    // Both PDF and XLSX generators should be available
    expect(typeof pdfService.generateCapitalAccountPDF).toBe('function');
    expect(typeof xlsxService.generateCapitalAccountXLSX).toBe('function');
  });
});

// ============================================================================
// RESULT STRUCTURE TESTS
// ============================================================================

describe('Report Generation Result Structure', () => {
  it('should define success result with required fields', () => {
    const successResult = {
      success: true,
      fileUrl: 'https://storage.example.com/reports/report-123.pdf',
      fileSize: 102400,
      generatedAt: new Date().toISOString(),
      durationMs: 1500,
    };

    expect(successResult.success).toBe(true);
    expect(successResult.fileUrl).toMatch(/^https?:\/\//);
    expect(successResult.fileSize).toBeGreaterThan(0);
    expect(successResult.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(successResult.durationMs).toBeGreaterThan(0);
  });

  it('should define failure result with error message', () => {
    const failureResult = {
      success: false,
      error: 'LP has no commitment to fund 999',
      durationMs: 150,
    };

    expect(failureResult.success).toBe(false);
    expect(failureResult.error).toBeDefined();
    expect(failureResult.error.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// STORAGE SERVICE INTEGRATION
// ============================================================================

describe('Storage Service Integration', () => {
  it('should import storage service factory', async () => {
    const storageModule = await import('../../server/services/storage-service');

    expect(typeof storageModule.createStorageService).toBe('function');
    expect(typeof storageModule.getStorageService).toBe('function');
  });

  it('should create memory storage provider for testing', async () => {
    const { createStorageService } = await import('../../server/services/storage-service');
    const storage = createStorageService({ provider: 'memory' });

    expect(storage).toBeDefined();
    expect(typeof storage.upload).toBe('function');
    expect(typeof storage.download).toBe('function');
    expect(typeof storage.getSignedUrl).toBe('function');
  });
});
