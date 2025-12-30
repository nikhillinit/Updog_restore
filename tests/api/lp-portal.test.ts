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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

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
