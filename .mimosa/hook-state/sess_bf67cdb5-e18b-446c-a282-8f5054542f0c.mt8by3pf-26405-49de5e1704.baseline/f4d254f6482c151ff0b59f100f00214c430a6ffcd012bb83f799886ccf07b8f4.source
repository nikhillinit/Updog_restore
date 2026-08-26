import type { CircuitState } from './types';

export interface StateChangeEvent {
  from: CircuitState;
  to: CircuitState;
  reason: string;
  timestamp: number;
}

export interface ProbeDeniedEvent {
  rateLimited: boolean;
  concurrencyLimited: boolean;
  timestamp: number;
}
