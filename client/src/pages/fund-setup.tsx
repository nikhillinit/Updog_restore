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
const VALID_STEPS = ['2', '3', '4'] as const;
type ValidStep = typeof VALID_STEPS[number];

// This line guarantees we map every ValidStep and nothing extra:
const NUM_TO_KEY = {
  '2': 'investment-strategy',
  '3': 'exit-recycling',
  '4': 'waterfall',
} as const satisfies Record<ValidStep, Exclude<StepKey, 'not-found'>>;

function useStepKey(): StepKey {
  const [loc] = useLocation();
  return React.useMemo<StepKey>(() => {
    const qs = loc.includes('?') ? loc.slice(loc.indexOf('?')) : '';
    const val = new URLSearchParams(qs).get('step') ?? '2';
    
    if (!VALID_STEPS.includes(val as ValidStep)) {
      if (import.meta.env.DEV) {
        console.warn(`[FundSetup] Invalid step '${val}', defaulting to not-found`);
      }
      return 'not-found';
    }
    
    return NUM_TO_KEY[val as ValidStep];
  }, [loc]);
}

export default function FundSetup() {
  const key = useStepKey();
  const Step = STEP_COMPONENTS[key] ?? StepNotFound;

  return (
    <ErrorBoundary
      fallback={<StepNotFound />}
      onError={(error) => {
        if (import.meta.env.DEV) {
          console.error(`[FundSetup] Error in step ${key}:`, error);
        }
        // hook for telemetry here
      }}
    >
      <div data-testid={`wizard-step-${key}-container`}>
        <Step />
      </div>
    </ErrorBoundary>
  );
}