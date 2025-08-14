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
 * Creates a fund creation payload from the store state
 * NOTE: We already clamp in the store for UX. We keep this adapter clamp as a final
 * belt-and-suspenders safety net before hitting the API. Do not remove without
 * replacing with server-side validation.
 */
export function toFundCreationPayload(storeState: ReturnType<typeof useFundStore.getState>) {
  const stages = storeState.stages.map(stage => ({
    id: stage.id,
    name: stage.name.trim() || `Stage ${stage.id}`,
    graduate: clampPct(stage.graduate),
    exit: clampPct(stage.exit), 
    months: clampInt(stage.months, 1, 120)
  }));

  return {
    basics: {
      name: `Fund from Store ${new Date().toISOString()}`,
      size: 50000000,
      modelVersion: 'reserves-ev1' as const
    },
    strategy: {
      stages
    }
  };
}

// Legacy compatibility
export const toEngineGraduationRates = toFundCreationPayload;