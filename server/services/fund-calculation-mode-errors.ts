export class FundCalculationModeVersionConflictError extends Error {
  readonly code = 'stale_expected_version';

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number
  ) {
    super(`Expected mode version ${expectedVersion}, found ${actualVersion}`);
    this.name = 'FundCalculationModeVersionConflictError';
  }
}

export class FundCalculationModeIdempotencyConflictError extends Error {
  readonly code = 'idempotency_conflict';

  constructor(message: string) {
    super(message);
    this.name = 'FundCalculationModeIdempotencyConflictError';
  }
}

export class FundCalculationModeInProgressError extends Error {
  readonly code = 'idempotency_request_in_progress';

  constructor() {
    super('Idempotent MOIC mode update is still in progress');
    this.name = 'FundCalculationModeInProgressError';
  }
}
