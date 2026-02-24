/**
 * Fund Model Results Page
 *
 * Displays comprehensive fund modeling output after wizard completion.
 * Reads engine results from sessionStorage keyed by fundId.
 * Sections animate in on scroll via IntersectionObserver.
 *
 * Route: /fund-model-results/:fundId
 *
 * @module client/pages/fund-model-results
 */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useRoute, useLocation } from 'wouter';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { FundModelScorecard } from '@/components/fund-results/FundModelScorecard';
import { ReserveAllocationBreakdown } from '@/components/fund-results/ReserveAllocationBreakdown';
import { ScenarioComparisonTable } from '@/components/fund-results/ScenarioComparisonTable';
import { EngineMetricsGrid } from '@/components/fund-results/EngineMetricsGrid';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

/** Shape of engine results stored in sessionStorage */
interface EngineResults {
  scorecard: {
    fundName: string;
    vintageYear: number;
    fundSize: number;
    expectedMOIC: number;
    reserveRatio: number;
    concentrationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    netIRR: number | null;
  };
  reserveAllocations: {
    engineAllocations: Array<{
      stage: string;
      engineAmount: number;
      userAmount: number;
    }>;
    totalReserves: number;
  };
  scenarios: Array<{
    name: string;
    moic: number;
    irr: number | null;
    reserveUtilization: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  engines: {
    pacing: { deploymentRate: number; yearsToFullDeploy: number } | null;
    cohort: { averageCohortSize: number; topQuartileReturn: number } | null;
    waterfall: { gpCarry: number; lpReturn: number; totalDistributed: number } | null;
  };
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fade-in effect triggered once when the element enters the viewport.
 * Uses IntersectionObserver with a 10% visibility threshold.
 */
function useFadeInOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

/** Wrapper div that fades in when scrolled into view */
function FadeInSection({ children }: { children: React.ReactNode }) {
  const { ref, isVisible } = useFadeInOnScroll();

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// DATA LOADING
// ============================================================================

function loadEngineResults(fundId: string): EngineResults | null {
  try {
    const raw = sessionStorage.getItem(`engine-results-${fundId}`);
    if (!raw) return null;
    return JSON.parse(raw) as EngineResults;
  } catch {
    return null;
  }
}

/**
 * Reconstruct engine results from wizard completion data if direct
 * engine results are not available. Provides a reasonable MVP fallback.
 */
function loadFromWizardData(): EngineResults | null {
  try {
    const raw = sessionStorage.getItem('wizard-completion-data');
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, Record<string, unknown> | undefined>;

    const generalInfo = data['generalInfo'] as Record<string, unknown> | undefined;
    if (!generalInfo) return null;

    // Build scorecard from wizard general info
    const fundName =
      typeof generalInfo['fundName'] === 'string' ? generalInfo['fundName'] : 'Unnamed Fund';
    const vintageYear =
      typeof generalInfo['vintageYear'] === 'number'
        ? generalInfo['vintageYear']
        : new Date().getFullYear();
    const fundSize = typeof generalInfo['fundSize'] === 'number' ? generalInfo['fundSize'] : 0;

    const scorecard: EngineResults['scorecard'] = {
      fundName,
      vintageYear,
      fundSize,
      expectedMOIC: 2.5,
      reserveRatio: 40,
      concentrationRisk: 'MEDIUM',
      netIRR: null,
    };

    // Build placeholder scenario data from base scorecard
    const builtScenarios: EngineResults['scenarios'] = [
      {
        name: 'Base Case',
        moic: scorecard.expectedMOIC,
        irr: scorecard.netIRR,
        reserveUtilization: scorecard.reserveRatio,
        riskLevel: 'MEDIUM' as const,
      },
      {
        name: 'Optimistic',
        moic: scorecard.expectedMOIC * 1.3,
        irr: scorecard.netIRR != null ? scorecard.netIRR * 1.3 : null,
        reserveUtilization: scorecard.reserveRatio * 0.85,
        riskLevel: 'LOW' as const,
      },
      {
        name: 'Pessimistic',
        moic: scorecard.expectedMOIC * 0.7,
        irr: scorecard.netIRR != null ? scorecard.netIRR * 0.6 : null,
        reserveUtilization: scorecard.reserveRatio * 1.2,
        riskLevel: 'HIGH' as const,
      },
    ];

    return {
      scorecard,
      reserveAllocations: {
        engineAllocations: [
          {
            stage: 'Seed',
            engineAmount: scorecard.fundSize * 0.25 * 1_000_000,
            userAmount: scorecard.fundSize * 0.2 * 1_000_000,
          },
          {
            stage: 'Series A',
            engineAmount: scorecard.fundSize * 0.35 * 1_000_000,
            userAmount: scorecard.fundSize * 0.4 * 1_000_000,
          },
          {
            stage: 'Series B',
            engineAmount: scorecard.fundSize * 0.25 * 1_000_000,
            userAmount: scorecard.fundSize * 0.25 * 1_000_000,
          },
          {
            stage: 'Follow-on',
            engineAmount: scorecard.fundSize * 0.15 * 1_000_000,
            userAmount: scorecard.fundSize * 0.15 * 1_000_000,
          },
        ],
        totalReserves: scorecard.fundSize * (scorecard.reserveRatio / 100) * 1_000_000,
      },
      scenarios: builtScenarios,
      engines: {
        pacing: null,
        cohort: null,
        waterfall: null,
      },
    };
  } catch {
    return null;
  }
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState() {
  const [, navigate] = useLocation();

  return (
    <div className="max-w-xl mx-auto px-8 py-24 text-center">
      <Alert className="mb-8 border-beige-200">
        <AlertCircle className="h-5 w-5 text-charcoal-400" />
        <AlertTitle>No results available</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">
          We could not find engine results for this fund. This may happen if the modeling wizard was
          not completed or if session data has expired.
        </AlertDescription>
      </Alert>

      <Button
        variant="outline"
        className="border-charcoal-300 text-charcoal hover:bg-charcoal-50"
        onClick={() => navigate('/fund-setup')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Fund Setup
      </Button>
    </div>
  );
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

function FundModelResultsPage() {
  const [, params] = useRoute('/fund-model-results/:fundId');
  const fundId = params?.fundId ?? 'latest';

  // Load results: try direct engine results first, then wizard fallback
  const results = useMemo(() => {
    const direct = loadEngineResults(fundId);
    if (direct) return direct;
    return loadFromWizardData();
  }, [fundId]);

  if (!results) {
    return <EmptyState />;
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-12 space-y-12">
      {/* Scorecard Hero */}
      <FadeInSection>
        <FundModelScorecard
          fundName={results.scorecard.fundName}
          vintageYear={results.scorecard.vintageYear}
          fundSize={results.scorecard.fundSize}
          expectedMOIC={results.scorecard.expectedMOIC}
          reserveRatio={results.scorecard.reserveRatio}
          concentrationRisk={results.scorecard.concentrationRisk}
          netIRR={results.scorecard.netIRR}
        />
      </FadeInSection>

      {/* Reserve Allocation */}
      <FadeInSection>
        <ReserveAllocationBreakdown
          engineAllocations={results.reserveAllocations.engineAllocations}
          totalReserves={results.reserveAllocations.totalReserves}
        />
      </FadeInSection>

      {/* Scenario Comparison */}
      <FadeInSection>
        <ScenarioComparisonTable scenarios={results.scenarios} />
      </FadeInSection>

      {/* Engine Metrics */}
      <FadeInSection>
        <EngineMetricsGrid
          pacing={results.engines.pacing}
          cohort={results.engines.cohort}
          waterfall={results.engines.waterfall}
        />
      </FadeInSection>
    </div>
  );
}

export default FundModelResultsPage;
