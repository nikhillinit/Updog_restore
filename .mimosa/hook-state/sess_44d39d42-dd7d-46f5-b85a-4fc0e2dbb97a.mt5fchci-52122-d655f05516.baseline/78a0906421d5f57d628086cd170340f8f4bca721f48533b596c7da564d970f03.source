/**
 * WizardShell Component
 *
 * Main wizard container that provides:
 * - Step navigation UI
 * - Progress tracking
 * - Step validation indicators
 * - Auto-save notifications
 * - Error handling UI
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Check,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import type { WizardStep } from '@/machines/modeling-wizard.machine';

// ============================================================================
// TYPES
// ============================================================================

export interface WizardShellProps {
  // Current step info
  currentStep: WizardStep;
  currentStepIndex: number;
  totalSteps: number;

  // Step data
  completedSteps: Set<WizardStep>;
  visitedSteps: Set<WizardStep>;
  validationErrors: Record<WizardStep, string[]>;

  // Navigation handlers
  onNext: () => void;
  onBack: () => void;
  onGoToStep?: (step: WizardStep) => void;

  // State
  canGoNext: boolean;
  canGoBack: boolean;
  isSubmitting?: boolean;
  isSaving?: boolean;
  lastSaved?: number | null;

  // Error handling
  submissionError?: string | null;
  onRetrySubmit?: () => void;
  onCancelSubmission?: () => void;

  // Content
  children: React.ReactNode;
  className?: string;
}

// ============================================================================
// STEP CONFIGURATION
// ============================================================================

const STEP_LABELS: Record<WizardStep, { title: string; description: string }> = {
  generalInfo: {
    title: 'General Info',
    description: 'Fund basics, vintage year, and size'
  },
  sectorProfiles: {
    title: 'Sector/Stage Profiles',
    description: 'Investment thesis and allocations'
  },
  capitalAllocation: {
    title: 'Capital Allocation',
    description: 'Check sizes, follow-on strategy, and pacing'
  },
  feesExpenses: {
    title: 'Fees & Expenses',
    description: 'Management fees and admin expenses'
  },
  exitRecycling: {
    title: 'Exit Recycling',
    description: 'Optional: reinvest distributions'
  },
  waterfall: {
    title: 'Waterfall',
    description: 'Distribution waterfall and carry'
  },
  scenarios: {
    title: 'Scenarios',
    description: 'Construction vs current state comparison'
  }
};

const STEP_ORDER: WizardStep[] = [
  'generalInfo',
  'sectorProfiles',
  'capitalAllocation',
  'feesExpenses',
  'exitRecycling',
  'waterfall',
  'scenarios'
];

// ============================================================================
// COMPONENT
// ============================================================================

export function WizardShell({
  currentStep,
  currentStepIndex,
  totalSteps,
  completedSteps,
  visitedSteps,
  validationErrors,
  onNext,
  onBack,
  onGoToStep,
  canGoNext,
  canGoBack,
  isSubmitting = false,
  isSaving = false,
  lastSaved,
  submissionError,
  onRetrySubmit,
  onCancelSubmission,
  children,
  className
}: WizardShellProps) {
  const currentStepInfo = STEP_LABELS[currentStep];
  const progressPercentage = ((currentStepIndex + 1) / totalSteps) * 100;
  const currentErrors = validationErrors[currentStep] || [];
  const hasErrors = currentErrors.length > 0;

  return (
    <div className={cn('min-h-screen bg-gradient-to-br from-beige-50 to-white', className)}>
      {/* Header */}
      <div className="bg-white border-b border-charcoal-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-inter font-bold text-3xl text-pov-charcoal">
                Fund Modeling Wizard
              </h1>
              <p className="font-poppins text-sm text-charcoal-600 mt-1">
                Step {currentStepIndex + 1} of {totalSteps}: {currentStepInfo.title}
              </p>
            </div>

            {/* Auto-save indicator */}
            <div className="flex items-center gap-3">
              {isSaving && (
                <div className="flex items-center gap-2 text-sm text-charcoal-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </div>
              )}

              {!isSaving && lastSaved && (
                <div className="flex items-center gap-2 text-sm text-charcoal-600">
                  <Save className="h-4 w-4 text-success" />
                  <span>
                    Saved {formatLastSaved(lastSaved)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex items-center justify-between text-xs text-charcoal-500">
              <span>{Math.round(progressPercentage)}% complete</span>
              <span>{completedSteps.size} of {totalSteps} steps completed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Step navigation breadcrumbs */}
      <div className="bg-white border-b border-charcoal-200">
        <div className="max-w-6xl mx-auto px-8 py-4">
          <div className="flex items-center gap-2 overflow-x-auto">
            {STEP_ORDER.map((step, index) => {
              const stepInfo = STEP_LABELS[step];
              const isCompleted = completedSteps.has(step);
              const isVisited = visitedSteps.has(step);
              const isCurrent = step === currentStep;
              const hasStepErrors = (validationErrors[step] || []).length > 0;

              return (
                <React.Fragment key={step}>
                  {index > 0 && (
                    <ArrowRight className="h-4 w-4 text-charcoal-400 flex-shrink-0" />
                  )}

                  <button
                    onClick={() => onGoToStep?.(step)}
                    disabled={!isVisited || !onGoToStep}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
                      'font-poppins text-sm whitespace-nowrap',
                      isCurrent && 'bg-pov-charcoal text-white font-medium',
                      !isCurrent && isCompleted && 'bg-success/10 text-success hover:bg-success/20',
                      !isCurrent && !isCompleted && isVisited && 'bg-charcoal-100 text-charcoal-700 hover:bg-charcoal-200',
                      !isCurrent && !isVisited && 'bg-charcoal-50 text-charcoal-400',
                      hasStepErrors && !isCurrent && 'bg-error/10 text-error'
                    )}
                  >
                    {isCompleted && !isCurrent && (
                      <Check className="h-4 w-4" />
                    )}
                    {hasStepErrors && !isCurrent && (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span>{stepInfo.title}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* Step description */}
        <div className="mb-8">
          <h2 className="font-inter font-bold text-2xl text-pov-charcoal mb-2">
            {currentStepInfo.title}
          </h2>
          <div className="h-px bg-charcoal-300 w-16 mb-3" />
          <p className="font-poppins text-charcoal-600">
            {currentStepInfo.description}
          </p>
        </div>

        {/* Validation errors */}
        {hasErrors && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-poppins font-medium mb-2">
                Please fix the following errors before continuing:
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {currentErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Submission error */}
        {submissionError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-poppins font-medium mb-1">
                    Submission Failed
                  </div>
                  <p className="text-sm">{submissionError}</p>
                </div>
                <div className="flex items-center gap-2">
                  {onRetrySubmit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRetrySubmit}
                      className="font-poppins"
                    >
                      Retry
                    </Button>
                  )}
                  {onCancelSubmission && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCancelSubmission}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Step content */}
        <div className="bg-white rounded-2xl shadow-sm p-8 mb-8">
          {children}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={!canGoBack || isSubmitting}
            className="flex items-center gap-2 font-poppins"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous Step
          </Button>

          <div className="flex items-center gap-3">
            {/* Show submission button on last step */}
            {currentStepIndex === totalSteps - 1 ? (
              <Button
                onClick={onNext}
                disabled={!canGoNext || isSubmitting}
                className="flex items-center gap-2 bg-pov-charcoal hover:bg-pov-charcoal/90 font-poppins px-8"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Model
                    <Check className="h-4 w-4" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={onNext}
                disabled={!canGoNext || isSubmitting}
                className="flex items-center gap-2 bg-pov-charcoal hover:bg-pov-charcoal/90 font-poppins"
              >
                Next Step
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format last saved timestamp to human-readable string
 */
function formatLastSaved(timestamp: number): string {
  const now = Date.now();
  const secondsAgo = Math.floor((now - timestamp) / 1000);

  if (secondsAgo < 10) {
    return 'just now';
  } else if (secondsAgo < 60) {
    return `${secondsAgo}s ago`;
  } else if (secondsAgo < 3600) {
    const minutesAgo = Math.floor(secondsAgo / 60);
    return `${minutesAgo}m ago`;
  } else {
    const hoursAgo = Math.floor(secondsAgo / 3600);
    return `${hoursAgo}h ago`;
  }
}
