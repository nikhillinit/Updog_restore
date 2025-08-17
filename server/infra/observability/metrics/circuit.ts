import client from 'prom-client';

export const cbState = new client.Gauge({ name: 'cb_state', help: 'Circuit state (0=CLOSED,1=HALF_OPEN,2=OPEN)', labelNames: ['name'] });
export const cbRequests = new client.Counter({ name: 'cb_total_requests', help: 'Requests through breaker', labelNames: ['name'] });
export const cbSuccess = new client.Counter({ name: 'cb_success', help: 'Successful operations', labelNames: ['name'] });
export const cbFallback = new client.Counter({ name: 'cb_fallback', help: 'Fallback invocations', labelNames: ['name'] });
export const cbLatency = new client.Histogram({ name: 'cb_latency_ms', help: 'Operation latency', buckets: [10, 25, 50, 100, 200, 400, 800, 1600], labelNames: ['name'] });

export function stateToNumber(s: string) {
  return s === 'CLOSED' ? 0 : s === 'HALF_OPEN' ? 1 : 2;
}
