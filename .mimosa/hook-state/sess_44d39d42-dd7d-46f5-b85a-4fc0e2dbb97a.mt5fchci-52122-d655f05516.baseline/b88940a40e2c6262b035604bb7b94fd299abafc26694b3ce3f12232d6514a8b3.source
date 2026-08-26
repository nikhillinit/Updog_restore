import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { API_ROUTE_POLICY_REGISTRY } from '../../../server/route-policy/api-route-policy-registry';

/**
 * Ruling GR2-4a scopes v1 KPI collection to internal, CSV-first entry: no
 * company-facing request form, no recipient, no send, no share, and no export.
 * This test keeps that boundary from eroding one convenience endpoint at a time.
 */
/** Comments say what the boundary is; only executable code can breach it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('KPI collection internal-only boundary', () => {
  it('exposes no export, share, send, or recipient surface', async () => {
    const [routeSource, serviceSource, csvSource] = await Promise.all([
      readFile('server/routes/kpi-observations.ts', 'utf8'),
      readFile('server/services/kpi/kpi-observation-service.ts', 'utf8'),
      readFile('server/services/kpi/kpi-observation-csv.ts', 'utf8'),
    ]);

    for (const source of [routeSource, serviceSource, csvSource]) {
      expect(withoutComments(source)).not.toMatch(
        /\b(?:recipient|mailer|sendEmail|shareSnapshot)\b/i
      );
    }
    expect(routeSource).not.toMatch(/router\.(?:get|post|put|patch|delete)\(\s*'[^']*\/export/i);
    expect(routeSource).not.toMatch(/router\.(?:get|post|put|patch|delete)\(\s*'[^']*\/share/i);
    expect(routeSource).not.toMatch(/router\.(?:get|post|put|patch|delete)\(\s*'[^']*\/requests/i);
    expect(routeSource).not.toMatch(/text\/csv|attachment;/i);
  });

  it('never deletes a collected observation', async () => {
    const [routeSource, serviceSource] = await Promise.all([
      readFile('server/routes/kpi-observations.ts', 'utf8'),
      readFile('server/services/kpi/kpi-observation-service.ts', 'utf8'),
    ]);

    expect(routeSource).not.toMatch(/router\.delete\(/);
    expect(serviceSource).not.toMatch(/export\s+(?:async\s+)?function\s+delete/);
    expect(serviceSource).not.toMatch(/\.delete\(/);
  });

  it('classifies every KPI route as internal and not exportable', () => {
    const kpiEntries = API_ROUTE_POLICY_REGISTRY.filter((entry) =>
      entry.path.includes('/kpi-observations')
    );

    expect(kpiEntries).toHaveLength(5);
    for (const entry of kpiEntries) {
      expect(entry.exportPolicy).toBe('not_exportable');
      expect(entry.apiAuthBoundary).toBe('require_auth_and_fund_access');
      expect(entry.fundScopeMode).toBe('route_param_fund_id');
      expect(entry.financialSurface).toBe('portfolio_management');
    }
  });

  it('reuses the one shared CSV tokenizer instead of adding a parser', async () => {
    const csvSource = await readFile('server/services/kpi/kpi-observation-csv.ts', 'utf8');

    expect(csvSource).toContain("from '../../lib/csv-tokenizer'");
    expect(csvSource).not.toMatch(/require\(['"]csv-parse|from ['"]csv-parse/);
    expect(csvSource).not.toMatch(/function\s+\w*(?:splitCsv|tokenize)\w*\s*\(/i);
  });
});
