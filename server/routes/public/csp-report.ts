import { Router } from 'express';
import type { Request, Response } from 'express';
import { cspMetrics } from '../../telemetry';
import { logger } from '../../lib/logger.js';

const router = Router();

type CspViolationReport = {
  'csp-report'?: {
    'document-uri'?: string;
    'violated-directive'?: string;
    'effective-directive'?: string;
    disposition?: string;
    'blocked-uri'?: string;
    [key: string]: unknown;
  };
  type?: string;
  body?: {
    blockedURL?: string;
    documentURL?: string;
    effectiveDirective?: string;
    disposition?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function getViolationSummary(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { reportType: 'unknown' };
  }

  const report = body as CspViolationReport;
  const legacyReport = report['csp-report'];

  if (legacyReport && typeof legacyReport === 'object') {
    return {
      reportType: 'csp-report',
      documentUri: legacyReport['document-uri'],
      violatedDirective: legacyReport['violated-directive'] ?? legacyReport['effective-directive'],
      disposition: legacyReport['disposition'],
      blockedUri: legacyReport['blocked-uri'],
    };
  }

  if (report.body && typeof report.body === 'object') {
    return {
      reportType: report.type ?? 'report-to',
      documentUri: report.body.documentURL,
      violatedDirective: report.body.effectiveDirective,
      disposition: report.body.disposition,
      blockedUri: report.body.blockedURL,
    };
  }

  return {
    reportType: report.type ?? 'unknown',
    keys: Object.keys(report),
  };
}

router.post('/csp-violations', (req: Request, res: Response) => {
  try {
    // Requests may be JSON with { "csp-report": { ... } } or Report-To batch
    const body: unknown = req.body ?? {};
    logger.warn({ violation: getViolationSummary(body) }, '[CSP] violation');
    cspMetrics.violations.inc?.();
    // TODO: forward to logs/metrics sink
  } catch (error: unknown) {
    // Log CSP report processing errors but don't fail the request
    // CSP reports are fire-and-forget from the browser
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      '[CSP] Failed to process violation report'
    );
  }
  res.sendStatus(204);
});

export const cspReportRoute = router;
