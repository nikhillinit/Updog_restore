/**
 * Engine selector with shadow comparison capability
 * Intelligently chooses between TypeScript and WASM implementations
 * Supports A/B testing and gradual migration
 */

import { isUnifiedFlagEnabled } from '@/core/flags/unifiedClientFlags';
import { calculateReservesSafe } from '@/lib/reserves-v11';
import { metrics } from '@/metrics/reserves-metrics';
import type {
  ReservesInput,
  ReservesConfig,
  ReservesResult,
  Company,
} from '@shared/types/reserves-v11';

// Mock WASM implementation (replace with actual when available)
async function calculateReservesWASM(
  input: ReservesInput,
  config: ReservesConfig
): Promise<ReservesResult> {
  // Simulate WASM call delay
  await new Promise((resolve) => setTimeout(resolve, 10));

  // For now, return TS implementation
  // In production, this would call the actual WASM module
  return calculateReservesSafe(input, config);
}

// TypeScript implementation wrapper
async function calculateReservesTS(
  input: ReservesInput,
  config: ReservesConfig
): Promise<ReservesResult> {
  return calculateReservesSafe(input, config);
}

// Check if results are different (for shadow comparison)
function isDifferent(
  tsResult: ReservesResult,
  wasmResult: ReservesResult,
  epsilonCents: number = 1
): boolean {
  if (!tsResult.ok || !wasmResult.ok) {
    return tsResult.ok !== wasmResult.ok;
  }

  const tsData = tsResult.data!;
  const wasmData = wasmResult.data!;

  // Check remaining difference
  if (Math.abs(tsData.remaining_cents - wasmData.remaining_cents) > epsilonCents) {
    return true;
  }

  // Check allocation count
  if (tsData.allocations.length !== wasmData.allocations.length) {
    return true;
  }

  // Check each allocation
  const tsMap = new Map(tsData.allocations.map((a) => [a.company_id, a.planned_cents]));
  const wasmMap = new Map(wasmData.allocations.map((a) => [a.company_id, a.planned_cents]));

  for (const [id, tsCents] of tsMap) {
    const wasmCents = wasmMap['get'](id);
    if (wasmCents === undefined || Math.abs(tsCents - wasmCents) > epsilonCents) {
      return true;
    }
  }

  return false;
}

// Engine selection function
export type ReservesCalculator = (
  input: ReservesInput,
  config: ReservesConfig
) => Promise<ReservesResult>;

/**
 * Get the appropriate reserves calculator based on feature flags and user
 */
export async function getReservesCalculator(userId?: string): Promise<ReservesCalculator> {
  const shadow = isUnifiedFlagEnabled('shadow_compare', userId);
  const tsOn = isUnifiedFlagEnabled('ts_reserves', userId);
  const wasmOn = isUnifiedFlagEnabled('wasm_reserves', userId);

  // Shadow comparison mode - run both and compare
  if (shadow && tsOn && wasmOn) {
    return async (input: ReservesInput, config: ReservesConfig) => {
      const timer = metrics.startTimer('reserves.shadow_compare');

      try {
        // Run both implementations in parallel
        const [tsResult, wasmResult] = await Promise.all([
          calculateReservesTS(input, config),
          calculateReservesWASM(input, config).catch((error) => {
            // If WASM fails, log and continue with TS
            metrics.recordError(`WASM error: ${error}`);
            return null;
          }),
        ]);

        // Compare results if both succeeded
        if (wasmResult && isDifferent(tsResult, wasmResult)) {
          metrics.recordDivergence(tsResult, wasmResult);
          console.warn('Reserves calculation divergence detected', {
            ts: tsResult.data,
            wasm: wasmResult.data,
          });
        }

        // Always return TS result during shadow mode
        return tsResult;
      } finally {
        timer.end();
      }
    };
  }

  // WASM only mode
  if (wasmOn && !tsOn) {
    return async (input: ReservesInput, config: ReservesConfig) => {
      const timer = metrics.startTimer('reserves.wasm');
      try {
        return await calculateReservesWASM(input, config);
      } catch (error) {
        // Fallback to TS if WASM fails
        metrics.recordError(`WASM fallback: ${error}`);
        return await calculateReservesTS(input, config);
      } finally {
        timer.end();
      }
    };
  }

  // TypeScript mode (default)
  return async (input: ReservesInput, config: ReservesConfig) => {
    const timer = metrics.startTimer('reserves.typescript');
    try {
      return await calculateReservesTS(input, config);
    } finally {
      timer.end();
    }
  };
}

/**
 * Simple interface for common use cases
 */
export async function calculateReservesWithFlags(
  companies: Company[],
  reservePercent: number,
  enableRemainPass: boolean = false,
  userId?: string
): Promise<ReservesResult> {
  const calculator = await getReservesCalculator(userId);

  const input: ReservesInput = {
    companies,
    fund_size_cents: companies.reduce((sum: any, c: any) => sum + (c.invested_cents || 0), 0),
    quarter_index: new Date().getFullYear() * 4 + Math.floor(new Date().getMonth() / 3),
  };

  const config: ReservesConfig = {
    reserve_bps: Math.round(reservePercent * 10000),
    remain_passes: enableRemainPass ? 1 : 0,
    cap_policy: {
      kind: 'fixed_percent',
      default_percent: 0.5,
    },
    audit_level: 'basic',
  };

  return calculator(input, config);
}

/**
 * Migration helper - gradually move users from old to new engine
 */
export async function migrateReservesCalculation(
  legacyResult: any,
  companies: Company[],
  config: ReservesConfig,
  userId?: string
): Promise<any> {
  // Check if user is in migration cohort
  const shouldMigrate = isUnifiedFlagEnabled('reserves_v11', userId);

  if (!shouldMigrate) {
    return legacyResult;
  }

  // Run new calculation
  const calculator = await getReservesCalculator(userId);
  const input: ReservesInput = {
    companies,
    fund_size_cents: companies.reduce((sum: any, c: any) => sum + (c.invested_cents || 0), 0),
    quarter_index: new Date().getFullYear() * 4 + Math.floor(new Date().getMonth() / 3),
  };

  const newResult = await calculator(input, config);

  // Log migration for analysis
  if (isUnifiedFlagEnabled('metrics_collection', userId)) {
    metrics.recordDivergence(legacyResult, newResult);
  }

  return newResult;
}
