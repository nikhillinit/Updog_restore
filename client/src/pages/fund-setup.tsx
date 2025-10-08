import React from 'react';
import { useLocation, useSearch } from 'wouter';
import FundBasicsStep from './FundBasicsStep';
import InvestmentRoundsStep from './InvestmentRoundsStep';
import CapitalStructureStep from './CapitalStructureStep';
import InvestmentStrategyStep from './InvestmentStrategyStep';
import InvestmentStrategyStepNew from './InvestmentStrategyStepNew';
import DistributionsStep from './DistributionsStep';
import CashflowManagementStep from './CashflowManagementStep';
import StepNotFound from './steps/StepNotFound';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { resolveStepKeyFromLocation, type StepKey } from './fund-setup-utils';
import { emitWizard } from '@/lib/wizard-telemetry';
import { ModernWizardProgress } from '@/components/wizard/ModernWizardProgress';

// Feature flag for new selector pattern migration
const useNewSelectors = import.meta.env['VITE_NEW_SELECTORS'] === 'true';

const STEP_COMPONENTS: Record<StepKey, React.ComponentType> = {
  'fund-basics': FundBasicsStep,
  'investment-rounds': InvestmentRoundsStep,
  'capital-structure': CapitalStructureStep,
  'investment-strategy': useNewSelectors ? InvestmentStrategyStepNew : InvestmentStrategyStep,
  distributions: DistributionsStep,
  'cashflow-management': CashflowManagementStep,
  'not-found': StepNotFound,
};

// Modern wizard steps configuration
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
    description: 'Stages, sectors, and allocations',
  },
  {
    id: 'distributions',
    number: 5,
    title: 'EXIT RECYCLING',
    description: 'Proceeds recycling configuration',
  },
  {
    id: 'cashflow-management',
    number: 6,
    title: 'WATERFALL & CARRY',
    description: 'Distribution terms and carry structure',
  },
  {
    id: 'review',
    number: 7,
    title: 'ADVANCED SETTINGS',
    description: 'Fund structure and expenses',
  },
  {
    id: 'complete',
    number: 8,
    title: 'REVIEW & CREATE',
    description: 'Final review and fund creation',
  },
];

function useStepKey(): StepKey {
  const [loc] = useLocation();
  const search = useSearch(); // Use wouter's useSearch hook for proper query param tracking

  // Debug: log every time this hook runs
  if (import.meta.env.DEV) {
    console.log(`[useStepKey] Hook called, loc='${loc}', search='${search}'`);
  }

  return React.useMemo<StepKey>(() => {
    // Add ? prefix since useSearch returns without it
    const searchWithPrefix = search ? `?${search}` : '';
    const fullLocation = loc + searchWithPrefix;
    const key = resolveStepKeyFromLocation(fullLocation);

    // Debug logging
    if (import.meta.env.DEV) {
      const stepParam = new URLSearchParams(search)['get']('step');
      console.log(
        `[FundSetup Debug] fullLocation='${fullLocation}', stepParam='${stepParam}', resolved key='${key}'`
      );
    }

    if (key === 'not-found' && import.meta.env.DEV) {
      const val = new URLSearchParams(search)['get']('step');
      console.warn(`[FundSetup] Invalid step '${val}', defaulting to not-found`);
    }

    return key;
  }, [loc, search]);
}

export default function FundSetup() {
  const key = useStepKey();
  const Step = STEP_COMPONENTS[key] ?? StepNotFound;

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
      <div data-testid="fund-setup-wizard" className="min-h-screen bg-gray-50">
        {/* Modern Progress Header */}
        <ModernWizardProgress steps={stepsWithStatus} currentStepId={key} />

        {/* Step Content */}
        <div data-testid={`wizard-step-${key}-container`} className="relative">
          <Step />
        </div>
      </div>
    </ErrorBoundary>
  );
}
