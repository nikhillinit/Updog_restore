/**
 * Fund Model Results — Reports (Plan 9 Wave 9B1, D-F.3)
 *
 * Fund-scoped reports destination: validates the route fund id with the
 * existing /^\d+$/ idiom, verifies FundContext resolved to the SAME fund
 * (never rendering another fund's pipeline), and renders the GP
 * qualification summary strip ABOVE the existing LP reporting metrics
 * pipeline. `/lp-reporting/metrics` remains the unchanged compatibility
 * route.
 *
 * Route: /fund-model-results/:fundId/reports
 *
 * @module client/pages/fund-model-results-reports
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoute } from 'wouter';
import { AlertTriangle, Info } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  GpQualificationStrip,
  type QualificationSnapshot,
} from '@/components/lp-reporting/GpQualificationStrip';
import LpReportingMetricsPage from '@/pages/lp-reporting/metrics';
import { useFundContext } from '@/contexts/FundContext';
import { WorkspaceBasisIndicator, WorkspaceNav } from '@/pages/fund-model-results/workspace-nav';

type FundIdParseResult =
  | { status: 'missing'; fundId: null }
  | { status: 'invalid'; fundId: null }
  | { status: 'valid'; fundId: number };

function parseFundIdParam(rawValue: string | undefined): FundIdParseResult {
  if (rawValue === undefined) {
    return { status: 'missing', fundId: null };
  }

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

interface FundKeyedSnapshot {
  fundId: number;
  snapshot: QualificationSnapshot;
}

export default function FundModelResultsReportsPage() {
  const [, params] = useRoute('/fund-model-results/:fundId/reports');
  const fundIdResult = parseFundIdParam(params?.fundId);
  const routeFundId = fundIdResult.fundId;
  const { currentFund, fundId: contextFundId, isLoading } = useFundContext();
  // Review P1-2: the snapshot is keyed by the fund it was produced for and
  // cleared on fund change, so another fund's qualification state can never
  // render as authoritative on this route.
  const [keyedSnapshot, setKeyedSnapshot] = useState<FundKeyedSnapshot | null>(null);
  const previousRouteFundIdRef = useRef<number | null>(routeFundId);

  useEffect(() => {
    // Clear on fund CHANGE only (child effects publish before parent effects
    // on mount; an unconditional clear would wipe the initial publication).
    if (previousRouteFundIdRef.current !== routeFundId) {
      previousRouteFundIdRef.current = routeFundId;
      setKeyedSnapshot(null);
    }
  }, [routeFundId]);

  const handleSnapshot = useCallback(
    (snapshot: QualificationSnapshot) => {
      if (routeFundId !== null) {
        setKeyedSnapshot({ fundId: routeFundId, snapshot });
      }
    },
    [routeFundId]
  );

  const fundScopeMatches = fundIdResult.status === 'valid' && contextFundId === routeFundId;
  const snapshot =
    keyedSnapshot !== null && keyedSnapshot.fundId === routeFundId ? keyedSnapshot.snapshot : null;
  // Review P1-2: never show prior-fund identity (name included) outside a
  // verified scope match; unavailable funds get disabled nav links (D-C).
  const scopedFundName = fundScopeMatches ? currentFund?.name : undefined;
  const routeFundLabel =
    fundIdResult.status === 'valid' ? (scopedFundName ?? `Fund ${routeFundId}`) : 'No fund';

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold text-pov-charcoal">Reports</h1>
        <p className="text-muted-foreground">
          {fundIdResult.status === 'valid' ? routeFundLabel : 'Fund-scoped reporting'}
        </p>
      </header>

      {/* Workspace row (D-F.2). Reporting metrics are computed from recorded
          fund facts: static "Basis: Current" indicator (D-E). */}
      <WorkspaceNav
        fundId={fundScopeMatches ? String(routeFundId) : null}
        fundLabel={routeFundLabel}
        active="reports"
        indicator={<WorkspaceBasisIndicator mode="current" />}
      />

      {fundIdResult.status === 'missing' ? (
        <StateCard
          title="Fund ID required"
          description="Fund reports are unavailable because the route did not include a fund ID."
          icon="info"
        />
      ) : null}

      {fundIdResult.status === 'invalid' ? (
        <StateCard
          title="Invalid fund ID"
          description="Fund reports are unavailable because the fund ID is not a positive integer."
        />
      ) : null}

      {fundScopeMatches ? (
        <>
          <GpQualificationStrip snapshot={snapshot} />
          <LpReportingMetricsPage onQualificationSnapshot={handleSnapshot} />
        </>
      ) : fundIdResult.status === 'valid' ? (
        <StateCard
          title={isLoading ? 'Resolving fund scope' : 'Fund not available'}
          description={
            isLoading
              ? 'The reporting pipeline loads once the fund context matches this route.'
              : `Fund ${routeFundId} is not available in your workspace scope, so the reporting pipeline is withheld.`
          }
          icon={isLoading ? 'info' : 'warning'}
        />
      ) : null}
    </div>
  );
}
