import React from 'react';
import { useLocation } from 'wouter';
import InvestmentStrategyStep from './InvestmentStrategyStep';
import ExitRecyclingStep from './ExitRecyclingStep';
import WaterfallStep from './WaterfallStep';
import StepNotFound from './steps/StepNotFound';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { resolveStepKeyFromLocation, type StepKey } from './fund-setup-utils';
import { emitWizard } from '@/lib/wizard-telemetry';

const STEP_COMPONENTS: Record<StepKey, React.ComponentType<any>> = {
  'investment-strategy': InvestmentStrategyStep,
  'exit-recycling':     ExitRecyclingStep,
  'waterfall':          WaterfallStep,
  'not-found':          StepNotFound,
};

function useStepKey(): StepKey {
  const [loc] = useLocation();
  return React.useMemo<StepKey>(() => {
    const key = resolveStepKeyFromLocation(loc);
    
    if (key === 'not-found' && import.meta.env.DEV) {
      const val = new URLSearchParams(loc.includes('?') ? loc.slice(loc.indexOf('?')) : '').get('step');
      console.warn(`[FundSetup] Invalid step '${val}', defaulting to not-found`);
    }
    
    return key;
  }, [loc]);
}

export default function FundSetup() {
  const key = useStepKey();
  const Step = STEP_COMPONENTS[key] ?? StepNotFound;

  // Emit telemetry on step load
  React.useEffect(() => {
    const ttfmp = performance.now();
    emitWizard({ 
      type: "step_loaded", 
      step: key,
      route: window.location.pathname + window.location.search,
      ttfmp 
    });
  }, [key]);

  return (
    <ErrorBoundary
      fallback={<StepNotFound />}
      onError={(error) => {
        if (import.meta.env.DEV) {
          console.error(`[FundSetup] Error in step ${key}:`, error);
        }
        // Emit telemetry on error
        emitWizard({ 
          type: "wizard_error", 
          step: key, 
          message: String(error),
          stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined
        });
      }}
    >
      <div data-testid={`wizard-step-${key}-container`}>
        <Step />
      </div>
    </ErrorBoundary>
  );
}