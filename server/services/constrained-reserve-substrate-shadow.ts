/**
 * Constrained-reserve substrate shadow observer (Tranche 7, ADR-048).
 *
 * The FIRST live consumer of the ADR-042 calculation substrate. It routes the
 * prod-live `POST /api/v1/reserves/calculate` request through the Tranche 6 read
 * seam (`resolveSubstrateCalcMode`, ADR-047) into the Tranche 5 constrained
 * reserve adapter (`runConstrainedReserveWithSubstrate`, ADR-046) as a
 * MODE-GATED, BEST-EFFORT SHADOW: the substrate result is computed and logged
 * server-side only and NEVER enters the HTTP response.
 *
 * Invariants (technical, enforced here and in tests, not by governance):
 * - Zero response change: this helper returns only `{ ran: boolean }` reporting
 *   whether the shadow executed; it never returns a value the route could serve.
 * - Mode gate: the universal safe default (no per-fund registry row -> off) is
 *   short-circuited BEFORE any context build or adapter run, so a fund that has
 *   not opted in via the registry costs exactly one `findFirst` and nothing more.
 * - Best-effort: the whole body is wrapped in try/catch; any error (resolver
 *   rejection, adapter throw, ...) is logged at warn and swallowed to
 *   `{ ran: false }`. A shadow failure can never surface to the caller.
 * - Non-collapse disclosure: the resolver returns the uncollapsed
 *   `{ configuredMode, killSwitchActive }` and the adapter derives `effectiveMode`
 *   and reason codes itself, so a kill-switched `on` fund logs `unavailable` +
 *   `KILL_SWITCH_ACTIVE` (not `MODE_OFF`) - carried end to end.
 */

import { createCalculationContext, type CalcMode } from '@shared/core/calc-substrate';
import {
  CONSTRAINED_RESERVE_CALCULATION_KEY,
  runConstrainedReserveWithSubstrate,
  type ConstrainedReserveCalcValue,
} from '@shared/core/reserves/constrained-reserve-substrate-adapter';
import { logger } from '../lib/logger';
import {
  resolveSubstrateCalcMode,
  type SubstrateCalcModeResolution,
} from './substrate-calc-mode-resolver';
import { persistSubstrateShadowReconciliation } from './substrate-shadow-reconciliation-writer';

/** Minimal structural logger this helper needs; the pino app logger satisfies it. */
export interface ShadowLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

/**
 * Injectable resolver seam, mirroring Tranche 6's injectable-reader philosophy
 * one level up: tests drive every mode / kill-switch case with no live DB.
 */
export type ResolveSubstrateCalcModeFn = (args: {
  fundId: number;
  calculationKey: string;
}) => Promise<SubstrateCalcModeResolution>;

/**
 * Structural view of the legacy `ConstrainedReserveEngine` output the prod-live
 * route already computed and served for the same request. Only the fields the
 * reconciliation compares are named; the route's richer `out` (whose allocations
 * also carry `name`/`stage`) satisfies this shape structurally.
 */
export interface LegacyConstrainedReserveResult {
  allocations: ReadonlyArray<{ id: string; allocated: number }>;
  totalAllocated: number;
  remaining: number;
  conservationOk: boolean;
}

/** Outcome of comparing the substrate value against the legacy result. */
export interface ConstrainedReserveShadowReconciliation {
  status: 'match' | 'mismatch';
  mismatches: string[];
}

/**
 * Convert a fixed 2-decimal money string (`/^(0|[1-9]\d*)\.\d{2}$/`, as produced
 * by the constrained-reserve adapter) into exact integer cents by splitting on
 * the decimal point. This is lossless; `parseFloat`/`Number` on the whole string
 * would reintroduce the binary-float artifacts the adapter deliberately avoids.
 */
function moneyStringToCents(value: string): number {
  const [whole, frac] = value.split('.');
  return Number(whole) * 100 + Number(frac);
}

/** Convert a legacy engine money number (exact 2dp cents) into integer cents. */
function moneyNumberToCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Reconcile the substrate constrained-reserve value against the legacy engine
 * result for the SAME request. Pure (no I/O, no ambient reads). All money is
 * normalized to exact integer cents before comparison and allocations are keyed
 * by `id`, so the comparison is order- and float-artifact-independent. An empty
 * `mismatches` list means the substrate path reproduced the legacy path exactly.
 */
export function reconcileConstrainedReserveShadow(
  substrateValue: ConstrainedReserveCalcValue,
  legacy: LegacyConstrainedReserveResult
): ConstrainedReserveShadowReconciliation {
  const mismatches: string[] = [];

  const substrateById = new Map(
    substrateValue.allocations.map((allocation) => [allocation.id, allocation] as const)
  );
  const legacyById = new Map(
    legacy.allocations.map((allocation) => [allocation.id, allocation] as const)
  );

  // Allocation id SET (order-independent): report ids present on one side only.
  for (const id of substrateById.keys()) {
    if (!legacyById.has(id)) {
      mismatches.push(`allocation ${id} present in substrate but absent from legacy`);
    }
  }
  for (const id of legacyById.keys()) {
    if (!substrateById.has(id)) {
      mismatches.push(`allocation ${id} present in legacy but absent from substrate`);
    }
  }

  // Per shared id: `allocated` compared in exact cents.
  for (const [id, substrateAllocation] of substrateById) {
    const legacyAllocation = legacyById.get(id);
    if (!legacyAllocation) {
      continue;
    }
    const substrateCents = moneyStringToCents(substrateAllocation.allocated);
    const legacyCents = moneyNumberToCents(legacyAllocation.allocated);
    if (substrateCents !== legacyCents) {
      mismatches.push(
        `allocation ${id} allocated cents differ: substrate ${substrateCents} vs legacy ${legacyCents}`
      );
    }
  }

  const substrateTotal = moneyStringToCents(substrateValue.totalAllocated);
  const legacyTotal = moneyNumberToCents(legacy.totalAllocated);
  if (substrateTotal !== legacyTotal) {
    mismatches.push(
      `totalAllocated cents differ: substrate ${substrateTotal} vs legacy ${legacyTotal}`
    );
  }

  const substrateRemaining = moneyStringToCents(substrateValue.remaining);
  const legacyRemaining = moneyNumberToCents(legacy.remaining);
  if (substrateRemaining !== legacyRemaining) {
    mismatches.push(
      `remaining cents differ: substrate ${substrateRemaining} vs legacy ${legacyRemaining}`
    );
  }

  if (substrateValue.conservationOk !== legacy.conservationOk) {
    mismatches.push(
      `conservationOk differs: substrate ${substrateValue.conservationOk} vs legacy ${legacy.conservationOk}`
    );
  }

  return {
    status: mismatches.length === 0 ? 'match' : 'mismatch',
    mismatches,
  };
}

/**
 * The durable audit-ledger record persisted for one value-producing shadow
 * reconciliation (Tranche 9, ADR-050). Built ONLY on the same gate as the
 * reconciliation log (a substrate value exists AND the route supplied
 * `legacyResult`), so `substrateState` is always `available` or `indicative`.
 * Fed straight into the fund-scoped, append-only
 * `substrate_shadow_reconciliations` table.
 */
export interface SubstrateShadowReconciliationRecord {
  fundId: number;
  calculationKey: string;
  configuredMode: CalcMode;
  effectiveMode: CalcMode;
  killSwitchActive: boolean;
  substrateState: 'available' | 'indicative';
  reconciliationStatus: 'match' | 'mismatch';
  inputHash: string;
  resultHash: string;
  assumptionsHash: string;
  mismatches: string[];
}

/**
 * Injectable writer seam, mirroring the `resolveMode` philosophy one level up:
 * prod uses the real append-only DB writer; tests pass a fake so the
 * persistence assertions stay DB-free.
 */
export type PersistSubstrateShadowReconciliationFn = (
  record: SubstrateShadowReconciliationRecord
) => Promise<void>;

export interface ObserveConstrainedReserveSubstrateShadowParams {
  fundId: number;
  input: unknown;
  resolveMode?: ResolveSubstrateCalcModeFn;
  asOf?: string;
  log?: ShadowLogger;
  /**
   * The legacy engine output the route just computed and will serve. When
   * present AND the substrate produced a value, the helper reconciles the two
   * and logs a parity/divergence disclosure. Absent -> exactly the Tranche 7
   * behavior (shadow disclosure only).
   */
  legacyResult?: LegacyConstrainedReserveResult;
  /**
   * Injectable persistence seam (Tranche 9, ADR-050). Defaults to the real
   * append-only DB writer. A best-effort insert runs ONLY when the
   * reconciliation itself runs (a substrate value exists AND `legacyResult` is
   * supplied); a throwing writer is swallowed - persistence is off the response
   * path and can never surface to the caller.
   */
  persist?: PersistSubstrateShadowReconciliationFn;
}

/**
 * Observe (compute + log, never serve) the constrained-reserve substrate shadow
 * for one prod-live reserve calculation. Returns whether the shadow executed.
 */
export async function observeConstrainedReserveSubstrateShadow({
  fundId,
  input,
  resolveMode = resolveSubstrateCalcMode,
  asOf,
  log = logger,
  legacyResult,
  persist = persistSubstrateShadowReconciliation,
}: ObserveConstrainedReserveSubstrateShadowParams): Promise<{ ran: boolean }> {
  try {
    const resolution = await resolveMode({
      fundId,
      calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
    });

    // Mode gate: `off` and not kill-switched is the universal default until a
    // fund opts in via the registry. Skip the context build and adapter run.
    if (resolution.configuredMode === 'off' && !resolution.killSwitchActive) {
      return { ran: false };
    }

    const ctx = createCalculationContext({
      calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
      // The constrained engine draws no randomness, so this seed is a valid,
      // cosmetic constant.
      seed: 1,
      asOf: asOf ?? new Date().toISOString(),
    });

    const result = runConstrainedReserveWithSubstrate(ctx, input, { ...resolution });

    log.info(
      {
        fundId,
        calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
        state: result.state,
        reasonCodes: result.reasonCodes,
        resultHash: 'resultHash' in result ? result.resultHash : null,
        inputHash: result.basis.inputHash,
        configuredMode: resolution.configuredMode,
        killSwitchActive: resolution.killSwitchActive,
      },
      'constrained reserve substrate shadow'
    );

    // Reconciliation (ADR-049): when the route supplied the legacy engine output
    // it will serve AND the substrate produced a value (available/indicative),
    // compare the two in exact cents and log a parity/divergence disclosure.
    // Server-side only; never touches the response. Inside the same try/catch so
    // a reconcile defect can never surface to the caller.
    if (legacyResult && (result.state === 'available' || result.state === 'indicative')) {
      const reconciliation = reconcileConstrainedReserveShadow(result.value, legacyResult);
      if (reconciliation.status === 'match') {
        log.info(
          {
            fundId,
            calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
            reconciliation: reconciliation.status,
            substrateState: result.state,
            resultHash: result.resultHash,
          },
          'constrained reserve substrate reconciliation'
        );
      } else {
        log.warn(
          {
            fundId,
            calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
            reconciliation: reconciliation.status,
            substrateState: result.state,
            resultHash: result.resultHash,
            mismatches: reconciliation.mismatches,
          },
          'constrained reserve substrate reconciliation MISMATCH'
        );
      }

      // Persistence (ADR-050): durably record THIS reconciliation observation in
      // the append-only, fund-scoped audit ledger. Best-effort and idempotent -
      // ordered AFTER the reconciliation log, wrapped in its OWN try/catch so a
      // persist failure logs one warn and is swallowed: it never surfaces to the
      // caller, never throws, never alters the response, and never prevents the
      // reconciliation log above.
      const record: SubstrateShadowReconciliationRecord = {
        fundId,
        calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
        configuredMode: resolution.configuredMode,
        effectiveMode: result.basis.effectiveMode,
        killSwitchActive: resolution.killSwitchActive,
        substrateState: result.state,
        reconciliationStatus: reconciliation.status,
        inputHash: result.basis.inputHash,
        resultHash: result.resultHash,
        assumptionsHash: result.basis.assumptionsHash,
        mismatches: reconciliation.mismatches,
      };
      try {
        await persist(record);
      } catch (persistError) {
        log.warn(
          {
            fundId,
            calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
            error: persistError instanceof Error ? persistError.message : String(persistError),
          },
          'constrained reserve substrate reconciliation persist failed'
        );
      }
    }

    return { ran: true };
  } catch (error) {
    log.warn(
      {
        fundId,
        calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
        error: error instanceof Error ? error.message : String(error),
      },
      'constrained reserve substrate shadow failed'
    );
    return { ran: false };
  }
}
