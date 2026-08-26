import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/queryClient';
import { roundErrorMessage } from '@/lib/investment-round-error';

describe('roundErrorMessage', () => {
  it('distinguishes 409 sub-codes via errorCode', () => {
    expect(roundErrorMessage(new ApiError(409, 'x', 'round_already_superseded'))).toMatch(/already corrected/i);
    expect(roundErrorMessage(new ApiError(409, 'x', 'idempotency_key_reused'))).toMatch(/duplicate/i);
  });

  it('maps auth and not-found states', () => {
    expect(roundErrorMessage(new ApiError(401, 'x'))).toMatch(/session expired/i);
    expect(roundErrorMessage(new ApiError(403, 'x'))).toMatch(/access to this fund/i);
    expect(roundErrorMessage(new ApiError(404, 'x', 'supersede_target_missing'))).toMatch(/correcting no longer exists/i);
    expect(roundErrorMessage(new ApiError(400, 'x', 'supersede_target_other_investment'))).toMatch(/different investment/i);
  });

  it('falls back for non-ApiError', () => {
    expect(roundErrorMessage(new Error('boom'))).toMatch(/something went wrong/i);
  });
});
