import type { CalculationStatus } from '@shared/contracts/fund-state-read-v1.contract';
import type { DispatchState } from '@shared/schema/fund';

interface CalcRunStatusInput {
  dispatchState: string;
  completedAt: Date | null;
  failedAt: Date | null;
}

const VALID_DISPATCH_STATES: DispatchState[] = ['pending', 'dispatched', 'partial', 'failed'];

/**
 * Derive the lightweight calculation status used by lifecycle/history read models.
 * Full lifecycle derivation remains in fund-state-derivation.ts where snapshot
 * availability participates in the status decision.
 */
export function deriveRunStatus(run: CalcRunStatusInput): CalculationStatus {
  if (run.failedAt) return 'failed';
  if (run.completedAt) return 'ready';
  if (run.dispatchState === 'dispatched' || run.dispatchState === 'partial') return 'calculating';
  if (run.dispatchState === 'pending') return 'submitted';
  return 'calculating';
}

/**
 * Narrow a raw string to the DispatchState union, returning null on mismatch.
 */
export function toDispatchState(raw: string): DispatchState | null {
  return (VALID_DISPATCH_STATES as string[]).includes(raw) ? (raw as DispatchState) : null;
}
