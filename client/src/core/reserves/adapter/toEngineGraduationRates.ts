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
