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

  it('exposes the admin reconciliation POST with role + idempotency guards', async () => {
    const source = await readRepoFile('server/routes/fund-moic.ts');
    expect(source).toContain('/admin/funds/:fundId/moic/reconciliations');
    expect(source).toContain("requireRole('admin')");
    expect(source).toContain('Idempotency-Key');
    expect(source).toContain('recordMoicReconciliation');
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
