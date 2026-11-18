import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VehicleOnboardingRequest } from '../../../../shared/contracts/lp-reporting/vehicle-onboarding.contract';

const mocks = vi.hoisted(() => ({
  scope: vi.fn(),
  applyRLS: vi.fn(),
  createArtifact: vi.fn(),
}));
vi.mock('../../../../server/db/request-context', () => ({
  getRequestDatabaseScope: mocks.scope,
  applyRLSContext: mocks.applyRLS,
}));
vi.mock('../../../../server/db-schema', () => ({ combinedSchema: {} }));
vi.mock('../../../../server/services/financial-observations/source-artifact-service', () => ({
  createSourceArtifact: mocks.createArtifact,
}));

import { onboardMainFundVehicle } from '../../../../server/services/lp-reporting/vehicle-onboarding-service';

function request(): VehicleOnboardingRequest {
  return {
    contractVersion: 'vehicle-onboarding/1.0.0',
    vehicleSlug: 'main-fund',
    name: 'Synthetic main fund',
    committedCapital: '1000000.00',
    source: { sourceType: 'manual', content: 'Synthetic commitment: USD 1,000,000.' },
    sourceLocator: 'Synthetic declaration, paragraph 1',
    attestation: 'source-supports-commitment/1.0.0',
  };
}
function command() {
  return {
    fundId: 7,
    actorId: 11,
    idempotencyKey: '00000000-0000-4000-8000-000000000001',
    request: request(),
    context: { userId: '11', fundId: '7', role: 'admin', orgId: '', email: 'test@example.invalid' },
  };
}
const options = { readPilotFundId: () => 7 };

describe('vehicle onboarding admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scope.mockReturnValue(undefined);
  });

  it.each([null, 8])(
    'refuses disabled or different pilot scope (%s) before any database access',
    async (pilot) => {
      await expect(
        onboardMainFundVehicle(command(), { readPilotFundId: () => pilot })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
      expect(mocks.scope).not.toHaveBeenCalled();
      expect(mocks.createArtifact).not.toHaveBeenCalled();
    }
  );

  it.each(['', 'arbitrary-key', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'])(
    'rejects invalid key %s',
    async (key) => {
      await expect(
        onboardMainFundVehicle({ ...command(), idempotencyKey: key }, options)
      ).rejects.toMatchObject({
        code: 'INVALID_IDEMPOTENCY_KEY',
      });
      expect(mocks.scope).not.toHaveBeenCalled();
    }
  );

  it.each(['-1.00', '1.001', '100000000000000.00'])(
    'rejects invalid commitment %s before transaction',
    async (amount) => {
      const input = command();
      input.request.committedCapital = amount;
      await expect(onboardMainFundVehicle(input, options)).rejects.toMatchObject({
        code: 'INVALID_BODY',
      });
      expect(mocks.scope).not.toHaveBeenCalled();
    }
  );

  it('bounds decoded UTF-8 source bytes, not only character count', async () => {
    const input = command();
    input.request.source = { sourceType: 'manual', content: 'é'.repeat(70_000) };
    await expect(onboardMainFundVehicle(input, options)).rejects.toMatchObject({
      code: 'INVALID_BODY',
    });
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it('refuses unpaired surrogate source text without silently replacing it', async () => {
    const input = command();
    input.request.source = { sourceType: 'manual', content: 'source\ud800' };
    await expect(onboardMainFundVehicle(input, options)).rejects.toMatchObject({
      code: 'INVALID_BODY',
    });
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it('refuses noncanonical base64 padding bits', async () => {
    const input = command();
    input.request.source = { sourceType: 'csv', fileName: 'source.csv', payloadBase64: 'YR==' };
    await expect(onboardMainFundVehicle(input, options)).rejects.toMatchObject({
      code: 'INVALID_BODY',
    });
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it('does not silently obtain a second connection without a request transaction', async () => {
    await expect(onboardMainFundVehicle(command(), options)).rejects.toMatchObject({
      statusCode: 503,
      code: 'TRANSACTION_REQUIRED',
    });
    expect(mocks.createArtifact).not.toHaveBeenCalled();
  });

  it.each([{ userId: '12' }, { fundId: '8' }])(
    'rejects mismatched context %j before opening an injected connection',
    async (change) => {
      const input = command();
      Object.assign(input.context, change);
      const connect = vi.fn();
      await expect(onboardMainFundVehicle(input, { ...options, connect })).rejects.toMatchObject({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
      expect(connect).not.toHaveBeenCalled();
    }
  );

  it('requires administrator claims even if database authority might later pass', async () => {
    const input = command();
    input.context.role = 'partner';
    const connect = vi.fn();
    await expect(onboardMainFundVehicle(input, { ...options, connect })).rejects.toMatchObject({
      statusCode: 403,
      code: 'INSUFFICIENT_ROLE',
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('uses the active request connection and lets its owner handle rollback', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    mocks.scope.mockReturnValue({ context: command().context, client: { query }, db: {} });
    const connect = vi.fn();
    await expect(onboardMainFundVehicle(command(), { ...options, connect })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain('FROM users');
    expect(mocks.applyRLS).not.toHaveBeenCalled();
  });
});
