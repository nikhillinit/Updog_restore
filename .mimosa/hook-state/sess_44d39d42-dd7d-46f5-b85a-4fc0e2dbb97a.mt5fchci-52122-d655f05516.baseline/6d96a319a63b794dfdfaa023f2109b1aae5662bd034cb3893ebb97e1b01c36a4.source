import client from 'prom-client';

export const calcGuardBad = new client.Counter({
  name: 'calc_guard_badvalues_total',
  help: 'Count of NaN/Infinity values scrubbed by engine guard',
  labelNames: ['route', 'correlation'],
});

export const calcGuardEvents = new client.Counter({
  name: 'calc_guard_events_total',
  help: 'Count of engine guard events (any sanitization)',
  labelNames: ['route', 'correlation'],
});