/**
 * Pure utility functions for fund-setup wizard
 * Extracted for easier unit testing without DOM dependencies
 *
 * NOTE: Step 4 shows pre-recycling allocations for validation
 * Step 5 (distributions/recycling) parameters are set after user validates base allocations
 */

export type StepKey = 'fund-basics' | 'investment-rounds' | 'capital-structure' | 'investment-strategy' | 'distributions' | 'cashflow-management' | 'review' | 'not-found';

export const VALID_STEPS = ['1', '2', '3', '4', '5', '6', '7'] as const;
export type ValidStep = typeof VALID_STEPS[number];

export const NUM_TO_KEY = {
  '1': 'fund-basics',
  '2': 'investment-rounds',
  '3': 'capital-structure',
  '4': 'investment-strategy',
  '5': 'distributions',
  '6': 'cashflow-management',
  '7': 'review',
} as const satisfies Record<ValidStep, Exclude<StepKey, 'not-found'>>;

export function isValidStep(v: unknown): v is ValidStep {
  return typeof v === 'string' && (VALID_STEPS as readonly string[]).includes(v);
}

/** Missing param (null) -> default '1'. Empty string -> invalid. */
export function normalizeStepParam(value: string | null): ValidStep | null {
  if (value === null) return '1';                // no param -> default
  const v = value.trim();
  if (v === '') return null;                     // param present but empty -> invalid
  return isValidStep(v) ? (v as ValidStep) : null;
}

export function resolveStepKeyFromLocation(loc: string): StepKey {
  const qs = loc.includes('?') ? loc.slice(loc.indexOf('?')) : '';
  const raw = new URLSearchParams(qs)['get']('step');     // '' for '?step' / '?step='
  const norm = normalizeStepParam(raw);
  return norm ? NUM_TO_KEY[norm] : 'not-found';
}

export function getStepNumber(key: Exclude<StepKey, 'not-found'>): ValidStep {
  for (const [num, mapped] of Object.entries(NUM_TO_KEY) as [ValidStep, Exclude<StepKey,'not-found'>][]) {
    if (mapped === key) return num;
  }
  return '1';
}