/**
 * Calc-Run Completion Handlers
 *
 * Registers downstream automation that fires when a calc-run transitions
 * to completed. Each handler is fire-and-forget -- failures are logged
 * but never block the completion path.
 *
 * Import this module at server startup to wire the handlers.
 */

import { registerCalcRunCompletedHandler } from './calc-run-tracking';
import { ensureAttributedFundMetricsForCalcRun } from './fund-metrics-attribution-service';
import { BaselineService } from './variance-tracking';
import { logger } from '../lib/logger';

const log = logger.child({ module: 'calc-run-completion-handlers' });

const baselineService = new BaselineService();
let handlersRegistered = false;

export function registerCompletionHandlers(): void {
  if (handlersRegistered) {
    log.debug('Calc-run completion handlers already registered');
    return;
  }

  handlersRegistered = true;

  registerCalcRunCompletedHandler(async function attributeMetrics(runId) {
    await ensureAttributedFundMetricsForCalcRun(runId);
  });

  registerCalcRunCompletedHandler(async function createBaseline(runId) {
    await baselineService.createBaselineFromCalcRun(runId);
  });

  log.info('Calc-run completion handlers registered');
}

/** Reset registration guard for test isolation only. */
export function resetCompletionHandlerRegistration(): void {
  handlersRegistered = false;
}
