/**
 * Calc-Run Completion Handlers
 *
 * Registers downstream automation that fires when a calc-run transitions
 * to completed. The handler is retried by markCalcRunCompletedIfReady(),
 * so the internal steps must be sequential and idempotent.
 *
 * Import this module at server startup to wire the handlers.
 */

import { registerCalcRunCompletedHandler } from './calc-run-tracking';
import { logger } from '../lib/logger';
import { varianceAlertAutomationService } from './variance-alert-automation';

const log = logger.child({ module: 'calc-run-completion-handlers' });
let handlersRegistered = false;

export function registerCompletionHandlers(): void {
  if (handlersRegistered) {
    log.debug('Calc-run completion handlers already registered');
    return;
  }

  handlersRegistered = true;

  registerCalcRunCompletedHandler(async function automateVarianceAlerts(runId, fundId) {
    await varianceAlertAutomationService.runCalcRunCompletion(runId, fundId);
  });

  log.info('Calc-run completion handlers registered');
}

/** Reset registration guard for test isolation only. */
export function resetCompletionHandlerRegistration(): void {
  handlersRegistered = false;
}
