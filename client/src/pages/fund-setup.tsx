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
import { useFundSelector, useFundTuple } from '@/stores/useFundSelector';
import { fundStore, hasFundWorkspaceSession } from '@/stores/fundStore';
import { parseFundIdParam } from '@/lib/fund-routes';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  const requestedKey = useStepKey();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { markStepVisited, getRedirectUrl } = useWizardStepGuard();
  const draftFundId = useFundSelector((s) => s.draftFundId);
  const [hydrated, draftServerReady, fundName, pendingCommand, creationKey] = useFundTuple(
    (s) => [s.hydrated, s.draftServerReady, s.fundName, s.pendingCommand, s.creationKey] as const
  );
  const hasLocalSession = useFundSelector(hasFundWorkspaceSession);
  const pendingFinalize = pendingCommand?.operation === 'finalize';
  const key = pendingFinalize ? 'review' : requestedKey;
  React.useEffect(() => {
    if (!pendingFinalize || requestedKey === 'review') return;
    const params = new URLSearchParams(search);
    params.set('step', '7');
    setLocation(`/fund-setup?${params.toString()}`, { replace: true });
  }, [pendingFinalize, requestedKey, search, setLocation]);
  const { status, error, retry, isHydrating, loadServerDraft, keepLocalDraft, missingDraftFundId } =
    useFundDraftSync({ stepKey: key });
  // Stamp only a save this tab confirmed; hydrating an old draft must not claim "saved now".
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const previousStatus = React.useRef(status);
  React.useEffect(() => {
    if (status === 'synced' && previousStatus.current === 'saving') setSavedAt(new Date());
    previousStatus.current = status;
  }, [status]);
  React.useEffect(() => setSavedAt(null), [draftFundId]);
  const Step = STEP_COMPONENTS[key] ?? StepNotFound;
  const explicitFund = React.useMemo(() => parseFundIdParam(search), [search]);
  const [switchBlocked, setSwitchBlocked] = React.useState(false);
  const needsLocalSessionIdentity =
    hydrated &&
    explicitFund.kind === 'absent' &&
    draftFundId == null &&
    pendingCommand == null &&
    creationKey == null;

  React.useEffect(() => {
    if (needsLocalSessionIdentity) fundStore.getState().reserveCreationKey();
  }, [needsLocalSessionIdentity]);

  // Explicit ?fundId=N: resume that server draft, unless a different local
  // session still has unsettled changes. Bare /fund-setup never creates anything.
  React.useEffect(() => {
    if (!hydrated) return;
    if (explicitFund.kind !== 'valid' || explicitFund.id === draftFundId) {
      setSwitchBlocked(false);
      return;
    }
    // Only a confirmed save is settled; 'idle' after reload can hold unsaved restored edits.
    const settled = draftServerReady && status === 'synced';
    if (!pendingCommand && (!hasLocalSession || (draftFundId != null && settled))) {
      fundStore.getState().resumeServerDraft(explicitFund.id);
      setSwitchBlocked(false);
      return;
    }
    setSwitchBlocked(true);
  }, [
    draftFundId,
    draftServerReady,
    explicitFund,
    hasLocalSession,
    hydrated,
    pendingCommand,
    status,
  ]);

  const startNewFund = React.useCallback(() => {
    fundStore.getState().startNewFundSession();
    setLocation('/fund-setup?step=1');
  }, [setLocation]);

  const discardLocalAndOpenTarget = React.useCallback(() => {
    if (pendingCommand || explicitFund.kind !== 'valid') return;
    fundStore.getState().resumeServerDraft(explicitFund.id);
    setSwitchBlocked(false);
  }, [explicitFund, pendingCommand]);

  // Get current step number from key
  const currentStepNumber = WIZARD_STEPS.find((s) => s.id === key)?.number || 1;

  // Step guard: redirect if trying to skip ahead via URL manipulation
  React.useEffect(() => {
    if (pendingFinalize || isHydrating || key === 'not-found') return; // Recovery replays an already dispatched command.

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
  }, [
    currentStepNumber,
    getRedirectUrl,
    isHydrating,
    key,
    markStepVisited,
    pendingFinalize,
    setLocation,
  ]);

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
        <ModernWizardProgress
          steps={WIZARD_STEPS}
          currentStepId={key}
          enableNavigation={!pendingFinalize}
        />

        {(isHydrating && draftFundId != null) || needsLocalSessionIdentity ? (
          <div
            className="flex min-h-[320px] items-center justify-center px-6"
            data-testid="draft-hydrating"
          >
            <div className="flex items-center gap-3 rounded-xl border border-beige-200 bg-pov-white px-6 py-4 text-sm font-poppins text-pov-charcoal shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {needsLocalSessionIdentity ? 'Preparing fund workspace' : 'Loading your draft'}
            </div>
          </div>
        ) : (
          <>
            {(switchBlocked || explicitFund.kind === 'invalid') && (
              <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
                <Alert
                  aria-live="polite"
                  className="border-l-4 border-l-warning bg-warning/10"
                  data-testid="draft-switch-blocked"
                >
                  <AlertTriangle aria-hidden="true" className="h-4 w-4 text-warning" />
                  <AlertTitle>
                    {explicitFund.kind === 'invalid'
                      ? 'That fund address is not valid'
                      : 'Another draft is still open in this tab'}
                  </AlertTitle>
                  <AlertDescription className="flex flex-wrap items-center gap-3">
                    <span>
                      {explicitFund.kind === 'invalid'
                        ? 'Choose a fund from the workspace instead.'
                        : `Settle changes to ${fundName?.trim() || 'the current draft'} before opening another draft.`}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setLocation('/dashboard')}
                    >
                      Open fund workspace
                    </Button>
                    {switchBlocked && explicitFund.kind === 'valid' && !pendingCommand && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" size="sm" variant="outline">
                            Discard local draft and open selected fund
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Discard local draft?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Unsaved changes to {fundName?.trim() || 'the current draft'} will be
                              discarded before opening the selected fund.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep local draft</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-pov-charcoal hover:bg-charcoal-700"
                              onClick={discardLocalAndOpenTarget}
                            >
                              Discard and open
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {draftFundId != null && status !== 'idle' && (
              <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
                {missingDraftFundId === draftFundId ? (
                  <Alert
                    aria-live="assertive"
                    className="border-l-4 border-l-error bg-error/10"
                    data-testid="draft-missing"
                  >
                    <AlertTriangle aria-hidden="true" className="h-4 w-4 text-error" />
                    <AlertTitle>No active draft</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center gap-3">
                      <span>
                        This fund has no active draft to edit. Open its model, or start a new fund.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`/fund-model-results/${draftFundId}`)}
                      >
                        Open model
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={startNewFund}>
                        Start a new fund
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : status === 'error' ? (
                  <Alert
                    aria-live="assertive"
                    className="border-l-4 border-l-error bg-error/10"
                    data-testid="draft-sync-error"
                  >
                    <AlertTriangle aria-hidden="true" className="h-4 w-4 text-error" />
                    <AlertTitle>Draft sync failed</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center gap-3">
                      <span>{error ?? 'Could not save changes'}</span>
                      <Button type="button" size="sm" variant="outline" onClick={retry}>
                        Retry Sync
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : status === 'stale' ? (
                  <Alert
                    aria-live="assertive"
                    className="border-l-4 border-l-warning bg-warning/10"
                    data-testid="draft-stale"
                  >
                    <AlertTriangle aria-hidden="true" className="h-4 w-4 text-warning" />
                    <AlertTitle>A newer draft is available</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center gap-3">
                      <span>
                        Your local values are kept. Load the saved draft, or keep your changes and
                        save them over it.
                      </span>
                      <Button type="button" size="sm" variant="outline" onClick={loadServerDraft}>
                        Load server draft
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" size="sm" variant="outline">
                            Keep my changes
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Overwrite the saved draft?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Someone saved a newer version of this draft. Your values will replace
                              it on the server, and the other changes will be lost.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-pov-charcoal hover:bg-charcoal-700"
                              onClick={keepLocalDraft}
                            >
                              Overwrite saved draft
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </AlertDescription>
                  </Alert>
                ) : status === 'uncertain' ? (
                  <Alert
                    aria-live="assertive"
                    className="border-l-4 border-l-warning bg-warning/10"
                    data-testid="draft-uncertain"
                  >
                    <AlertTriangle aria-hidden="true" className="h-4 w-4 text-warning" />
                    <AlertTitle>Save not confirmed</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center gap-3">
                      <span>{error ?? 'Could not confirm the save; it may have completed'}</span>
                      <Button type="button" size="sm" variant="outline" onClick={retry}>
                        Check save status
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div
                    aria-live="polite"
                    className="rounded-xl border border-beige-200 bg-pov-white px-4 py-3 text-sm font-poppins text-charcoal-600 shadow-sm"
                    data-testid="draft-sync-status"
                  >
                    {status === 'saving'
                      ? 'Saving draft…'
                      : savedAt
                        ? `Latest draft saved at ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                        : 'Latest draft saved'}
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
