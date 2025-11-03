/**
 * Deprecation Headers Middleware for Stage Validation
 *
 * Express middleware for setting HTTP headers during shadow mode and migration periods.
 * Enables gradual rollout of stage validation with observability and client warnings.
 *
 * Key Headers:
 * - X-Stage-Warning: Informational warning for validation failures in warn mode
 * - X-Stage-Would-Reject: Shadow mode indicator (would reject in enforce mode)
 * - X-Stage-Mode: Current validation mode (off | warn | enforce)
 * - X-Stage-Unknown-Count: Count of unknown stages in request
 *
 * @module server/middleware/deprecation-headers
 * @version 3.4.0
 */

import type { Response } from 'express';

/**
 * Validation mode type
 */
export type ValidationMode = 'off' | 'warn' | 'enforce';

/**
 * Stage warning details
 */
export interface StageWarning {
  message: string;
  stage?: string;
  canonical?: string;
}

/**
 * Set stage warning header for failed validation
 *
 * Used in 'warn' mode to inform clients of validation failures without rejecting requests.
 * The header contains a JSON-encoded warning object with details about the validation failure.
 *
 * @param res Express response object
 * @param warning Warning details (message, stage, canonical)
 *
 * @example
 * if (mode === 'warn' && !result.ok) {
 *   setStageWarningHeaders(res, {
 *     message: 'Unknown stage',
 *     stage: 'late-stage',
 *     canonical: 'pre-seed, seed, series-a, series-b, series-c, series-c+'
 *   });
 * }
 */
export function setStageWarningHeaders(res: Response, warning: StageWarning): void {
  // Set warning header with JSON-encoded details
  res['setHeader']('X-Stage-Warning', JSON.stringify(warning));

  // Set individual headers for easier parsing
  if (warning.stage) {
    res['setHeader']('X-Stage-Unknown', warning.stage);
  }

  if (warning.canonical) {
    res['setHeader']('X-Stage-Canonical', warning.canonical);
  }
}

/**
 * Set shadow mode header to indicate request would be rejected in enforce mode
 *
 * Used to track and measure impact before enabling enforcement.
 * Clients can detect this header and log/alert on potential future failures.
 *
 * @param res Express response object
 * @param reason Rejection reason (what would fail in enforce mode)
 *
 * @example
 * if (mode === 'warn' && !result.ok) {
 *   setShadowModeHeader(res, 'Unknown stage: late-stage');
 * }
 */
export function setShadowModeHeader(res: Response, reason: string): void {
  res['setHeader']('X-Stage-Would-Reject', 'true');
  res['setHeader']('X-Stage-Rejection-Reason', reason);
}

/**
 * Set current validation mode header
 *
 * Informs clients of the current validation mode for debugging and metrics.
 *
 * @param res Express response object
 * @param mode Current validation mode (off | warn | enforce)
 *
 * @example
 * setValidationModeHeader(res, mode);
 */
export function setValidationModeHeader(res: Response, mode: ValidationMode): void {
  res['setHeader']('X-Stage-Mode', mode);
}

/**
 * Set unknown stage count header
 *
 * Reports the number of unknown stages encountered in the request.
 * Useful for batch operations and distribution validation.
 *
 * @param res Express response object
 * @param count Number of unknown stages
 *
 * @example
 * if (errors.filter(e => e.kind === 'UnknownStage').length > 0) {
 *   setUnknownStageCountHeader(res, unknownCount);
 * }
 */
export function setUnknownStageCountHeader(res: Response, count: number): void {
  res['setHeader']('X-Stage-Unknown-Count', String(count));
}

/**
 * Set all deprecation headers for a validation result
 *
 * Convenience function that sets all appropriate headers based on validation outcome.
 * Automatically handles mode-specific logic (warn vs enforce).
 *
 * @param res Express response object
 * @param mode Current validation mode
 * @param result Validation result (with ok flag and optional errors)
 *
 * @example
 * const result = normalizeInvestmentStage(stage);
 * setDeprecationHeaders(res, mode, result);
 */
export function setDeprecationHeaders(
  res: Response,
  mode: ValidationMode,
  result: { ok: boolean; error?: { kind: string; original: string; canonical?: string } }
): void {
  // Always set mode header
  setValidationModeHeader(res, mode);

  // If validation failed, set warning headers
  if (!result.ok && result.error) {
    const warning: StageWarning = {
      message: `${result.error.kind}: ${result.error.original}`,
      stage: result.error.original,
      ...(result.error.canonical !== undefined && { canonical: result.error.canonical }),
    };

    // In warn mode, set warning headers without rejecting
    if (mode === 'warn') {
      setStageWarningHeaders(res, warning);
      setShadowModeHeader(res, warning.message);
    }

    // In enforce mode, warning headers still useful for logging
    if (mode === 'enforce') {
      setStageWarningHeaders(res, warning);
    }
  }
}

/**
 * Set headers for distribution validation errors
 *
 * Handles multiple validation errors from parseStageDistribution.
 * Groups errors by kind and sets appropriate headers.
 *
 * @param res Express response object
 * @param mode Current validation mode
 * @param errors Array of validation errors
 *
 * @example
 * const result = parseStageDistribution(entries);
 * if (!result.ok) {
 *   setDistributionErrorHeaders(res, mode, result.errors);
 * }
 */
export function setDistributionErrorHeaders(
  res: Response,
  mode: ValidationMode,
  errors: Array<{
    kind: 'UnknownStage' | 'InvalidWeight' | 'InvalidSum' | 'EmptyDistribution';
    message: string;
    stage?: string;
  }>
): void {
  // Set mode header
  setValidationModeHeader(res, mode);

  // Count unknown stages
  const unknownStages = errors.filter((e) => e.kind === 'UnknownStage');
  if (unknownStages.length > 0) {
    setUnknownStageCountHeader(res, unknownStages.length);
  }

  // Set composite warning with all error messages
  const warning: StageWarning = {
    message: errors.map((e) => e.message).join('; '),
  };

  if (mode === 'warn') {
    setStageWarningHeaders(res, warning);
    setShadowModeHeader(res, warning.message);
  }

  if (mode === 'enforce') {
    setStageWarningHeaders(res, warning);
  }
}

/**
 * Clear all stage validation headers
 *
 * Utility function to clear headers set by previous middleware.
 * Useful for testing and conditional header application.
 *
 * @param res Express response object
 */
export function clearStageHeaders(res: Response): void {
  res['removeHeader']('X-Stage-Warning');
  res['removeHeader']('X-Stage-Unknown');
  res['removeHeader']('X-Stage-Canonical');
  res['removeHeader']('X-Stage-Would-Reject');
  res['removeHeader']('X-Stage-Rejection-Reason');
  res['removeHeader']('X-Stage-Mode');
  res['removeHeader']('X-Stage-Unknown-Count');
}

/**
 * Express middleware factory: Set validation mode header for all responses
 *
 * @param mode Validation mode (or function to determine mode)
 * @returns Express middleware function
 *
 * @example
 * app.use(stageValidationMiddleware('warn'));
 *
 * @example
 * app.use(stageValidationMiddleware(async () => {
 *   return await getStageValidationMode();
 * }));
 */
export function stageValidationMiddleware(
  mode: ValidationMode | (() => ValidationMode | Promise<ValidationMode>)
) {
  return async (_req: unknown, res: Response, next: () => void) => {
    try {
      const resolvedMode = typeof mode === 'function' ? await mode() : mode;
      setValidationModeHeader(res, resolvedMode);
      next();
    } catch {
      // If mode resolution fails, default to 'off' and continue
      setValidationModeHeader(res, 'off');
      next();
    }
  };
}
