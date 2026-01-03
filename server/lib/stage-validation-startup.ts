/**
 * Startup Environment Validation for Stage Normalization v3.4
 *
 * Validates critical environment variables and configuration
 * before the server starts. Fails fast with structured warnings
 * if configuration is invalid.
 */

import { createClient } from 'redis';
import { sql } from '../db-serverless';

/**
 * Validate STAGE_VALIDATION_MODE environment variable
 *
 * @returns true if valid, false with warning if invalid
 */
export function validateStageValidationMode(): boolean {
  const mode = process.env['STAGE_VALIDATION_MODE'];
  const validModes = ['off', 'warn', 'enforce'];

  if (!mode) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'startup_validation',
        component: 'stage_validation_mode',
        message: 'STAGE_VALIDATION_MODE not set, will default to "warn"',
        timestamp: new Date().toISOString(),
      })
    );
    return true; // Not an error - will use default
  }

  if (!validModes.includes(mode)) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'startup_validation_failed',
        component: 'stage_validation_mode',
        message: `Invalid STAGE_VALIDATION_MODE="${mode}", must be one of: ${validModes.join(', ')}`,
        provided: mode,
        valid_values: validModes,
        timestamp: new Date().toISOString(),
      })
    );
    return false;
  }

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'startup_validation',
      component: 'stage_validation_mode',
      message: `STAGE_VALIDATION_MODE="${mode}" is valid`,
      timestamp: new Date().toISOString(),
    })
  );
  return true;
}

/**
 * Validate ALERTMANAGER_WEBHOOK_SECRET length
 *
 * Must be at least 32 characters for security
 *
 * @returns true if valid, false with error if invalid
 */
export function validateWebhookSecret(): boolean {
  const secret = process.env['ALERTMANAGER_WEBHOOK_SECRET'];
  const MIN_LENGTH = 32;

  if (!secret) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'startup_validation_failed',
        component: 'webhook_secret',
        message: 'ALERTMANAGER_WEBHOOK_SECRET is required but not set',
        required_min_length: MIN_LENGTH,
        timestamp: new Date().toISOString(),
      })
    );
    return false;
  }

  if (secret.length < MIN_LENGTH) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'startup_validation_failed',
        component: 'webhook_secret',
        message: `ALERTMANAGER_WEBHOOK_SECRET too short (${secret.length} chars), must be ≥${MIN_LENGTH} chars`,
        provided_length: secret.length,
        required_min_length: MIN_LENGTH,
        timestamp: new Date().toISOString(),
      })
    );
    return false;
  }

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'startup_validation',
      component: 'webhook_secret',
      message: `ALERTMANAGER_WEBHOOK_SECRET is valid (${secret.length} chars)`,
      timestamp: new Date().toISOString(),
    })
  );
  return true;
}

/**
 * Pre-flight DB probe: Check that normalize_stage() function exists
 *
 * Fails fast if the database migration hasn't been run
 *
 * @returns true if function exists, false with error if missing
 */
export async function validateDatabaseFunction(): Promise<boolean> {
  try {
    // Test that normalize_stage() function exists by calling it with a known input
    const result = await sql`SELECT normalize_stage('seed') AS test_stage`;

    const firstRow = result?.[0];
    if (!firstRow) {
      throw new Error('normalize_stage() returned no results');
    }

    const testStage = firstRow['test_stage'];
    if (testStage !== 'seed') {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'startup_validation',
          component: 'database_function',
          message: 'normalize_stage() returned unexpected value',
          input: 'seed',
          output: testStage,
          timestamp: new Date().toISOString(),
        })
      );
    }

    console.log(
      JSON.stringify({
        level: 'info',
        event: 'startup_validation',
        component: 'database_function',
        message: 'normalize_stage() function exists and is working',
        test_result: testStage,
        timestamp: new Date().toISOString(),
      })
    );
    return true;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'startup_validation_failed',
        component: 'database_function',
        message: 'normalize_stage() function not found in database',
        error: (err as Error)?.message,
        hint: 'Run database migration to create normalize_stage() function',
        timestamp: new Date().toISOString(),
      })
    );
    return false;
  }
}

/**
 * Validate Redis connectivity for mode store
 *
 * Tests connection but doesn't fail startup if Redis is unavailable
 * (mode store has fallback behavior)
 *
 * @returns true if connected, false with warning if unavailable
 */
export async function validateRedisConnection(): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    const client = createClient({ url: redisUrl });
    await client.connect();
    await client.ping();
    await client.disconnect();

    console.log(
      JSON.stringify({
        level: 'info',
        event: 'startup_validation',
        component: 'redis_connection',
        message: 'Redis connection successful',
        url: redisUrl.replace(/:[^:@]+@/, ':****@'), // Mask password
        timestamp: new Date().toISOString(),
      })
    );
    return true;
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'startup_validation',
        component: 'redis_connection',
        message: 'Redis connection failed - mode store will use fallback',
        error: (err as Error)?.message,
        url: redisUrl.replace(/:[^:@]+@/, ':****@'),
        impact: 'Mode store will use cache/default fallback',
        timestamp: new Date().toISOString(),
      })
    );
    return false; // Not a fatal error - mode store has fallback
  }
}

/**
 * Run all startup validations
 *
 * @throws Error if any critical validation fails
 */
export async function runStartupValidations(): Promise<void> {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'startup_validation_begin',
      message: 'Running Stage Normalization v3.4 startup validations',
      timestamp: new Date().toISOString(),
    })
  );

  const results = {
    stage_validation_mode: validateStageValidationMode(),
    webhook_secret: validateWebhookSecret(),
    database_function: await validateDatabaseFunction(),
    redis_connection: await validateRedisConnection(),
  };

  // Critical failures (must pass)
  const critical = ['webhook_secret', 'database_function'];
  const criticalFailures = critical.filter((key) => !results[key as keyof typeof results]);

  if (criticalFailures.length > 0) {
    const errorMsg = `Startup validation failed: ${criticalFailures.join(', ')}`;
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'startup_validation_failed',
        message: errorMsg,
        failed_components: criticalFailures,
        all_results: results,
        timestamp: new Date().toISOString(),
      })
    );
    throw new Error(errorMsg);
  }

  // Warnings (can proceed)
  const warnings = Object.keys(results).filter(
    (key) => !results[key as keyof typeof results] && !critical.includes(key)
  );
  if (warnings.length > 0) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'startup_validation_warnings',
        message: 'Some validations failed but server can proceed',
        warning_components: warnings,
        timestamp: new Date().toISOString(),
      })
    );
  }

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'startup_validation_complete',
      message: 'All critical startup validations passed',
      results,
      timestamp: new Date().toISOString(),
    })
  );
}
