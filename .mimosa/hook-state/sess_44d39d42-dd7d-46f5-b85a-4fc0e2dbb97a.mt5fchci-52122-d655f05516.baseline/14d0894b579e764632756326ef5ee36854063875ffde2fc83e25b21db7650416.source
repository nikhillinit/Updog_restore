import { and, eq, sql, type SQL, type SQLWrapper } from 'drizzle-orm';

import { funds } from '@shared/schema/fund';

/**
 * Central predicate for governed cross-fund reads.
 *
 * Fund-scoped detail reads deliberately do not use this helper: an authorized
 * canary principal must be able to inspect its own smoke fund. Reporting,
 * rollup, export, and cross-fund metric queries use this predicate instead.
 */
export const PRODUCTION_FUND_DATA_ORIGIN = 'production' as const;

export function productionFundPredicate(fundOrigin: SQLWrapper = funds.dataOrigin): SQL {
  return eq(fundOrigin, PRODUCTION_FUND_DATA_ORIGIN);
}

export function withProductionFundPredicate(
  condition: SQLWrapper | undefined,
  fundOrigin: SQLWrapper = funds.dataOrigin
): SQL {
  return condition
    ? and(condition, productionFundPredicate(fundOrigin))!
    : productionFundPredicate(fundOrigin);
}

/** Raw-SQL form for query sites that cannot use Drizzle column expressions. */
export function productionFundSql(fundOrigin: SQLWrapper = funds.dataOrigin): SQL {
  return sql`${fundOrigin} = ${PRODUCTION_FUND_DATA_ORIGIN}`;
}
