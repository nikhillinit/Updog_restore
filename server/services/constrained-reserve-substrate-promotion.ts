/**
 * Constrained-reserve substrate promotion (Tranche 11, ADR-052).
 *
 * The arc's FIRST serving-path change, delivered dormant: for an opted-in
 * request whose fund resolves `configuredMode === 'on'` with the kill switch
 * inactive, the substrate result becomes the served source - but ONLY when it
 * VERIFIES against the legacy engine output for that same request (state
 * `available` AND reconciliation `match` AND `conservationOk`). Every other
 * outcome fail-safes to the legacy response with a warn-level demotion
 * disclosure, and non-`on` modes DELEGATE to the Tranche 7-10 shadow helper so
 * their logging/reconciliation/persistence behavior is preserved byte-for-byte.
 *
 * Invariants (technical, enforced here and in tests, not by governance):
 * - Verified-parity seatbelt: the substrate is served only on a same-request
 *   cents-exact match against the legacy engine, so a served substrate response
 *   can differ from legacy at most in float-noise representation (e.g.
 *   599999.9999999999 -> 600000), never in cents.
 * - Fail-safe to legacy: `response` is ALWAYS present and defaults to the
 *   passed legacy result; any throw anywhere (resolver, adapter, reconcile,
 *   projection) is logged at warn and demoted. Promotion can never 500 the
 *   route.
 * - Delegation: `configuredMode !== 'on' || killSwitchActive` routes through
 *   `observeConstrainedReserveSubstrateShadow` with the ALREADY-resolved mode
 *   injected through its `resolveMode` seam - zero extra registry query, and
 *   the T7-T10 shadow/reconcile/persist path stays the single source of that
 *   behavior.
 * - Persistence continuity: the `on` path persists its value-producing
 *   reconciliation through the SAME Tranche 9 writer seam with the same
 *   best-effort own-try/catch swallow, so the append-only ledger keeps
 *   accumulating under promotion exactly as it does under shadow.
 * - Dormancy: with no `mode` registry row anywhere (prod has none and this
 *   tranche seeds none), every request resolves `off` and this service is
 *   behaviorally identical to the pre-T11 route.
 */

import { createCalculationContext } from '@shared/core/calc-substrate';
import {
  CONSTRAINED_RESERVE_CALCULATION_KEY,
  runConstrainedReserveWithSubstrate,
} from '@shared/core/reserves/constrained-reserve-substrate-adapter';
import { logger } from '../lib/logger';
import {
  observeConstrainedReserveSubstrateShadow,
  reconcileConstrainedReserveShadow,
  type PersistSubstrateShadowReconciliationFn,
  type ResolveSubstrateCalcModeFn,
  type ShadowLogger,
  type SubstrateShadowReconciliationRecord,
} from './constrained-reserve-substrate-shadow';
import { resolveSubstrateCalcMode } from './substrate-calc-mode-resolver';
import { persistSubstrateShadowReconciliation } from './substrate-shadow-reconciliation-writer';

/**
 * Minimal structural view of one legacy allocation. The generic parameter
 * preserves the route's richer allocation shape (`name`/`stage`/...) through
 * the projection: served allocations are the LEGACY objects spread with only
 * `allocated` replaced, so the key set and key order are exactly the legacy
 * engine's.
 */
export interface ServeConstrainedReserveCalculationParams<
  A extends { id: string; allocated: number },
> {
  fundId: number;
  input: unknown;
  /** The legacy engine output the route computed and will serve on demotion. */
  legacyResult: {
    allocations: ReadonlyArray<A>;
    totalAllocated: number;
    remaining: number;
    conservationOk: boolean;
  };
  resolveMode?: ResolveSubstrateCalcModeFn;
  persist?: PersistSubstrateShadowReconciliationFn;
  log?: ShadowLogger;
  asOf?: string;
}

export interface ServeConstrainedReserveCalculationOutcome<A> {
  served: 'substrate' | 'legacy';
  reasonCodes: string[];
  /** Always present; the route serves this verbatim (plus `rid`). */
  response: {
    allocations: ReadonlyArray<A>;
    totalAllocated: number;
    remaining: number;
  };
}

/**
 * Serve one opted-in constrained-reserve calculation: substrate when `on`,
 * verified, and conservation-clean; the passed legacy result otherwise.
 */
export async function serveConstrainedReserveCalculation<
  A extends { id: string; allocated: number },
>({
  fundId,
  input,
  legacyResult,
  resolveMode = resolveSubstrateCalcMode,
  persist = persistSubstrateShadowReconciliation,
  log = logger,
  asOf,
}: ServeConstrainedReserveCalculationParams<A>): Promise<
  ServeConstrainedReserveCalculationOutcome<A>
> {
  // Built from the passed legacy fields so demoted responses stay
  // byte-identical to what the route served before this tranche.
  const legacyResponse = {
    allocations: legacyResult.allocations,
    totalAllocated: legacyResult.totalAllocated,
    remaining: legacyResult.remaining,
  };

  try {
    const resolution = await resolveMode({
      fundId,
      calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
    });

    if (resolution.configuredMode !== 'on' || resolution.killSwitchActive) {
      // Non-`on` (or kill-switched): EXACTLY the Tranche 7-10 shadow behavior,
      // reached through the existing helper with the already-resolved mode.
      await observeConstrainedReserveSubstrateShadow({
        fundId,
        input,
        legacyResult,
        resolveMode: async () => resolution,
        persist,
        log,
        ...(asOf !== undefined && { asOf }),
      });

      // Mirror the adapter's reason-code semantics for the disclosure:
      // KILL_SWITCH_ACTIVE and/or MODE_OFF when effectively off, SHADOW_ONLY
      // when effectively shadow.
      const reasonCodes: string[] = [];
      if (resolution.killSwitchActive) reasonCodes.push('KILL_SWITCH_ACTIVE');
      if (resolution.configuredMode === 'off') reasonCodes.push('MODE_OFF');
      if (!resolution.killSwitchActive && resolution.configuredMode === 'shadow') {
        reasonCodes.push('SHADOW_ONLY');
      }
      return { served: 'legacy', reasonCodes, response: legacyResponse };
    }

    const ctx = createCalculationContext({
      calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
      // The constrained engine draws no randomness; cosmetic constant seed.
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
      'constrained reserve substrate promotion'
    );

    if (result.state !== 'available') {
      // `on` but no servable value (INPUT_INVALID / ENGINE_ERROR / ...):
      // demote with the adapter's own reason codes. No value -> nothing to
      // reconcile or persist, matching the T7-T10 value-producing-only gate.
      log.warn(
        {
          fundId,
          calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
          served: 'legacy',
          state: result.state,
          reasonCodes: result.reasonCodes,
        },
        'constrained reserve substrate promotion demoted to legacy'
      );
      return { served: 'legacy', reasonCodes: [...result.reasonCodes], response: legacyResponse };
    }

    const reconciliation = reconcileConstrainedReserveShadow(result.value, legacyResult);

    // Persistence (ADR-050 seam, unchanged): durably record THIS
    // reconciliation observation regardless of the serving decision, in its
    // own try/catch so a persist failure warns once and never affects serving.
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

    if (reconciliation.status !== 'match') {
      log.warn(
        {
          fundId,
          calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
          served: 'legacy',
          reconciliation: reconciliation.status,
          mismatches: reconciliation.mismatches,
          resultHash: result.resultHash,
        },
        'constrained reserve substrate promotion demoted to legacy'
      );
      return {
        served: 'legacy',
        reasonCodes: ['RECONCILIATION_MISMATCH'],
        response: legacyResponse,
      };
    }

    if (!result.value.conservationOk) {
      // Unreachable through the route (a conservation failure 500s before this
      // service is called, and a substrate/legacy conservation disagreement is
      // a mismatch above), but the seatbelt is enforced independently.
      log.warn(
        {
          fundId,
          calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
          served: 'legacy',
          resultHash: result.resultHash,
        },
        'constrained reserve substrate promotion demoted to legacy'
      );
      return { served: 'legacy', reasonCodes: ['CONSERVATION_FAILED'], response: legacyResponse };
    }

    // Projection (serving parse, pinned by ADR-052): LEGACY allocations in
    // LEGACY order, spread-preserved key set/order, with only `allocated`
    // replaced by `Number(...)` of the adapter's exact-2dp string - the
    // canonical deterministic closest-double serving parse. The match gate
    // guarantees id-set equality and cents equality, so any byte difference vs
    // legacy is float-noise cleanup of the representation, never the cents.
    const substrateById = new Map(
      result.value.allocations.map((allocation) => [allocation.id, allocation] as const)
    );
    const allocations = legacyResult.allocations.map((legacyAllocation) => {
      const substrateAllocation = substrateById.get(legacyAllocation.id);
      if (!substrateAllocation) {
        throw new Error(
          `substrate allocation missing for id ${legacyAllocation.id} despite reconciliation match`
        );
      }
      return { ...legacyAllocation, allocated: Number(substrateAllocation.allocated) };
    });

    log.info(
      {
        fundId,
        calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
        served: 'substrate',
        resultHash: result.resultHash,
        inputHash: result.basis.inputHash,
      },
      'constrained reserve substrate promotion served'
    );

    return {
      served: 'substrate',
      reasonCodes: [],
      response: {
        allocations,
        totalAllocated: Number(result.value.totalAllocated),
        remaining: Number(result.value.remaining),
      },
    };
  } catch (error) {
    log.warn(
      {
        fundId,
        calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
        error: error instanceof Error ? error.message : String(error),
      },
      'constrained reserve substrate promotion failed'
    );
    return { served: 'legacy', reasonCodes: ['PROMOTION_ERROR'], response: legacyResponse };
  }
}
