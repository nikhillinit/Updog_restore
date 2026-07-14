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

import { useState } from 'react';
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

export default function FundModelResultsReportsPage() {
  const [, params] = useRoute('/fund-model-results/:fundId/reports');
  const fundIdResult = parseFundIdParam(params?.fundId);
  const { currentFund, fundId: contextFundId, isLoading } = useFundContext();
  const [snapshot, setSnapshot] = useState<QualificationSnapshot | null>(null);

  const fundScopeMatches = fundIdResult.status === 'valid' && contextFundId === fundIdResult.fundId;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold text-pov-charcoal">Reports</h1>
        <p className="text-muted-foreground">
          {fundIdResult.status === 'valid'
            ? (currentFund?.name ?? `Fund ${fundIdResult.fundId}`)
            : 'Fund-scoped reporting'}
        </p>
      </header>

      {/* Workspace row (D-F.2). Reporting metrics are computed from recorded
          fund facts: static "Basis: Current" indicator (D-E). */}
      <WorkspaceNav
        fundId={fundIdResult.status === 'valid' ? String(fundIdResult.fundId) : null}
        fundLabel={
          fundIdResult.status === 'valid'
            ? (currentFund?.name ?? `Fund ${fundIdResult.fundId}`)
            : 'No fund'
        }
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

      {fundIdResult.status === 'valid' ? <GpQualificationStrip snapshot={snapshot} /> : null}

      {fundScopeMatches ? (
        <LpReportingMetricsPage onQualificationSnapshot={setSnapshot} />
      ) : fundIdResult.status === 'valid' ? (
        <StateCard
          title={isLoading ? 'Resolving fund scope' : 'Fund not available'}
          description={
            isLoading
              ? 'The reporting pipeline loads once the fund context matches this route.'
              : `Fund ${fundIdResult.fundId} is not available in your workspace scope, so the reporting pipeline is withheld.`
          }
          icon={isLoading ? 'info' : 'warning'}
        />
      ) : null}
    </div>
  );
}
