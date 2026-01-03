// Wizard validation guardrails for fund setup
// Implements the exact LP-credible constraints mentioned in the strategy

import type { FundModelWire } from '@shared/fund-wire-schema';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  canSave: boolean; // Can save with warnings, but not with errors
}

/**
 * Primary validation function for fund setup wizard
 * Implements all the LP-credible constraints and business rules
 */
export function validateFundSetup(fundData: Partial<FundModelWire>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Basic fund information validation
  validateBasicInfo(fundData, errors, warnings);

  // Investment strategy validation
  if (fundData.state?.investmentStrategy) {
    validateInvestmentStrategy(fundData.state.investmentStrategy, errors, warnings);
  }

  // Fee structure validation
  if (fundData.state?.fees) {
    validateFeeStructure(fundData.state.fees, errors, warnings);
  }

  // Fund structure validation
  validateFundStructure(fundData, errors, warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    canSave: errors.length === 0 // Can save with warnings
  };
}

/**
 * Validate basic fund information
 */
function validateBasicInfo(
  fundData: Partial<FundModelWire>,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  // Fund name validation
  if (!fundData.name || fundData.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Fund name is required',
      severity: 'error',
      code: 'REQUIRED_FIELD'
    });
  } else if (fundData.name.length > 100) {
    warnings.push({
      field: 'name',
      message: 'Fund name is quite long. Consider shortening for clarity.',
      severity: 'warning',
      code: 'LONG_NAME'
    });
  }

  // Capital commitment validation
  const commitment = fundData.state?.capital?.totalCommitment;
  if (!commitment || commitment <= 0) {
    errors.push({
      field: 'capital.totalCommitment',
      message: 'Total commitment must be positive',
      severity: 'error',
      code: 'INVALID_COMMITMENT'
    });
  } else {
    if (commitment < 1_000_000) {
      warnings.push({
        field: 'capital.totalCommitment',
        message: 'Fund size under $1M is unusually small for institutional funds',
        severity: 'warning',
        code: 'SMALL_FUND'
      });
    }
    if (commitment > 10_000_000_000) {
      warnings.push({
        field: 'capital.totalCommitment',
        message: 'Fund size over $10B is unusually large. Please verify.',
        severity: 'warning',
        code: 'LARGE_FUND'
      });
    }
  }
}

/**
 * Validate investment strategy with stage constraints
 */
function validateInvestmentStrategy(
  strategy: FundModelWire['state']['investmentStrategy'],
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  // Validate allocations sum to 100%
  const totalAllocation = strategy.allocations.reduce((sum, alloc) => sum + alloc.percentage, 0);
  if (Math.abs(totalAllocation - 100) > 0.01) {
    errors.push({
      field: 'investmentStrategy.allocations',
      message: `Allocations must sum to 100% (currently ${totalAllocation.toFixed(1)}%)`,
      severity: 'error',
      code: 'ALLOCATION_SUM'
    });
  }

  // Validate stage constraints: graduation% + exit% ≤ 100%
  strategy.stages.forEach((stage, index) => {
    const total = stage.graduationRate + stage.exitRate;
    if (total > 100.01) { // Small tolerance for floating point
      errors.push({
        field: `investmentStrategy.stages[${index}]`,
        message: `${stage.name}: graduation rate (${stage.graduationRate}%) + exit rate (${stage.exitRate}%) cannot exceed 100%`,
        severity: 'error',
        code: 'STAGE_RATE_EXCEEDED'
      });
    }

    // Graduation rate validation
    if (stage.graduationRate < 0 || stage.graduationRate > 100) {
      errors.push({
        field: `investmentStrategy.stages[${index}].graduationRate`,
        message: `${stage.name}: graduation rate must be between 0% and 100%`,
        severity: 'error',
        code: 'INVALID_GRADUATION_RATE'
      });
    }

    // Exit rate validation
    if (stage.exitRate < 0 || stage.exitRate > 100) {
      errors.push({
        field: `investmentStrategy.stages[${index}].exitRate`,
        message: `${stage.name}: exit rate must be between 0% and 100%`,
        severity: 'error',
        code: 'INVALID_EXIT_RATE'
      });
    }
  });

  // Last stage graduation rate must be 0
  if (strategy.stages.length > 0) {
    const lastStage = strategy.stages[strategy.stages.length - 1];
    if (lastStage && lastStage.graduationRate > 0) {
      errors.push({
        field: `investmentStrategy.stages[${strategy.stages.length - 1}].graduationRate`,
        message: `${lastStage.name} (final stage) must have graduation rate of 0%`,
        severity: 'error',
        code: 'LAST_STAGE_GRADUATION'
      });
    }
  }

  // Warn about unusual allocation patterns
  strategy.allocations.forEach((alloc, index) => {
    if (alloc.percentage > 60) {
      warnings.push({
        field: `investmentStrategy.allocations[${index}]`,
        message: `${alloc.category}: allocation over 60% is unusually concentrated`,
        severity: 'warning',
        code: 'HIGH_CONCENTRATION'
      });
    }
    if (alloc.percentage > 0 && alloc.percentage < 5) {
      warnings.push({
        field: `investmentStrategy.allocations[${index}]`,
        message: `${alloc.category}: allocation under 5% may not provide sufficient diversification`,
        severity: 'warning',
        code: 'LOW_ALLOCATION'
      });
    }
  });
}

/**
 * Validate fee structure with committed-basis constraints
 */
function validateFeeStructure(
  fees: FundModelWire['state']['fees'],
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  // Management fee validation
  if (fees.managementFee < 0 || fees.managementFee > 0.05) {
    errors.push({
      field: 'fees.managementFee',
      message: 'Management fee must be between 0% and 5%',
      severity: 'error',
      code: 'INVALID_MGMT_FEE'
    });
  } else {
    if (fees.managementFee > 0.03) {
      warnings.push({
        field: 'fees.managementFee',
        message: 'Management fee over 3% is above market standards',
        severity: 'warning',
        code: 'HIGH_MGMT_FEE'
      });
    }
    if (fees.managementFee < 0.015) {
      warnings.push({
        field: 'fees.managementFee',
        message: 'Management fee under 1.5% may be unsustainable for fund operations',
        severity: 'warning',
        code: 'LOW_MGMT_FEE'
      });
    }
  }

  // Carry percentage validation
  if (fees.carryPercentage < 0 || fees.carryPercentage > 0.30) {
    errors.push({
      field: 'fees.carryPercentage',
      message: 'Carry percentage must be between 0% and 30%',
      severity: 'error',
      code: 'INVALID_CARRY'
    });
  } else {
    if (fees.carryPercentage > 0.25) {
      warnings.push({
        field: 'fees.carryPercentage',
        message: 'Carry over 25% is above typical market standards',
        severity: 'warning',
        code: 'HIGH_CARRY'
      });
    }
    if (fees.carryPercentage < 0.15) {
      warnings.push({
        field: 'fees.carryPercentage',
        message: 'Carry under 15% may not provide sufficient GP incentive alignment',
        severity: 'warning',
        code: 'LOW_CARRY'
      });
    }
  }
}

/**
 * Validate fund structure (evergreen vs fixed term)
 */
function validateFundStructure(
  fundData: Partial<FundModelWire>,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  const termMonths = fundData.state?.foundation?.termMonths;

  // Term validation
  if (termMonths !== null && termMonths !== undefined) {
    if (termMonths <= 0) {
      errors.push({
        field: 'foundation.termMonths',
        message: 'Fund term must be positive',
        severity: 'error',
        code: 'INVALID_TERM'
      });
    } else {
      if (termMonths < 60) { // Less than 5 years
        warnings.push({
          field: 'foundation.termMonths',
          message: 'Fund term under 5 years is unusually short for VC funds',
          severity: 'warning',
          code: 'SHORT_TERM'
        });
      }
      if (termMonths > 180) { // More than 15 years
        warnings.push({
          field: 'foundation.termMonths',
          message: 'Fund term over 15 years is unusually long',
          severity: 'warning',
          code: 'LONG_TERM'
        });
      }
    }
  }
}

/**
 * Real-time validation for form fields
 * Returns immediate feedback for user input
 */
export function validateField(
  fieldPath: string,
  value: unknown,
  fullData?: Partial<FundModelWire>
): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (fieldPath) {
    case 'name':
      if (!value || value.trim().length === 0) {
        errors.push({
          field: fieldPath,
          message: 'Fund name is required',
          severity: 'error',
          code: 'REQUIRED_FIELD'
        });
      }
      break;

    case 'capital.totalCommitment':
      if (!value || value <= 0) {
        errors.push({
          field: fieldPath,
          message: 'Total commitment must be positive',
          severity: 'error',
          code: 'INVALID_COMMITMENT'
        });
      }
      break;

    case 'fees.managementFee':
      if (value < 0 || value > 0.05) {
        errors.push({
          field: fieldPath,
          message: 'Management fee must be between 0% and 5%',
          severity: 'error',
          code: 'INVALID_MGMT_FEE'
        });
      }
      break;

    case 'fees.carryPercentage':
      if (value < 0 || value > 0.30) {
        errors.push({
          field: fieldPath,
          message: 'Carry percentage must be between 0% and 30%',
          severity: 'error',
          code: 'INVALID_CARRY'
        });
      }
      break;
  }

  return errors;
}

/**
 * Check if form can be saved based on validation state
 */
export function canSaveForm(validationResult: ValidationResult): boolean {
  return validationResult.errors.length === 0;
}

/**
 * Format validation errors for display
 */
export function formatValidationMessage(error: ValidationError): string {
  return error.message;
}

/**
 * Demo-safe validation wrapper
 * Never throws errors, always returns a valid result
 */
export function validateFundSetupSafe(fundData: unknown): ValidationResult {
  try {
    return validateFundSetup(fundData as Partial<FundModelWire>);
  } catch (error) {
    console.error('Validation error:', error);
    return {
      isValid: false,
      errors: [{
        field: 'general',
        message: 'Validation failed due to unexpected error. Please check your inputs.',
        severity: 'error',
        code: 'VALIDATION_ERROR'
      }],
      warnings: [],
      canSave: false
    };
  }
}