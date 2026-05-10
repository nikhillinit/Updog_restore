import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('LP Reporting report-package source guards', () => {
  it('does not add a standalone /lp-reporting/reports client route or navigation item', () => {
    const appSource = read('client/src/App.tsx');
    const navigationSource = read('client/src/config/navigation.ts');

    expect(appSource).not.toContain('/lp-reporting/reports');
    expect(navigationSource).not.toContain('/lp-reporting/reports');
  });

  it('keeps report-package assembly on the internal package endpoint', () => {
    const hookSource = read('client/src/hooks/lp-reporting/useMetricsDryRun.ts');

    expect(hookSource).toContain('/api/funds/${fundId}/metric-runs/${metricRunId}/report-package');
    expect(hookSource).toContain(
      '/api/funds/${fundId}/metric-runs/${metricRunId}/report-package/render-model'
    );
    expect(hookSource).not.toMatch(/postMetricRunReportPackage[\s\S]*\/evidence-records/);
    expect(hookSource).not.toContain('@/hooks/useLPReports');
  });

  it('does not introduce an export lifecycle in the report-package service', () => {
    const serviceSource = read('server/services/lp-reporting/report-package-service.ts');

    expect(serviceSource).not.toMatch(/\bexportedAt\b/);
    expect(serviceSource).not.toMatch(/status:\s*['"]exported['"]/);
    expect(serviceSource).not.toMatch(/\.set\([^)]*exported/i);
  });

  it('keeps the render-model path read-only and generation-free', () => {
    const routeSource = read('server/routes/lp-reporting/metric-runs.ts');
    const serviceSource = read(
      'server/services/lp-reporting/report-package-render-model-service.ts'
    );
    const metricsPageSource = read('client/src/pages/lp-reporting/metrics.tsx');

    expect(routeSource).toContain(
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model'
    );
    expect(routeSource).not.toContain('/api/lp/reports/generate');
    expect(routeSource).not.toMatch(
      /generateReport|reportGenerationQueue|pdfGeneration|xlsxGeneration/
    );

    expect(serviceSource).not.toMatch(
      /report-generation-queue|pdf-generation-service|xlsx-generation-service|routes\/lp-api/
    );
    expect(serviceSource).not.toMatch(/storageKey|signedUrl|downloadUrl|publicUrl/);
    expect(serviceSource).not.toMatch(/\bQueue\b|report-generation/);
    expect(serviceSource).not.toMatch(/\.(insert|update|delete)\(/);

    expect(metricsPageSource).not.toContain('@/hooks/useLPReports');
    expect(metricsPageSource).not.toMatch(
      /\bDownload\b|\bShare\b|Export PDF|Export XLSX|Public link|\bEmail\b|LP portal/
    );
  });
});
