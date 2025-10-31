/**
 * Stage Validation Startup Checks
 *
 * Validates environment configuration at application startup to fail fast
 * if critical configuration is missing or invalid.
 *
 * Called from server/bootstrap.ts before server starts accepting requests.
 */

import { logger } from '../logger';

type ValidationMode = 'off' | 'warn' | 'enforce';

interface StartupCheckResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validate STAGE_VALIDATION_MODE environment variable
 */
function validateStageValidationMode(): { valid: boolean; warning?: string } {
  const mode = process.env['STAGE_VALIDATION_MODE'];

  if (!mode) {
    return {
      valid: true,
      warning: 'STAGE_VALIDATION_MODE not set, using default: "warn"',
    };
  }

  const validModes: ValidationMode[] = ['off', 'warn', 'enforce'];
  if (!validModes.includes(mode as ValidationMode)) {
    return {
      valid: false,
      warning: `Invalid STAGE_VALIDATION_MODE="${mode}", expected one of: ${validModes.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validate ALERTMANAGER_WEBHOOK_SECRET if webhook is enabled
 */
function validateWebhookSecret(): { valid: boolean; warning?: string } {
  const secret = process.env['ALERTMANAGER_WEBHOOK_SECRET'];

  // If not set, webhook won't work but non-critical
  if (!secret) {
    return {
      valid: true,
      warning: 'ALERTMANAGER_WEBHOOK_SECRET not set, auto-downgrade webhook disabled',
    };
  }

  // Enforce minimum length for security (32 chars = 256 bits of entropy if random)
  const MIN_LENGTH = 32;
  if (secret.length < MIN_LENGTH) {
    return {
      valid: false,
      warning: `ALERTMANAGER_WEBHOOK_SECRET too short (${secret.length} chars), minimum ${MIN_LENGTH} required for security`,
    };
  }

  return { valid: true };
}

/**
 * Validate environment variable format
 */
function validateEnforceWriteOnly(): { valid: boolean; warning?: string } {
  const value = process.env['ENFORCE_WRITE_ONLY'];

  if (!value) {
    return { valid: true }; // Optional, defaults to false
  }

  if (value !== 'true' && value !== 'false') {
    return {
      valid: false,
      warning: `Invalid ENFORCE_WRITE_ONLY="${value}", expected "true" or "false"`,
    };
  }

  return { valid: true };
}

/**
 * Validate enforcement percentage
 */
function validateEnforcementPercent(): { valid: boolean; warning?: string } {
  const value = process.env['ENFORCEMENT_PERCENT'];

  if (!value) {
    return { valid: true }; // Optional, defaults to 0
  }

  const num = parseInt(value, 10);
  if (isNaN(num) || num < 0 || num > 100) {
    return {
      valid: false,
      warning: `Invalid ENFORCEMENT_PERCENT="${value}", expected integer 0-100`,
    };
  }

  return { valid: true };
}

/**
 * Run all startup checks
 *
 * @throws Error if critical configuration is invalid
 */
export function validateStageValidationStartup(): StartupCheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let passed = true;

  // Check 1: Validation mode
  const modeCheck = validateStageValidationMode();
  if (!modeCheck.valid) {
    errors.push(modeCheck.warning!);
    passed = false;
  } else if (modeCheck.warning) {
    warnings.push(modeCheck.warning);
  }

  // Check 2: Webhook secret
  const secretCheck = validateWebhookSecret();
  if (!secretCheck.valid) {
    errors.push(secretCheck.warning!);
    passed = false;
  } else if (secretCheck.warning) {
    warnings.push(secretCheck.warning);
  }

  // Check 3: Enforce write only flag
  const writeOnlyCheck = validateEnforceWriteOnly();
  if (!writeOnlyCheck.valid) {
    errors.push(writeOnlyCheck.warning!);
    passed = false;
  } else if (writeOnlyCheck.warning) {
    warnings.push(writeOnlyCheck.warning);
  }

  // Check 4: Enforcement percentage
  const percentCheck = validateEnforcementPercent();
  if (!percentCheck.valid) {
    errors.push(percentCheck.warning!);
    passed = false;
  } else if (percentCheck.warning) {
    warnings.push(percentCheck.warning);
  }

  // Log structured results
  if (errors.length > 0) {
    logger.error({
      event: 'stage_validation_startup_failed',
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    });
  } else if (warnings.length > 0) {
    logger.warn({
      event: 'stage_validation_startup_warnings',
      warnings,
      timestamp: new Date().toISOString(),
    });
  } else {
    logger.info({
      event: 'stage_validation_startup_ok',
      mode: process.env['STAGE_VALIDATION_MODE'] || 'warn',
      timestamp: new Date().toISOString(),
    });
  }

  return { passed, warnings, errors };
}

/**
 * Check if normalize_stage() database function exists
 * This function is required by the migration scripts
 */
async function validateNormalizeStageFunction(): Promise<{ valid: boolean; error?: string }> {
  try {
    // Try importing database connection
    const { sql } = await import('../db');

    // Test that normalize_stage() function exists
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const result = await sql`SELECT normalize_stage('seed') AS test`;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!result || result.length === 0) {
      return {
        valid: false,
        error: 'normalize_stage() function exists but returned no results',
      };
    }

    // Verify it returns expected canonical value
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const normalized = result[0]?.test as string | undefined;
    if (normalized !== 'seed') {
      return {
        valid: false,
        error: `normalize_stage('seed') returned '${normalized}', expected 'seed'`,
      };
    }

    return { valid: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // If function doesn't exist, error will contain "function normalize_stage"
    if (message.includes('function') && message.includes('normalize_stage')) {
      return {
        valid: false,
        error: 'normalize_stage() database function not found - run migration first',
      };
    }

    // Database connection issues are warnings, not hard failures
    // (allow server to start in environments without database)
    return {
      valid: true, // Don't block startup
      error: `Database probe skipped (${message})`,
    };
  }
}

/**
 * Convenience function to run checks and throw on failure
 * Use this in bootstrap.ts
 */
export async function validateOrThrow(): Promise<void> {
  const result = validateStageValidationStartup();

  if (!result.passed) {
    throw new Error(`Stage validation startup checks failed:\n${result.errors.join('\n')}`);
  }

  // Optional: Check database function (non-blocking)
  const dbCheck = await validateNormalizeStageFunction();
  if (dbCheck.error) {
    if (dbCheck.valid) {
      logger.warn({
        event: 'db_probe_warning',
        message: dbCheck.error,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.error({
        event: 'db_probe_failed',
        message: dbCheck.error,
        timestamp: new Date().toISOString(),
      });
      // Note: We log but don't throw - allows server to start for non-migration use cases
    }
  } else {
    logger.info({
      event: 'db_probe_ok',
      message: 'normalize_stage() function verified',
      timestamp: new Date().toISOString(),
    });
  }
}
