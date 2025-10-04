/**
 * Modeling Wizard - Main Component
 *
 * Complete implementation of the VC fund modeling wizard.
 * This is the main entry point for the wizard flow.
 *
 * Features:
 * - 7-step sequential workflow
 * - Auto-save to localStorage
 * - Resume capability
 * - Validation at each step
 * - API submission with retry
 *
 * @example
 * import { ModelingWizard } from '@/components/modeling-wizard/ModelingWizard';
 *
 * function App() {
 *   return <ModelingWizard />;
 * }
 */

import React from 'react';
import { useLocation } from 'wouter';
import { WizardShell } from './WizardShell';
import { useModelingWizard } from '@/hooks/useModelingWizard';
import {
  GeneralInfoStep,
  SectorProfilesStep,
  CapitalAllocationStep,
  FeesExpensesStep,
  ExitRecyclingStep,
  WaterfallStep,
  ScenariosStep
} from './steps';

// ============================================================================
// TYPES
// ============================================================================

export interface ModelingWizardProps {
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
   * Callback when wizard is completed successfully
   */
  onComplete?: () => void;

  /**
   * Callback when wizard encounters an error
   */
  onError?: (error: Error) => void;

  /**
   * Redirect path after successful completion
   * Default: '/dashboard'
   */
  redirectOnComplete?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ModelingWizard({
  skipOptionalSteps = false,
  autoSaveInterval = 30000,
  loadSavedProgress = true,
  onComplete,
  onError,
  redirectOnComplete = '/dashboard'
}: ModelingWizardProps) {
  const [, navigate] = useLocation();

  // Initialize wizard hook
  const wizard = useModelingWizard({
    skipOptionalSteps,
    autoSaveInterval,
    loadSavedProgress,
    onComplete: (data) => {
      console.log('[ModelingWizard] Wizard completed successfully!', data);

      // Call user callback
      onComplete?.();

      // Redirect after short delay to show success message
      setTimeout(() => {
        navigate(redirectOnComplete);
      }, 2000);
    },
    onError: (error) => {
      console.error('[ModelingWizard] Wizard error:', error);
      onError?.(error);
    }
  });

  // Handle submission (on last step)
  const handleNext = () => {
    if (wizard.currentStepIndex === wizard.context.totalSteps - 1) {
      // Last step - submit
      wizard.submit();
    } else {
      // Navigate to next step
      wizard.goNext();
    }
  };

  return (
    <WizardShell
      currentStep={wizard.currentStep}
      currentStepIndex={wizard.currentStepIndex}
      totalSteps={wizard.context.totalSteps}
      completedSteps={wizard.completedSteps}
      visitedSteps={wizard.visitedSteps}
      validationErrors={wizard.context.validationErrors}
      onNext={handleNext}
      onBack={wizard.goBack}
      onGoToStep={wizard.goToStep}
      canGoNext={wizard.canGoNext}
      canGoBack={wizard.canGoBack}
      isSubmitting={wizard.isSubmitting}
      isSaving={wizard.isDirty}
      lastSaved={wizard.context.lastSaved}
      submissionError={wizard.context.submissionError}
      onRetrySubmit={wizard.retrySubmit}
      onCancelSubmission={wizard.cancelSubmission}
    >
      {/* Step 1: General Info */}
      {wizard.currentStep === 'generalInfo' && (
        <GeneralInfoStep
          initialData={wizard.getStepData('generalInfo')}
          onSave={(data) => wizard.saveStep('generalInfo', data)}
        />
      )}

      {/* Step 2: Sector Profiles */}
      {wizard.currentStep === 'sectorProfiles' && (
        <SectorProfilesStep
          initialData={wizard.getStepData('sectorProfiles')}
          onSave={(data) => wizard.saveStep('sectorProfiles', data)}
        />
      )}

      {/* Step 3: Capital Allocation */}
      {wizard.currentStep === 'capitalAllocation' && (
        <CapitalAllocationStep
          initialData={wizard.getStepData('capitalAllocation')}
          onSave={(data) => wizard.saveStep('capitalAllocation', data)}
        />
      )}

      {/* Step 4: Fees & Expenses */}
      {wizard.currentStep === 'feesExpenses' && (
        <FeesExpensesStep
          initialData={wizard.getStepData('feesExpenses')}
          onSave={(data) => wizard.saveStep('feesExpenses', data)}
        />
      )}

      {/* Step 5: Exit Recycling (Optional) */}
      {wizard.currentStep === 'exitRecycling' && (
        <ExitRecyclingStep
          initialData={wizard.getStepData('exitRecycling')}
          onSave={(data) => wizard.saveStep('exitRecycling', data)}
        />
      )}

      {/* Step 6: Waterfall */}
      {wizard.currentStep === 'waterfall' && (
        <WaterfallStep
          initialData={wizard.getStepData('waterfall')}
          onSave={(data) => wizard.saveStep('waterfall', data)}
        />
      )}

      {/* Step 7: Scenarios */}
      {wizard.currentStep === 'scenarios' && (
        <ScenariosStep
          initialData={wizard.getStepData('scenarios')}
          onSave={(data) => wizard.saveStep('scenarios', data)}
        />
      )}
    </WizardShell>
  );
}

// ============================================================================
// DEBUG COMPONENT (Development Only)
// ============================================================================

/**
 * Debug panel showing wizard state (development only)
 */
export function WizardDebugPanel({ wizard }: { wizard: ReturnType<typeof useModelingWizard> }) {
  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-charcoal-300 rounded-lg p-4 shadow-lg max-w-md">
      <h3 className="font-inter font-bold text-sm mb-2">Wizard Debug</h3>

      <div className="space-y-2 text-xs font-poppins">
        <div>
          <strong>Current Step:</strong> {wizard.currentStep}
        </div>
        <div>
          <strong>Progress:</strong> {wizard.progressPercentage.toFixed(0)}%
        </div>
        <div>
          <strong>Is Dirty:</strong> {wizard.isDirty ? 'Yes' : 'No'}
        </div>
        <div>
          <strong>Completed Steps:</strong> {wizard.completedSteps.size} / {wizard.context.totalSteps}
        </div>
        <div>
          <strong>Visited Steps:</strong> {Array.from(wizard.visitedSteps).join(', ')}
        </div>
        <div>
          <strong>Last Saved:</strong>{' '}
          {wizard.context.lastSaved ? new Date(wizard.context.lastSaved).toLocaleTimeString() : 'Never'}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-charcoal-200">
        <button
          onClick={wizard.reset}
          className="text-xs text-error hover:underline"
        >
          Reset Wizard
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ModelingWizard;
