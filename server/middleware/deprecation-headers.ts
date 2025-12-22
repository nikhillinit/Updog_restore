/**
 * Deprecation Headers Middleware
 *
 * Sets HTTP headers to warn clients about deprecated stage names
 * or other validation issues that didn't block the request.
 */

import type { Response } from 'express';

/**
 * Set warning headers for unknown/deprecated stage names
 * @param res - Express response object
 * @param invalidStages - List of stage names that weren't recognized
 */
export function setStageWarningHeaders(res: Response, invalidStages: string[]): void {
  if (invalidStages.length === 0) return;

  // Standard Deprecation header (RFC 8594)
  res.setHeader('Deprecation', 'true');

  // Custom header with specific invalid stages
  res.setHeader('X-Stage-Warning', `Unknown stages: ${invalidStages.join(', ')}`);

  // Sunset header indicating when strict enforcement will begin
  // Set to 90 days from now as a rolling window
  const sunsetDate = new Date();
  sunsetDate.setDate(sunsetDate.getDate() + 90);
  res.setHeader('Sunset', sunsetDate.toUTCString());

  // Link to documentation about valid stage names
  res.setHeader(
    'Link',
    '</api/docs/stages>; rel="deprecation"; type="text/html"'
  );
}

/**
 * Set warning headers for any validation issues that didn't block the request
 * @param res - Express response object
 * @param warnings - List of warning messages
 */
export function setValidationWarningHeaders(res: Response, warnings: string[]): void {
  if (warnings.length === 0) return;

  res.setHeader('X-Validation-Warnings', warnings.join('; '));
}
