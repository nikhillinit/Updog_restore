import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler, {
  getWizardTelemetryRateLimiterSize,
  resetWizardTelemetryRateLimiter,
  sanitizeWizardTelemetry,
} from '../../../api/telemetry/wizard';

function response() {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.end.mockReturnValue(res);
  return res;
}

describe('wizard telemetry input and resource bounds', () => {
  beforeEach(() => {
    resetWizardTelemetryRateLimiter();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('logs only bounded client fields', () => {
    expect(
      sanitizeWizardTelemetry({
        type: 'wizard_error',
        step: 'construction',
        message: 'failed',
        stack: 'secret stack',
        arbitrary: 'attacker-controlled',
        timestamp: 1,
      })
    ).toEqual({
      type: 'wizard_error',
      step: 'construction',
      timestamp: 1,
    });
    expect(sanitizeWizardTelemetry({ type: 'unknown_event' })).toBeNull();
  });

  it('caps distinct sender state', () => {
    for (let index = 0; index < 1_001; index += 1) {
      const res = response();
      handler(
        {
          method: 'POST',
          headers: { 'x-forwarded-for': `192.0.2.${index}` },
          body: { type: 'step_loaded', step: 'fund-details' },
          socket: {},
        } as never,
        res as never
      );
      expect(res.end).toHaveBeenCalled();
    }

    expect(getWizardTelemetryRateLimiterSize()).toBe(1_000);
  });
});
