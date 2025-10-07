/**
 * React hook for capital allocation calculations
 *
 * Provides real-time calculated values and validation for capital allocation step.
 * Integrates with wizard context to access fund financials and sector profiles.
 *
 * @module useCapitalAllocationCalculations
 */

import React from 'react';
import {
  calculateCapitalAllocation,
  validateCapitalAllocation,
  type CapitalAllocationCalculations,
  type ValidationResult
} from '@/lib/capital-allocation-calculations';
import type {
  CapitalAllocationInput,
  SectorProfile,
  FundFinancialsOutput
} from '@/schemas/modeling-wizard.schemas';

// ============================================================================
// HOOK INTERFACE
// ============================================================================

export interface UseCapitalAllocationCalculationsOptions {
  /** Capital allocation form values */
  formValues: CapitalAllocationInput;

  /** Fund financials from previous step */
  fundFinancials: FundFinancialsOutput;

  /** Sector profiles from previous step */
  sectorProfiles: SectorProfile[];

  /** Vintage year for date calculations */
  vintageYear?: number;
}

export interface UseCapitalAllocationCalculationsResult {
  /** All calculated metrics */
  calculations: CapitalAllocationCalculations;

  /** Validation results */
  validation: ValidationResult;

  /** Is calculation complete and valid? */
  isValid: boolean;

  /** Are there any errors? */
  hasErrors: boolean;

  /** Are there any warnings? */
  hasWarnings: boolean;

  /** Loading state (for async operations) */
  isLoading: boolean;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook to calculate capital allocation metrics in real-time
 *
 * Memoizes calculations to avoid unnecessary recomputation on every render.
 * Updates automatically when form values or dependencies change.
 *
 * @example
 * ```typescript
 * function CapitalAllocationStep() {
 *   const form = useForm<CapitalAllocationInput>();
 *   const { fundFinancials, sectorProfiles } = useWizardContext();
 *
 *   const { calculations, validation, isValid } = useCapitalAllocationCalculations({
 *     formValues: form.watch(),
 *     fundFinancials,
 *     sectorProfiles
 *   });
 *
 *   return (
 *     <div>
 *       <p>Estimated deals: {calculations.estimatedDeals}</p>
 *       {!isValid && <Alert variant="error">{validation.errors[0]?.message}</Alert>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useCapitalAllocationCalculations(
  options: UseCapitalAllocationCalculationsOptions
): UseCapitalAllocationCalculationsResult {
  const {
    formValues,
    fundFinancials,
    sectorProfiles,
    vintageYear = new Date().getFullYear()
  } = options;

  // Loading state (for future async operations)
  const [isLoading] = React.useState(false);

  // Memoized calculations
  const calculations = React.useMemo(() => {
    try {
      return calculateCapitalAllocation(
        formValues,
        sectorProfiles,
        fundFinancials.fundSize,
        fundFinancials.investmentPeriod,
        vintageYear
      );
    } catch (error) {
      // Return safe defaults on error
      console.error('Capital allocation calculation error:', error);
      return {
        avgRoundSize: 0,
        impliedOwnership: 0,
        estimatedDeals: 0,
        initialCapitalAllocated: 0,
        followOnAllocations: [],
        totalFollowOnCapital: 0,
        totalCapitalAllocated: 0,
        availableReserves: 0,
        remainingCapital: fundFinancials.fundSize,
        pacingSchedule: []
      };
    }
  }, [
    formValues,
    sectorProfiles,
    fundFinancials.fundSize,
    fundFinancials.investmentPeriod,
    vintageYear
  ]);

  // Memoized validation
  const validation = React.useMemo(() => {
    try {
      return validateCapitalAllocation(calculations, fundFinancials.fundSize);
    } catch (error) {
      console.error('Capital allocation validation error:', error);
      return {
        isValid: false,
        errors: [
          {
            field: 'general',
            message: 'Unable to validate capital allocation. Please check your inputs.'
          }
        ],
        warnings: []
      };
    }
  }, [calculations, fundFinancials.fundSize]);

  // Derived state
  const isValid = validation.isValid;
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = validation.warnings.length > 0;

  return {
    calculations,
    validation,
    isValid,
    hasErrors,
    hasWarnings,
    isLoading
  };
}

// ============================================================================
// HELPER HOOKS
// ============================================================================

/**
 * Hook to get capital allocation summary for display
 *
 * Provides formatted summary metrics for quick display in UI.
 */
export function useCapitalAllocationSummary(
  calculations: CapitalAllocationCalculations
) {
  return React.useMemo(() => {
    const deploymentPercentage =
      (calculations.totalCapitalAllocated /
        (calculations.totalCapitalAllocated + calculations.remainingCapital)) *
      100;

    const reserveUtilization =
      calculations.availableReserves > 0
        ? (calculations.totalFollowOnCapital / calculations.availableReserves) * 100
        : 0;

    return {
      deploymentPercentage,
      reserveUtilization,
      initialVsFollowOn:
        calculations.initialCapitalAllocated > 0
          ? calculations.totalFollowOnCapital / calculations.initialCapitalAllocated
          : 0,
      avgFollowOnPerDeal:
        calculations.estimatedDeals > 0
          ? calculations.totalFollowOnCapital / calculations.estimatedDeals
          : 0
    };
  }, [calculations]);
}
