export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod?: number;
  operationTimeout?: number;
  successesToClose?: number;
  maxHalfOpenRequests?: number;
  halfOpenRateLimit?: {
    capacity: number;
    refillPerSecond: number;
  };
  adaptiveThreshold?: {
    enabled: boolean;
    min: number;
    max: number;
    rate: number;
  };
}

export interface StateChangeEvent {
  from: CircuitState;
  to: CircuitState;
  reason: string;
  timestamp: number;
}
