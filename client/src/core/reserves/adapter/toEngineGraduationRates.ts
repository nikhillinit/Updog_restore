import { clampPct, clampInt } from '@/lib/coerce';
import type { useFundStore } from '@/stores/useFundStore';

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
 * Creates a fund creation payload from the store state or test input
 * NOTE: We already clamp in the store for UX. We keep this adapter clamp as a final
 * belt-and-suspenders safety net before hitting the API. Do not remove without
 * replacing with server-side validation.
 */
export function toFundCreationPayload(input: any) {
  // Handle both store state format and test input format
  const stagesList = input.stages || input.strategy?.stages || [];
  const stages = stagesList.map((stage: any) => ({
    id: stage.id || `stage-${Math.random().toString(36).substr(2, 9)}`,
    name: (stage.name || '').toString().trim() || `Stage ${stage.id || 'Unknown'}`,
    graduate: clampPct(stage.graduate),
    exit: clampPct(stage.exit), 
    months: clampInt(stage.months, 1, 120)
  }));

  // If input has basics, use them, otherwise generate defaults
  const basics = input.basics || {
    name: `Fund from Store ${new Date().toISOString()}`,
    size: 50000000,
    modelVersion: 'reserves-ev1' as const
  };

  return {
    basics,
    strategy: {
      stages
    }
  };
}

// Legacy compatibility
export const toEngineGraduationRates = toFundCreationPayload;