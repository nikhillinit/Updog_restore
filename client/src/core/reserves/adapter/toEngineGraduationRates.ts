import { clampPct, clampInt } from '../../lib/coerce';
import type { useFundStore } from '../../stores/useFundStore';

export interface Stage {
  id: string;
  name: string;
  graduate: number; // %
  exit: number;     // %
  months: number;   // int >= 1
}

export interface EngineRates {
  [transitionId: string]: {
    graduate: number;
    fail: number;
    remain: number;
    months: number;
  };
}

/**
 * Converts user-defined stages into engine transitions.
 * Treats "exit" as non-follow-on bucket (like "fail") for reserves budgeting.
 * Transition key format: `${from.id}__to__${to.id}`
 */
export function toEngineGraduationRates(stages: Stage[]): EngineRates {
  const out: EngineRates = {};
  for (let i = 0; i < stages.length - 1; i++) {
    const from = stages[i];
    const to = stages[i + 1];

    const remain = Math.max(0, 100 - (from.graduate + from.exit));
    const key = `${from.id}__to__${to.id}`;

    out[key] = {
      graduate: from.graduate,
      fail: from.exit,
      remain,
      months: from.months,
    };
  }
  return out;
}

/**
 * Creates a fund creation payload from the store state
 * Belt-and-suspenders validation before API (store already clamps)
 */
export function toFundCreationPayload(state: ReturnType<typeof useFundStore.getState>) {
  // Belt-and-suspenders validation before API (store already clamps)
  const stages = state.stages.map((r) => ({
    name: r.name.trim(),
    graduate: clampPct(r.graduate),
    exit: clampPct(r.exit),
    months: clampInt(r.months, 1, 120),
  }));

  return {
    basics: {
      // Add any basic fund info here when available
      // For now, leaving empty or with defaults
    },
    stages,
    followOnChecks: state.followOnChecks,
    modelVersion: 'reserves-ev1',
  };
}
