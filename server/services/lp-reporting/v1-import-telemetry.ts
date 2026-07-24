/**
 * V1 LP-reporting import telemetry (PLAN_61 Wave C, Task 6, §12 / finding 9).
 *
 * A non-throwing count + log surface for valid V1 `csv | notion` import route
 * invocations. Satisfies R33-f with an operational Prometheus counter (no
 * DB-derived count, no new GET route). It counts valid invocations including
 * downstream service failures, cannot be inflated by V2 (which uses distinct
 * `financial_observation_v2` events), and never changes V1 behavior.
 *
 * @module server/services/lp-reporting/v1-import-telemetry
 */
import { register, Counter, type CounterConfiguration } from 'prom-client';

import { logger } from '../../lib/logger';

type V1Label = 'route' | 'source_type';

function getOrCreateCounter(config: CounterConfiguration<V1Label>): Counter<V1Label> {
  const existing = register.getSingleMetric(config.name);
  if (existing) {
    return existing as Counter<V1Label>;
  }
  return new Counter(config);
}

const V1_IMPORT_INVOCATIONS = getOrCreateCounter({
  name: 'lp_reporting_v1_import_route_invocations_total',
  help: 'Valid V1 LP-reporting import route invocations (csv|notion), including service failures.',
  labelNames: ['route', 'source_type'],
});

export function recordV1ImportInvocation(args: {
  route: string;
  fundId: number;
  sourceType: string;
}): void {
  try {
    V1_IMPORT_INVOCATIONS.labels(args.route, args.sourceType).inc();
    logger.info(
      {
        event: 'v1_import_route_invoked',
        route: args.route,
        fundId: args.fundId,
        sourceType: args.sourceType,
      },
      'v1_import_route_invoked'
    );
  } catch {
    // Telemetry must never alter V1 behavior; swallow logger/metric failures.
  }
}
