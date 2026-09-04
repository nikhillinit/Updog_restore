import { asc, eq } from 'drizzle-orm';

import type { db } from '../../db';
import type { FinancialFactsSnapshot } from '../../../shared/schema/financial-facts-snapshots';
import { financialFactsSnapshots } from '../../../shared/schema/financial-facts-snapshots';

export type TerminalFactsHeadResult =
  | { readonly kind: 'none' }
  | { readonly kind: 'head'; readonly row: FinancialFactsSnapshot }
  | {
      readonly kind: 'ambiguous';
      readonly code: 'FACTS_HEAD_AMBIGUOUS';
      readonly headIds: number[];
    }
  | {
      readonly kind: 'invalid';
      readonly code: 'FACTS_LINEAGE_INVALID';
      readonly reason: 'cycle' | 'detached';
    };

function invalid(reason: 'cycle' | 'detached'): TerminalFactsHeadResult {
  return { kind: 'invalid', code: 'FACTS_LINEAGE_INVALID', reason };
}

function walkLineage(
  start: FinancialFactsSnapshot,
  byId: ReadonlyMap<number, FinancialFactsSnapshot>
): TerminalFactsHeadResult {
  const visited = new Set<number>();
  let current: FinancialFactsSnapshot | undefined = start;

  while (current !== undefined) {
    if (visited.has(current.id)) return invalid('cycle');
    visited.add(current.id);

    if (current.supersedesSnapshotId === null) {
      return { kind: 'head', row: start };
    }

    current = byId.get(current.supersedesSnapshotId);
    if (current === undefined) return invalid('detached');
  }

  return invalid('detached');
}

export async function resolveTerminalFactsHead(
  database: typeof db,
  fundId: number
): Promise<TerminalFactsHeadResult> {
  const rows = await database
    .select()
    .from(financialFactsSnapshots)
    .where(eq(financialFactsSnapshots.fundId, fundId))
    .orderBy(asc(financialFactsSnapshots.id));

  if (rows.length === 0) return { kind: 'none' };

  const byId = new Map(rows.map((row) => [row.id, row]));
  const referencedIds = new Set(
    rows
      .map((row) => row.supersedesSnapshotId)
      .filter((id): id is number => id !== null)
  );
  const headRows = rows.filter((row) => !referencedIds.has(row.id));

  if (headRows.length > 1) {
    return {
      kind: 'ambiguous',
      code: 'FACTS_HEAD_AMBIGUOUS',
      headIds: headRows.map((row) => row.id),
    };
  }

  return walkLineage(headRows[0] ?? rows[0]!, byId);
}
