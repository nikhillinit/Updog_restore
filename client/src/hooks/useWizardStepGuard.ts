/**
 * Wizard Step Guard Hook
 *
 * Prevents users from bypassing wizard steps via URL manipulation.
 * Tracks visited steps in sessionStorage and redirects if sequence is violated.
 *
 * @example
 * const { canAccessStep, markStepVisited, highestVisitedStep } = useWizardStepGuard();
 *
 * // Check if user can access current step
 * if (!canAccessStep(currentStep)) {
 *   navigate(`/fund-setup?step=${highestVisitedStep + 1}`);
 * }
 */

import { useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';

const STORAGE_KEY = 'wizard-visited-steps';
const MAX_STEP = 7;

/**
 * Get visited steps from sessionStorage
 */
function getVisitedSteps(): Set<number> {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return new Set([1]); // Step 1 is always accessible
    const parsed = JSON.parse(stored) as number[];
    return new Set([1, ...parsed]); // Always include step 1
  } catch {
    return new Set([1]);
  }
}

/**
 * Save visited steps to sessionStorage
 */
function saveVisitedSteps(steps: Set<number>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...steps]));
  } catch {
    // Silently fail if sessionStorage is unavailable
  }
}

/**
 * Reset wizard progress (call when starting fresh)
 */
export function resetWizardProgress(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently fail
  }
}

export interface WizardStepGuardResult {
  /** Check if user can access a specific step */
  canAccessStep: (stepNumber: number) => boolean;
  /** Mark a step as visited (called when legitimately reaching a step) */
  markStepVisited: (stepNumber: number) => void;
  /** The highest step number the user has legitimately visited */
  highestVisitedStep: number;
  /** Get the appropriate redirect URL if current step is invalid */
  getRedirectUrl: (requestedStep: number) => string | null;
  /** All visited steps */
  visitedSteps: Set<number>;
  /** Reset progress to step 1 */
  resetProgress: () => void;
}

/**
 * Hook to enforce wizard step sequence
 *
 * Rules:
 * - Step 1 is always accessible
 * - User can access any previously visited step (going back is allowed)
 * - User can access the next step after their highest visited step
 * - User cannot skip ahead more than one step
 */
export function useWizardStepGuard(): WizardStepGuardResult {
  const [, setLocation] = useLocation();

  // Get current visited steps
  const visitedSteps = useMemo(() => getVisitedSteps(), []);

  // Calculate highest visited step
  const highestVisitedStep = useMemo(() => {
    return Math.max(...visitedSteps);
  }, [visitedSteps]);

  /**
   * Check if a step can be accessed
   * - Previously visited steps: YES (allow going back)
   * - Next sequential step: YES (allow progression)
   * - Skip ahead: NO
   */
  const canAccessStep = useCallback(
    (stepNumber: number): boolean => {
      // Invalid step numbers
      if (stepNumber < 1 || stepNumber > MAX_STEP) return false;

      // Step 1 is always accessible
      if (stepNumber === 1) return true;

      // Previously visited steps are accessible (going back is ok)
      if (visitedSteps.has(stepNumber)) return true;

      // Can access the next sequential step
      if (stepNumber === highestVisitedStep + 1) return true;

      // Cannot skip ahead
      return false;
    },
    [visitedSteps, highestVisitedStep]
  );

  /**
   * Mark a step as visited
   * Only marks if the step is legitimately accessible
   */
  const markStepVisited = useCallback(
    (stepNumber: number): void => {
      if (stepNumber < 1 || stepNumber > MAX_STEP) return;

      // Only mark if step is actually accessible (prevents marking skipped steps)
      if (!canAccessStep(stepNumber)) return;

      const updated = new Set(visitedSteps);
      updated.add(stepNumber);
      saveVisitedSteps(updated);
    },
    [visitedSteps, canAccessStep]
  );

  /**
   * Get redirect URL if step is invalid
   * Returns null if step is valid
   */
  const getRedirectUrl = useCallback(
    (requestedStep: number): string | null => {
      if (canAccessStep(requestedStep)) return null;

      // Redirect to the highest accessible step (next after highest visited)
      const redirectStep = Math.min(highestVisitedStep + 1, MAX_STEP);
      return `/fund-setup?step=${redirectStep}`;
    },
    [canAccessStep, highestVisitedStep]
  );

  /**
   * Reset wizard progress
   */
  const resetProgress = useCallback((): void => {
    resetWizardProgress();
    setLocation('/fund-setup?step=1');
  }, [setLocation]);

  return {
    canAccessStep,
    markStepVisited,
    highestVisitedStep,
    getRedirectUrl,
    visitedSteps,
    resetProgress,
  };
}
