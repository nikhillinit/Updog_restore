/**
 * SensitivityRunService
 *
 * DB-backed lifecycle service for sensitivity analysis runs (one-way, two-way,
 * and stress). Handles state transitions (pending -> running -> completed
 * | failed) with explicit validation, fund-scoped reads, and keyset-paginated
 * history queries.
 *
 * Mirrors the Zod contract at shared/contracts/sensitivity-run-v1.contract.ts
 * and the SQL CHECK constraints in
 * migrations/0011_scenario_share_sensitivity_drift.sql. All three must move
 * together.
 *
 * Test seam: production paths build Drizzle eq()/and()/desc() expressions via
 * the private `helpers` module-level binding. Tests may swap that binding
 * through __setQueryHelpers to substitute plain JS predicates for the mock db.
 *
 * @module server/services/sensitivity-run-service
 */

import { db } from '../db';
import { sensitivityRuns, type SensitivityRun } from '@shared/schema';
import { eq, and, desc, lt, or, sql, type SQL } from 'drizzle-orm';
import type { SensitivityRunKind } from '@shared/contracts/sensitivity-run-v1.contract';

const TERMINAL_STATUSES = new Set(['completed', 'failed']);
const TRANSITIONABLE_STATUSES = new Set(['pending', 'running']);

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 100;

/**
 * Test seam: query-fragment factories. Production uses Drizzle SQL fragments;
 * unit tests substitute plain JS predicate functions matching the mock db.
 */
export interface SensitivityQueryHelpers {
  eqFundAndId: (fundId: number, id: number) => unknown;
  eqId: (id: number) => unknown;
  eqFund: (fundId: number, kind?: string) => unknown;
  orderByCreatedDescIdDesc: unknown;
}

const productionHelpers: SensitivityQueryHelpers = {
  eqFundAndId: (fundId: number, id: number) =>
    and(eq(sensitivityRuns.fundId, fundId), eq(sensitivityRuns.id, id)),
  eqId: (id: number) => eq(sensitivityRuns.id, id),
  eqFund: (fundId: number, kind?: string) => {
    if (kind) {
      return and(eq(sensitivityRuns.fundId, fundId), eq(sensitivityRuns.kind, kind));
    }
    return eq(sensitivityRuns.fundId, fundId);
  },
  orderByCreatedDescIdDesc: [desc(sensitivityRuns.createdAt), desc(sensitivityRuns.id)],
};

let helpers: SensitivityQueryHelpers = productionHelpers;

/** Test-only: replace the query helper bindings used by the service. */
export function __setQueryHelpers(next: SensitivityQueryHelpers): void {
  helpers = next;
}

/** Test-only: restore production helper bindings. */
export function __resetQueryHelpers(): void {
  helpers = productionHelpers;
}

export interface HistoryCursor {
  createdAt: string | Date;
  id: number;
}

export interface GetHistoryOptions {
  kind?: SensitivityRunKind;
  limit?: number;
  cursor?: HistoryCursor;
}

export class SensitivityRunService {
  /**
   * Insert a new sensitivity run in 'pending' state. Returns the inserted row
   * (including the DB-assigned id and createdAt timestamp).
   */
  async createPending(
    fundId: number,
    kind: SensitivityRunKind,
    params: unknown,
    createdBy: number
  ): Promise<SensitivityRun> {
    const [row] = await db
      .insert(sensitivityRuns)
      .values({
        fundId,
        kind,
        status: 'pending',
        params: params as SensitivityRun['params'],
        createdBy,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create sensitivity run: insert returned no rows');
    }
    return row;
  }

  /**
   * Transition a run from pending|running -> completed, attaching results and
   * the measured durationMs. Wrapped in a transaction so the existence and
   * status guards are atomic with the update.
   */
  async markCompleted(
    runId: number,
    results: unknown,
    durationMs: number
  ): Promise<SensitivityRun> {
    return db.transaction(async (tx) => {
      const existing = await this.findByIdInTx(tx, runId);
      this.assertCanTransition(existing, runId);

      const [updated] = await tx
        .update(sensitivityRuns)
        .set({
          status: 'completed',
          results: results as SensitivityRun['results'],
          completedAt: new Date(),
          durationMs,
        })
        .where(helpers['eqId'](runId) as SQL<unknown>)
        .returning();

      if (!updated) {
        throw new Error(`Sensitivity run ${runId} disappeared during update`);
      }
      return updated;
    });
  }

  /**
   * Transition a run from pending|running -> failed, recording an errorCode,
   * a human-readable errorMessage, and the elapsed durationMs.
   */
  async markFailed(
    runId: number,
    errorCode: string,
    errorMessage: string,
    durationMs: number
  ): Promise<SensitivityRun> {
    return db.transaction(async (tx) => {
      const existing = await this.findByIdInTx(tx, runId);
      this.assertCanTransition(existing, runId);

      const [updated] = await tx
        .update(sensitivityRuns)
        .set({
          status: 'failed',
          errorCode,
          errorMessage,
          completedAt: new Date(),
          durationMs,
        })
        .where(helpers['eqId'](runId) as SQL<unknown>)
        .returning();

      if (!updated) {
        throw new Error(`Sensitivity run ${runId} disappeared during update`);
      }
      return updated;
    });
  }

  /**
   * Fund-scoped fetch by id. Returns null if no row matches the (fundId, id)
   * pair -- this is the ownership boundary; callers must NOT bypass it.
   */
  async getById(fundId: number, runId: number): Promise<SensitivityRun | null> {
    const rows = await db
      .select()
      .from(sensitivityRuns)
      .where(helpers['eqFundAndId'](fundId, runId) as SQL<unknown>)
      .limit(1);

    return (rows[0] as SensitivityRun | undefined) ?? null;
  }

  /**
   * Paginated history for a fund, ordered by createdAt DESC, id DESC. Supports
   * optional kind filtering and a keyset cursor of {createdAt, id}.
   */
  async getHistoryByFund(fundId: number, opts: GetHistoryOptions = {}): Promise<SensitivityRun[]> {
    const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_HISTORY_LIMIT), MAX_HISTORY_LIMIT);

    const baseWhere = helpers['eqFund'](fundId, opts.kind) as SQL<unknown>;

    let whereClause: SQL<unknown> = baseWhere;
    if (opts.cursor) {
      const { createdAt, id } = opts.cursor;
      const cursorDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
      // (createdAt, id) < (cursor.createdAt, cursor.id) in DESC space.
      const cursorClause = or(
        lt(sensitivityRuns.createdAt, cursorDate),
        and(eq(sensitivityRuns.createdAt, cursorDate), lt(sensitivityRuns.id, id))
      ) as SQL<unknown>;
      whereClause = and(baseWhere, cursorClause) as SQL<unknown>;
    }

    const orderBy = helpers['orderByCreatedDescIdDesc'];
    const query = db
      .select()
      .from(sensitivityRuns)
      .where(whereClause)
      .orderBy(orderBy as SQL<unknown>)
      .limit(limit);

    const rows = await query;
    return rows as SensitivityRun[];
  }

  // ----- private helpers ----------------------------------------------------

  private async findByIdInTx(tx: typeof db, runId: number): Promise<SensitivityRun | null> {
    const rows = await tx
      .select()
      .from(sensitivityRuns)
      .where(helpers['eqId'](runId) as SQL<unknown>)
      .limit(1);
    return (rows[0] as SensitivityRun | undefined) ?? null;
  }

  private assertCanTransition(
    existing: SensitivityRun | null,
    runId: number
  ): asserts existing is SensitivityRun {
    if (!existing) {
      throw new Error(`Sensitivity run ${runId} not found`);
    }
    if (TERMINAL_STATUSES.has(existing.status)) {
      throw new Error(
        `Cannot transition sensitivity run ${runId}: already in terminal status "${existing.status}"`
      );
    }
    if (!TRANSITIONABLE_STATUSES.has(existing.status)) {
      throw new Error(
        `Cannot transition sensitivity run ${runId}: status "${existing.status}" is not transitionable`
      );
    }
  }
}

export const sensitivityRunService = new SensitivityRunService();

// Suppress unused-import noise from drizzle-orm helpers that may be elided by
// the auto-fix linter when the test seam swaps in plain predicates. They are
// genuinely used in productionHelpers; this no-op reference keeps tree-shaking
// honest.
void sql;
