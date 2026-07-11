import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const h9MigrationTag = '0029_h9_actionability_reconcile_drift';
const allocationScenarioMigrationTag = '0030_allocation_scenarios_reconcile_drift';
const identityMigrationTag = '0031_user_identity_grants_revocation';
const journalPath = path.join(repoRoot, 'migrations', 'meta', '_journal.json');
const allocationScenarioTables = [
  'allocation_scenarios',
  'allocation_scenario_items',
  'allocation_scenario_events',
  'allocation_scenario_ic_decisions',
] as const;
const allocationScenarioIndexNames = [
  'allocation_scenarios_fund_updated_idx',
  'allocation_scenario_items_scenario_idx',
  'allocation_scenario_events_scenario_created_idx',
  'allocation_scenario_events_fund_created_idx',
  'allocation_scenario_ic_decisions_scenario_idx',
  'allocation_scenario_ic_decisions_fund_idx',
] as const;
const allocationScenarioConstraintNames = [
  'allocation_scenarios_fund_id_fkey',
  'allocation_scenario_items_scenario_id_fkey',
  'allocation_scenario_items_company_id_fkey',
  'allocation_scenario_items_non_negative_planned',
  'allocation_scenario_items_non_negative_cap',
  'allocation_scenario_items_cap_gte_planned',
  'allocation_scenario_events_scenario_id_fkey',
  'allocation_scenario_events_fund_id_fkey',
  'allocation_scenario_events_actor_user_id_fkey',
  'allocation_scenario_events_type_check',
  'allocation_scenario_ic_decisions_scenario_id_fkey',
  'allocation_scenario_ic_decisions_fund_id_fkey',
  'allocation_scenario_ic_decisions_company_id_fkey',
  'allocation_scenario_ic_decisions_decided_by_user_id_fkey',
  'allocation_scenario_ic_decisions_unique_company',
  'allocation_scenario_ic_decisions_type_check',
  'allocation_scenario_ic_decisions_status_check',
  'allocation_scenario_ic_decisions_proposed_non_negative',
  'allocation_scenario_ic_decisions_final_non_negative',
] as const;
const identityTableNames = ['user_fund_grants', 'revoked_tokens'] as const;
const identityConstraintNames = [
  'users_role_check',
  'user_fund_grants_user_id_users_id_fk',
  'user_fund_grants_fund_id_funds_id_fk',
  'revoked_tokens_user_id_users_id_fk',
] as const;

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

describe('H9 reconcile drift patch migration', () => {
  it('marks 0029 as a drift patch on the first line', () => {
    expect(fs.existsSync(migrationPath(h9MigrationTag))).toBe(true);

    const firstLine = readMigrationSql(h9MigrationTag).split(/\r?\n/, 1)[0];

    expect(firstLine).toBe('-- @drift-patch');
  });

  it('uses replay-safe guards for table and column changes', () => {
    const sql = readMigrationSql(h9MigrationTag);
    const alterTableIfExists = sql.match(/\bALTER\s+TABLE\s+IF\s+EXISTS\b/gi) ?? [];
    const bareAlterTable = sql.match(/\bALTER\s+TABLE\b(?!\s+IF\s+EXISTS\b)/gi) ?? [];
    const addColumnIfNotExists = sql.match(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
    const bareAddColumn = sql.match(/\bADD\s+COLUMN\b(?!\s+IF\s+NOT\s+EXISTS\b)/gi) ?? [];

    expect(alterTableIfExists).toHaveLength(12);
    expect(bareAlterTable).toEqual([]);
    expect(addColumnIfNotExists).toHaveLength(24);
    expect(bareAddColumn).toEqual([]);
  });

  it('guards all constraint additions inside pg_constraint-aware DO blocks', () => {
    const sql = readMigrationSql(h9MigrationTag);
    const doBlocks = sql.match(/DO\s+\$\$[\s\S]*?END\s*\$\$;/gi) ?? [];
    const addConstraintBlocks = doBlocks.filter((block) => /\bADD\s+CONSTRAINT\b/i.test(block));
    const topLevelSql = sql.replace(/DO\s+\$\$[\s\S]*?END\s*\$\$;/gi, '');

    expect(addConstraintBlocks).toHaveLength(8);
    expect(topLevelSql).not.toMatch(/\bADD\s+CONSTRAINT\b/i);

    for (const block of addConstraintBlocks) {
      expect(block).toMatch(/\bNOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_constraint\b/i);
    }
  });

  it('does not include destructive or base-table operations', () => {
    const sql = readMigrationSql(h9MigrationTag);

    expect(sql).not.toMatch(/\bDROP\s+/i);
    expect(sql).not.toMatch(/\bRENAME\s+/i);
    expect(sql).not.toMatch(/\bCREATE\s+TABLE\b/i);
  });

  it('journals 0029 at idx 30', () => {
    const entries = readJournalEntries().filter((entry) => entry.tag === h9MigrationTag);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      idx: 30,
      version: '7',
      tag: h9MigrationTag,
      breakpoints: true,
    });
    expect(entries[0]?.when).toBeGreaterThan(1783022913852);
  });
});

describe('Allocation scenario reconcile drift patch migration', () => {
  it('marks 0030 as a drift patch on the first line', () => {
    expect(fs.existsSync(migrationPath(allocationScenarioMigrationTag))).toBe(true);

    const firstLine = readMigrationSql(allocationScenarioMigrationTag).split(/\r?\n/, 1)[0];

    expect(firstLine).toBe('-- @drift-patch');
  });

  it('uses replay-safe guards for table, column, and index changes', () => {
    const sql = readMigrationSql(allocationScenarioMigrationTag);
    const createTableIfNotExists = sql.match(/\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
    const bareCreateTable = sql.match(/\bCREATE\s+TABLE\b(?!\s+IF\s+NOT\s+EXISTS\b)/gi) ?? [];
    const addColumnIfNotExists = sql.match(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
    const bareAddColumn = sql.match(/\bADD\s+COLUMN\b(?!\s+IF\s+NOT\s+EXISTS\b)/gi) ?? [];
    const createIndexIfNotExists = sql.match(/\bCREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
    const bareCreateIndex = sql.match(/\bCREATE\s+INDEX\b(?!\s+IF\s+NOT\s+EXISTS\b)/gi) ?? [];

    expect(createTableIfNotExists).toHaveLength(allocationScenarioTables.length);
    expect(bareCreateTable).toEqual([]);
    expect(addColumnIfNotExists).toHaveLength(48);
    expect(bareAddColumn).toEqual([]);
    expect(createIndexIfNotExists).toHaveLength(allocationScenarioIndexNames.length);
    expect(bareCreateIndex).toEqual([]);

    for (const table of allocationScenarioTables) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+"${table}"`, 'i'));
    }

    for (const indexName of allocationScenarioIndexNames) {
      expect(sql).toContain(`CREATE INDEX IF NOT EXISTS "${indexName}"`);
    }
  });

  it('guards all constraint additions inside pg_constraint-aware DO blocks', () => {
    const sql = readMigrationSql(allocationScenarioMigrationTag);
    const doBlocks = sql.match(/DO\s+\$\$[\s\S]*?END\s*\$\$;/gi) ?? [];
    const addConstraintBlocks = doBlocks.filter((block) => /\bADD\s+CONSTRAINT\b/i.test(block));
    const topLevelSql = sql.replace(/DO\s+\$\$[\s\S]*?END\s*\$\$;/gi, '');

    expect(addConstraintBlocks).toHaveLength(allocationScenarioConstraintNames.length);
    expect(topLevelSql).not.toMatch(/\bADD\s+CONSTRAINT\b/i);

    for (const block of addConstraintBlocks) {
      expect(block).toMatch(/\bNOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_constraint\b/i);
    }

    for (const constraintName of allocationScenarioConstraintNames) {
      expect(
        addConstraintBlocks.some(
          (block) => block.includes(`"${constraintName}"`) || block.includes(`'${constraintName}'`)
        )
      ).toBe(true);
    }
  });

  it('does not include destructive operations or the intentionally omitted dead table', () => {
    const sql = readMigrationSql(allocationScenarioMigrationTag);

    expect(sql).not.toMatch(/\bDROP\s+/i);
    expect(sql).not.toMatch(/\bRENAME\s+/i);
    expect(sql).not.toContain('allocation_scenario_decisions');
  });

  it('references all four live allocation scenario tables', () => {
    const sql = readMigrationSql(allocationScenarioMigrationTag);

    for (const table of allocationScenarioTables) {
      expect(sql).toContain(`"${table}"`);
    }
  });

  it('journals 0030 at idx 31', () => {
    const entries = readJournalEntries().filter(
      (entry) => entry.tag === allocationScenarioMigrationTag
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      idx: 31,
      version: '7',
      tag: allocationScenarioMigrationTag,
      breakpoints: true,
    });
    expect(entries[0]?.when).toBeGreaterThan(1783790526019);
  });
});

describe('Identity reconcile drift patch migration', () => {
  it('marks 0031 as a drift patch on the first line', () => {
    expect(fs.existsSync(migrationPath(identityMigrationTag))).toBe(true);

    const firstLine = readMigrationSql(identityMigrationTag).split(/\r?\n/, 1)[0];

    expect(firstLine).toBe('-- @drift-patch');
  });

  it('uses replay-safe guards for table, column, and index changes', () => {
    const sql = readMigrationSql(identityMigrationTag);
    const createTableIfNotExists = sql.match(/\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
    const bareCreateTable = sql.match(/\bCREATE\s+TABLE\b(?!\s+IF\s+NOT\s+EXISTS\b)/gi) ?? [];
    const addColumnIfNotExists = sql.match(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
    const bareAddColumn = sql.match(/\bADD\s+COLUMN\b(?!\s+IF\s+NOT\s+EXISTS\b)/gi) ?? [];
    const createIndexIfNotExists = sql.match(/\bCREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\b/gi) ?? [];
    const bareCreateIndex = sql.match(/\bCREATE\s+INDEX\b(?!\s+IF\s+NOT\s+EXISTS\b)/gi) ?? [];

    expect(createTableIfNotExists).toHaveLength(identityTableNames.length);
    expect(bareCreateTable).toEqual([]);
    expect(addColumnIfNotExists).toHaveLength(5);
    expect(bareAddColumn).toEqual([]);
    expect(createIndexIfNotExists).toHaveLength(1);
    expect(bareCreateIndex).toEqual([]);

    for (const tableName of identityTableNames) {
      expect(sql).toMatch(
        new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+"${tableName}"`, 'i')
      );
    }
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "revoked_tokens_expires_at_idx"');
  });

  it('guards every identity constraint addition inside pg_constraint-aware DO blocks', () => {
    const sql = readMigrationSql(identityMigrationTag);
    const doBlocks = sql.match(/DO\s+\$\$[\s\S]*?END\s*\$\$;/gi) ?? [];
    const addConstraintBlocks = doBlocks.filter((block) => /\bADD\s+CONSTRAINT\b/i.test(block));
    const topLevelSql = sql.replace(/DO\s+\$\$[\s\S]*?END\s*\$\$;/gi, '');

    expect(addConstraintBlocks).toHaveLength(identityConstraintNames.length);
    expect(topLevelSql).not.toMatch(/\bADD\s+CONSTRAINT\b/i);

    for (const block of addConstraintBlocks) {
      expect(block).toMatch(/\bNOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+pg_constraint\b/i);
    }

    for (const constraintName of identityConstraintNames) {
      expect(
        addConstraintBlocks.some(
          (block) => block.includes(`"${constraintName}"`) || block.includes(`'${constraintName}'`)
        )
      ).toBe(true);
    }
  });

  it('does not contain destructive operations or the deferred cookie-session table', () => {
    const sql = readMigrationSql(identityMigrationTag);

    expect(sql).not.toMatch(/\bDROP\s+/i);
    expect(sql).not.toMatch(/\bRENAME\s+/i);
    expect(sql).not.toContain('auth_sessions');
  });

  it('journals 0031 exactly once at idx 32', () => {
    const entries = readJournalEntries().filter((entry) => entry.tag === identityMigrationTag);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      idx: 32,
      version: '7',
      tag: identityMigrationTag,
      breakpoints: true,
    });
    expect(entries[0]?.when).toBeGreaterThan(1783791316672);
  });
});

function migrationPath(tag: string): string {
  return path.join(repoRoot, 'migrations', `${tag}.sql`);
}

function readMigrationSql(tag: string): string {
  return fs.readFileSync(migrationPath(tag), 'utf8');
}

function readJournalEntries(): JournalEntry[] {
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: JournalEntry[];
  };

  return journal.entries;
}
