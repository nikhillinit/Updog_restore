import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useRoute } from 'wouter';

import { InternalEconomicsPanel } from '@/components/fund-results/InternalEconomicsPanel';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFundContext } from '@/contexts/FundContext';
import { useInternalAnalysis } from '@/hooks/useInternalAnalysis';
import {
  defaultInternalEconomicsSelection,
  groupInternalEconomicsPins,
  projectInternalEconomicsPins,
  type InternalEconomicsSelection,
  useInternalEconomics,
} from '@/hooks/useInternalEconomics';
import { WorkspaceBasisIndicator, WorkspaceNav } from '@/pages/fund-model-results/workspace-nav';

export type FundIdParseResult =
  | { status: 'missing'; fundId: null }
  | { status: 'invalid'; fundId: null }
  | { status: 'valid'; fundId: number };

export function parseFundIdParam(rawValue: string | undefined): FundIdParseResult {
  if (rawValue === undefined) return { status: 'missing', fundId: null };

  const trimmed = rawValue.trim();
  const parsed = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    return { status: 'invalid', fundId: null };
  }
  return { status: 'valid', fundId: parsed };
}

function StateCard({
  title,
  description,
  icon = 'warning',
}: {
  title: string;
  description: string;
  icon?: 'info' | 'warning';
}) {
  const Icon = icon === 'info' ? Info : AlertTriangle;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-pov-charcoal">
          <Icon className="h-5 w-5" />
          <span>{title}</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function InternalEconomicsContent({ fundId }: { fundId: number }) {
  const { drafts, references, isLoading, error } = useInternalAnalysis(fundId, {
    includeSuperseded: false,
  });
  const groups = useMemo(
    () => groupInternalEconomicsPins(projectInternalEconomicsPins(drafts, references)),
    [drafts, references]
  );
  const [selection, setSelection] = useState<InternalEconomicsSelection>({
    baselineRunId: null,
    currentRunId: null,
  });

  useEffect(() => {
    const defaults = defaultInternalEconomicsSelection(groups);
    const availableRunIds = new Set(groups.map((group) => group.runId));
    setSelection((previous) => {
      const currentRunId =
        previous.currentRunId !== null && availableRunIds.has(previous.currentRunId)
          ? previous.currentRunId
          : defaults.currentRunId;
      let baselineRunId =
        previous.baselineRunId !== null && availableRunIds.has(previous.baselineRunId)
          ? previous.baselineRunId
          : defaults.baselineRunId;
      if (baselineRunId === currentRunId) {
        baselineRunId = groups.find((group) => group.runId !== currentRunId)?.runId ?? null;
      }

      if (
        previous.baselineRunId === baselineRunId &&
        previous.currentRunId === currentRunId
      ) {
        return previous;
      }
      return { baselineRunId, currentRunId };
    });
  }, [groups]);

  const receipts = useInternalEconomics(fundId, [
    selection.baselineRunId,
    selection.currentRunId,
  ]);

  return (
    <section aria-labelledby="internal-economics-heading" className="space-y-5">
      <div>
        <h2 id="internal-economics-heading" className="text-lg font-semibold text-pov-charcoal">
          Economics comparison
        </h2>
        <p className="mt-1 text-sm text-presson-textMuted">
          Compare economics receipts already pinned to internal analysis drafts and references.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-presson-textMuted">Loading pinned economics runs...</p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-pov-charcoal"
        >
          {error.message}
        </p>
      ) : null}
      {!isLoading && !error ? (
        <InternalEconomicsPanel
          groups={groups}
          selection={selection}
          baseline={receipts.baseline}
          current={receipts.current}
          onSelectionChange={setSelection}
        />
      ) : null}
    </section>
  );
}

export default function FundModelResultsAnalysisPage() {
  const [, params] = useRoute('/fund-model-results/:fundId/analysis');
  const fundIdResult = parseFundIdParam(params?.fundId);
  const routeFundId = fundIdResult.fundId;
  const { currentFund, fundId: contextFundId, isLoading } = useFundContext();
  const fundScopeMatches = fundIdResult.status === 'valid' && contextFundId === routeFundId;
  const scopedFundName = fundScopeMatches ? currentFund?.name : undefined;
  const routeFundLabel =
    fundIdResult.status === 'valid' ? (scopedFundName ?? `Fund ${routeFundId}`) : 'No fund';

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold text-pov-charcoal">Internal Economics</h1>
        <p className="text-muted-foreground">
          {fundIdResult.status === 'valid' ? routeFundLabel : 'Fund-scoped economics comparison'}
        </p>
      </header>

      <WorkspaceNav
        fundId={fundScopeMatches ? String(routeFundId) : null}
        fundLabel={routeFundLabel}
        active="analysis"
        indicator={<WorkspaceBasisIndicator mode="current" />}
      />

      {fundIdResult.status === 'missing' ? (
        <StateCard
          title="Fund ID required"
          description="Economics comparison is unavailable because the route did not include a fund ID."
          icon="info"
        />
      ) : null}
      {fundIdResult.status === 'invalid' ? (
        <StateCard
          title="Invalid fund ID"
          description="Economics comparison is unavailable because the fund ID is not a positive integer."
        />
      ) : null}
      {fundScopeMatches ? (
        <InternalEconomicsContent fundId={routeFundId as number} />
      ) : fundIdResult.status === 'valid' ? (
        <StateCard
          title={isLoading ? 'Resolving fund scope' : 'Fund not available'}
          description={
            isLoading
              ? 'Economics comparison loads once the fund context matches this route.'
              : `Fund ${routeFundId} is not available in your workspace scope, so economics evidence is withheld.`
          }
          icon={isLoading ? 'info' : 'warning'}
        />
      ) : null}
    </div>
  );
}
