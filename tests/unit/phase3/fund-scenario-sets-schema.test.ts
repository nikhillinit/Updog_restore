import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function readRepoFile(relativePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('ADR-022 fund scenario set schema shell', () => {
  it('exports fund scenario set, variant, and event tables through the shared schema barrel', async () => {
    const schema = await import('@shared/schema');

    expect(schema.fundScenarioSets).toBeDefined();
    expect(schema.fundScenarioSets.fundId.name).toBe('fund_id');
    expect(schema.fundScenarioSets.sourceConfigVersion.name).toBe('source_config_version');
    expect(schema.fundScenarioSets.archivedAt.name).toBe('archived_at');

    expect(schema.fundScenarioVariants).toBeDefined();
    expect(schema.fundScenarioVariants.scenarioSetId.name).toBe('scenario_set_id');
    expect(schema.fundScenarioVariants.overrideType.name).toBe('override_type');
    expect(schema.fundScenarioVariants.overridePayload.name).toBe('override_payload');

    expect(schema.fundScenarioSetEvents).toBeDefined();
    expect(schema.fundScenarioSetEvents.changeSummary.name).toBe('change_summary_json');
  });

  it('migration creates dedicated tables and keeps first-slice overrides fee-profile only', async () => {
    const migration = await readRepoFile('server/db/migrations/0013_fund_scenario_sets.sql');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS fund_scenario_sets');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS fund_scenario_variants');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS fund_scenario_set_events');
    expect(migration).toContain('archived_at TIMESTAMPTZ');
    expect(migration).toContain("CHECK (override_type IN ('fee_profile'))");
    expect(migration).toContain('fund_scenario_sets_fund_active_updated_idx');
    expect(migration).toContain('idempotency_key VARCHAR(128)');
    expect(migration).toContain('idempotency_request_hash TEXT');
    expect(migration).toContain('fund_scenario_sets_fund_idempotency_unique');
    expect(migration).toContain('fund_scenario_variants_set_order_unique');
  });
});
