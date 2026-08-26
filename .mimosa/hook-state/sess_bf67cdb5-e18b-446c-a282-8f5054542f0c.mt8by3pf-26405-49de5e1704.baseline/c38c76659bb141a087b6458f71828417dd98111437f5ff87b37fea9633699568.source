const HARD_TIMEOUT_ENV = 'FUND_SCENARIO_HARD_TIMEOUT_MS';

export const FUND_SCENARIO_HARD_TIMEOUT_ENV = HARD_TIMEOUT_ENV;

export class FundScenarioHardTimeoutError extends Error {
  readonly kind = 'fund-scenario-hard-timeout' as const;

  constructor(runId: string) {
    super(`Fund scenario calculation ${runId} exceeded its hard deadline`);
    this.name = 'FundScenarioHardTimeoutError';
  }
}

export function isFundScenarioHardTimeoutError(error: unknown): error is FundScenarioHardTimeoutError {
  return (
    error instanceof FundScenarioHardTimeoutError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { kind?: unknown }).kind === 'fund-scenario-hard-timeout')
  );
}

export function getFundScenarioHardTimeoutMs(): number {
  const raw = process.env[HARD_TIMEOUT_ENV]?.trim();
  if (!raw) {
    throw new Error(`${HARD_TIMEOUT_ENV} is required for fund scenario calculations`);
  }

  const timeoutMs = Number(raw);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`${HARD_TIMEOUT_ENV} must be a positive integer in milliseconds`);
  }

  return timeoutMs;
}

export function isFundScenarioSweepEnabled(): boolean {
  const raw = process.env['FUND_SCENARIO_SWEEP_ENABLED']?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}
