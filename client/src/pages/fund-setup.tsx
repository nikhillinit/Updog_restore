import React from 'react';
import { useLocation } from 'wouter';
import InvestmentStrategyStep from './InvestmentStrategyStep';
import ExitRecyclingStep from './ExitRecyclingStep';
import WaterfallStep from './WaterfallStep';
import StepNotFound from './steps/StepNotFound';
import { ErrorBoundary } from '@/components/ErrorBoundary';

type StepKey = 'investment-strategy' | 'exit-recycling' | 'waterfall' | 'not-found';

const STEP_COMPONENTS: Record<StepKey, React.ComponentType<any>> = {
  'investment-strategy': InvestmentStrategyStep,
  'exit-recycling':     ExitRecyclingStep,
  'waterfall':          WaterfallStep,
  'not-found':          StepNotFound,
};

// Map ?step=2 → investment-strategy, etc.
const NUM_TO_KEY: Record<string, StepKey> = {
  '2': 'investment-strategy',
  '3': 'exit-recycling',
  '4': 'waterfall',
};

function useStepKey(): StepKey {
  const [loc] = useLocation();
  const search = loc.includes('?') ? loc.slice(loc.indexOf('?')) : '';
  const params = new URLSearchParams(search);
  const raw = params.get('step') ?? '2'; // Default to step 2
  return NUM_TO_KEY[raw] ?? 'not-found';
}

export default function FundSetup() {
  const key = useStepKey();
  const Step = STEP_COMPONENTS[key] ?? StepNotFound;

  return (
    <ErrorBoundary>
      <div data-testid={`wizard-step-${key}-container`}>
        <Step />
      </div>
    </ErrorBoundary>
  );
}