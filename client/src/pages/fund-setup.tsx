import React from 'react';
import { useLocation, useSearch } from 'wouter';
import FundBasicsStep from './FundBasicsStep';
import InvestmentRoundsStep from './InvestmentRoundsStepV2';
import CapitalStructureStep from './CapitalStructureStep';
import InvestmentStrategyStep from './InvestmentStrategyStep';
import InvestmentStrategyStepNew from './InvestmentStrategyStepNew';
import DistributionsStep from './DistributionsStep';
import CashflowManagementStep from './CashflowManagementStep';
import ReviewStep from './ReviewStep';
import StepNotFound from './steps/StepNotFound';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { resolveStepKeyFromLocation, type StepKey } from './fund-setup-utils';
import { emitWizard } from '@/lib/wizard-telemetry';
import { ModernWizardProgress } from '@/components/wizard/ModernWizardProgress';
import { useWizardStepGuard } from '@/hooks/useWizardStepGuard';
import { useFundDraftSync } from '@/hooks/useFundDraftSync';
import { useFundSelector } from '@/stores/useFundSelector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Feature flag for new selector pattern migration
const useNewSelectors = import.meta.env['VITE_NEW_SELECTORS'] === 'true';

const STEP_COMPONENTS: Record<StepKey, React.ComponentType> = {
  'fund-basics': FundBasicsStep,
  'investment-rounds': InvestmentRoundsStep,
  'capital-structure': CapitalStructureStep,
  'investment-strategy': useNewSelectors ? InvestmentStrategyStepNew : InvestmentStrategyStep,
  distributions: DistributionsStep,
  'cashflow-management': CashflowManagementStep,
  review: ReviewStep,
  'not-found': StepNotFound,
};

// Modern wizard steps configuration
// NOTE: Step 4 shows pre-recycling capital allocation so users can validate numbers tie
// Recycling is calculated later in step 5 after user sets recycling parameters
const WIZARD_STEPS = [
  {
    id: 'fund-basics',
    number: 1,
    title: 'FUND BASICS',
    description: 'Fund identity, capital, and economics structure',
  },
  {
    id: 'investment-rounds',
    number: 2,
    title: 'INVESTMENT ROUNDS',
    description: 'Define stages, valuations, and progression rates',
  },
  {
    id: 'capital-structure',
    number: 3,
    title: 'CAPITAL ALLOCATION',
    description: 'Investment stage allocations and deal modeling',
  },
  {
    id: 'investment-strategy',
    number: 4,
    title: 'INVESTMENT STRATEGY',
    description: 'Stages, sectors, and allocations (pre-recycling)',
  },
  {
    id: 'distributions',
    number: 5,
    title: 'DISTRIBUTIONS & WATERFALL',
    description: 'Carry waterfall, fees, expenses, and recycling',
  },
  {
    id: 'cashflow-management',
    number: 6,
    title: 'CASHFLOW & LIQUIDITY',
    description: 'Capital calls, expenses, and liquidity settings',
  },
  {
    id: 'review',
    number: 7,
    title: 'REVIEW & CREATE',
    description: 'Final review and fund creation',
  },
];

function useStepKey(): StepKey {
  const [loc] = useLocation();
  const search = useSearch(); // Use wouter's useSearch hook for proper query param tracking

  return React.useMemo<StepKey>(() => {
    // Add ? prefix since useSearch returns without it
    const searchWithPrefix = search ? `?${search}` : '';
    const fullLocation = loc + searchWithPrefix;
    const key = resolveStepKeyFromLocation(fullLocation);

    if (key === 'not-found' && import.meta.env.DEV) {
      const val = new URLSearchParams(search)['get']('step');
      console.warn(`[FundSetup] Invalid step '${val}', defaulting to not-found`);
    }

    return key;
  }, [loc, search]);
}

export default function FundSetup() {
  const key = useStepKey();
  const [, setLocation] = useLocation();
  const { markStepVisited, getRedirectUrl } = useWizardStepGuard();
  const draftFundId = useFundSelector((s) => s.draftFundId);
  const { status, error, retry, isHydrating } = useFundDraftSync({ stepKey: key });
  const Step = STEP_COMPONENTS[key] ?? StepNotFound;

  // Get current step number from key
  const currentStepNumber = WIZARD_STEPS.find((s) => s.id === key)?.number || 1;

  // Step guard: redirect if trying to skip ahead via URL manipulation
  React.useEffect(() => {
    if (isHydrating || key === 'not-found') return; // Let not-found render normally

    const redirectUrl = getRedirectUrl(currentStepNumber);
    if (redirectUrl) {
      // Log the bypass attempt in development
      if (import.meta.env.DEV) {
        console.warn(
          `[WizardStepGuard] Blocked access to step ${currentStepNumber}, redirecting to ${redirectUrl}`
        );
      }
      emitWizard({
        type: 'step_guard_redirect',
        step: key,
        attemptedStep: currentStepNumber,
        redirectUrl,
      });
      setLocation(redirectUrl);
      return;
    }

    // Mark step as visited if legitimately accessed
    markStepVisited(currentStepNumber);
  }, [currentStepNumber, getRedirectUrl, isHydrating, key, markStepVisited, setLocation]);

  // Emit telemetry on step load
  React.useEffect(() => {
    const ttfmp = performance.now();
    emitWizard({
      type: 'step_loaded',
      step: key,
      route: window.location.pathname + window.location.search,
      ttfmp,
    });
  }, [key]);

  // Add completed status to steps based on current progress
  const stepsWithStatus = WIZARD_STEPS.map((step) => ({
    ...step,
    completed:
      WIZARD_STEPS.findIndex((s) => s.id === key) > WIZARD_STEPS.findIndex((s) => s.id === step.id),
    current: step.id === key,
  }));

  return (
    <ErrorBoundary
      fallback={<StepNotFound />}
      onError={(error: Error) => {
        if (import.meta.env.DEV) {
          console.error(`[FundSetup] Error in step ${key}:`, error);
        }
        // Emit telemetry on error
        emitWizard({
          type: 'wizard_error',
          step: key,
          message: String(error),
          stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
        });
      }}
    >
      <div data-testid="fund-setup-wizard" className="min-h-screen bg-pov-gray">
        {/* Modern Progress Header - Single unified progress indicator */}
        <ModernWizardProgress steps={stepsWithStatus} currentStepId={key} />

        {isHydrating && draftFundId != null ? (
          <div
            className="flex min-h-[320px] items-center justify-center px-6"
            data-testid="draft-hydrating"
          >
            <div className="flex items-center gap-3 rounded-xl border border-[#E0D8D1] bg-white px-6 py-4 text-sm font-poppins text-[#292929] shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading saved draft from the server...
            </div>
          </div>
        ) : (
          <>
            {draftFundId != null && status !== 'idle' && (
              <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6 lg:px-8">
                {status === 'error' ? (
                  <Alert
                    aria-live="assertive"
                    className="border-l-4 border-l-error bg-error/10"
                    data-testid="draft-sync-error"
                  >
                    <AlertTriangle aria-hidden="true" className="h-4 w-4 text-error" />
                    <AlertTitle>Draft Sync Failed</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center gap-3">
                      <span>{error ?? 'Unable to sync the authoritative draft.'}</span>
                      <Button type="button" size="sm" variant="outline" onClick={retry}>
                        Retry Sync
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div
                    aria-live="polite"
                    className="rounded-xl border border-[#E0D8D1] bg-white px-4 py-3 text-sm font-poppins text-[#5F564F] shadow-sm"
                    data-testid="draft-sync-status"
                  >
                    {status === 'saving'
                      ? 'Saving authoritative server draft...'
                      : 'Draft saved to server'}
                  </div>
                )}
              </div>
            )}

            {/* Step Content */}
            <div data-testid={`wizard-step-${key}-container`} className="relative">
              <Step />
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
