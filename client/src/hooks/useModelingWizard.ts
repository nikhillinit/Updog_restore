/**
 * useModelingWizard Hook
 *
 * React hook that integrates the XState modeling wizard machine with React components.
 * Provides a clean API for:
 * - State management
 * - Navigation
 * - Validation
 * - Persistence
 * - Submission
 */

import { useMachine } from '@xstate/react';
import { useCallback, useEffect, useMemo } from 'react';
import {
  modelingWizardMachine,
  type WizardStep,
  type ModelingWizardContext,
  STEP_ORDER,
  getNextStep,
  getPreviousStep
} from '@/machines/modeling-wizard.machine';

// ============================================================================
// TYPES
// ============================================================================

export interface UseModelingWizardOptions {
  /**
   * Skip optional steps (e.g., Exit Recycling)
   */
  skipOptionalSteps?: boolean;

  /**
   * Auto-save interval in milliseconds
   * Default: 30000 (30 seconds)
   */
  autoSaveInterval?: number;

  /**
   * Load saved progress on mount
   * Default: true
   */
  loadSavedProgress?: boolean;

  /**
   * Callback when wizard is completed
   */
  onComplete?: (data: ModelingWizardContext) => void;

  /**
   * Callback when submission fails
   */
  onError?: (error: Error) => void;
}

export interface UseModelingWizardReturn {
  // State
  state: any;
  context: ModelingWizardContext;
  currentStep: WizardStep;
  currentStepIndex: number;
  isSubmitting: boolean;
  isDirty: boolean;

  // Navigation
  canGoNext: boolean;
  canGoBack: boolean;
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: WizardStep) => void;

  // Data management
  saveStep: (step: WizardStep, data: any) => void;
  getStepData: <T = any>(step: WizardStep) => T | undefined;

  // Validation
  isStepValid: (step: WizardStep) => boolean;
  getStepErrors: (step: WizardStep) => string[];

  // Submission
  submit: () => void;
  retrySubmit: () => void;
  cancelSubmission: () => void;

  // Progress
  completedSteps: Set<WizardStep>;
  visitedSteps: Set<WizardStep>;
  progressPercentage: number;

  // Configuration
  toggleSkipOptional: (skip: boolean) => void;

  // Reset
  reset: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useModelingWizard(options: UseModelingWizardOptions = {}): UseModelingWizardReturn {
  const {
    skipOptionalSteps = false,
    autoSaveInterval = 30000,
    loadSavedProgress = true,
    onComplete,
    onError
  } = options;

  // Initialize XState machine
  const [state, send] = useMachine(modelingWizardMachine, {
    input: {
      skipOptionalSteps,
      autoSaveInterval
    }
  });

  const context = state.context;

  // Load saved progress on mount
  useEffect(() => {
    if (loadSavedProgress) {
      send({ type: 'LOAD_FROM_STORAGE' });
    }
  }, [loadSavedProgress, send]);

  // Handle completion
  useEffect(() => {
    if (state.matches('completed')) {
      onComplete?.(context);
    }
  }, [state, context, onComplete]);

  // Handle errors
  useEffect(() => {
    if (context.submissionError && onError) {
      onError(new Error(context.submissionError));
    }
  }, [context.submissionError, onError]);

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  const currentStep = context.currentStep;
  const currentStepIndex = context.currentStepIndex;

  const canGoNext = useMemo(() => {
    // Check if current step is valid
    const isValid = context.isStepValid[currentStep] ?? false;

    // Check if there is a next step
    const hasNext = getNextStep(currentStep, context.skipOptionalSteps) !== null;

    return isValid && hasNext;
  }, [currentStep, context.isStepValid, context.skipOptionalSteps]);

  const canGoBack = useMemo(() => {
    return getPreviousStep(currentStep, context.skipOptionalSteps) !== null;
  }, [currentStep, context.skipOptionalSteps]);

  const goNext = useCallback(() => {
    if (canGoNext) {
      send({ type: 'NEXT' });
    }
  }, [canGoNext, send]);

  const goBack = useCallback(() => {
    if (canGoBack) {
      send({ type: 'BACK' });
    }
  }, [canGoBack, send]);

  const goToStep = useCallback((step: WizardStep) => {
    send({ type: 'GOTO', step });
  }, [send]);

  // ============================================================================
  // DATA MANAGEMENT
  // ============================================================================

  const saveStep = useCallback((step: WizardStep, data: any) => {
    send({ type: 'SAVE_STEP', step, data });
  }, [send]);

  const getStepData = useCallback(<T = any>(step: WizardStep): T | undefined => {
    return context.steps[step] as T | undefined;
  }, [context.steps]);

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const isStepValid = useCallback((step: WizardStep): boolean => {
    return context.isStepValid[step] ?? false;
  }, [context.isStepValid]);

  const getStepErrors = useCallback((step: WizardStep): string[] => {
    return context.validationErrors[step] || [];
  }, [context.validationErrors]);

  // ============================================================================
  // SUBMISSION
  // ============================================================================

  const submit = useCallback(() => {
    send({ type: 'SUBMIT' });
  }, [send]);

  const retrySubmit = useCallback(() => {
    send({ type: 'RETRY_SUBMIT' });
  }, [send]);

  const cancelSubmission = useCallback(() => {
    send({ type: 'CANCEL_SUBMISSION' });
  }, [send]);

  // ============================================================================
  // PROGRESS
  // ============================================================================

  const progressPercentage = useMemo(() => {
    return ((currentStepIndex + 1) / context.totalSteps) * 100;
  }, [currentStepIndex, context.totalSteps]);

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const toggleSkipOptional = useCallback((skip: boolean) => {
    send({ type: 'TOGGLE_SKIP_OPTIONAL', skip });
  }, [send]);

  // ============================================================================
  // RESET
  // ============================================================================

  const reset = useCallback(() => {
    send({ type: 'RESET' });
  }, [send]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    state,
    context,
    currentStep,
    currentStepIndex,
    isSubmitting: state.matches({ active: 'submitting' }),
    isDirty: context.isDirty,

    // Navigation
    canGoNext,
    canGoBack,
    goNext,
    goBack,
    goToStep,

    // Data management
    saveStep,
    getStepData,

    // Validation
    isStepValid,
    getStepErrors,

    // Submission
    submit,
    retrySubmit,
    cancelSubmission,

    // Progress
    completedSteps: context.completedSteps,
    visitedSteps: context.visitedSteps,
    progressPercentage,

    // Configuration
    toggleSkipOptional,

    // Reset
    reset
  };
}

// ============================================================================
// EXAMPLE USAGE COMPONENT
// ============================================================================

/**
 * Example usage of the useModelingWizard hook
 *
 * @example
 * ```tsx
 * function ModelingWizardExample() {
 *   const wizard = useModelingWizard({
 *     skipOptionalSteps: false,
 *     autoSaveInterval: 30000,
 *     onComplete: (data) => {
 *       console.log('Wizard completed!', data);
 *     },
 *     onError: (error) => {
 *       console.error('Wizard error:', error);
 *     }
 *   });
 *
 *   return (
 *     <div>
 *       <h1>Modeling Wizard</h1>
 *       <p>Current Step: {wizard.currentStep}</p>
 *       <p>Progress: {wizard.progressPercentage.toFixed(0)}%</p>
 *       <p>Is Dirty: {wizard.isDirty ? 'Yes' : 'No'}</p>
 *
 *       <div>
 *         <button onClick={wizard.goBack} disabled={!wizard.canGoBack}>
 *           Back
 *         </button>
 *         <button onClick={wizard.goNext} disabled={!wizard.canGoNext}>
 *           Next
 *         </button>
 *       </div>
 *
 *       {wizard.isSubmitting && <p>Submitting...</p>}
 *
 *       {wizard.currentStep === 'generalInfo' && (
 *         <div>
 *           <h2>General Info Step</h2>
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Hook to get the current step component based on wizard state
 */
export function useCurrentStepComponent(wizard: UseModelingWizardReturn) {
  return useMemo(() => {
    const stepComponents = {
      generalInfo: 'GeneralInfoStep',
      sectorProfiles: 'SectorProfilesStep',
      capitalAllocation: 'CapitalAllocationStep',
      feesExpenses: 'FeesExpensesStep',
      exitRecycling: 'ExitRecyclingStep',
      waterfall: 'WaterfallStep',
      scenarios: 'ScenariosStep'
    };

    return stepComponents[wizard.currentStep];
  }, [wizard.currentStep]);
}

/**
 * Hook to check if wizard is ready to submit
 */
export function useIsWizardComplete(wizard: UseModelingWizardReturn): boolean {
  return useMemo(() => {
    // Check if all required steps are completed
    const requiredSteps = STEP_ORDER.filter(
      step => !wizard.context.skipOptionalSteps || step !== 'exitRecycling'
    );

    return requiredSteps.every(step => wizard.isStepValid(step));
  }, [wizard]);
}

/**
 * Hook to format wizard data for API submission
 */
export function useFormattedWizardData(wizard: UseModelingWizardReturn) {
  return useMemo(() => {
    return {
      generalInfo: wizard.getStepData('generalInfo'),
      sectorProfiles: wizard.getStepData('sectorProfiles'),
      capitalAllocation: wizard.getStepData('capitalAllocation'),
      feesExpenses: wizard.getStepData('feesExpenses'),
      exitRecycling: wizard.getStepData('exitRecycling'),
      waterfall: wizard.getStepData('waterfall'),
      scenarios: wizard.getStepData('scenarios')
    };
  }, [wizard]);
}
