import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SensitivityHookError } from '@/hooks/useSensitivityRuns';
import { Sentry } from '@/monitoring';

interface SensitivityRunErrorCardProps {
  error: SensitivityHookError;
  onRetry: () => void;
  retryDisabled: boolean;
  retryDisabledReason: string | null;
  testIdPrefix: 'one-way' | 'two-way' | 'stress';
  fundId?: number | null;
}

interface ErrorCopy {
  title: string;
  message: string;
  actionLabel: string;
  actionHref?: string;
  retry: boolean;
}

function getErrorCopy(error: SensitivityHookError): ErrorCopy {
  if (error.code === 'NO_PUBLISHED_CONFIG') {
    return {
      title: 'Publish fund configuration',
      message: 'Publish the active fund configuration before running sensitivity analysis.',
      actionLabel: 'Publish Fund Configuration',
      actionHref: '/fund-setup?step=7',
      retry: false,
    };
  }

  return {
    title: 'Sensitivity analysis did not run',
    message:
      'Something interrupted this analysis. Try again, or check the latest fund inputs if it keeps failing.',
    actionLabel: 'Retry',
    retry: true,
  };
}

export function SensitivityRunErrorCard({
  error,
  fundId,
  onRetry,
  retryDisabled,
  retryDisabledReason,
  testIdPrefix,
}: SensitivityRunErrorCardProps) {
  const copy = getErrorCopy(error);
  const disabledReasonId = `${testIdPrefix}-retry-disabled-reason`;
  const reportedErrors = useRef(new WeakSet<SensitivityHookError>());

  useEffect(() => {
    if (error.code === 'NO_PUBLISHED_CONFIG') {
      return;
    }

    if (reportedErrors.current.has(error)) {
      return;
    }
    reportedErrors.current.add(error);

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('sensitivity.panel', testIdPrefix);
      if (fundId != null) {
        scope.setTag('fund.id', String(fundId));
      }
      scope.setContext('sensitivityRunError', {
        code: error.code ?? 'UNKNOWN',
        message: error.message,
        status: error.status ?? null,
        panel: testIdPrefix,
        fundId: fundId ?? null,
      });
      Sentry.captureException(error);
    });
  }, [error, fundId, testIdPrefix]);

  return (
    <Card className="border-red-200" data-testid={`${testIdPrefix}-error`}>
      <CardContent className="px-4 py-3">
        <p className="text-sm font-medium text-red-700">{copy.title}</p>
        <p className="mt-0.5 text-xs text-gray-600" data-testid={`${testIdPrefix}-error-message`}>
          {copy.message}
        </p>
        {copy.retry ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={retryDisabled}
            aria-describedby={retryDisabledReason ? disabledReasonId : undefined}
            className="mt-2"
            data-testid={`${testIdPrefix}-retry-button`}
          >
            {retryDisabledReason && (
              <span id={disabledReasonId} className="sr-only">
                {retryDisabledReason}
              </span>
            )}
            {copy.actionLabel}
          </Button>
        ) : (
          <Button asChild size="sm" className="mt-2" data-testid={`${testIdPrefix}-setup-link`}>
            <a href={copy.actionHref}>{copy.actionLabel}</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
