/**
 * Wizard Type Definitions
 *
 * Centralized type exports for wizard components and validation.
 * Types are inferred from Zod schemas for type safety.
 */

import type { z } from 'zod';
import type {
  fundBasicsSchema,
  stageAllocationSchema,
  graduationRatesSchema,
  exitTimingSchema,
  exitValuesByStageSchema,
  stageExitValueSchema,
  opsPolicySchema,
} from './wizard-schemas';

/**
 * Stage Types
 */
export type Stage = 'preSeed' | 'seed' | 'seriesA' | 'seriesB' | 'seriesC' | 'seriesD';

export const STAGES: Stage[] = ['preSeed', 'seed', 'seriesA', 'seriesB', 'seriesC', 'seriesD'];

export const STAGE_LABEL: Record<Stage, string> = {
  preSeed: 'Pre-Seed',
  seed: 'Seed',
  seriesA: 'Series A',
  seriesB: 'Series B',
  seriesC: 'Series C',
  seriesD: 'Series D+',
};

/**
 * Inferred Types from Zod Schemas
 */
export type FundBasics = z.infer<typeof fundBasicsSchema>;
export type StageAllocation = z.infer<typeof stageAllocationSchema>;
export type GraduationRates = z.infer<typeof graduationRatesSchema>;
export type ExitTiming = z.infer<typeof exitTimingSchema>;
export type StageExitValue = z.infer<typeof stageExitValueSchema>;
export type ExitValuesByStage = z.infer<typeof exitValuesByStageSchema>;
export type OpsPolicy = z.infer<typeof opsPolicySchema>;

/**
 * Reserve Strategy Types (inferred from schema for consistency)
 */
import type { reserveSettingsSchema } from './wizard-schemas';
export type ReserveSettings = z.infer<typeof reserveSettingsSchema>;

/**
 * Complete Wizard State
 *
 * Combines all wizard sections into a single state object.
 */
export interface WizardState {
  fundBasics: FundBasics;
  stageAllocation: StageAllocation;
  reserveSettings: ReserveSettings;
  graduationRates: GraduationRates;
  exitTiming: ExitTiming;
  exitValues: ExitValuesByStage;
  opsPolicy: OpsPolicy;
}

/**
 * Wizard Validation State
 */
export interface WizardValidationState {
  /** Field errors from Zod validation */
  errors: Record<string, string[]>;

  /** Whether current step is valid */
  isValid: boolean;

  /** First error (for "fix this" UX) */
  firstError?: {
    field: string;
    message: string;
  };
}

/**
 * Default Values for Wizard
 */
export const DEFAULT_FUND_BASICS: FundBasics = {
  fundName: '',
  establishmentDate: new Date().toISOString().split('T')[0] ?? '', // Today's date
  committedCapitalUSD: 0,
  gpCommitmentUSD: 0,
  managementFeeBasis: 'committed',
  mgmtFeeEarlyPct: 2.0,
  mgmtFeeLatePct: 1.5,
  feeCutoverYear: 6,
  carriedInterestPct: 20,
  fundLifeYears: 10,
  isEvergreen: false,
};

export const DEFAULT_STAGE_ALLOCATION: StageAllocation = {
  preSeed: 0,
  seed: 30,
  seriesA: 40,
  seriesB: 0,
  seriesC: 0,
  seriesD: 0,
  reserves: 30,
};

export const DEFAULT_RESERVE_SETTINGS: ReserveSettings = {
  strategy: 'proRata',
  reserveRatioPct: 30,
  proRataParticipationRatePct: 80,
  followOnMultiple: 1.5,
  targetReserveRatio: 1.0,
  maxFollowOnRounds: 3,
};

export const DEFAULT_GRADUATION_RATES: GraduationRates = {
  preSeedToSeed: 50,
  seedToA: 40,
  aToB: 50,
  bToC: 60,
  cToD: 70,
};

export const DEFAULT_EXIT_TIMING: ExitTiming = {
  preSeed: 5,
  seed: 6,
  seriesA: 7,
  seriesB: 8,
  seriesC: 9,
  seriesD: 10,
};

export const DEFAULT_EXIT_VALUES: ExitValuesByStage = {
  preSeed: { median: 10_000_000 },
  seed: { median: 20_000_000 },
  seriesA: { median: 50_000_000 },
  seriesB: { median: 100_000_000 },
  seriesC: { median: 200_000_000 },
  seriesD: { median: 500_000_000 },
};

export const DEFAULT_OPS_POLICY: OpsPolicy = {
  distributionTiming: 'quarterly',
  distributionMinimumUSD: 10_000,
  distributionPreference: 'cash',
  navValuationMethod: 'lastRound',
  extensions: {
    numberOfExtensions: 2,
    extensionLengthYears: 1,
    feeDuringExtensionPct: 1.5,
  },
};
