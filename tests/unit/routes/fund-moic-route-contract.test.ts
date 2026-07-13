import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function readRepoFile(relativePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('fund-moic route contract', () => {
  it('guards the rankings endpoint with requireAuth and requireFundAccess', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('requireAuth()');
    expect(source).toContain('requireFundAccess');
    expect(source).toContain('/funds/:fundId/moic/rankings');
  });

  it('parses and validates fundId before calling the service', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('FundIdParamSchema');
  });

  it('calls the fund MOIC ranking service', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('getFundMoicRankingSources');
    expect(source).toContain('resolveFundCalculationMode');
  });

  it('branches the GET on a v1/v2 contract query and rejects unknown contracts', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain("req.query['contract']");
    expect(source).toContain("'v2'");
    expect(source).toContain('invalid_contract');
    // V2 output is re-validated against the strict allowlist contract.
    expect(source).toContain('FundMoicRankingsResponseV2Schema.parse');
  });

  it('reports companyCount from facts on success and from source record count on failure', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('buildFundCompanyActualsFacts({');
    expect(source).toContain('asOfDate: actualsAsOfDate');
    expect(source).toContain("{ status: 'available', response: actualsFacts }");
    expect(source).toContain('FUND_MOIC_FACTS_ABSENT');
    expect(source).not.toContain('factsByCompanyId');
    expect(source).toContain('sources.factsBasisByInvestmentId');
    expect(source).toContain('discloseFundMoicRankings');
    expect(source).toContain("factsStatus: 'available'");
    expect(source).toContain(
      'trustStates: actualsFacts.facts.map((fact) => fact.provenance.trustState)'
    );
    expect(source).toContain(
      'const sourceCompanyCount = sources.legacy.provenance.sourceRecordCount'
    );
    expect(source).toContain("factsStatus: 'failed'");
    expect(source).toContain(
      "trustStates: Array.from({ length: sourceCompanyCount }, () => 'UNAVAILABLE')"
    );
    expect(source).toContain("warnings: ['actuals_facts_failed']");
  });

  it('gates facts-basis comparison telemetry on effective shadow or on mode', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain("modePreview.effectiveMode === 'shadow'");
    expect(source).toContain("modePreview.effectiveMode === 'on'");
    expect(source).toContain('emitFundMoicFactsShadowTelemetry({');
  });

  it('exposes the admin reconciliation POST with role + idempotency guards', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('/admin/funds/:fundId/moic/reconciliations');
    expect(source).toContain("requireRole('admin')");
    expect(source).toContain('Idempotency-Key');
    expect(source).toContain('recordMoicReconciliation');
  });

  it('mounts the fund MOIC router on both server boot surfaces', async () => {
    // Post common-manifest convergence (#1090) both entrypoints mount shared routers
    // through server/routes/mount-common-routes.ts, so the proof is the delegation
    // chain: the common map carries fund-moic at /api, and each surface invokes its
    // surface-specific mountCommonRoutes call. Group membership/order completeness is
    // owned by tests/unit/server/common-route-manifest.test.ts.
    const commonMapSource = await readRepoFile('server/routes/mount-common-routes.ts');
    expect(commonMapSource).toContain("import fundMoicRouter from './fund-moic.js'");
    expect(commonMapSource).toMatch(/'fund-moic':\s*at\(\s*'\/api'\s*,\s*fundMoicRouter\s*\)/);

    const appSource = await readRepoFile('server/app.ts');
    expect(appSource).toContain("mountCommonRoutes(app, { surface: 'make_app'");

    const routesSource = await readRepoFile('server/routes.ts');
    expect(routesSource).toContain("mountCommonRoutes(app, { surface: 'register_routes'");
  });

  it('maps the idempotency lifecycle to 428 (missing key), 409 (conflict), 201/200 (new/replay)', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('428');
    expect(source).toContain('MoicReconciliationConflictError');
    expect(source).toContain('409');
    expect(source).toContain('replayed ? 200 : 201');
  });

  it('exposes the admin MOIC input PUT with role, fund access, and idempotency guards', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('/admin/funds/:fundId/moic-inputs/portfolio-companies/:companyId');
    expect(source).toContain('requireAuth()');
    expect(source).toContain('requireFundAccess');
    expect(source).toContain("requireRole('admin')");
    expect(source).toContain('Idempotency-Key');
    expect(source).toContain('MoicInputUpdateBodySchema');
    expect(source).toContain('updateFundMoicInputs');
  });

  it('maps admin MOIC input optimistic-lock and idempotency errors', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('FundMoicInputNotFoundError');
    expect(source).toContain('FundMoicInputVersionConflictError');
    expect(source).toContain('FundMoicInputIdempotencyConflictError');
    expect(source).toContain('FundMoicInputInProgressError');
    expect(source).toContain('invalid_company_id');
    expect(source).toContain('invalid_moic_input_update');
  });

  it('exposes the admin mode PUT with role, fund access, and idempotency guards', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('/admin/funds/:fundId/calculation-modes/fund-moic-rankings');
    expect(source).toContain('ModeUpdateBodySchema');
    expect(source).toContain('updateFundMoicCalculationMode');
    expect(source).toContain('FundCalculationModeVersionConflictError');
  });
});
