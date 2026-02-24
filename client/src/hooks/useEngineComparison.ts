/**
 * Hook for DeterministicReserveEngine integration with wizard
 *
 * Runs engine comparison behind ENABLE_ENGINE_INTEGRATION feature flag.
 * Debounces inputs to avoid excessive recalculation on every keystroke.
 *
 * @module useEngineComparison
 */

import React from 'react';
import { FLAGS } from '@/core/flags/featureFlags';
import type { ModelingWizardContext } from '@/machines/modeling-wizard.machine';
import type { SectorProfile, CapitalAllocationOutput } from '@/schemas/modeling-wizard.schemas';
import type { ReserveCalculationResult } from '@shared/schemas/reserves-schemas';
import { calculateEngineComparison } from '@/lib/wizard-reserve-bridge';

export interface EngineComparisonState {
  /** Engine calculation result (null if not yet computed or flag off) */
  result: ReserveCalculationResult | null;
  /** Whether engine is currently calculating */
  isCalculating: boolean;
  /** Error from last engine run (null if none) */
  error: string | null;
  /** Whether engine integration is enabled */
  isEnabled: boolean;
  /** Trigger a manual recalculation */
  recalculate: () => void;
}

interface UseEngineComparisonOptions {
  wizardContext: ModelingWizardContext;
  sectorProfiles: SectorProfile[];
  capitalAllocation: CapitalAllocationOutput | null;
  /** Debounce delay in ms (default 800) */
  debounceMs?: number;
}

export function useEngineComparison({
  wizardContext,
  sectorProfiles,
  capitalAllocation,
  debounceMs = 800,
}: UseEngineComparisonOptions): EngineComparisonState {
  const isEnabled = FLAGS.ENABLE_ENGINE_INTEGRATION;
  const [result, setResult] = React.useState<ReserveCalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Track latest request to discard stale results
  const requestIdRef = React.useRef(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const runCalculation = React.useCallback(async () => {
    if (!isEnabled) return;
    if (!capitalAllocation?.followOnStrategy?.stageAllocations?.length) return;
    if (!sectorProfiles.length) return;
    if (!wizardContext.steps.generalInfo) return;

    const currentId = ++requestIdRef.current;
    setIsCalculating(true);
    setError(null);

    try {
      const engineResult = await calculateEngineComparison(
        wizardContext,
        sectorProfiles,
        capitalAllocation
      );

      // Only apply if this is still the latest request
      if (currentId === requestIdRef.current) {
        setResult(engineResult);
      }
    } catch (err) {
      if (currentId === requestIdRef.current) {
        const message = err instanceof Error ? err.message : 'Engine calculation failed';
        setError(message);
        console.error('[useEngineComparison] Engine error:', err);
      }
    } finally {
      if (currentId === requestIdRef.current) {
        setIsCalculating(false);
      }
    }
  }, [isEnabled, wizardContext, sectorProfiles, capitalAllocation]);

  // Debounced auto-run when inputs change
  React.useEffect(() => {
    if (!isEnabled) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      runCalculation();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isEnabled, runCalculation, debounceMs]);

  return {
    result,
    isCalculating,
    error,
    isEnabled,
    recalculate: runCalculation,
  };
}
