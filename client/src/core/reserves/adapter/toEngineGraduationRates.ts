<<<<<<< HEAD
import { clampPct, clampInt } from '../../lib/coerce';
import type { useFundStore } from '../../stores/useFundStore';

interface Stage {
  id: string;
  name: string;
  graduate: number;
  exit: number;
  months: number;
}

interface EngineRates {
  [key: string]: {
=======
export interface Stage {
  id: string;
  name: string;
  graduate: number; // %
  exit: number;     // %
  months: number;   // int >= 1
}

export interface EngineRates {
  [transitionId: string]: {
>>>>>>> origin/main
    graduate: number;
    fail: number;
    remain: number;
    months: number;
  };
}

/**
<<<<<<< HEAD
 * Creates a fund creation payload from the store state
 * NOTE: We already clamp in the store for UX. We keep this adapter clamp as a final
 * belt-and-suspenders safety net before hitting the API. Do not add further coercion elsewhere.
 */
export function toFundCreationPayload(state: ReturnType<typeof useFundStore.getState>) {
  const stages = state.stages.map((r) => ({
    name: r.name.trim(),
    graduate: clampPct(r.graduate),
    exit: clampPct(r.exit),
    months: clampInt(r.months, 1, 120),
  }));

  return {
    basics: state.basics || {},
    stages,
    followOnChecks: state.followOnChecks,
    modelVersion: 'reserves-ev1',
  };
}

/**
=======
>>>>>>> origin/main
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
