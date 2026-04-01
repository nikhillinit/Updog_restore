import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRegisterCalcRunCompletedHandler, mockInfo, mockDebug } = vi.hoisted(() => ({
  mockRegisterCalcRunCompletedHandler: vi.fn(),
  mockInfo: vi.fn(),
  mockDebug: vi.fn(),
}));

vi.mock('../../../server/services/calc-run-tracking', () => ({
  registerCalcRunCompletedHandler: mockRegisterCalcRunCompletedHandler,
}));

vi.mock('../../../server/services/fund-metrics-attribution-service', () => ({
  ensureAttributedFundMetricsForCalcRun: vi.fn(),
}));

vi.mock('../../../server/services/variance-tracking', () => ({
  BaselineService: vi.fn(() => ({
    createBaselineFromCalcRun: vi.fn(),
  })),
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: {
    child: () => ({
      info: mockInfo,
      debug: mockDebug,
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('calc-run completion handler registration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('registers the completion handlers only once per process', async () => {
    const mod = await import('../../../server/services/calc-run-completion-handlers');

    mod.registerCompletionHandlers();
    mod.registerCompletionHandlers();

    expect(mockRegisterCalcRunCompletedHandler).toHaveBeenCalledTimes(2);
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockDebug).toHaveBeenCalledWith('Calc-run completion handlers already registered');
  });

  it('allows re-registration after resetting the module guard', async () => {
    const mod = await import('../../../server/services/calc-run-completion-handlers');

    mod.registerCompletionHandlers();
    mod.resetCompletionHandlerRegistration();
    mod.registerCompletionHandlers();

    expect(mockRegisterCalcRunCompletedHandler).toHaveBeenCalledTimes(4);
  });
});
