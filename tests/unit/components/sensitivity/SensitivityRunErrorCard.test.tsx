import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SensitivityRunErrorCard } from '@/components/sensitivity/SensitivityRunErrorCard';
import type { SensitivityHookError } from '@/hooks/useSensitivityRuns';

const monitoringMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  setLevel: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
}));

vi.mock('@/monitoring', () => ({
  Sentry: {
    captureException: monitoringMocks.captureException,
    withScope: (callback: (scope: unknown) => void) =>
      callback({
        setLevel: monitoringMocks.setLevel,
        setTag: monitoringMocks.setTag,
        setContext: monitoringMocks.setContext,
      }),
  },
}));

function makeError(code: string, message: string, status = 500): SensitivityHookError {
  const error = new Error(message) as SensitivityHookError;
  error.code = code;
  error.status = status;
  return error;
}

describe('SensitivityRunErrorCard', () => {
  beforeEach(() => {
    monitoringMocks.captureException.mockReset();
    monitoringMocks.setLevel.mockReset();
    monitoringMocks.setTag.mockReset();
    monitoringMocks.setContext.mockReset();
  });

  it('keeps no-published-config user-facing and avoids exception noise', () => {
    render(
      <SensitivityRunErrorCard
        error={makeError('NO_PUBLISHED_CONFIG', 'publish config first', 409)}
        fundId={7}
        onRetry={vi.fn()}
        retryDisabled={false}
        retryDisabledReason={null}
        testIdPrefix="one-way"
      />
    );

    expect(screen.getByRole('link', { name: /publish fund configuration/i })).toBeInTheDocument();
    expect(monitoringMocks.captureException).not.toHaveBeenCalled();
  });

  it('reports generic sensitivity failures with structured monitoring context', async () => {
    const error = makeError('ENGINE_TIMEOUT', 'engine timed out', 504);

    render(
      <SensitivityRunErrorCard
        error={error}
        fundId={7}
        onRetry={vi.fn()}
        retryDisabled={false}
        retryDisabledReason={null}
        testIdPrefix="stress"
      />
    );

    expect(screen.getByTestId('stress-error-message')).toHaveTextContent(
      'Something interrupted this analysis'
    );
    await waitFor(() => expect(monitoringMocks.captureException).toHaveBeenCalledWith(error));
    expect(monitoringMocks.setTag).toHaveBeenCalledWith('sensitivity.panel', 'stress');
    expect(monitoringMocks.setTag).toHaveBeenCalledWith('fund.id', '7');
    expect(monitoringMocks.setContext).toHaveBeenCalledWith(
      'sensitivityRunError',
      expect.objectContaining({
        code: 'ENGINE_TIMEOUT',
        message: 'engine timed out',
        panel: 'stress',
        fundId: 7,
      })
    );
  });

  it('reports each new error instance while ignoring a rerender of the same instance', async () => {
    const firstError = makeError('ENGINE_TIMEOUT', 'engine timed out', 504);
    const secondError = makeError('ENGINE_TIMEOUT', 'engine timed out', 504);

    const { rerender } = render(
      <SensitivityRunErrorCard
        error={firstError}
        fundId={7}
        onRetry={vi.fn()}
        retryDisabled={false}
        retryDisabledReason={null}
        testIdPrefix="stress"
      />
    );

    await waitFor(() => expect(monitoringMocks.captureException).toHaveBeenCalledTimes(1));
    rerender(
      <SensitivityRunErrorCard
        error={firstError}
        fundId={7}
        onRetry={vi.fn()}
        retryDisabled={false}
        retryDisabledReason={null}
        testIdPrefix="stress"
      />
    );
    expect(monitoringMocks.captureException).toHaveBeenCalledTimes(1);

    rerender(
      <SensitivityRunErrorCard
        error={secondError}
        fundId={7}
        onRetry={vi.fn()}
        retryDisabled={false}
        retryDisabledReason={null}
        testIdPrefix="stress"
      />
    );
    await waitFor(() => expect(monitoringMocks.captureException).toHaveBeenCalledTimes(2));
    expect(monitoringMocks.captureException).toHaveBeenLastCalledWith(secondError);
  });
});
