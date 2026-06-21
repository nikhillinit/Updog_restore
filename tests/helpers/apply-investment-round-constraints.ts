import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sql, type SQL } from 'drizzle-orm';
import { Pool } from 'pg';

const INVESTMENTS_UNIQUE_CONSTRAINT = 'investments_id_fund_id_key';
const INVESTMENT_ROUNDS_FK_CONSTRAINT = 'investment_rounds_investment_fund_fk';

interface QueryTarget {
  query(queryText: string): Promise<unknown>;
}

interface ExecuteTarget {
  execute(query: SQL): Promise<unknown>;
}

interface QueryResultShape {
  rows?: unknown;
}

type ConstraintTarget = string | QueryTarget | ExecuteTarget;

interface SqlRunner {
  run(statement: string): Promise<unknown>;
}

function readMigration(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

function extractStatement(migrationSql: string, pattern: RegExp, label: string): string {
  const match = migrationSql.match(pattern);
  if (!match?.[0]) {
    throw new Error(`Unable to find ${label} in journaled migration SQL`);
  }

  return match[0];
}

function loadConstraintStatements(): {
  investmentsUnique: string;
  investmentRoundsFk: string;
  investmentRoundsSupersedesIndex: string;
} {
  const investmentsUnique = readMigration(
    'server/migrations/20260621_investments_id_fund_unique_v1.up.sql'
  ).trim();
  const investmentRoundsMigration = readMigration(
    'server/migrations/20260621_z_investment_rounds_v1.up.sql'
  );

  const investmentRoundsFkClause = extractStatement(
    investmentRoundsMigration,
    /CONSTRAINT investment_rounds_investment_fund_fk\s+FOREIGN KEY \(investment_id, fund_id\)\s+REFERENCES investments\(id, fund_id\)\s+ON UPDATE RESTRICT\s+ON DELETE RESTRICT,/m,
    INVESTMENT_ROUNDS_FK_CONSTRAINT
  ).replace(/,\s*$/, '');
  const investmentRoundsSupersedesIndex = extractStatement(
    investmentRoundsMigration,
    /CREATE UNIQUE INDEX IF NOT EXISTS investment_rounds_supersedes_uq\s+ON investment_rounds\(supersedes_round_id\)\s+WHERE supersedes_round_id IS NOT NULL;/m,
    'investment_rounds_supersedes_uq'
  );

  return {
    investmentsUnique,
    investmentRoundsFk: `ALTER TABLE investment_rounds ADD ${investmentRoundsFkClause};`,
    investmentRoundsSupersedesIndex,
  };
}

function isQueryTarget(value: ConstraintTarget): value is QueryTarget {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { query?: unknown }).query === 'function';
}

function isExecuteTarget(value: ConstraintTarget): value is ExecuteTarget {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as { execute?: unknown }).execute === 'function';
}

function resultRows(result: unknown): unknown[] {
  if (typeof result !== 'object' || result === null) return [];

  const rows = (result as QueryResultShape).rows;
  return Array.isArray(rows) ? rows : [];
}

async function withSqlRunner<T>(
  target: ConstraintTarget,
  action: (runner: SqlRunner) => Promise<T>
): Promise<T> {
  if (typeof target === 'string') {
    const pool = new Pool({ connectionString: target, max: 1 });
    try {
      return await action({ run: (statement) => pool.query(statement) });
    } finally {
      await pool.end();
    }
  }

  if (isQueryTarget(target)) {
    return action({ run: (statement) => target.query(statement) });
  }

  if (isExecuteTarget(target)) {
    return action({ run: (statement) => target.execute(sql.raw(statement)) });
  }

  throw new Error('Unsupported database handle for investment round constraints');
}

async function constraintExists(runner: SqlRunner, constraintName: string): Promise<boolean> {
  const result = await runner.run(`
    SELECT 1
    FROM pg_constraint
    WHERE conname = '${constraintName}'
    LIMIT 1
  `);

  return resultRows(result).length > 0;
}

export async function applyInvestmentRoundConstraints(target: ConstraintTarget): Promise<void> {
  const statements = loadConstraintStatements();

  await withSqlRunner(target, async (runner) => {
    if (!(await constraintExists(runner, INVESTMENTS_UNIQUE_CONSTRAINT))) {
      await runner.run(statements.investmentsUnique);
    }

    if (!(await constraintExists(runner, INVESTMENT_ROUNDS_FK_CONSTRAINT))) {
      await runner.run(statements.investmentRoundsFk);
    }

    await runner.run(statements.investmentRoundsSupersedesIndex);
  });
}
