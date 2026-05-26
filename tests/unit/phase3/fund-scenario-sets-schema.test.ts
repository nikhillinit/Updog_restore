import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableConfig } from 'drizzle-orm/pg-core';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function readRepoFile(relativePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function indexColumnName(column: unknown): string {
  if (typeof column === 'object' && column !== null && 'name' in column) {
    const { name } = column as { name?: unknown };
    return typeof name === 'string' ? name : 'sql_expression';
  }

  return 'sql_expression';
}

function indexColumnOrder(column: unknown): string {
  if (typeof column === 'object' && column !== null && 'indexConfig' in column) {
    const { indexConfig } = column as { indexConfig?: { order?: unknown } };
    return typeof indexConfig?.order === 'string' ? indexConfig.order : 'asc';
  }

  return 'asc';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function sqlQueryChunks(value: unknown): unknown[] {
  const queryChunks = asRecord(value)?.queryChunks;
  return Array.isArray(queryChunks) ? queryChunks : [];
}

function sqlChunkText(value: unknown): string {
  return sqlQueryChunks(value)
    .flatMap((chunk) => {
      const chunkValue = asRecord(chunk)?.value;
      return Array.isArray(chunkValue) ? chunkValue : [];
    })
    .filter((chunkValue): chunkValue is string => typeof chunkValue === 'string')
    .join('');
}

function sqlChunkColumnNames(value: unknown): string[] {
  return sqlQueryChunks(value)
    .map((chunk) => asRecord(chunk)?.name)
    .filter((name): name is string => typeof name === 'string');
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

  it('Drizzle fund scenario set indexes mirror the active-row SQL migration indexes', async () => {
    const schema = await import('@shared/schema');
    const config = getTableConfig(schema.fundScenarioSets);
    const indexes = new Map(config.indexes.map((idx) => [idx.config.name, idx.config]));

    const activeUpdatedIdx = indexes.get('fund_scenario_sets_fund_active_updated_idx');
    expect(activeUpdatedIdx).toBeDefined();
    expect(activeUpdatedIdx?.unique).toBe(false);
    expect(activeUpdatedIdx?.columns.map(indexColumnName)).toEqual(['fund_id', 'updated_at', 'id']);
    expect(activeUpdatedIdx?.columns.map(indexColumnOrder)).toEqual(['asc', 'desc', 'desc']);
    expect(activeUpdatedIdx?.where).toBeDefined();
    expect(sqlChunkColumnNames(activeUpdatedIdx?.where)).toEqual(['archived_at']);
    expect(sqlChunkText(activeUpdatedIdx?.where)).toBe(' IS NULL');

    const activeNameUniqueIdx = indexes.get('fund_scenario_sets_fund_name_active_unique');
    expect(activeNameUniqueIdx).toBeDefined();
    expect(activeNameUniqueIdx?.unique).toBe(true);
    expect(activeNameUniqueIdx?.columns.map(indexColumnName)).toEqual([
      'fund_id',
      'sql_expression',
    ]);
    expect(activeNameUniqueIdx?.where).toBeDefined();
    expect(sqlChunkText(activeNameUniqueIdx?.columns[1])).toBe('lower()');
    expect(sqlChunkColumnNames(activeNameUniqueIdx?.columns[1])).toEqual(['name']);
    expect(sqlChunkColumnNames(activeNameUniqueIdx?.where)).toEqual(['archived_at']);
    expect(sqlChunkText(activeNameUniqueIdx?.where)).toBe(' IS NULL');

    const migration = await readRepoFile('server/db/migrations/0013_fund_scenario_sets.sql');
    expect(migration).toContain(
      'ON fund_scenario_sets(fund_id, updated_at DESC, id DESC)\n  WHERE archived_at IS NULL'
    );
    expect(migration).toContain(
      'ON fund_scenario_sets(fund_id, lower(name))\n  WHERE archived_at IS NULL'
    );
  });
});
