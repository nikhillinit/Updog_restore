/**
 * ReviewStep - Step 7: Review & Create
 *
 * Final step in the fund setup wizard showing a summary of all configurations
 * and allowing the user to create the fund.
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
import { useFundSelector } from '@/stores/useFundSelector';
import { fundStore } from '@/stores/fundStore';
import { fundStoreToCreateV1, fundStoreToDraftWriteV1 } from '@/adapters/fund-store-adapters';
import { createFund, normalizeCreateFundResponse } from '@/services/funds';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/formatting';

interface SummarySection {
  title: string;
  items: Array<{ label: string; value: string | number; status?: 'ok' | 'warning' | 'missing' }>;
}

type SubmitState = 'idle' | 'submitting' | 'saving-draft' | 'publishing' | 'error';

type ErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  issues?: Array<{ path: (string | number)[]; message: string }>;
};

async function readApiError(response: Response, fallback: string): Promise<Error> {
  const errBody = (await response.json().catch(() => ({}) as ErrorBody)) as ErrorBody;
  const message = errBody.error || errBody.message || `${fallback} (HTTP ${response.status})`;
  return new Error(message);
}

/** Save full wizard config as draft via PUT /api/funds/:id/draft */
async function saveDraft(fundId: number): Promise<void> {
  const storeState = fundStore.getState();
  const draftPayload = fundStoreToDraftWriteV1(storeState);

  const response = await fetch(`/api/funds/${fundId}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draftPayload),
  });

  if (!response.ok) {
    throw await readApiError(response, 'Draft save failed');
  }
}

async function publishConfig(fundId: number): Promise<void> {
  const response = await fetch(`/api/funds/${fundId}/publish`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw await readApiError(response, 'Publish failed');
  }
}

export default function ReviewStep() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { setCurrentFund } = useFundContext();

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

  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Track created fund ID for retry logic (skip POST, retry PUT only)
  const [createdFundId, setCreatedFundId] = useState<number | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

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
          },
          {
            label: 'Fund Size',
            value: formatUSD(fundSize ?? 0),
            status: fundSize ? 'ok' : 'warning',
          },
          {
            label: 'Vintage Year',
            value: vintageYear ?? 'Not set',
            status: vintageYear ? 'ok' : 'warning',
          },
          {
            label: 'Fund Life',
            value: fundLife ? `${fundLife} years` : 'Not set',
            status: fundLife ? 'ok' : 'warning',
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
          },
          {
            label: 'Carry',
            value: carriedInterest != null ? `${carriedInterest.toFixed(0)}%` : 'Not set',
            status: carriedInterest != null ? 'ok' : 'warning',
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
          },
          {
            label: 'Waterfall',
            value: waterfallType ?? 'Not set',
            status: waterfallType ? 'ok' : 'warning',
          },
          { label: 'Recycling', value: recyclingEnabled ? 'Enabled' : 'Disabled', status: 'ok' },
          {
            label: 'Establishment',
            value: establishmentDate ?? 'Not set',
            status: establishmentDate ? 'ok' : 'warning',
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

  const handleBack = useCallback(() => {
    setLocation('/fund-setup?step=6');
  }, [setLocation]);

  const finalizeSuccessfulPublish = useCallback(
    async (fundId: number) => {
      try {
        await queryClient.invalidateQueries({ queryKey: ['funds'] });
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
    if (
      submitState === 'submitting' ||
      submitState === 'saving-draft' ||
      submitState === 'publishing'
    ) {
      return;
    }

    let fundId = createdFundId;
    let activeStage: SubmitState = 'idle';

    setSubmitError(null);

    try {
      if (fundId == null) {
        activeStage = 'submitting';
        setSubmitState('submitting');

        const storeState = fundStore.getState();
        const payload = fundStoreToCreateV1(storeState);
        const raw = await createFund({ ...payload });
        const fund = normalizeCreateFundResponse(raw);

        fundId = fund.id;
        setCreatedFundId(fund.id);
      }

      if (!draftSaved) {
        activeStage = 'saving-draft';
        setSubmitState('saving-draft');
        await saveDraft(fundId);
        setDraftSaved(true);
      }

      activeStage = 'publishing';
      setSubmitState('publishing');
      await publishConfig(fundId);

      await finalizeSuccessfulPublish(fundId);
    } catch (err) {
      const fallbackMessage =
        activeStage === 'publishing'
          ? 'Publish failed'
          : activeStage === 'saving-draft'
            ? 'Draft save failed'
            : 'Failed to create fund';
      const message = err instanceof Error ? err.message : fallbackMessage;
      setSubmitError(message);
      setSubmitState('error');
    }
  }, [createdFundId, draftSaved, finalizeSuccessfulPublish, submitState]);

  const getStatusIcon = (status?: 'ok' | 'warning' | 'missing') => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'missing':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const isSubmitting =
    submitState === 'submitting' || submitState === 'saving-draft' || submitState === 'publishing';

  return (
    <div className="space-y-6 pb-8" data-testid="review-step">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-presson-text">Review & Create Fund</h1>
        <p className="text-presson-textMuted">
          Review your fund configuration before creating. You can go back to any step to make
          changes.
        </p>
      </div>

      {/* Validation Summary */}
      <Alert
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
              <AlertTriangle className="h-5 w-5 text-amber-500" />
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
                    <span className="text-sm font-medium text-presson-text">{item.value}</span>
                    {getStatusIcon(item.status)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      {/* Error display */}
      {submitState === 'error' && submitError && (
        <Alert className="border-l-4 border-l-red-500 bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <AlertTitle>Fund Creation Failed</AlertTitle>
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
            disabled={validationSummary.missing > 0 || isSubmitting}
            className="gap-2 bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
            data-testid="create-fund-button"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {submitState === 'saving-draft'
                  ? 'Saving Config...'
                  : submitState === 'publishing'
                    ? 'Publishing Config...'
                    : 'Creating Fund...'}
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                {submitState === 'error' ? 'Retry' : 'Create Fund'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
