import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTelemetry, readTelemetry, track } from '@/lib/telemetry';

describe('Wave 2 telemetry boundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    clearTelemetry();
    localStorage.removeItem('telemetry_session_id');
  });

  it('fails closed to an empty list when stored telemetry JSON is invalid', () => {
    localStorage.setItem('telemetry_buffer_v1', '{not-json');

    expect(readTelemetry()).toEqual([]);
  });

  it('accepts fund creation telemetry payloads that match the strict allowlist', () => {
    const event = track('fund_create_success', {
      idempotency_status: 'created',
      request_id: 'req-1',
    });

    expect(event).not.toBeNull();
    expect(readTelemetry()).toHaveLength(1);
  });

  it('accepts client capacity telemetry payloads through the buffer boundary', () => {
    const event = track('client_capacity_hit', {
      route: '/api/funds',
      concurrent: 3,
      throttled: false,
    });

    expect(event).not.toBeNull();
    expect(readTelemetry()[0]).toMatchObject({
      event: 'client_capacity_hit',
      properties: {
        route: '/api/funds',
        concurrent: 3,
        throttled: false,
      },
    });
  });
});
