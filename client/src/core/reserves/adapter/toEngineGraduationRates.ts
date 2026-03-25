import { clampPct, clampInt } from '@/lib/coerce';

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

type PayloadBasics = {
  name: string;
  size: number;
  modelVersion: 'reserves-ev1';
} | Record<string, unknown>;

type FundCreationPayload = {
  basics: PayloadBasics;
  strategy: {
    stages: Stage[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStagesSource(input: Record<string, unknown>): unknown[] {
  if (Array.isArray(input.stages)) {
    return input.stages;
  }

  const strategy = input.strategy;
  if (isRecord(strategy) && Array.isArray(strategy.stages)) {
    return strategy.stages;
  }

  return [];
}

function normalizeStage(stage: unknown, index: number): Stage {
  if (!isRecord(stage)) {
    return {
      id: `stage-${index + 1}`,
      name: `Stage ${index + 1}`,
      graduate: 0,
      exit: 0,
      months: 1,
    };
  }

  const rawId = stage.id;
  const rawName = stage.name;

  return {
    id: typeof rawId === 'string' && rawId.trim() !== '' ? rawId : `stage-${index + 1}`,
    name:
      typeof rawName === 'string' && rawName.trim() !== ''
        ? rawName.trim()
        : `Stage ${index + 1}`,
    graduate: clampPct(stage.graduate),
    exit: clampPct(stage.exit),
    months: clampInt(stage.months, 1, 120),
  };
}

function getBasics(input: Record<string, unknown>): PayloadBasics | undefined {
  return isRecord(input.basics) ? input.basics : undefined;
}

/**
 * Creates a fund creation payload from the store state or test input
 * NOTE: We already clamp in the store for UX. We keep this adapter clamp as a final
 * belt-and-suspenders safety net before hitting the API. Do not remove without
 * replacing with server-side validation.
 */
export function toFundCreationPayload(input: unknown): FundCreationPayload {
  const normalizedInput = isRecord(input) ? input : {};
  const stages = getStagesSource(normalizedInput).map(normalizeStage);
  const basics = getBasics(normalizedInput) ?? {
    name: `Fund from Store ${new Date().toISOString()}`,
    size: 50000000,
    modelVersion: 'reserves-ev1' as const,
  };

  return {
    basics,
    strategy: {
      stages,
    },
  };
}

// Legacy compatibility
export const toEngineGraduationRates = toFundCreationPayload;
