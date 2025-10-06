import client from 'prom-client';

export const cbTotal = new client.Counter({ name: 'cb_total_requests', help: 'Total CB requests', labelNames: ['dep'] });
export const cbSuccess = new client.Counter({ name: 'cb_success', help: 'Successful CB operations', labelNames: ['dep'] });
export const cbFallback = new client.Counter({ name: 'cb_fallback', help: 'Fallback invocations', labelNames: ['dep'] });
export const cbProbeDenied = new client.Counter({ name: 'cb_probe_denied', help: 'Half-open probes denied', labelNames: ['dep','reason'] });
export const cbState = new client.Gauge({ name: 'cb_state', help: 'CB state', labelNames: ['dep','state'] });
export const cbLatency = new client.Histogram({ name: 'cb_latency_ms', help: 'Operation latency', labelNames: ['dep'],
  buckets: [5, 10, 25, 50, 100, 200, 300, 400, 600, 800, 1000] });

export function observeState(dep: string, state: 'CLOSED'|'OPEN'|'HALF_OPEN') {
  cbState.labels(dep,'CLOSED').set(state==='CLOSED'?1:0);
  cbState.labels(dep,'OPEN').set(state==='OPEN'?1:0);
  cbState.labels(dep,'HALF_OPEN').set(state==='HALF_OPEN'?1:0);
}
