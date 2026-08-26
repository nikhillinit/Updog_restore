import { sql } from 'drizzle-orm';

import { investments } from '../../../shared/schema/portfolio';
import { db } from '../../db';

type LegacyInvestmentInsert = typeof investments.$inferInsert;
type LegacyInvestment = typeof investments.$inferSelect;

interface InsertReturning {
  returning: () => Promise<LegacyInvestment[]>;
}

interface LegacyGuardTransaction {
  execute: (query: unknown) => Promise<unknown>;
  insert: (table: typeof investments) => {
    values: (value: LegacyInvestmentInsert) => InsertReturning;
  };
}

export interface LegacyGuardDatabase {
  transaction: <T>(callback: (transaction: LegacyGuardTransaction) => Promise<T>) => Promise<T>;
}

export class UseLedgerRouteError extends Error {
  readonly status = 409;
  readonly statusCode = 409;
  readonly code = 'USE_LEDGER_ROUTE';

  constructor() {
    super('This position is managed by the investment ledger and is read-only here.');
    this.name = 'UseLedgerRouteError';
  }
}

function rowsFromResult(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result.filter(
      (row): row is Record<string, unknown> => typeof row === 'object' && row !== null
    );
  }
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    return rowsFromResult((result as { rows: unknown }).rows);
  }
  return [];
}

async function lockFundIdentity(
  transaction: LegacyGuardTransaction,
  fundId: number
): Promise<void> {
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`fund-identity:${fundId}`}))`
  );
}

export async function createLegacyInvestmentWithLedgerGuard(
  investment: LegacyInvestmentInsert & { fundId: number; companyId: number },
  database: LegacyGuardDatabase = db as unknown as LegacyGuardDatabase
): Promise<LegacyInvestment> {
  return database.transaction(async (transaction) => {
    await lockFundIdentity(transaction, investment.fundId);
    const linkedParticipations = rowsFromResult(
      await transaction.execute(sql`
        SELECT vfp.id AS participation_id
        FROM portfolio_company_identity_links AS identity_link
        JOIN financing_events AS event
          ON event.fund_id = identity_link.fund_id
         AND event.company_identity_id = identity_link.company_identity_id
        JOIN vehicle_financing_participations AS vfp
          ON vfp.fund_id = event.fund_id
         AND vfp.financing_event_id = event.id
         AND vfp.superseded_by_participation_id IS NULL
        WHERE identity_link.fund_id = ${investment.fundId}
          AND identity_link.portfolio_company_id = ${investment.companyId}
          AND identity_link.active = true
        LIMIT 1
      `)
    );
    if (linkedParticipations.length > 0) {
      throw new UseLedgerRouteError();
    }

    const inserted = await transaction.insert(investments).values(investment).returning();
    const row = inserted[0];
    if (!row) {
      throw new Error('Failed to create investment.');
    }
    return row;
  });
}

export async function assertLegacyInvestmentMutable(
  fundId: number,
  investmentId: number,
  database: LegacyGuardDatabase = db as unknown as LegacyGuardDatabase
): Promise<void> {
  await database.transaction(async (transaction) => {
    await lockFundIdentity(transaction, fundId);
    const rows = rowsFromResult(
      await transaction.execute(sql`
        SELECT vehicle_participation_id
        FROM investments
        WHERE id = ${investmentId}
          AND fund_id = ${fundId}
        LIMIT 1
      `)
    );
    if (rows[0]?.['vehicle_participation_id'] != null) {
      throw new UseLedgerRouteError();
    }
  });
}
