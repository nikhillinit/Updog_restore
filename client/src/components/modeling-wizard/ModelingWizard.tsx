/**
 * Modeling Wizard - Main Component
 *
 * Legacy XState wizard UI retained only as an opt-in compatibility surface.
 * The routed store-based flow under /fund-setup is the production owner.
 *
 * Features when explicitly enabled:
 * - 7-step sequential workflow
 * - Auto-save to localStorage
 * - Resume capability
 * - Validation at each step
 * - API submission with retry
 *
 * @deprecated Non-authoritative wizard UI kept only for compatibility work.
 *
 * @example
 * import { ModelingWizard } from '@/components/modeling-wizard/ModelingWizard';
 *
 * function App() {
 *   return <ModelingWizard allowLegacyAccess />;
 * }
 */

import React from 'react';
import { Link, useLocation } from 'wouter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { WizardShell } from './WizardShell';
import { useModelingWizard } from '@/hooks/useModelingWizard';
import type { GeneralInfoInput, FundFinancialsOutput } from '@/schemas/modeling-wizard.schemas';
import {
  GeneralInfoStep,
  SectorProfilesStep,
  CapitalAllocationStep,
  FeesExpensesStep,
  ExitRecyclingStep,
  WaterfallStep,
  ScenariosStep,
} from './steps';

// ============================================================================
// TYPES
// ============================================================================

export interface ModelingWizardProps {
  /**
   * Explicit opt-in required to render the legacy XState wizard UI.
   * Default: false
   */
  allowLegacyAccess?: boolean;

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

const DEFAULT_FUND_FINANCIALS: FundFinancialsOutput = {
  fundSize: 100,
  orgExpenses: 0,
  additionalExpenses: [],
  investmentPeriod: 5,
  gpCommitment: 1,
  cashlessSplit: 50,
  managementFee: { rate: 2, stepDown: { enabled: false } },
};

function buildFundFinancials(generalInfo?: GeneralInfoInput): FundFinancialsOutput {
  return {
    ...DEFAULT_FUND_FINANCIALS,
    fundSize: generalInfo?.fundSize ?? DEFAULT_FUND_FINANCIALS.fundSize,
    investmentPeriod: generalInfo?.investmentPeriod ?? DEFAULT_FUND_FINANCIALS.investmentPeriod,
  };
}

function LegacyWizardNotice() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center p-8">
      <Alert className="border-amber-300 bg-amber-50" data-testid="legacy-modeling-wizard-notice">
        <AlertTitle>Legacy wizard UI is quarantined</AlertTitle>
        <AlertDescription className="space-y-4">
          <p>
            The routed store-based wizard at <code>/fund-setup</code> is the only supported
            production flow. This XState UI remains compatibility-only.
          </p>
          <Button asChild type="button">
            <Link href="/fund-setup">Open Fund Setup</Link>
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

function LegacyModelingWizardFlow({
  skipOptionalSteps = false,
  autoSaveInterval = 30000,
  loadSavedProgress = true,
  onComplete,
  onError,
}: Omit<ModelingWizardProps, 'allowLegacyAccess'>) {
  const [, navigate] = useLocation();

  // Initialize wizard hook
  const wizard = useModelingWizard({
    skipOptionalSteps,
    autoSaveInterval,
    loadSavedProgress,
    onComplete: (data) => {
      // Call user callback
      onComplete?.();

      // Navigate to the concrete fund results page using the ID captured
      // by the XState machine from the POST /api/funds response.
      // Falls back to /fund-setup if the ID was not captured (Zod parse failed).
      const fundId = data.createdFundId;
      setTimeout(() => {
        navigate(fundId != null ? `/fund-model-results/${fundId}` : '/fund-setup');
      }, 1500);
    },
    onError: (error) => {
      console.error('[ModelingWizard] Wizard error:', error);
      onError?.(error);
    },
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

  // Gather step data (types-only optimization for exactOptionalPropertyTypes)
  const generalInfoData = wizard.getStepData('generalInfo');
  const sectorProfilesData = wizard.getStepData('sectorProfiles');
  const capitalAllocationData = wizard.getStepData('capitalAllocation');
  const feesExpensesData = wizard.getStepData('feesExpenses');
  const exitRecyclingData = wizard.getStepData('exitRecycling');
  const waterfallData = wizard.getStepData('waterfall');
  const scenariosData = wizard.getStepData('scenarios');
  const fundFinancials = buildFundFinancials(generalInfoData);
  const sectorProfiles = sectorProfilesData?.sectorProfiles ?? [];

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
          {...(generalInfoData !== undefined ? { initialData: generalInfoData } : {})}
          onSave={(data) => wizard.saveStep('generalInfo', data)}
        />
      )}

      {/* Step 2: Sector Profiles */}
      {wizard.currentStep === 'sectorProfiles' && (
        <SectorProfilesStep
          {...(sectorProfilesData !== undefined ? { initialData: sectorProfilesData } : {})}
          onSave={(data) => wizard.saveStep('sectorProfiles', data)}
        />
      )}

      {/* Step 3: Capital Allocation */}
      {wizard.currentStep === 'capitalAllocation' && (
        <CapitalAllocationStep
          {...(capitalAllocationData !== undefined ? { initialData: capitalAllocationData } : {})}
          onSave={(data) => wizard.saveStep('capitalAllocation', data)}
          fundFinancials={fundFinancials}
          sectorProfiles={sectorProfiles}
        />
      )}

      {/* Step 4: Fees & Expenses */}
      {wizard.currentStep === 'feesExpenses' && (
        <FeesExpensesStep
          {...(feesExpensesData !== undefined ? { initialData: feesExpensesData } : {})}
          onSave={(data) => wizard.saveStep('feesExpenses', data)}
        />
      )}

      {/* Step 5: Exit Recycling (Optional) */}
      {wizard.currentStep === 'exitRecycling' && (
        <ExitRecyclingStep
          {...(exitRecyclingData !== undefined ? { initialData: exitRecyclingData } : {})}
          onSave={(data) => wizard.saveStep('exitRecycling', data)}
          fundFinancials={fundFinancials}
        />
      )}

      {/* Step 6: Waterfall */}
      {wizard.currentStep === 'waterfall' && (
        <WaterfallStep
          {...(waterfallData !== undefined ? { initialData: waterfallData } : {})}
          onSave={(data) => wizard.saveStep('waterfall', data)}
        />
      )}

      {/* Step 7: Scenarios */}
      {wizard.currentStep === 'scenarios' && (
        <ScenariosStep
          {...(scenariosData !== undefined ? { initialData: scenariosData } : {})}
          onSave={(data) => wizard.saveStep('scenarios', data)}
        />
      )}
    </WizardShell>
  );
}

export function ModelingWizard({ allowLegacyAccess = false, ...props }: ModelingWizardProps) {
  if (!allowLegacyAccess) {
    return <LegacyWizardNotice />;
  }

  return <LegacyModelingWizardFlow {...props} />;
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
    <div className="fixed bottom-4 right-4 max-w-md rounded-lg border border-charcoal-300 bg-white p-4 shadow-lg">
      <h3 className="mb-2 font-inter text-sm font-bold">Wizard Debug</h3>

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
          <strong>Completed Steps:</strong> {wizard.completedSteps.size} /{' '}
          {wizard.context.totalSteps}
        </div>
        <div>
          <strong>Visited Steps:</strong> {Array.from(wizard.visitedSteps).join(', ')}
        </div>
        <div>
          <strong>Last Saved:</strong>{' '}
          {wizard.context.lastSaved
            ? new Date(wizard.context.lastSaved).toLocaleTimeString()
            : 'Never'}
        </div>
      </div>

      <div className="mt-3 border-t border-charcoal-200 pt-3">
        <button onClick={wizard.reset} className="text-xs text-error hover:underline">
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
