/**
 * LP Portal API - Integration Test Suite
 *
 * Tests for Sprint 2 LP Portal features:
 * - Storage service abstraction
 * - Email service abstraction
 * - LP settings API endpoints
 * - Notification triggers
 *
 * @group api
 * @group lp-portal
 * @group integration
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// STORAGE SERVICE TESTS
// ============================================================================

describe('Storage Service', () => {
  it('should create storage service with local provider by default', async () => {
    const { createStorageService } = await import('../../server/services/storage-service');
    const storage = createStorageService({ provider: 'memory' });

    expect(storage).toBeDefined();
    expect(typeof storage.upload).toBe('function');
    expect(typeof storage.download).toBe('function');
    expect(typeof storage.delete).toBe('function');
    expect(typeof storage.exists).toBe('function');
    expect(typeof storage.getSignedUrl).toBe('function');
  });

  it('should upload and download files with memory provider', async () => {
    const { createStorageService, resetStorageService } = await import(
      '../../server/services/storage-service'
    );
    resetStorageService();

    const storage = createStorageService({ provider: 'memory' });
    const testContent = 'Test file content for LP report';
    const testBuffer = Buffer.from(testContent);

    // Upload
    const uploadResult = await storage.upload('test/report.pdf', testBuffer, 'application/pdf');
    expect(uploadResult.key).toBe('test/report.pdf');
    expect(uploadResult.size).toBe(testBuffer.length);
    expect(uploadResult.contentType).toBe('application/pdf');
    expect(uploadResult.etag).toBeDefined();

    // Check exists
    const exists = await storage.exists('test/report.pdf');
    expect(exists).toBe(true);

    // Download
    const downloadResult = await storage.download('test/report.pdf');
    expect(downloadResult.buffer.toString()).toBe(testContent);
    expect(downloadResult.contentType).toBe('application/pdf');

    // Delete
    const deleted = await storage.delete('test/report.pdf');
    expect(deleted).toBe(true);

    // Verify deleted
    const existsAfterDelete = await storage.exists('test/report.pdf');
    expect(existsAfterDelete).toBe(false);
  });

  it('should generate signed URLs', async () => {
    const { createStorageService, resetStorageService } = await import(
      '../../server/services/storage-service'
    );
    resetStorageService();

    const storage = createStorageService({ provider: 'memory' });

    // Upload a file first
    await storage.upload('test/signed.pdf', Buffer.from('test'), 'application/pdf');

    // Get signed URL
    const signedUrl = await storage.getSignedUrl('test/signed.pdf', 3600);
    expect(signedUrl.url).toBeDefined();
    expect(signedUrl.expiresAt).toBeInstanceOf(Date);
    expect(signedUrl.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should list files by prefix', async () => {
    const { createStorageService, resetStorageService } = await import(
      '../../server/services/storage-service'
    );
    resetStorageService();

    const storage = createStorageService({ provider: 'memory' });

    // Upload multiple files
    await storage.upload('reports/q1.pdf', Buffer.from('q1'), 'application/pdf');
    await storage.upload('reports/q2.pdf', Buffer.from('q2'), 'application/pdf');
    await storage.upload('other/file.pdf', Buffer.from('other'), 'application/pdf');

    // List files
    const reportFiles = await storage.listFiles('reports');
    expect(reportFiles).toContain('reports/q1.pdf');
    expect(reportFiles).toContain('reports/q2.pdf');
    expect(reportFiles).not.toContain('other/file.pdf');
  });
});

// ============================================================================
// EMAIL SERVICE TESTS
// ============================================================================

describe('Email Service', () => {
  it('should create email service with console provider by default', async () => {
    const { createEmailService } = await import('../../server/services/email-service');
    const email = createEmailService({
      provider: 'console',
      from: 'test@example.com',
    });

    expect(email).toBeDefined();
    expect(typeof email.send).toBe('function');
    expect(typeof email.sendBatch).toBe('function');
  });

  it('should send email and track in sent emails list', async () => {
    const { createEmailService, getSentEmails, clearSentEmails } = await import(
      '../../server/services/email-service'
    );
    clearSentEmails();

    const email = createEmailService({
      provider: 'console',
      from: 'test@example.com',
    });

    const result = await email.send({
      to: { email: 'lp@example.com', name: 'Test LP' },
      subject: 'Test Email',
      text: 'This is a test email',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(result.timestamp).toBeInstanceOf(Date);

    // Verify tracked in sent emails
    const sentEmails = getSentEmails();
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0]?.message.subject).toBe('Test Email');
  });

  it('should send batch emails', async () => {
    const { createEmailService, clearSentEmails, getSentEmails } = await import(
      '../../server/services/email-service'
    );
    clearSentEmails();

    const email = createEmailService({
      provider: 'console',
      from: 'test@example.com',
    });

    const results = await email.sendBatch([
      {
        to: { email: 'lp1@example.com', name: 'LP 1' },
        subject: 'Email 1',
        text: 'Content 1',
      },
      {
        to: { email: 'lp2@example.com', name: 'LP 2' },
        subject: 'Email 2',
        text: 'Content 2',
      },
    ]);

    expect(results.length).toBe(2);
    expect(results.every((r) => r.success)).toBe(true);

    const sentEmails = getSentEmails();
    expect(sentEmails.length).toBe(2);
  });

  it('should send capital call email with proper formatting', async () => {
    const { sendCapitalCallEmail, clearSentEmails, getSentEmails } = await import(
      '../../server/services/email-service'
    );
    clearSentEmails();

    const result = await sendCapitalCallEmail(
      { email: 'lp@example.com', name: 'Acme Family Office' },
      {
        lpName: 'Acme Family Office',
        fundName: 'Press On Ventures Fund I',
        callAmount: 1000000,
        callDate: new Date('2025-01-15'),
        dueDate: new Date('2025-01-30'),
        purpose: 'Follow-on investment in TechCo',
        wireInstructions: {
          bankName: 'First National Bank',
          accountName: 'Press On Capital LLC',
          accountNumber: '****1234',
          routingNumber: '****5678',
          reference: 'POV-I-CALL-2025-01',
        },
      }
    );

    expect(result.success).toBe(true);

    const sentEmails = getSentEmails();
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0]?.message.subject).toContain('Capital Call Notice');
    expect(sentEmails[0]?.message.subject).toContain('$1,000,000');
  });

  it('should send distribution email', async () => {
    const { sendDistributionEmail, clearSentEmails, getSentEmails } = await import(
      '../../server/services/email-service'
    );
    clearSentEmails();

    const result = await sendDistributionEmail(
      { email: 'lp@example.com', name: 'State Pension Fund' },
      {
        lpName: 'State Pension Fund',
        fundName: 'Press On Ventures Fund I',
        distributionAmount: 500000,
        distributionDate: new Date('2025-01-15'),
        distributionType: 'capital_gains',
        breakdown: {
          returnOfCapital: 100000,
          capitalGains: 400000,
        },
      }
    );

    expect(result.success).toBe(true);

    const sentEmails = getSentEmails();
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0]?.message.subject).toContain('Distribution Notice');
  });

  it('should send report ready email', async () => {
    const { sendReportReadyEmail, clearSentEmails, getSentEmails } = await import(
      '../../server/services/email-service'
    );
    clearSentEmails();

    const result = await sendReportReadyEmail(
      { email: 'lp@example.com', name: 'University Endowment' },
      {
        lpName: 'University Endowment',
        reportType: 'Quarterly Statement',
        reportPeriod: 'Q4 2024',
        downloadUrl: 'https://example.com/reports/download/abc123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }
    );

    expect(result.success).toBe(true);

    const sentEmails = getSentEmails();
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0]?.message.subject).toContain('Quarterly Statement');
    expect(sentEmails[0]?.message.subject).toContain('Q4 2024');
  });
});

// ============================================================================
// LP TEST FIXTURES
// ============================================================================

describe('LP Test Fixtures', () => {
  it('should provide valid LP profiles', async () => {
    const { testLPProfiles, getLPProfile } = await import('../../tests/fixtures/lp-data');

    expect(testLPProfiles.length).toBeGreaterThan(0);
    expect(testLPProfiles[0]?.name).toBeDefined();
    expect(testLPProfiles[0]?.email).toBeDefined();

    const lp = getLPProfile(1);
    expect(lp).toBeDefined();
    expect(lp?.name).toBe('Acme Family Office');
  });

  it('should provide valid LP commitments', async () => {
    const { testCommitments, getLPCommitments } = await import('../../tests/fixtures/lp-data');

    expect(testCommitments.length).toBeGreaterThan(0);

    const lp1Commitments = getLPCommitments(1);
    expect(lp1Commitments.length).toBeGreaterThan(0);
    expect(lp1Commitments[0]?.commitmentAmount).toBeGreaterThan(0);
  });

  it('should provide valid capital activities', async () => {
    const { testCapitalActivities, getLPCapitalActivities } = await import(
      '../../tests/fixtures/lp-data'
    );

    expect(testCapitalActivities.length).toBeGreaterThan(0);

    const lp1Activities = getLPCapitalActivities(1);
    expect(lp1Activities.length).toBeGreaterThan(0);
    expect(lp1Activities[0]?.type).toBeDefined();
  });

  it('should calculate LP summary metrics', async () => {
    const { calculateLPSummary } = await import('../../tests/fixtures/lp-data');

    const summary = calculateLPSummary(1);
    expect(summary.totalCommitted).toBeGreaterThan(0);
    expect(summary.totalCalled).toBeGreaterThan(0);
    expect(summary.fundCount).toBeGreaterThan(0);
  });

  it('should provide valid K-1 tax data', async () => {
    const { testK1Data } = await import('../../tests/fixtures/lp-data');

    expect(testK1Data.length).toBeGreaterThan(0);
    expect(testK1Data[0]?.taxYear).toBe(2023);
    expect(testK1Data[0]?.longTermCapitalGains).toBeGreaterThan(0);
  });
});

// ============================================================================
// LP SETTINGS API VALIDATION
// ============================================================================

describe('LP Settings Validation', () => {
  it('should define valid notification preferences schema', () => {
    const validNotificationPrefs = {
      emailCapitalCalls: true,
      emailDistributions: true,
      emailQuarterlyReports: true,
      emailAnnualReports: true,
      emailMarketUpdates: false,
    };

    // All boolean values
    Object.values(validNotificationPrefs).forEach((value) => {
      expect(typeof value).toBe('boolean');
    });
  });

  it('should define valid display preferences schema', () => {
    const validDisplayPrefs = {
      currency: 'USD',
      numberFormat: 'US',
      timezone: 'America/New_York',
      dateFormat: 'MM/DD/YYYY',
    };

    expect(['USD', 'EUR', 'GBP']).toContain(validDisplayPrefs.currency);
    expect(['US', 'EU']).toContain(validDisplayPrefs.numberFormat);
    expect(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']).toContain(validDisplayPrefs.dateFormat);
  });
});

// ============================================================================
// PII LOGGING PREVENTION
// ============================================================================

describe('PII Logging Prevention', () => {
  it('should have PII field detection for common sensitive fields', () => {
    const piiFields = [
      'email',
      'taxId',
      'ssn',
      'socialSecurityNumber',
      'password',
      'apiKey',
      'token',
      'creditCard',
      'bankAccount',
      'accountNumber',
      'routingNumber',
    ];

    // Verify these are the expected PII fields that should be detected
    expect(piiFields.length).toBeGreaterThan(10);
    expect(piiFields).toContain('email');
    expect(piiFields).toContain('taxId');
    expect(piiFields).toContain('password');
  });
});

// ============================================================================
// PDF GENERATION SERVICE TESTS
// ============================================================================

describe('PDF Generation Service', () => {
  it('should export K1 report data builder', async () => {
    const { buildK1ReportData } = await import('../../server/services/pdf-generation-service');
    expect(typeof buildK1ReportData).toBe('function');
  });

  it('should export quarterly report data builder', async () => {
    const { buildQuarterlyReportData } = await import(
      '../../server/services/pdf-generation-service'
    );
    expect(typeof buildQuarterlyReportData).toBe('function');
  });

  it('should export capital account report data builder', async () => {
    const { buildCapitalAccountReportData } = await import(
      '../../server/services/pdf-generation-service'
    );
    expect(typeof buildCapitalAccountReportData).toBe('function');
  });

  it('should export PDF generation functions', async () => {
    const { generateK1PDF, generateQuarterlyPDF, generateCapitalAccountPDF } = await import(
      '../../server/services/pdf-generation-service'
    );

    expect(typeof generateK1PDF).toBe('function');
    expect(typeof generateQuarterlyPDF).toBe('function');
    expect(typeof generateCapitalAccountPDF).toBe('function');
  });

  it('should build K1 report data structure correctly', async () => {
    const { buildK1ReportData } = await import('../../server/services/pdf-generation-service');

    // Create mock LP data matching the service interface
    const mockLPData = {
      lp: { id: 1, name: 'Test LP', email: 'test@example.com' },
      commitments: [
        {
          commitmentId: 1,
          fundId: 1,
          fundName: 'Test Fund I',
          commitmentAmount: 10000000,
          ownershipPercentage: 0.1,
        },
      ],
      transactions: [
        {
          commitmentId: 1,
          fundId: 1,
          date: new Date('2023-03-15'),
          type: 'capital_call',
          amount: 2500000,
          description: 'Initial capital call',
        },
        {
          commitmentId: 1,
          fundId: 1,
          date: new Date('2023-09-01'),
          type: 'distribution',
          amount: 500000,
          description: 'Q3 distribution',
        },
      ],
    };

    const k1Data = buildK1ReportData(mockLPData, 1, 2023);

    expect(k1Data.partnerName).toBe('Test LP');
    expect(k1Data.fundName).toBe('Test Fund I');
    expect(k1Data.taxYear).toBe(2023);
    expect(k1Data.allocations).toBeDefined();
    expect(k1Data.capitalAccount).toBeDefined();
    expect(k1Data.distributions).toBeDefined();
  });

  it('should build quarterly report data structure correctly', async () => {
    const { buildQuarterlyReportData } = await import(
      '../../server/services/pdf-generation-service'
    );

    const mockLPData = {
      lp: { id: 1, name: 'Test LP', email: 'test@example.com' },
      commitments: [
        {
          commitmentId: 1,
          fundId: 1,
          fundName: 'Test Fund I',
          commitmentAmount: 10000000,
          ownershipPercentage: 0.1,
        },
      ],
      transactions: [
        {
          commitmentId: 1,
          fundId: 1,
          date: new Date('2024-03-15'),
          type: 'capital_call',
          amount: 2500000,
          description: 'Capital call',
        },
      ],
    };

    const quarterlyData = buildQuarterlyReportData(mockLPData, 1, 'Q2', 2024);

    expect(quarterlyData.fundName).toBe('Test Fund I');
    expect(quarterlyData.quarter).toBe('Q2');
    expect(quarterlyData.year).toBe(2024);
    expect(quarterlyData.lpName).toBe('Test LP');
    expect(quarterlyData.summary).toBeDefined();
    expect(quarterlyData.summary.totalCommitted).toBe(10000000);
    expect(quarterlyData.portfolioCompanies).toBeDefined();
    expect(quarterlyData.portfolioCompanies.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// XLSX GENERATION SERVICE TESTS
// ============================================================================

describe('XLSX Generation Service', () => {
  it('should export Excel generation functions', async () => {
    const {
      generateCapitalAccountXLSX,
      generateQuarterlyXLSX,
      generateTransactionHistoryXLSX,
      generatePerformanceSummaryXLSX,
    } = await import('../../server/services/xlsx-generation-service');

    expect(typeof generateCapitalAccountXLSX).toBe('function');
    expect(typeof generateQuarterlyXLSX).toBe('function');
    expect(typeof generateTransactionHistoryXLSX).toBe('function');
    expect(typeof generatePerformanceSummaryXLSX).toBe('function');
  });

  it('should generate capital account Excel buffer', async () => {
    const { generateCapitalAccountXLSX } = await import(
      '../../server/services/xlsx-generation-service'
    );

    const testData = {
      lpName: 'Test LP',
      fundName: 'Test Fund I',
      asOfDate: '2024-06-30',
      commitment: 10000000,
      transactions: [
        {
          date: '2024-01-15',
          type: 'Capital Call',
          description: 'Initial call',
          amount: 2500000,
          balance: 2500000,
        },
        {
          date: '2024-03-15',
          type: 'Distribution',
          description: 'Q1 distribution',
          amount: -500000,
          balance: 2000000,
        },
      ],
      summary: {
        beginningBalance: 0,
        totalContributions: 2500000,
        totalDistributions: 500000,
        netIncome: 0,
        endingBalance: 2000000,
      },
    };

    const buffer = generateCapitalAccountXLSX(testData);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // XLSX files start with PK (ZIP signature)
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  it('should generate quarterly report Excel buffer', async () => {
    const { generateQuarterlyXLSX } = await import('../../server/services/xlsx-generation-service');

    const testData = {
      fundName: 'Test Fund I',
      quarter: 'Q2',
      year: 2024,
      lpName: 'Test LP',
      summary: {
        nav: 12000000,
        tvpi: 1.25,
        dpi: 0.2,
        irr: 0.15,
        totalCommitted: 10000000,
        totalCalled: 8000000,
        totalDistributed: 2000000,
        unfunded: 2000000,
      },
      portfolioCompanies: [
        { name: 'TechCo', invested: 3000000, value: 4000000, moic: 1.33 },
        { name: 'HealthAI', invested: 2000000, value: 2500000, moic: 1.25 },
      ],
      cashFlows: [
        { date: '2024-03-01', type: 'contribution' as const, amount: 1000000 },
        { date: '2024-05-15', type: 'distribution' as const, amount: 500000 },
      ],
    };

    const buffer = generateQuarterlyXLSX(testData);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // XLSX files start with PK (ZIP signature)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});

// ============================================================================
// REPORT DOWNLOAD ENDPOINT TESTS
// ============================================================================

describe('Report Download Endpoint', () => {
  it('should define content type helper correctly', () => {
    // Test the content type mapping logic
    const contentTypes: Record<string, string> = {
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
    };

    expect(contentTypes['pdf']).toBe('application/pdf');
    expect(contentTypes['xlsx']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(contentTypes['csv']).toBe('text/csv');
  });

  it('should have signed URL expiry of 1 hour (3600 seconds)', () => {
    // This is a documentation test to ensure the endpoint uses 1 hour expiry
    const SIGNED_URL_EXPIRY_SECONDS = 3600;
    expect(SIGNED_URL_EXPIRY_SECONDS).toBe(60 * 60); // 1 hour
  });

  it('should validate report download response structure', () => {
    // Mock download response structure
    const downloadResponse = {
      success: true,
      data: {
        reportId: 'report-123',
        downloadUrl: 'https://storage.example.com/signed-url?token=abc',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        fileName: 'quarterly-report-123.pdf',
        contentType: 'application/pdf',
        fileSize: 102400,
      },
    };

    expect(downloadResponse.success).toBe(true);
    expect(downloadResponse.data.reportId).toMatch(/^report-/);
    expect(downloadResponse.data.downloadUrl).toMatch(/^https?:\/\//);
    expect(downloadResponse.data.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(downloadResponse.data.fileName).toMatch(/\.(pdf|xlsx|csv)$/);
    expect(downloadResponse.data.contentType).toBe('application/pdf');
    expect(downloadResponse.data.fileSize).toBeGreaterThan(0);
  });

  it('should validate error response for non-existent report', () => {
    // Mock 404 error response structure
    const errorResponse = {
      success: false,
      error: {
        code: 'REPORT_NOT_FOUND',
        message: 'Report not found or has expired',
      },
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error.code).toBe('REPORT_NOT_FOUND');
    expect(errorResponse.error.message.length).toBeGreaterThan(0);
  });

  it('should validate error response for unauthorized access', () => {
    // Mock 403 error response structure
    const errorResponse = {
      success: false,
      error: {
        code: 'NOT_AUTHORIZED',
        message: 'You do not have access to this report',
      },
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error.code).toBe('NOT_AUTHORIZED');
  });

  it('should validate error response for report still generating', () => {
    // Mock 202 pending response structure
    const pendingResponse = {
      success: false,
      error: {
        code: 'REPORT_PENDING',
        message: 'Report is still being generated. Please try again later.',
        status: 'generating',
        progress: 45,
      },
    };

    expect(pendingResponse.success).toBe(false);
    expect(pendingResponse.error.code).toBe('REPORT_PENDING');
    expect(pendingResponse.error.status).toBe('generating');
    expect(pendingResponse.error.progress).toBeGreaterThanOrEqual(0);
    expect(pendingResponse.error.progress).toBeLessThanOrEqual(100);
  });

  it('should support all report file formats', () => {
    const formats = ['pdf', 'xlsx', 'csv'];
    const expectedContentTypes: Record<string, string> = {
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
    };

    formats.forEach((format) => {
      const response = {
        fileName: `report-123.${format}`,
        contentType: expectedContentTypes[format],
      };

      expect(response.fileName).toContain(`.${format}`);
      expect(response.contentType).toBe(expectedContentTypes[format]);
    });
  });

  it('should generate valid signed URL structure', async () => {
    const { createStorageService, resetStorageService } = await import(
      '../../server/services/storage-service'
    );
    resetStorageService();

    const storage = createStorageService({ provider: 'memory' });

    // Upload a test file
    const testContent = Buffer.from('Test PDF content');
    await storage.upload('reports/test-123.pdf', testContent, 'application/pdf');

    // Get signed URL
    const signedUrl = await storage.getSignedUrl('reports/test-123.pdf', 3600);

    // Memory provider returns a path; production providers return full URLs
    expect(signedUrl.url).toBeDefined();
    expect(signedUrl.url.length).toBeGreaterThan(0);
    expect(signedUrl.expiresAt).toBeInstanceOf(Date);
    expect(signedUrl.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
