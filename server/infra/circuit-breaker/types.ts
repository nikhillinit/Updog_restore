export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface HalfOpenRateLimit {
  capacity: number;
  refillPerSecond: number;
}

export interface AdaptiveThreshold {
  enabled: boolean;
  min: number;
  max: number;
  rate: number; // 0.1 = 10%
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;       // base backoff in ms
  operationTimeout?: number;  // ms
  monitoringPeriod?: number;  // use either rolling window or consecutive failures
  successesToClose?: number;
  maxHalfOpenRequests?: number;
  halfOpenRateLimit?: HalfOpenRateLimit;
  adaptiveThreshold?: AdaptiveThreshold;
}
