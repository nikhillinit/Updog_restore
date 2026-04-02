import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRegisterCalcRunCompletedHandler, mockRunCalcRunCompletion, mockInfo, mockDebug } =
  vi.hoisted(() => ({
    mockRegisterCalcRunCompletedHandler: vi.fn(),
    mockRunCalcRunCompletion: vi.fn(),
    mockInfo: vi.fn(),
    mockDebug: vi.fn(),
  }));

vi.mock('../../../server/services/calc-run-tracking', () => ({
  registerCalcRunCompletedHandler: mockRegisterCalcRunCompletedHandler,
}));

vi.mock('../../../server/services/variance-alert-automation', () => ({
  varianceAlertAutomationService: {
    runCalcRunCompletion: mockRunCalcRunCompletion,
  },
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

    expect(mockRegisterCalcRunCompletedHandler).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockDebug).toHaveBeenCalledWith('Calc-run completion handlers already registered');
  });

  it('allows re-registration after resetting the module guard', async () => {
    const mod = await import('../../../server/services/calc-run-completion-handlers');

    mod.registerCompletionHandlers();
    mod.resetCompletionHandlerRegistration();
    mod.registerCompletionHandlers();

    expect(mockRegisterCalcRunCompletedHandler).toHaveBeenCalledTimes(2);
  });

  it('registers a sequential calc-run automation handler', async () => {
    const mod = await import('../../../server/services/calc-run-completion-handlers');

    mod.registerCompletionHandlers();

    const registeredHandler = mockRegisterCalcRunCompletedHandler.mock.calls[0]?.[0];
    expect(typeof registeredHandler).toBe('function');

    await registeredHandler?.(42, 7, 11, 3);

    expect(mockRunCalcRunCompletion).toHaveBeenCalledWith(42, 7);
  });
});
