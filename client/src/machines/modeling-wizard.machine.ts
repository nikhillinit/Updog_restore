/**
 * Modeling Wizard State Machine (XState v5)
 *
 * Manages the multi-step wizard flow for VC fund modeling with:
 * - 7 sequential steps with validation
 * - Forward/backward navigation
 * - Optional step skipping (Exit Recycling)
 * - Auto-save to localStorage every 30s
 * - Resume capability from any step
 * - API submission with retry logic
 * - Comprehensive error handling
 */

import { setup, assign, fromPromise } from 'xstate';
import {
  calculateReservesForWizard,
  validateWizardPortfolio,
  enrichWizardMetrics,
  type ReserveAllocation,
  type EnrichedReserveAllocation,
  type PortfolioValidationResult,
  type WizardPortfolioCompany
} from '@/lib/wizard-calculations';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type WizardStep =
  | 'generalInfo'
  | 'sectorProfiles'
  | 'capitalAllocation'
  | 'feesExpenses'
  | 'exitRecycling'
  | 'waterfall'
  | 'scenarios';

export interface GeneralInfoData {
  fundName: string;
  vintageYear: number;
  fundSize: number;
  currency: 'USD' | 'EUR' | 'GBP';
  establishmentDate: string;
  isEvergreen: boolean;
  fundLife?: number;
  investmentPeriod?: number;
}

export interface SectorProfilesData {
  sectorProfiles: Array<{
    id: string;
    name: string;
    allocation: number;
    description?: string;
  }>;
  stageAllocations: Array<{
    stage: string;
    allocation: number;
  }>;
}

export interface CapitalAllocationData {
  initialCheckSize: number;
  followOnStrategy: {
    reserveRatio: number;
    followOnChecks: {
      A: number;
      B: number;
      C: number;
    };
  };
  pacingModel: {
    investmentsPerYear: number;
    deploymentCurve: 'linear' | 'front-loaded' | 'back-loaded';
  };
  syntheticPortfolio?: WizardPortfolioCompany[];
}

export interface FeesExpensesData {
  managementFee: {
    rate: number;
    basis: 'committed' | 'called' | 'fmv';
    stepDown?: {
      enabled: boolean;
      afterYear?: number;
      newRate?: number;
    };
  };
  adminExpenses: {
    annualAmount: number;
    growthRate: number;
  };
}

export interface ExitRecyclingData {
  enabled: boolean;
  recyclingCap?: number;
  recyclingPeriod?: number;
  exitRecyclingRate?: number;
  mgmtFeeRecyclingRate?: number;
}

export interface WaterfallData {
  type: 'american' | 'european' | 'hybrid';
  preferredReturn: number;
  catchUp: number;
  carriedInterest: number;
  tiers?: Array<{
    id: string;
    name: string;
    threshold: number;
    gpSplit: number;
    lpSplit: number;
  }>;
}

export interface ScenariosData {
  scenarioType: 'construction' | 'current_state' | 'comparison';
  baseCase: {
    name: string;
    assumptions: Record<string, unknown>;
  };
  scenarios?: Array<{
    id: string;
    name: string;
    assumptions: Record<string, unknown>;
  }>;
}

export interface ModelingWizardContext {
  // Step data storage
  steps: {
    generalInfo?: GeneralInfoData;
    sectorProfiles?: SectorProfilesData;
    capitalAllocation?: CapitalAllocationData;
    feesExpenses?: FeesExpensesData;
    exitRecycling?: ExitRecyclingData;
    waterfall?: WaterfallData;
    scenarios?: ScenariosData;
  };

  // Navigation state
  currentStep: WizardStep;
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: Set<WizardStep>;
  visitedSteps: Set<WizardStep>;

  // Validation state
  validationErrors: Record<WizardStep, string[]>;
  isStepValid: Record<WizardStep, boolean>;

  // Reactive portfolio validation
  portfolioValidation?: PortfolioValidationResult | undefined;

  // Calculation results
  calculations?: {
    reserves?: ReserveAllocation | undefined;
    enrichedReserves?: EnrichedReserveAllocation | undefined;
  } | undefined;

  // Persistence state
  lastSaved: number | null;
  isDirty: boolean;

  /**
   * Error message from failed persistence attempt.
   * null when no error. Used to show error UI and block navigation.
   */
  persistenceError: string | null;

  /**
   * Number of retry attempts for exponential backoff.
   * Starts at 0, incremented on retry, reset on success.
   */
  retryCount: number;

  /**
   * Timestamp of last persistence attempt (for debugging).
   * null initially.
   */
  lastPersistAttempt: number | null;

  /**
   * Navigation intent for persistence operation.
   * Tracks which navigation action triggered persistence.
   * Used to execute navigation after successful persistence.
   */
  navigationIntent: 'next' | 'back' | 'goto' | 'auto-save' | null;

  /**
   * Target step for GOTO navigation intent.
   * null for 'next' and 'back' intents.
   */
  targetStep: WizardStep | null;

  // API state
  submissionError: string | null;
  submissionRetryCount: number;

  // Configuration
  skipOptionalSteps: boolean;
  autoSaveInterval: number; // milliseconds
}

export type ModelingWizardEvents =
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'GOTO'; step: WizardStep }
  | { type: 'SAVE_STEP'; step: WizardStep; data: unknown }
  | { type: 'VALIDATE_STEP'; step: WizardStep }
  | { type: 'TOGGLE_SKIP_OPTIONAL'; skip: boolean }
  | { type: 'AUTO_SAVE' }
  | { type: 'SUBMIT' }
  | { type: 'RETRY_SUBMIT' }
  | { type: 'CANCEL_SUBMISSION' }
  | { type: 'RESET' }
  | { type: 'LOAD_FROM_STORAGE' }
  | { type: 'PORTFOLIO_CHANGED' }
  | { type: 'CALCULATE_RESERVES' }
  | { type: 'RETRY_PERSIST' }
  | { type: 'DISMISS_PERSIST_ERROR' };

// ============================================================================
// STEP CONFIGURATION
// ============================================================================

const STEP_ORDER: WizardStep[] = [
  'generalInfo',
  'sectorProfiles',
  'capitalAllocation',
  'feesExpenses',
  'exitRecycling',
  'waterfall',
  'scenarios'
];

const OPTIONAL_STEPS: Set<WizardStep> = new Set(['exitRecycling']);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the index of a step in the wizard flow
 */
function getStepIndex(step: WizardStep): number {
  return STEP_ORDER.indexOf(step);
}

/**
 * Get the next step in the wizard flow
 */
function getNextStep(currentStep: WizardStep, skipOptional: boolean): WizardStep | null {
  const currentIndex = getStepIndex(currentStep);

  for (let i = currentIndex + 1; i < STEP_ORDER.length; i++) {
    const nextStep = STEP_ORDER[i];
    if (!nextStep) continue; // Handle undefined from index signature

    // Skip optional steps if configured
    if (skipOptional && OPTIONAL_STEPS.has(nextStep)) {
      continue;
    }

    return nextStep;
  }

  return null; // No more steps
}

/**
 * Get the previous step in the wizard flow
 */
function getPreviousStep(currentStep: WizardStep, skipOptional: boolean): WizardStep | null {
  const currentIndex = getStepIndex(currentStep);

  for (let i = currentIndex - 1; i >= 0; i--) {
    const prevStep = STEP_ORDER[i];
    if (!prevStep) continue; // Handle undefined from index signature

    // Skip optional steps if configured
    if (skipOptional && OPTIONAL_STEPS.has(prevStep)) {
      continue;
    }

    return prevStep;
  }

  return null; // No previous step
}

/**
 * Calculate total steps considering optional step configuration
 */
function getTotalSteps(skipOptional: boolean): number {
  if (skipOptional) {
    return STEP_ORDER.length - OPTIONAL_STEPS.size;
  }
  return STEP_ORDER.length;
}

/**
 * Persist wizard context to localStorage
 */
function persistToStorage(context: ModelingWizardContext): void {
  try {
    const storageData = {
      steps: context.steps,
      currentStep: context.currentStep,
      completedSteps: Array.from(context.completedSteps),
      visitedSteps: Array.from(context.visitedSteps),
      skipOptionalSteps: context.skipOptionalSteps,
      lastSaved: Date.now()
    };

    localStorage.setItem('modeling-wizard-progress', JSON.stringify(storageData));
    console.log('[ModelingWizard] Progress saved to localStorage', { timestamp: storageData.lastSaved });
  } catch (error) {
    console.error('[ModelingWizard] Failed to save to localStorage:', error);
  }
}

/**
 * Async persistence service for XState invoke pattern
 *
 * Wraps localStorage persistence in a Promise-based service for future migration
 * to async API calls. Handles localStorage-specific errors:
 * - QuotaExceededError: Storage limit exceeded
 * - SecurityError: Privacy mode blocks localStorage access
 *
 * @param input - Wizard context to persist
 * @returns Promise that resolves on successful save
 * @throws Error with specific message for each failure type
 */
export const persistDataService = fromPromise(async ({ input }: { input: ModelingWizardContext }) => {
  // Force async rejection semantics (prevents synchronous throws from escaping before promise chain)
  await Promise.resolve();

  try {
    const storageData = {
      steps: input.steps,
      currentStep: input.currentStep,
      completedSteps: Array.from(input.completedSteps),
      visitedSteps: Array.from(input.visitedSteps),
      skipOptionalSteps: input.skipOptionalSteps,
      lastSaved: Date.now()
    };

    localStorage.setItem('modeling-wizard-progress', JSON.stringify(storageData));
    console.log('[ModelingWizard] Progress saved to localStorage (async service)', { timestamp: storageData.lastSaved });

    return storageData;
  } catch (error) {
    // Handle specific localStorage errors for better UX
    if (error instanceof Error) {
      if (error.name === 'QuotaExceededError') {
        console.error('[ModelingWizard] Storage quota exceeded:', error);
        throw Object.assign(new Error('Storage limit exceeded'), { name: 'QuotaExceededError' });
      }

      if (error.name === 'SecurityError') {
        console.error('[ModelingWizard] Storage access blocked (privacy mode):', error);
        throw Object.assign(new Error('Storage unavailable (privacy mode)'), { name: 'SecurityError' });
      }
    }

    // Generic error fallback
    console.error('[ModelingWizard] Failed to save to localStorage:', error);
    const genericError = error instanceof Error ? error : new Error('Could not save data');
    throw Object.assign(new Error(genericError.message), {
      name: genericError.name || 'PersistenceError'
    });
  }
});

/**
 * Load wizard context from localStorage
 */
function loadFromStorage(): Partial<ModelingWizardContext> | null {
  try {
    const stored = localStorage.getItem('modeling-wizard-progress');

    if (!stored) {
      return null;
    }

    const data = JSON.parse(stored);

    return {
      steps: data.steps || {},
      currentStep: data.currentStep || 'generalInfo',
      completedSteps: new Set(data.completedSteps || []),
      visitedSteps: new Set(data.visitedSteps || []),
      skipOptionalSteps: data.skipOptionalSteps ?? false,
      lastSaved: data.lastSaved || null
    };
  } catch (error) {
    console.error('[ModelingWizard] Failed to load from localStorage:', error);
    return null;
  }
}

/**
 * Clear wizard progress from localStorage
 */
function clearStorage(): void {
  try {
    localStorage.removeItem('modeling-wizard-progress');
    console.log('[ModelingWizard] Progress cleared from localStorage');
  } catch (error) {
    console.error('[ModelingWizard] Failed to clear localStorage:', error);
  }
}

/**
 * Validate step data based on step-specific rules
 */
function validateStepData(step: WizardStep, data: unknown): string[] {
  const errors: string[] = [];

  // Type guard to check if data is a record
  const isRecord = (val: unknown): val is Record<string, unknown> => {
    return typeof val === 'object' && val !== null;
  };

  // Import validation schemas dynamically to avoid circular dependencies
  // In production, these would call the Zod schemas from modeling-wizard.schemas.ts

  if (!isRecord(data)) {
    errors.push('Invalid data format');
    return errors;
  }

  switch (step) {
    case 'generalInfo': {
      const fundName = data['fundName'];
      const vintageYear = data['vintageYear'];
      const fundSize = data['fundSize'];

      if (!fundName || (typeof fundName === 'string' && fundName.trim().length === 0)) {
        errors.push('Fund name is required');
      }
      if (!vintageYear || (typeof vintageYear === 'number' && (vintageYear < 2000 || vintageYear > 2030))) {
        errors.push('Vintage year must be between 2000 and 2030');
      }
      if (!fundSize || (typeof fundSize === 'number' && fundSize <= 0)) {
        errors.push('Fund size must be positive');
      }
      break;
    }

    case 'sectorProfiles': {
      const sectorProfiles = data['sectorProfiles'];

      if (!sectorProfiles || !Array.isArray(sectorProfiles) || sectorProfiles.length === 0) {
        errors.push('At least one sector profile is required');
      }
      // Check allocations sum to 100%
      if (Array.isArray(sectorProfiles)) {
        const totalAllocation = sectorProfiles.reduce((sum, sp) => {
          return sum + (isRecord(sp) && typeof sp['allocation'] === 'number' ? sp['allocation'] : 0);
        }, 0);
        if (Math.abs(totalAllocation - 100) > 0.01) {
          errors.push('Sector allocations must sum to 100%');
        }
      }
      break;
    }

    case 'capitalAllocation': {
      const initialCheckSize = data['initialCheckSize'];
      const followOnStrategy = data['followOnStrategy'];

      if (!initialCheckSize || (typeof initialCheckSize === 'number' && initialCheckSize <= 0)) {
        errors.push('Initial check size must be positive');
      }
      if (isRecord(followOnStrategy)) {
        const reserveRatio = followOnStrategy['reserveRatio'];
        if (!reserveRatio || (typeof reserveRatio === 'number' && (reserveRatio < 0 || reserveRatio > 1))) {
          errors.push('Reserve ratio must be between 0 and 1');
        }
      }
      break;
    }

    case 'feesExpenses': {
      const managementFee = data['managementFee'];

      if (isRecord(managementFee)) {
        const rate = managementFee['rate'];
        if (!rate || (typeof rate === 'number' && (rate < 0 || rate > 5))) {
          errors.push('Management fee rate must be between 0% and 5%');
        }
      }
      break;
    }

    case 'exitRecycling': {
      // Optional step - only validate if enabled
      const enabled = data['enabled'];
      const recyclingCap = data['recyclingCap'];

      if (enabled) {
        if (recyclingCap && typeof recyclingCap === 'number' && (recyclingCap < 0 || recyclingCap > 100)) {
          errors.push('Recycling cap must be between 0% and 100%');
        }
      }
      break;
    }

    case 'waterfall': {
      const type = data['type'];
      const preferredReturn = data['preferredReturn'];

      if (!type || (typeof type === 'string' && !['american', 'european', 'hybrid'].includes(type))) {
        errors.push('Waterfall type must be specified');
      }
      if (preferredReturn && typeof preferredReturn === 'number' && (preferredReturn < 0 || preferredReturn > 20)) {
        errors.push('Preferred return must be between 0% and 20%');
      }
      break;
    }

    case 'scenarios': {
      if (!data['scenarioType']) {
        errors.push('Scenario type is required');
      }
      break;
    }
  }

  return errors;
}

/**
 * Submit fund model to API
 */
const submitFundModel = fromPromise(async ({ input }: { input: ModelingWizardContext }) => {
  console.log('[ModelingWizard] Submitting fund model to API', { steps: Object.keys(input.steps) });

  // Construct fund model from wizard steps
  const fundModel = {
    ...input.steps.generalInfo,
    sectorProfiles: input.steps.sectorProfiles,
    capitalAllocation: input.steps.capitalAllocation,
    fees: input.steps.feesExpenses,
    exitRecycling: input.steps.exitRecycling,
    waterfall: input.steps.waterfall,
    scenarios: input.steps.scenarios
  };

  try {
    const response = await fetch('/api/funds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fundModel)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to submit fund model');
    }

    const result = await response.json();
    console.log('[ModelingWizard] Fund model submitted successfully', { fundId: result.id });

    return result;
  } catch (error) {
    console.error('[ModelingWizard] API submission failed:', error);
    throw error;
  }
});

// ============================================================================
// STATE MACHINE DEFINITION
// ============================================================================

export const modelingWizardMachine = setup({
  types: {
    context: {} as ModelingWizardContext,
    events: {} as ModelingWizardEvents,
    input: {} as {
      skipOptionalSteps?: boolean;
      autoSaveInterval?: number;
    }
  },

  actors: {
    submitFundModel,

    /**
     * Calculate reserves for wizard portfolio
     * Assumes portfolio has already been validated (reactive validation)
     */
    calculateReserves: fromPromise(async ({ input }: { input: ModelingWizardContext }) => {
      const capitalAllocation = input.steps.capitalAllocation;
      if (!capitalAllocation?.syntheticPortfolio) {
        throw new Error('No portfolio data available');
      }

      // Validation should already been done (reactive)
      if (!input.portfolioValidation?.valid) {
        throw new Error('Portfolio validation must pass before calculation');
      }

      // Calculate reserves
      const allocation = await calculateReservesForWizard(
        input,
        capitalAllocation.syntheticPortfolio
      );

      // Enrich with insights
      const enriched = enrichWizardMetrics(allocation, input);

      return { allocation, enriched };
    }),

    /**
     * Persist wizard context to localStorage (ADR-016)
     * Handles QuotaExceededError and SecurityError
     */
    persistDataService
  },

  actions: {
    /**
     * Save step data and mark step as visited
     */
    saveStep: assign(({ context, event }) => {
      if (event.type !== 'SAVE_STEP') return context;

      const { step, data } = event;

      // Validate step data
      const errors = validateStepData(step, data);

      return {
        ...context,
        steps: {
          ...context.steps,
          [step]: data
        },
        visitedSteps: new Set([...context.visitedSteps, step]),
        validationErrors: {
          ...context.validationErrors,
          [step]: errors
        },
        isStepValid: {
          ...context.isStepValid,
          [step]: errors.length === 0
        },
        isDirty: true
      };
    }),

    /**
     * Validate portfolio reactively (called on portfolio changes)
     * This allows UI to show errors before user clicks "calculate"
     */
    validatePortfolio: assign(({ context }) => {
      const portfolio = context.steps.capitalAllocation?.syntheticPortfolio;

      if (!portfolio || portfolio.length === 0) {
        // Omit portfolioValidation instead of setting to undefined (exactOptionalPropertyTypes)
        const { portfolioValidation, ...rest } = context;
        return rest;
      }

      const validation = validateWizardPortfolio(portfolio);

      return {
        ...context,
        portfolioValidation: validation
      };
    }),

    /**
     * Save reserve calculation results
     */
    saveReserveCalculation: assign(({ context, event }) => {
      // XState v5 invoke done events pass output directly
      const output = (event as unknown as { output: { allocation: ReserveAllocation; enriched: EnrichedReserveAllocation } }).output;

      return {
        ...context,
        calculations: {
          ...context.calculations,
          reserves: output.allocation,
          enrichedReserves: output.enriched
        }
      };
    }),

    /**
     * Clear reserve calculation (on error or reset)
     */
    clearReserveCalculation: assign(({ context }) => {
      // Omit calculations entirely instead of setting nested fields to undefined (exactOptionalPropertyTypes)
      const { calculations, ...rest } = context;
      return rest;
    }),

    /**
     * Navigate to next step
     */
    goToNextStep: assign(({ context }) => {
      const nextStep = getNextStep(context.currentStep, context.skipOptionalSteps);

      if (!nextStep) {
        console.warn('[ModelingWizard] No next step available');
        return context;
      }

      // Mark current step as completed
      const newCompletedSteps = new Set(context.completedSteps);
      newCompletedSteps.add(context.currentStep);

      return {
        ...context,
        currentStep: nextStep,
        currentStepIndex: getStepIndex(nextStep),
        completedSteps: newCompletedSteps,
        visitedSteps: new Set([...context.visitedSteps, nextStep])
      };
    }),

    /**
     * Clear persistence error after successful persistence
     */
    clearPersistenceError: assign({ persistenceError: null }),

    /**
     * Set persistence error when persistence fails
     */

    setPersistenceError: assign({
      persistenceError: ({ event }) => ((event as { error?: Error }).error as Error).message
    }),

    /**
     * Navigate to previous step
     */
    goToPreviousStep: assign(({ context }) => {
      const prevStep = getPreviousStep(context.currentStep, context.skipOptionalSteps);

      if (!prevStep) {
        console.warn('[ModelingWizard] No previous step available');
        return context;
      }

      return {
        ...context,
        currentStep: prevStep,
        currentStepIndex: getStepIndex(prevStep)
      };
    }),

    /**
     * Jump to a specific step
     */
    goToStep: assign(({ context, event }) => {
      const step = event.type === 'GOTO' ? event.step : context.targetStep;

      if (!step) {
        return context;
      }

      return {
        ...context,
        currentStep: step,
        currentStepIndex: getStepIndex(step),
        visitedSteps: new Set([...context.visitedSteps, step])
      };
    }),

    /**
     * Toggle skip optional steps configuration
     */
    toggleSkipOptional: assign(({ context, event }) => {
      if (event.type !== 'TOGGLE_SKIP_OPTIONAL') return context;

      return {
        ...context,
        skipOptionalSteps: event.skip,
        totalSteps: getTotalSteps(event.skip)
      };
    }),

    /**
     * Track navigation intent triggered by manual navigation controls
     */
    setNavigationIntent: assign(({ context, event }: { context: ModelingWizardContext; event: ModelingWizardEvents }) => {
      if (event.type === 'NEXT') {
        return {
          ...context,
          navigationIntent: 'next' as const,
          targetStep: null
        };
      }

      if (event.type === 'BACK') {
        return {
          ...context,
          navigationIntent: 'back' as const,
          targetStep: null
        };
      }

      if (event.type === 'GOTO') {
        return {
          ...context,
          navigationIntent: 'goto' as const,
          targetStep: event.step
        };
      }

      return context;
    }),

    /**
     * Capture auto-save intent so UI can differentiate from manual navigation
     */
    setAutoSaveIntent: assign(({ context }: { context: ModelingWizardContext }) => ({
      ...context,
      navigationIntent: 'auto-save' as const,
      targetStep: null
    })),

    /**
     * Clear navigation intent after persistence completes
     */
    clearNavigationIntent: assign(({ context }) => ({
      ...context,
      navigationIntent: null,
      targetStep: null
    })),

    /**
     * Execute navigation intent after successful persistence
     */
    executeNavigationIntent: assign(({ context }) => {
      const { navigationIntent, targetStep, currentStep, skipOptionalSteps, completedSteps, visitedSteps } = context;

      if (navigationIntent === 'next') {
        const nextStep = getNextStep(currentStep, skipOptionalSteps);
        if (!nextStep) return context;

        const newCompletedSteps = new Set(completedSteps);
        newCompletedSteps.add(currentStep);

        return {
          ...context,
          currentStep: nextStep,
          currentStepIndex: getStepIndex(nextStep),
          completedSteps: newCompletedSteps,
          visitedSteps: new Set([...visitedSteps, nextStep])
        };
      }

      if (navigationIntent === 'back') {
        const prevStep = getPreviousStep(currentStep, skipOptionalSteps);
        if (!prevStep) return context;

        return {
          ...context,
          currentStep: prevStep,
          currentStepIndex: getStepIndex(prevStep)
        };
      }

      if (navigationIntent === 'goto' && targetStep) {
        return {
          ...context,
          currentStep: targetStep,
          currentStepIndex: getStepIndex(targetStep),
          visitedSteps: new Set([...visitedSteps, targetStep])
        };
      }

      // auto-save or null intent - no navigation
      return context;
    }),

    /**
     * Increment retry count for exponential backoff
     */
    incrementRetryCount: assign(({ context }) => ({
      ...context,
      retryCount: context.retryCount + 1
    })),

    /**
     * Reset retry count after successful persistence
     */
    resetRetryCount: assign(({ context }) => ({
      ...context,
      retryCount: 0
    })),

    /**
     * Record persistence attempt timestamp
     */
    recordPersistAttempt: assign(({ context }) => ({
      ...context,
      lastPersistAttempt: Date.now()
    })),

    /**
     * Persist current context to localStorage
     */
    persistToStorage: ({ context }) => {
      persistToStorage(context);
    },

    /**
     * Mark context as saved and not dirty
     */
    markSaved: assign(({ context }) => ({
      ...context,
      lastSaved: Date.now(),
      isDirty: false
    })),

    /**
     * Load context from localStorage
     */
    loadFromStorage: assign(({ context }) => {
      const stored = loadFromStorage();

      if (!stored) {
        console.log('[ModelingWizard] No saved progress found');
        return context;
      }

      console.log('[ModelingWizard] Loaded progress from localStorage', {
        currentStep: stored.currentStep,
        completedSteps: stored.completedSteps?.size
      });

      return {
        ...context,
        ...stored,
        currentStepIndex: getStepIndex(stored.currentStep || 'generalInfo'),
        totalSteps: getTotalSteps(stored.skipOptionalSteps ?? false)
      };
    }),

    /**
     * Clear wizard progress
     */
    clearProgress: () => {
      clearStorage();
    },

    /**
     * Handle submission error
     */
    setSubmissionError: assign(({ context, event }) => {
      // Extract error message from event or context
      const errorMessage = 'error' in event
        ? String(event.error)
        : 'Failed to submit fund model';

      return {
        ...context,
        submissionError: errorMessage,
        submissionRetryCount: context.submissionRetryCount + 1
      };
    }),

    /**
     * Clear submission error
     */
    clearSubmissionError: assign(({ context }) => ({
      ...context,
      submissionError: null
    })),

    /**
     * Reset wizard to initial state
     */
    resetWizard: assign(() => createInitialContext({ skipOptionalSteps: false }))
  },

  guards: {
    /**
     * Check if current step is valid
     */
    isCurrentStepValid: ({ context }) => {
      const isValid = context.isStepValid[context.currentStep];
      console.log('[ModelingWizard] Step validation check', {
        step: context.currentStep,
        isValid
      });
      return isValid ?? false;
    },

    /**
     * Check if there is a next step
     */
    hasNextStep: ({ context }) => {
      return getNextStep(context.currentStep, context.skipOptionalSteps) !== null;
    },

    /**
     * Check if there is a previous step
     */
    hasPreviousStep: ({ context }) => {
      return getPreviousStep(context.currentStep, context.skipOptionalSteps) !== null;
    },

    /**
     * Check if retry limit has been reached
     */
    canRetry: ({ context }) => {
      return context.submissionRetryCount < 3;
    },

    /**
     * Check if persistence can be retried (max 3 attempts)
     */
    canRetryPersistence: ({ context }) => {
      return context.retryCount < 3;
    }
  },

  delays: {
    /**
     * Auto-save interval
     */
    autoSaveInterval: ({ context }) => context.autoSaveInterval,

    /**
     * Exponential backoff for persistence retry
     * retryCount 0 -> 1000ms, 1 -> 2000ms, 2 -> 4000ms
     */
    PERSIST_RETRY_DELAY: ({ context }) => {
      return Math.pow(2, context.retryCount) * 1000;
    }
  }

}).createMachine({
  id: 'modelingWizard',

  initial: 'idle',

  context: ({ input }) => createInitialContext(input),

  states: {
    /**
     * Initial idle state - loads saved progress if available
     */
    idle: {
      on: {
        LOAD_FROM_STORAGE: {
          actions: ['loadFromStorage'],
          target: 'active'
        },
        NEXT: {
          target: 'active'
        }
      }
    },

    /**
     * Active wizard flow
     */
    active: {
      initial: 'editing',

      states: {
        /**
         * User is editing the current step
         */
        editing: {
          initial: 'idle',

          states: {
            /**
             * Normal editing mode - no persistence errors
             */
            idle: {
              // Auto-save timer (action-only, no target to avoid re-entry)
              after: {
                autoSaveInterval: {
                  actions: ['setAutoSaveIntent', 'persistToStorage', 'markSaved', 'clearNavigationIntent']
                }
              },

              on: {
                SAVE_STEP: {
                  actions: ['saveStep']
                },

                NEXT: {
                  guard: 'isCurrentStepValid',
                  actions: ['setNavigationIntent', 'recordPersistAttempt'],
                  target: '#modelingWizard.active.persisting'
                },

                BACK: {
                  guard: 'hasPreviousStep',
                  actions: ['setNavigationIntent', 'recordPersistAttempt'],
                  target: '#modelingWizard.active.persisting'
                },

                GOTO: {
                  actions: ['setNavigationIntent', 'recordPersistAttempt'],
                  target: '#modelingWizard.active.persisting'
                },

                TOGGLE_SKIP_OPTIONAL: {
                  actions: ['toggleSkipOptional', 'persistToStorage']
                },

                // Reactive validation on portfolio changes
                PORTFOLIO_CHANGED: {
                  actions: 'validatePortfolio'
                },

                // Calculate reserves (only enabled if valid)
                CALCULATE_RESERVES: {
                  target: '#modelingWizard.active.calculatingReserves'
                  // Note: UI should guard this with context.portfolioValidation?.valid check
                },

                SUBMIT: {
                  guard: 'isCurrentStepValid',
                  target: '#modelingWizard.active.submitting'
                }
              }
            },

            /**
             * Persistence failed - user can retry or dismiss error
             */
            persistFailed: {
              on: {
                RETRY_PERSIST: {
                  actions: ['clearPersistenceError'],
                  target: '#modelingWizard.active.persisting'
                },

                DISMISS_PERSIST_ERROR: {
                  actions: ['clearPersistenceError', 'clearNavigationIntent', 'resetRetryCount'],
                  target: 'idle'
                }
              }
            }
          }
        },

        /**
         * Persisting wizard state to localStorage
         */
        persisting: {
          invoke: {
            src: 'persistDataService',
            input: ({ context }) => context,
            onDone: {
              target: 'editing.idle',
              actions: ['executeNavigationIntent', 'clearNavigationIntent', 'clearPersistenceError', 'resetRetryCount', 'markSaved']
            },
            onError: [
              {
                guard: 'canRetryPersistence',
                target: 'delaying',
                actions: ['setPersistenceError']
              },
              {
                target: 'editing.persistFailed',
                actions: ['setPersistenceError']
              }
            ]
          }
        },

        /**
         * Exponential backoff delay before retry
         */
        delaying: {
          after: {
            PERSIST_RETRY_DELAY: {
              target: 'persisting',
              actions: ['incrementRetryCount']
            }
          }
        },

        /**
         * Calculating reserves
         */
        calculatingReserves: {
          invoke: {
            src: 'calculateReserves',
            input: ({ context }) => context,
            onDone: {
              target: 'editing',
              actions: ['saveReserveCalculation']
            },
            onError: {
              target: 'editing',
              actions: ['clearReserveCalculation']
            }
          }
        },

        /**
         * Submitting fund model to API
         */
        submitting: {
          invoke: {
            src: 'submitFundModel',
            input: ({ context }) => context,
            onDone: {
              target: '#modelingWizard.completed',
              actions: ['clearProgress', 'clearSubmissionError']
            },
            onError: {
              target: 'submissionError',
              actions: ['setSubmissionError']
            }
          }
        },

        /**
         * Submission error state with retry capability
         */
        submissionError: {
          on: {
            RETRY_SUBMIT: {
              guard: 'canRetry',
              target: 'submitting',
              actions: ['clearSubmissionError']
            },

            CANCEL_SUBMISSION: {
              target: 'editing',
              actions: ['clearSubmissionError']
            }
          }
        }
      },

      on: {
        RESET: {
          actions: ['resetWizard', 'clearProgress'],
          target: 'idle'
        }
      }
    },

    /**
     * Wizard completed successfully
     */
    completed: {
      type: 'final',
      entry: () => {
        console.log('[ModelingWizard] Wizard completed successfully');
      }
    }
  }
});

// ============================================================================
// INITIAL CONTEXT FACTORY
// ============================================================================

function createInitialContext(input: {
  skipOptionalSteps?: boolean;
  autoSaveInterval?: number;
} = {}): ModelingWizardContext {
  const skipOptionalSteps = input.skipOptionalSteps ?? false;

  // Omit optional fields that would be undefined (exactOptionalPropertyTypes)
  return {
    steps: {},
    currentStep: 'generalInfo',
    currentStepIndex: 0,
    totalSteps: getTotalSteps(skipOptionalSteps),
    completedSteps: new Set(),
    visitedSteps: new Set(['generalInfo']),
    validationErrors: {
      generalInfo: [],
      sectorProfiles: [],
      capitalAllocation: [],
      feesExpenses: [],
      exitRecycling: [],
      waterfall: [],
      scenarios: []
    },
    isStepValid: {
      generalInfo: false,
      sectorProfiles: false,
      capitalAllocation: false,
      feesExpenses: false,
      exitRecycling: true, // Optional step defaults to valid
      waterfall: false,
      scenarios: false
    },
    // portfolioValidation and calculations omitted (undefined) per exactOptionalPropertyTypes
    lastSaved: null,
    isDirty: false,
    persistenceError: null,
    retryCount: 0,
    lastPersistAttempt: null,
    navigationIntent: null,
    targetStep: null,
    submissionError: null,
    submissionRetryCount: 0,
    skipOptionalSteps,
    autoSaveInterval: input.autoSaveInterval ?? 30000 // 30 seconds default
  } as ModelingWizardContext;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { STEP_ORDER, OPTIONAL_STEPS, getStepIndex, getNextStep, getPreviousStep };
