/**
 * React hook for exit recycling calculations
 *
 * Provides real-time calculated values and validation for exit recycling step.
 * Calculates recycling capacity, schedules, and extended investment capacity.
 *
 * @module useExitRecyclingCalculations
 */

import React from 'react';
import {
  calculateExitRecycling,
  validateExitRecycling,
  type ExitRecyclingCalculations,
  type ValidationResult,
  type ExitEvent
} from '@/lib/exit-recycling-calculations';
import type { ExitRecyclingInput } from '@/schemas/modeling-wizard.schemas';

// ============================================================================
// HOOK INTERFACE
// ============================================================================

export interface UseExitRecyclingCalculationsOptions {
  /** Exit recycling form values */
  formValues: ExitRecyclingInput;

  /** Total fund size ($M) */
  fundSize: number;

  /** Optional array of exit events for schedule modeling */
  exits?: ExitEvent[];
}

export interface UseExitRecyclingCalculationsResult {
  /** All calculated metrics */
  calculations: ExitRecyclingCalculations;

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
 * Hook to calculate exit recycling metrics in real-time
 *
 * Memoizes calculations to avoid unnecessary recomputation on every render.
 * Updates automatically when form values or dependencies change.
 *
 * @example
 * ```typescript
 * function ExitRecyclingStep() {
 *   const form = useForm<ExitRecyclingInput>();
 *   const { fundFinancials } = useWizardContext();
 *
 *   const { calculations, validation, isValid } = useExitRecyclingCalculations({
 *     formValues: form.watch(),
 *     fundSize: fundFinancials.fundSize
 *   });
 *
 *   return (
 *     <div>
 *       <p>Max recyclable: ${calculations.capacity.maxRecyclableCapital}M</p>
 *       {!isValid && <Alert variant="error">{validation.errors[0]?.message}</Alert>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useExitRecyclingCalculations(
  options: UseExitRecyclingCalculationsOptions
): UseExitRecyclingCalculationsResult {
  const { formValues, fundSize, exits } = options;

  // Loading state (for future async operations)
  const [isLoading] = React.useState(false);

  // Memoized calculations
  const calculations = React.useMemo(() => {
    try {
      return calculateExitRecycling(formValues, fundSize, exits);
    } catch (error) {
      // Return safe defaults on error
      console.error('Exit recycling calculation error:', error);
      return {
        enabled: false,
        capacity: {
          maxRecyclableCapital: 0,
          recyclingCapPercentage: 0,
          recyclingPeriodYears: 0,
          annualRecyclingCapacity: 0
        },
        extendedInvestmentCapacity: 0,
        effectiveDeploymentRate: 100
      };
    }
  }, [formValues, fundSize, exits]);

  // Memoized validation
  const validation = React.useMemo(() => {
    try {
      return validateExitRecycling(formValues, fundSize);
    } catch (error) {
      console.error('Exit recycling validation error:', error);
      return {
        isValid: false,
        errors: [
          {
            field: 'general',
            message: 'Unable to validate exit recycling. Please check your inputs.'
          }
        ],
        warnings: []
      };
    }
  }, [formValues, fundSize]);

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
 * Hook to get exit recycling summary for display
 *
 * Provides formatted summary metrics for quick display in UI.
 */
export function useExitRecyclingSummary(calculations: ExitRecyclingCalculations) {
  return React.useMemo(() => {
    if (!calculations.enabled) {
      return {
        recyclingEnabled: false,
        capacityUtilization: 0,
        extendedDeploymentYears: 0,
        effectiveMultiplier: 1.0
      };
    }

    const capacityUtilization = calculations.schedule
      ? (calculations.schedule.totalRecycled / calculations.capacity.maxRecyclableCapital) * 100
      : 0;

    // Estimate extended deployment years based on recycling capacity
    const extendedDeploymentYears =
      calculations.capacity.annualRecyclingCapacity > 0
        ? calculations.capacity.recyclingPeriodYears
        : 0;

    const effectiveMultiplier = calculations.effectiveDeploymentRate / 100;

    return {
      recyclingEnabled: true,
      capacityUtilization,
      extendedDeploymentYears,
      effectiveMultiplier
    };
  }, [calculations]);
}

/**
 * Hook to format exit recycling metrics for display
 *
 * Provides consistent formatting across UI components.
 */
export function useFormattedExitRecycling(calculations: ExitRecyclingCalculations) {
  return React.useMemo(() => {
    const formatMoney = (value: number): string => {
      if (value >= 1000) {
        return `$${(value / 1000).toFixed(2)}B`;
      }
      return `$${value.toFixed(1)}M`;
    };

    const formatPercent = (value: number): string => {
      return `${value.toFixed(1)}%`;
    };

    return {
      maxRecyclableCapital: formatMoney(calculations.capacity.maxRecyclableCapital),
      annualCapacity: formatMoney(calculations.capacity.annualRecyclingCapacity),
      extendedCapacity: formatMoney(calculations.extendedInvestmentCapacity),
      effectiveDeploymentRate: formatPercent(calculations.effectiveDeploymentRate),
      recyclingCapPercentage: formatPercent(calculations.capacity.recyclingCapPercentage),
      totalRecycled: calculations.schedule
        ? formatMoney(calculations.schedule.totalRecycled)
        : 'N/A',
      totalReturnedToLPs: calculations.schedule
        ? formatMoney(calculations.schedule.totalReturnedToLPs)
        : 'N/A'
    };
  }, [calculations]);
}
