/**
 * Wizard Calculations Hook
 *
 * Provides reactive validation, summary, and enriched metrics for the modeling wizard.
 * Optimized with specific useMemo dependencies to prevent unnecessary recalculations.
 */

import { useMemo } from 'react';
import {
  validateWizardPortfolio,
  enrichWizardMetrics,
  generatePortfolioSummary,
  type WizardPortfolioCompany,
  type PortfolioValidationResult,
  type PortfolioSummary,
  type EnrichedReserveAllocation
} from '@/lib/wizard-calculations';
import type { ModelingWizardContext } from '@/machines/modeling-wizard.machine';

/**
 * Hook for wizard calculation operations
 * Provides validation, summary, and reserve calculation helpers
 *
 * @param portfolio - Array of portfolio companies
 * @param wizardContext - Strongly-typed wizard machine context (NO ANY!)
 */
export function useWizardCalculations(
  portfolio: WizardPortfolioCompany[],
  wizardContext: ModelingWizardContext | undefined
) {
  // Portfolio validation (recalculates when portfolio changes)
  const validation: PortfolioValidationResult = useMemo(
    () => validateWizardPortfolio(portfolio),
    [portfolio]
  );

  // Portfolio summary (recalculates when portfolio changes)
  const summary: PortfolioSummary = useMemo(
    () => generatePortfolioSummary(portfolio),
    [portfolio]
  );

  // Get enriched metrics if reserves are calculated
  // OPTIMIZED: Specific dependencies - not entire context!
  const reserveAllocation = wizardContext?.calculations?.reserves;
  const generalInfo = wizardContext?.steps?.generalInfo;
  const capitalAllocation = wizardContext?.steps?.capitalAllocation;

  const enrichedMetrics: EnrichedReserveAllocation | null = useMemo(() => {
    if (!reserveAllocation || !wizardContext) return null;

    return enrichWizardMetrics(reserveAllocation, wizardContext);
  }, [
    reserveAllocation,
    generalInfo,
    capitalAllocation
  ]);

  // Check if portfolio is ready for calculation
  const isReadyForCalculation = useMemo(() => {
    return (
      validation.valid &&
      portfolio.length > 0 &&
      generalInfo != null &&
      capitalAllocation != null
    );
  }, [
    validation.valid,
    portfolio.length,
    generalInfo,
    capitalAllocation
  ]);

  return {
    // Validation
    validation,
    isValid: validation.valid,
    hasErrors: validation.errors.length > 0,
    hasWarnings: validation.warnings.length > 0,

    // Summary
    summary,

    // Enriched metrics (if calculated)
    enrichedMetrics,

    // Calculation readiness
    isReadyForCalculation,

    // Reserve results (if available)
    reserveAllocation,
    hasReserves: !!reserveAllocation
  };
}
