/**
 * ReviewStep - Step 7: Review & Create
 *
 * Final step in the fund setup wizard showing a summary of all configurations
 * and allowing the user to create the fund via a single finalize endpoint.
 */

import { useMemo, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, AlertTriangle, ArrowLeft, Rocket, Loader2 } from 'lucide-react';
import { useFundContext } from '@/contexts/FundContext';
import { useFundSelector, useFundTuple } from '@/stores/useFundSelector';
import { fundStore } from '@/stores/fundStore';
import { fundStoreToDraftWriteV1, fundStoreToFinalizeV1 } from '@/adapters/fund-store-adapters';
import { finalizeFund } from '@/services/funds';
import { useFlag } from '@/hooks/useUnifiedFlag';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/formatting';
import {
  EconomicsInputValidationError,
  EconomicsInvariantError,
  runEconomicsModel,
} from '@shared/lib/economics/economics-engine';
import type { EconomicsResultV1 } from '@shared/contracts/economics-v1.contract';

interface SummarySection {
  title: string;
  items: Array<{
    label: string;
    value: string | number;
    status?: 'ok' | 'warning' | 'missing';
    stepNumber?: number;
  }>;
}

type SubmitState = 'idle' | 'submitting' | 'error';
type EconomicsDryRunState =
  | { status: 'available'; result: EconomicsResultV1 }
  | {
      status: 'failed';
      title: string;
      message: string;
      details: Array<{ message: string; count: number }>;
      fixStepNumber: number;
      fixStepLabel: string;
    };

function summarizeMessages(messages: string[]) {
  const counts = new Map<string, number>();

  messages
    .map((message) => message.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .forEach((message) => {
      counts.set(message, (counts.get(message) ?? 0) + 1);
    });

  return Array.from(counts.entries()).map(([message, count]) => ({ message, count }));
}

export default function ReviewStep() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { setCurrentFund } = useFundContext();
  const economicsEnabled = useFlag('enable_gp_economics_engine', { withDependencies: true });

  // Read wizard state from fundStore
  const fundName = useFundSelector((s) => s.fundName);
  const fundSize = useFundSelector((s) => s.fundSize);
  const managementFeeRate = useFundSelector((s) => s.managementFeeRate);
  const carriedInterest = useFundSelector((s) => s.carriedInterest);
  const vintageYear = useFundSelector((s) => s.vintageYear);
  const fundLife = useFundSelector((s) => s.fundLife);
  const establishmentDate = useFundSelector((s) => s.establishmentDate);
  const stages = useFundSelector((s) => s.stages);
  const waterfallType = useFundSelector((s) => s.waterfallType);
  const recyclingEnabled = useFundSelector((s) => s.recyclingEnabled);
  const _economicsDryRunRevision = useFundTuple((s) => [
    s.investmentPeriod,
    s.gpCommitment,
    s.waterfallTiers,
    s.recyclingType,
    s.recyclingCap,
    s.recyclingPeriod,
    s.exitRecyclingRate,
    s.mgmtFeeRecyclingRate,
    s.allowFutureRecycling,
    s.feeProfiles,
    s.fundExpenses,
    s.economicsAssumptions,
  ]);

  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const navigateToResults = useCallback(
    (fundId: number) => {
      setLocation(`/fund-model-results/${fundId}`);
    },
    [setLocation]
  );

  // Build summary from fundStore state
  const sections = useMemo<SummarySection[]>(() => {
    return [
      {
        title: 'Fund Basics',
        items: [
          {
            label: 'Fund Name',
            value: fundName || 'Unnamed Fund',
            status: fundName ? 'ok' : 'missing',
            stepNumber: 1,
          },
          {
            label: 'Fund Size',
            value: formatUSD(fundSize ?? 0),
            status: fundSize ? 'ok' : 'warning',
            stepNumber: 1,
          },
          {
            label: 'Vintage Year',
            value: vintageYear ?? 'Not set',
            status: vintageYear ? 'ok' : 'warning',
            stepNumber: 1,
          },
          {
            label: 'Fund Life',
            value: fundLife ? `${fundLife} years` : 'Not set',
            status: fundLife ? 'ok' : 'warning',
            stepNumber: 1,
          },
        ],
      },
      {
        title: 'Economics',
        items: [
          {
            label: 'Management Fee',
            value: managementFeeRate != null ? `${managementFeeRate.toFixed(2)}%` : 'Not set',
            status: managementFeeRate != null ? 'ok' : 'warning',
            stepNumber: 1,
          },
          {
            label: 'Carry',
            value: carriedInterest != null ? `${carriedInterest.toFixed(0)}%` : 'Not set',
            status: carriedInterest != null ? 'ok' : 'warning',
            stepNumber: 1,
          },
        ],
      },
      {
        title: 'Strategy',
        items: [
          {
            label: 'Investment Stages',
            value: stages.length > 0 ? `${stages.length} stages` : 'Not configured',
            status: stages.length > 0 ? 'ok' : 'warning',
            stepNumber: 2,
          },
          {
            label: 'Waterfall',
            value: waterfallType ?? 'Not set',
            status: waterfallType ? 'ok' : 'warning',
            stepNumber: 5,
          },
          {
            label: 'Recycling',
            value: recyclingEnabled ? 'Enabled' : 'Disabled',
            status: 'ok',
            stepNumber: 5,
          },
          {
            label: 'Establishment',
            value: establishmentDate ?? 'Not set',
            status: establishmentDate ? 'ok' : 'warning',
            stepNumber: 1,
          },
        ],
      },
    ];
  }, [
    fundName,
    fundSize,
    vintageYear,
    fundLife,
    managementFeeRate,
    carriedInterest,
    stages,
    waterfallType,
    recyclingEnabled,
    establishmentDate,
  ]);

  // Validation summary
  const validationSummary = useMemo(() => {
    const allItems = sections.flatMap((s) => s.items);
    const ok = allItems.filter((i) => i.status === 'ok').length;
    const warnings = allItems.filter((i) => i.status === 'warning').length;
    const missing = allItems.filter((i) => i.status === 'missing').length;
    return { ok, warnings, missing, total: allItems.length };
  }, [sections]);

  const economicsDryRun: EconomicsDryRunState | null = (() => {
    if (!economicsEnabled) return null;

    try {
      const draft = fundStoreToDraftWriteV1(fundStore.getState(), {
        includeEconomicsAssumptions: true,
      });
      return { status: 'available', result: runEconomicsModel(draft) };
    } catch (error) {
      if (error instanceof EconomicsInputValidationError) {
        const details = summarizeMessages(
          error.issues.map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join('.') : 'economics input';
            return `${path}: ${issue.message}`;
          })
        );
        return {
          status: 'failed',
          title: 'Economics validation failed',
          message: 'Review the listed economics inputs before publishing the fund.',
          details,
          fixStepNumber: 5,
          fixStepLabel: 'Review distributions, fees, and recycling settings',
        };
      }
      if (error instanceof EconomicsInvariantError) {
        const details = summarizeMessages(error.checks.errors.map((issue) => issue.message));
        return {
          status: 'failed',
          title: 'Economics invariant failed',
          message:
            'Period cash sources and uses do not reconcile. Review distributions, fees, recycling, and cashflow assumptions before publishing.',
          details,
          fixStepNumber: 6,
          fixStepLabel: 'Review cashflow and liquidity settings',
        };
      }
      return {
        status: 'failed',
        title: 'Economics dry-run failed',
        message: error instanceof Error ? error.message : 'Unexpected economics engine error',
        details: [],
        fixStepNumber: 5,
        fixStepLabel: 'Review distribution settings',
      };
    }
  })();

  const handleBack = useCallback(() => {
    setLocation('/fund-setup?step=6');
  }, [setLocation]);

  const finalizeSuccessfulPublish = useCallback(
    async (fundId: number) => {
      try {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/funds'] }),
          queryClient.invalidateQueries({ queryKey: ['funds'] }),
        ]);
      } catch (error) {
        console.warn('[ReviewStep] Failed to invalidate funds query after publish', error);
      }

      setCurrentFund({
        id: fundId,
        name: String(fundName ?? ''),
        size: Number(fundSize ?? 0),
        managementFee: (managementFeeRate ?? 0) / 100,
        carryPercentage: (carriedInterest ?? 0) / 100,
        vintageYear: vintageYear ?? new Date().getFullYear(),
        deployedCapital: 0,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      navigateToResults(fundId);
    },
    [
      carriedInterest,
      fundName,
      fundSize,
      managementFeeRate,
      navigateToResults,
      queryClient,
      setCurrentFund,
      vintageYear,
    ]
  );

  const handleCreate = useCallback(async () => {
    if (submitState === 'submitting') return;
    if (economicsEnabled && economicsDryRun?.status !== 'available') {
      setSubmitError(economicsDryRun?.message ?? 'Economics dry-run failed');
      setSubmitState('error');
      return;
    }

    setSubmitError(null);
    setSubmitState('submitting');

    try {
      const payload = fundStoreToFinalizeV1(fundStore.getState(), {
        includeEconomicsAssumptions: economicsEnabled,
      });
      const result = await finalizeFund(payload);
      const fundId = result.data.fundId;
      await finalizeSuccessfulPublish(fundId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create fund';
      setSubmitError(message);
      setSubmitState('error');
    }
  }, [submitState, finalizeSuccessfulPublish, economicsDryRun, economicsEnabled]);

  const getStatusIcon = (status?: 'ok' | 'warning' | 'missing') => {
    switch (status) {
      case 'ok':
        return (
          <span className="inline-flex items-center" aria-label="Valid">
            <CheckCircle aria-hidden="true" className="h-4 w-4 text-green-600" />
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center" aria-label="Warning: needs attention">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 text-amber-600" />
          </span>
        );
      case 'missing':
        return (
          <span className="inline-flex items-center" aria-label="Missing required data">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 text-red-600" />
          </span>
        );
      default:
        return null;
    }
  };

  const isSubmitting = submitState === 'submitting';
  const economicsBlocksSubmit = economicsEnabled && economicsDryRun?.status !== 'available';
  const createDisabledReason =
    validationSummary.missing > 0
      ? 'Complete missing required fields before creating the fund.'
      : economicsBlocksSubmit
        ? 'Resolve the economics dry-run error before publishing.'
        : isSubmitting
          ? 'Fund creation is already in progress.'
          : null;

  return (
    <div className="space-y-6 pb-8" data-testid="review-step">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-presson-text">Review & Create Fund</h1>
        <p className="text-presson-textMuted">
          Review your fund configuration before creating and publishing it. This final action saves
          the fund, publishes the configuration, starts calculations, and opens model results.
        </p>
      </div>

      {economicsEnabled && economicsDryRun?.status === 'failed' && (
        <Alert
          aria-live="assertive"
          className="border-l-4 border-l-red-600 bg-red-50"
          data-testid="economics-blocking-alert"
        >
          <AlertTriangle aria-hidden="true" className="h-5 w-5 text-red-600" />
          <AlertTitle>{economicsDryRun.title}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{economicsDryRun.message}</p>
            {economicsDryRun.details.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border border-red-200 bg-white p-3">
                <ul className="list-disc space-y-1 pl-5">
                  {economicsDryRun.details.map((detail) => (
                    <li key={detail.message}>
                      {detail.message}
                      {detail.count > 1 ? ` (${detail.count} occurrences)` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              className="text-sm font-medium text-red-800 underline underline-offset-4"
              onClick={() => setLocation(`/fund-setup?step=${economicsDryRun.fixStepNumber}`)}
            >
              {economicsDryRun.fixStepLabel}
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Validation Summary */}
      <Alert
        aria-live={
          validationSummary.missing > 0 || validationSummary.warnings > 0 ? 'assertive' : 'polite'
        }
        className={cn(
          'border-l-4',
          validationSummary.missing > 0
            ? 'border-l-red-500 bg-red-50'
            : validationSummary.warnings > 0
              ? 'border-l-amber-500 bg-amber-50'
              : 'border-l-green-500 bg-green-50'
        )}
      >
        <AlertTitle className="flex items-center gap-2">
          {validationSummary.missing > 0 ? (
            <>
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Missing Required Fields
            </>
          ) : validationSummary.warnings > 0 ? (
            <>
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Some Fields Need Attention
            </>
          ) : (
            <>
              <CheckCircle className="h-5 w-5 text-green-500" />
              Ready to Create
            </>
          )}
        </AlertTitle>
        <AlertDescription>
          {validationSummary.ok} of {validationSummary.total} fields configured
          {validationSummary.warnings > 0 && ` (${validationSummary.warnings} warnings)`}
          {validationSummary.missing > 0 && ` (${validationSummary.missing} missing)`}
        </AlertDescription>
      </Alert>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Card key={section.title} className="border-presson-borderSubtle">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-presson-text">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-presson-textMuted">{item.label}</span>
                  <div className="flex items-center gap-2">
                    {item.status === 'ok' || item.stepNumber == null ? (
                      <span className="text-sm font-medium text-presson-text">{item.value}</span>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-medium text-presson-text underline underline-offset-4"
                        onClick={() => setLocation(`/fund-setup?step=${item.stepNumber}`)}
                        aria-label={`Fix ${item.label} in step ${item.stepNumber}`}
                      >
                        {item.value}
                      </button>
                    )}
                    {getStatusIcon(item.status)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {economicsEnabled && economicsDryRun?.status === 'available' && (
        <Card className="border-presson-borderSubtle" data-testid="economics-dry-run-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-presson-text">Economics Dry Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DryRunMetric
                label="Net LP IRR"
                value={formatNullablePercent(economicsDryRun.result.summary.lpNetIrr)}
              />
              <DryRunMetric
                label="Net GP IRR"
                value={formatNullablePercent(economicsDryRun.result.summary.gpNetIrr)}
              />
              <DryRunMetric
                label="Management Fees"
                value={formatUSD(economicsDryRun.result.summary.totalManagementFees)}
              />
              <DryRunMetric
                label="Total GP Carry"
                value={formatUSD(economicsDryRun.result.summary.totalGpCarryDistributed)}
              />
              <DryRunMetric
                label="Final DPI"
                value={`${economicsDryRun.result.summary.finalDpi.toFixed(2)}x`}
              />
              <DryRunMetric
                label="Final TVPI"
                value={`${economicsDryRun.result.summary.finalTvpi.toFixed(2)}x`}
              />
              <DryRunMetric
                label="Clawback Exposure"
                value={formatUSD(economicsDryRun.result.summary.finalClawbackDue)}
              />
              <DryRunMetric
                label="Invariant Status"
                value={economicsDryRun.result.checks.passed ? 'Passed' : 'Failed'}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Error display */}
      {submitState === 'error' && submitError && (
        <Alert aria-live="assertive" className="border-l-4 border-l-red-500 bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <AlertTitle>Fund Creation and Publish Failed</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleBack} disabled={isSubmitting} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Step 6
        </Button>

        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="text-sm">
            Step 7 of 7
          </Badge>

          <Button
            onClick={handleCreate}
            disabled={validationSummary.missing > 0 || economicsBlocksSubmit || isSubmitting}
            aria-describedby={createDisabledReason ? 'create-disabled-reason' : undefined}
            title={createDisabledReason ?? undefined}
            className="gap-2 bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
            data-testid="create-fund-button"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating, Publishing, and Starting Calculations...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                {submitState === 'error' ? 'Retry Publish' : 'Create, Publish, and View Results'}
              </>
            )}
          </Button>
          {createDisabledReason && (
            <p id="create-disabled-reason" className="max-w-xs text-sm text-presson-textMuted">
              {createDisabledReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DryRunMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-presson-background p-3">
      <p className="text-xs text-presson-textMuted">{label}</p>
      <p className="text-sm font-medium text-presson-text">{value}</p>
    </div>
  );
}

function formatNullablePercent(value: number | null) {
  return value == null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}
