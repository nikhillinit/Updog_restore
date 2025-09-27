import React from 'react';
import { useLocation } from 'wouter';
import FundBasicsStep from './FundBasicsStep';
import CapitalStructureStep from './CapitalStructureStep';
import InvestmentStrategyStep from './InvestmentStrategyStep';
import InvestmentStrategyStepNew from './InvestmentStrategyStepNew';
import DistributionsStep from './DistributionsStep';
import StepNotFound from './steps/StepNotFound';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { resolveStepKeyFromLocation, type StepKey, getStepNumber } from './fund-setup-utils';
import { emitWizard } from '@/lib/wizard-telemetry';

// Feature flag for new selector pattern migration
const useNewSelectors = import.meta.env['VITE_NEW_SELECTORS'] === 'true';

const STEP_COMPONENTS: Record<StepKey, React.ComponentType<any>> = {
  'fund-basics':        FundBasicsStep,
  'capital-structure':  CapitalStructureStep,
  'investment-strategy': useNewSelectors ? InvestmentStrategyStepNew : InvestmentStrategyStep,
  'distributions':      DistributionsStep,
  'not-found':          StepNotFound,
};

function useStepKey(): StepKey {
  const [loc] = useLocation();
  
  // Use window location for query params since wouter doesn't track them reliably
  const [search, setSearch] = React.useState(window.location.search);
  
  // Listen for popstate events to update search params
  React.useEffect(() => {
    const handlePopState = () => {
      setSearch(window.location.search);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  
  // Update search when location changes or manually check periodically in dev
  React.useEffect(() => {
    setSearch(window.location.search);
    
    // In dev, also poll for URL changes as a fallback
    if (import.meta.env.DEV) {
      const interval = setInterval(() => {
        const currentSearch = window.location.search;
        if (currentSearch !== search) {
          console.log(`[useStepKey] Polling detected search change: '${search}' -> '${currentSearch}'`);
          setSearch(currentSearch);
        }
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [loc, search]);
  
  // Debug: log every time this hook runs
  if (import.meta.env.DEV) {
    console.log(`[useStepKey] Hook called, loc='${loc}', search='${search}', window.location='${window.location.pathname}${window.location.search}'`);
  }
  
  return React.useMemo<StepKey>(() => {
    const fullLocation = window.location.pathname + search;
    const key = resolveStepKeyFromLocation(fullLocation);
    
    // Debug logging
    if (import.meta.env.DEV) {
      const stepParam = new URLSearchParams(search).get('step');
      console.log(`[FundSetup Debug] fullLocation='${fullLocation}', stepParam='${stepParam}', resolved key='${key}'`);
    }
    
    if (key === 'not-found' && import.meta.env.DEV) {
      const val = new URLSearchParams(search).get('step');
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
      <div
        data-testid="fund-setup-wizard"
        className="wizard-container"
      >
        <div data-testid="step-indicator" className="step-indicator mb-4">
          Step {key !== 'not-found' ? getStepNumber(key) : '?'} of 4
        </div>
        <div data-testid={`wizard-step-${key}-container`}>
          <Step />
        </div>
      </div>
    </ErrorBoundary>
  );
}