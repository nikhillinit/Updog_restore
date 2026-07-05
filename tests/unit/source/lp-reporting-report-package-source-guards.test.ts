import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

const exists = (relativePath: string) => fs.existsSync(path.resolve(process.cwd(), relativePath));

describe('LP Reporting report-package source guards', () => {
  it('does not add a standalone /lp-reporting/reports client route or navigation item', () => {
    const appRoutesSource = read('client/src/app/app-routes.tsx');
    const navigationSource = read('client/src/components/layout/navigation-config.ts');

    expect(appRoutesSource).not.toContain('/lp-reporting/reports');
    expect(navigationSource).not.toContain('/lp-reporting/reports');
  });

  it('keeps report-package assembly on the internal package endpoint', () => {
    const hookSource = read('client/src/hooks/lp-reporting/useMetricsDryRun.ts');

    expect(hookSource).toContain('/api/funds/${fundId}/metric-runs/${metricRunId}/report-package');
    expect(hookSource).toContain(
      '/api/funds/${fundId}/metric-runs/${metricRunId}/report-package/render-model'
    );
    expect(hookSource).toContain(
      '/api/funds/${fundId}/metric-runs/${metricRunId}/report-package/export/json'
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
    const jsonExportServiceSource = read(
      'server/services/lp-reporting/report-package-json-export-service.ts'
    );
    const storedJsonExportServiceSource = read(
      'server/services/lp-reporting/report-package-json-stored-export-service.ts'
    );
    const storedCsvExportServiceSource = read(
      'server/services/lp-reporting/report-package-csv-stored-export-service.ts'
    );
    const metricsPageSource = read('client/src/pages/lp-reporting/metrics.tsx');

    expect(routeSource).toContain(
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/render-model'
    );
    expect(routeSource).toContain(
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/export/json'
    );
    expect(routeSource).toContain(
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv'
    );
    expect(routeSource).toContain(
      '/api/funds/:fundId/metric-runs/:metricRunId/report-package/exports/csv/artifact'
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

    expect(jsonExportServiceSource).not.toMatch(
      /report-generation-queue|pdf-generation-service|xlsx-generation-service|routes\/lp-api/
    );
    expect(jsonExportServiceSource).not.toMatch(/storageKey|signedUrl|downloadUrl|publicUrl/);
    expect(jsonExportServiceSource).not.toMatch(/\bQueue\b|report-generation/);
    expect(jsonExportServiceSource).not.toMatch(/\b(?:db|database)\.(insert|update|delete)\(/);

    expect(storedJsonExportServiceSource).toContain('lpReportPackageExports');
    expect(storedJsonExportServiceSource).toMatch(/\.insert\(lpReportPackageExports\)/);
    expect(storedJsonExportServiceSource).not.toMatch(
      /report-generation-queue|pdf-generation-service|xlsx-generation-service|routes\/lp-api/
    );
    expect(storedJsonExportServiceSource).not.toMatch(/storageKey|signedUrl|downloadUrl|publicUrl/);
    expect(storedJsonExportServiceSource).not.toMatch(/\bQueue\b|report-generation/);
    expect(storedJsonExportServiceSource).not.toMatch(/lpReports/);

    expect(storedCsvExportServiceSource).toContain('lpReportPackageExports');
    expect(storedCsvExportServiceSource).toMatch(/\.insert\(lpReportPackageExports\)/);
    expect(storedCsvExportServiceSource).toContain("format: 'csv'");
    expect(storedCsvExportServiceSource).not.toMatch(
      /getMetricRunReportPackageJsonExport|getMetricRunReportPackageRenderModel/
    );
    expect(storedCsvExportServiceSource).not.toMatch(
      /report-generation-queue|pdf-generation-service|xlsx-generation-service|routes\/lp-api/
    );
    expect(storedCsvExportServiceSource).not.toMatch(/storageKey|signedUrl|downloadUrl|publicUrl/);
    expect(storedCsvExportServiceSource).not.toMatch(/\bQueue\b|report-generation/);
    expect(storedCsvExportServiceSource).not.toMatch(/lpReports/);

    expect(metricsPageSource).not.toContain('@/hooks/useLPReports');
    expect(metricsPageSource).not.toMatch(
      /\bDownload\b|\bShare\b|Export PDF|Export XLSX|Public link|\bEmail\b|LP portal/
    );
  });

  it('locks PRD #996 AC-3 to the ADR-027 Surface-A watermark decision', () => {
    const queueSource = read('server/queues/report-generation-queue.ts');
    const queueRegistrySource = read('server/queues/registry.ts');
    const lpApiRouteSource = read('server/routes/lp-api.ts');
    const reportPackageRouteSource = read('server/routes/lp-reporting/metric-runs.ts');
    const routePolicySource = read('server/route-policy/api-route-policy-registry.ts');
    const decisionsSource = read('DECISIONS.md');
    const buildReadinessSource = read('docs/BUILD_READINESS.md');

    expect(exists('workers/report-worker.ts')).toBe(false);
    expect(queueSource).toContain("const QUEUE_NAME = 'lp-report-generation'");
    expect(queueRegistrySource).toContain("queueName: 'lp-report-generation'");
    expect(lpApiRouteSource).toContain('enqueueReportGeneration');
    expect(lpApiRouteSource).toContain('/api/lp/reports/generate');
    expect(reportPackageRouteSource).not.toMatch(/enqueueReportGeneration|lp-report-generation/);

    for (const source of [
      queueSource,
      queueRegistrySource,
      lpApiRouteSource,
      reportPackageRouteSource,
      routePolicySource,
    ]) {
      expect(source).not.toContain("'report-generation'");
      expect(source).not.toMatch(/\baddWatermark\b|\bwatermarked\b/);
    }

    expect(routePolicySource).toContain('scopes visual watermarking out by ADR-027');
    expect(routePolicySource).toContain('h9Stamp plus contentHash');
    expect(decisionsSource).toContain('## ADR-027: LP Export Watermark Policy (PRD #996 D3)');
    expect(decisionsSource).toContain('Watermarking is out of scope for Surface-A JSON/CSV');
    expect(decisionsSource).toContain('Delete `workers/report-worker.ts` instead of wiring it');
    expect(decisionsSource).toContain('### Current-Main Revalidation (2026-07-05)');
    expect(decisionsSource).toContain("`const QUEUE_NAME = 'lp-report-generation'`");
    expect(buildReadinessSource).toContain(
      'ADR-027 scopes visual watermarking out for these machine-readable artifacts'
    );
    expect(buildReadinessSource).toContain(
      '`workers/report-worker.ts` is deleted, and the live `lp-report-generation`'
    );
  });
});
