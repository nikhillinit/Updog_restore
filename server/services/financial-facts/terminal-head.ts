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

function validateLineages(
  rows: readonly FinancialFactsSnapshot[],
  byId: ReadonlyMap<number, FinancialFactsSnapshot>
): TerminalFactsHeadResult | null {
  const validatedIds = new Set<number>();

  for (const start of rows) {
    if (validatedIds.has(start.id)) continue;

    const path: FinancialFactsSnapshot[] = [];
    const pathIds = new Set<number>();
    let current: FinancialFactsSnapshot | undefined = start;

    while (current !== undefined && !validatedIds.has(current.id)) {
      if (pathIds.has(current.id)) return invalid('cycle');
      path.push(current);
      pathIds.add(current.id);

      if (current.supersedesSnapshotId === null) break;
      current = byId.get(current.supersedesSnapshotId);
      if (current === undefined) return invalid('detached');
    }

    for (const row of path) validatedIds.add(row.id);
  }

  return null;
}

function compareHeadRows(left: FinancialFactsSnapshot, right: FinancialFactsSnapshot): number {
  const cutoffDifference = left.knowledgeCutoff.getTime() - right.knowledgeCutoff.getTime();
  return cutoffDifference !== 0 ? cutoffDifference : left.id - right.id;
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
  const validation = validateLineages(rows, byId);
  if (validation) return validation;

  const referencedIds = new Set(
    rows
      .map((row) => row.supersedesSnapshotId)
      .filter((id): id is number => id !== null)
  );
  const headRows = rows.filter((row) => !referencedIds.has(row.id));

  const terminalRowsByAsOfDate = new Map<string, FinancialFactsSnapshot[]>();
  for (const row of headRows) {
    const terminalRows = terminalRowsByAsOfDate.get(row.asOfDate) ?? [];
    terminalRows.push(row);
    terminalRowsByAsOfDate.set(row.asOfDate, terminalRows);
  }

  const ambiguousHeadIds = [...terminalRowsByAsOfDate.values()]
    .filter((terminalRows) => terminalRows.length > 1)
    .flatMap((terminalRows) => terminalRows.map((row) => row.id))
    .sort((left, right) => left - right);
  if (ambiguousHeadIds.length > 0) {
    return {
      kind: 'ambiguous',
      code: 'FACTS_HEAD_AMBIGUOUS',
      headIds: ambiguousHeadIds,
    };
  }

  const terminalRows = [...terminalRowsByAsOfDate.values()].map((rows) => rows[0]!);
  const head = terminalRows.reduce((latest, row) =>
    compareHeadRows(latest, row) >= 0 ? latest : row
  );
  return { kind: 'head', row: head };
}
