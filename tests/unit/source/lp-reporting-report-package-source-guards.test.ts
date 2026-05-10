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

    expect(hookSource).toContain('/report-package');
    expect(hookSource).not.toMatch(/postMetricRunReportPackage[\s\S]*\/evidence-records/);
  });

  it('does not introduce an export lifecycle in the report-package service', () => {
    const serviceSource = read('server/services/lp-reporting/report-package-service.ts');

    expect(serviceSource).not.toContain('exportedAt');
    expect(serviceSource).not.toMatch(/status:\s*['"]exported['"]/);
    expect(serviceSource).not.toMatch(/\.set\([^)]*exported/i);
  });
});
