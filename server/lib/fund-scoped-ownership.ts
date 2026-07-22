import { and, eq } from 'drizzle-orm';

import { currentPlanVersions } from '../../shared/schema/current-plans';
import { financialFactsSnapshots } from '../../shared/schema/financial-facts-snapshots';
import { vehicles } from '../../shared/schema/lp-reporting-evidence';

export type FundScopedReference = {
  kind:
    | 'facts_snapshot'
    | 'current_plan_version'
    | 'fund_snapshot'
    | 'vehicle'
    | 'portfolio_company'
    | 'financing_event'
    | 'financing_tranche'
    | 'participation'
    | 'scenario_set'
    | 'reconciliation_case'
    | 'source_observation';
  id: string | number;
};

interface OwnershipQuery {
  from: (table: unknown) => {
    where: (condition: unknown) => {
      limit: (count: number) => Promise<ReadonlyArray<{ id: number }>>;
    };
  };
}

export interface FundScopedOwnershipDatabase {
  select: (fields?: Record<string, unknown>) => OwnershipQuery;
}

export class FundScopeError extends Error {
  readonly status = 404;
  readonly statusCode = 404;
  readonly code = 'FUND_SCOPE_NOT_FOUND';

  constructor(readonly ref: FundScopedReference) {
    super('The requested resource was not found in this fund.');
    this.name = 'FundScopeError';
  }
}

export class FundScopeKindNotImplementedError extends Error {
  readonly status = 501;
  readonly statusCode = 501;
  readonly code = 'FUND_SCOPE_KIND_NOT_IMPLEMENTED';

  constructor(readonly kind: FundScopedReference['kind']) {
    super(`Fund ownership lookup is not implemented for ${kind}.`);
    this.name = 'FundScopeKindNotImplementedError';
  }
}

function numericReferenceId(id: string | number): number | null {
  if (typeof id === 'number') {
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  if (!/^\d+$/.test(id)) return null;
  const parsed = Number.parseInt(id, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function assertOwnedByFund(opts: {
  db: FundScopedOwnershipDatabase;
  fundId: number;
  ref: FundScopedReference;
}): Promise<void> {
  const id = numericReferenceId(opts.ref.id);
  if (id === null) {
    throw new FundScopeError(opts.ref);
  }

  if (opts.ref.kind === 'facts_snapshot') {
    const rows = await opts.db
      .select({ id: financialFactsSnapshots.id })
      .from(financialFactsSnapshots)
      .where(
        and(eq(financialFactsSnapshots.id, id), eq(financialFactsSnapshots.fundId, opts.fundId))
      )
      .limit(1);

    if (rows.length === 0) {
      throw new FundScopeError(opts.ref);
    }
    return;
  }

  if (opts.ref.kind === 'current_plan_version') {
    const rows = await opts.db
      .select({ id: currentPlanVersions.id })
      .from(currentPlanVersions)
      .where(and(eq(currentPlanVersions.id, id), eq(currentPlanVersions.fundId, opts.fundId)))
      .limit(1);

    if (rows.length === 0) {
      throw new FundScopeError(opts.ref);
    }
    return;
  }

  if (opts.ref.kind === 'vehicle') {
    const rows = await opts.db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.fundId, opts.fundId)))
      .limit(1);

    if (rows.length === 0) {
      throw new FundScopeError(opts.ref);
    }
    return;
  }

  throw new FundScopeKindNotImplementedError(opts.ref.kind);
}
