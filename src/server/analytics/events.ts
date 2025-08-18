export type Event =
  | { type: 'simulation_started'; userId: string; tier: string }
  | { type: 'simulation_success'; userId: string; tier: string; durationMs: number }
  | { type: 'simulation_failed'; userId: string; tier: string; reason: string };
export function wireKpi(metrics: { inc:Function; obs:Function }) {
  return (ev: Event) => {
    if (ev.type === 'simulation_started') metrics.inc('kpi_simulation_started_total', { tier: ev.tier });
    if (ev.type === 'simulation_success') { metrics.inc('kpi_simulation_success_total', { tier: ev.tier }); metrics.obs('kpi_simulation_duration_ms', ev.durationMs, { tier: ev.tier }); }
    if (ev.type === 'simulation_failed') metrics.inc('kpi_simulation_failed_total', { tier: ev.tier, reason: ev.reason });
  };
}
