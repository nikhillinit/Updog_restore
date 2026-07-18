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

import { createCalculationContext } from '@shared/core/calc-substrate';
import {
  CONSTRAINED_RESERVE_CALCULATION_KEY,
  runConstrainedReserveWithSubstrate,
} from '@shared/core/reserves/constrained-reserve-substrate-adapter';
import { logger } from '../lib/logger';
import {
  resolveSubstrateCalcMode,
  type SubstrateCalcModeResolution,
} from './substrate-calc-mode-resolver';

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

export interface ObserveConstrainedReserveSubstrateShadowParams {
  fundId: number;
  input: unknown;
  resolveMode?: ResolveSubstrateCalcModeFn;
  asOf?: string;
  log?: ShadowLogger;
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
