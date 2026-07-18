/**
 * Read service for the constrained-reserve substrate shadow reconciliation
 * ledger (Tranche 10, ADR-051).
 *
 * The FIRST reader of `substrate_shadow_reconciliations` (Tranche 9, ADR-050):
 * it answers "has fund N's constrained-reserve substrate ever diverged, and
 * when?" by returning the most recent reconciliation observations for one
 * fund, newest first (served by the `(fund_id, observed_at DESC)` index), each
 * projected to a stable read DTO with `observed_at` as an ISO-8601 string.
 *
 * Invariants (technical, enforced here and in tests, not by governance):
 * - READ-ONLY: one SELECT; this module never inserts, updates, or deletes.
 * - PROD-SAFE ON TABLE ABSENCE: migration `0035` exists locally but is NOT
 *   provisioned to prod, so the DEFAULT reader treats PostgreSQL `42P01`
 *   (undefined_table) - including when wrapped in a driver/ORM error `cause`
 *   chain - as "no observations recorded" and returns `[]`. A prod read must
 *   be a 200 with an empty list, never a 500. Any other error propagates.
 * - Injectable reader seam (mirroring the Tranche 6 `resolveMode` and
 *   Tranche 9 `persist` philosophy): tests drive row and failure cases with
 *   no live DB; prod uses the real Drizzle query.
 * - Key-scoped: rows are filtered to the constrained-reserve calculation key,
 *   so a response envelope that labels these observations
 *   `reserve-constrained` can never mislabel rows written by a future second
 *   substrate consumer under another key.
 */

import { and, desc, eq } from 'drizzle-orm';
import { CONSTRAINED_RESERVE_CALCULATION_KEY } from '@shared/core/reserves/constrained-reserve-substrate-adapter';
import { substrateShadowReconciliations, type SubstrateShadowReconciliation } from '@shared/schema';
import { db } from '../db';

/** Default page size when the caller does not specify a limit. */
export const DEFAULT_SHADOW_RECONCILIATION_READ_LIMIT = 50;

/** Hard ceiling on rows per read, regardless of the caller-supplied limit. */
export const MAX_SHADOW_RECONCILIATION_READ_LIMIT = 200;

/** Stable read DTO for one persisted reconciliation observation. */
export interface ConstrainedReserveShadowReconciliationObservation {
  id: number;
  fundId: number;
  calculationKey: string;
  configuredMode: string;
  effectiveMode: string;
  killSwitchActive: boolean;
  substrateState: string;
  reconciliationStatus: string;
  inputHash: string;
  resultHash: string;
  assumptionsHash: string;
  mismatches: string[];
  /** ISO-8601 timestamp of the observation (`observed_at`). */
  observedAt: string;
}

/**
 * Injectable reader seam. The default queries the real ledger through Drizzle
 * (and owns the `42P01` graceful-absence behavior); tests inject a fake to
 * stay DB-free.
 */
export type ReadShadowReconciliationRowsFn = (args: {
  fundId: number;
  limit: number;
}) => Promise<SubstrateShadowReconciliation[]>;

/**
 * PostgreSQL `undefined_table`, matched through the error `cause` chain
 * because drivers and Drizzle wrap the raw PG error at varying depths.
 */
function isUndefinedTableError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    if ((current as { code?: unknown }).code === '42P01') {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Default reader: newest-first, fund- and key-scoped SELECT against the
 * append-only ledger. Table absence (`42P01`) resolves to `[]` because the
 * ledger is not yet provisioned to prod; every other failure propagates to
 * the caller's standard error handling.
 */
async function queryShadowReconciliationRows(args: {
  fundId: number;
  limit: number;
}): Promise<SubstrateShadowReconciliation[]> {
  try {
    return await db
      .select()
      .from(substrateShadowReconciliations)
      .where(
        and(
          eq(substrateShadowReconciliations.fundId, args.fundId),
          eq(substrateShadowReconciliations.calculationKey, CONSTRAINED_RESERVE_CALCULATION_KEY)
        )
      )
      .orderBy(desc(substrateShadowReconciliations.observedAt))
      .limit(args.limit);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return [];
    }
    throw error;
  }
}

function toObservation(
  row: SubstrateShadowReconciliation
): ConstrainedReserveShadowReconciliationObservation {
  return {
    id: row.id,
    fundId: row.fundId,
    calculationKey: row.calculationKey,
    configuredMode: row.configuredMode,
    effectiveMode: row.effectiveMode,
    killSwitchActive: row.killSwitchActive,
    substrateState: row.substrateState,
    reconciliationStatus: row.reconciliationStatus,
    inputHash: row.inputHash,
    resultHash: row.resultHash,
    assumptionsHash: row.assumptionsHash,
    mismatches: [...row.mismatches],
    observedAt: row.observedAt.toISOString(),
  };
}

export interface ReadConstrainedReserveShadowReconciliationsParams {
  fundId: number;
  /**
   * Requested maximum rows. Defaults to
   * `DEFAULT_SHADOW_RECONCILIATION_READ_LIMIT` and is clamped to
   * `[1, MAX_SHADOW_RECONCILIATION_READ_LIMIT]`.
   */
  limit?: number;
  /** Injectable reader seam; defaults to the real Drizzle query. */
  reader?: ReadShadowReconciliationRowsFn;
}

/**
 * Read the most recent constrained-reserve shadow reconciliation observations
 * for one fund, newest first.
 */
export async function readConstrainedReserveShadowReconciliations({
  fundId,
  limit = DEFAULT_SHADOW_RECONCILIATION_READ_LIMIT,
  reader = queryShadowReconciliationRows,
}: ReadConstrainedReserveShadowReconciliationsParams): Promise<
  ConstrainedReserveShadowReconciliationObservation[]
> {
  const boundedLimit = Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_SHADOW_RECONCILIATION_READ_LIMIT
  );
  const rows = await reader({ fundId, limit: boundedLimit });
  return rows.map(toObservation);
}
