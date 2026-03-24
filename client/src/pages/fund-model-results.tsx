/**
 * Fund Model Results Page
 *
 * Displays fund modeling output backed by GET /api/funds/:id/results.
 * Each section renders independently based on server-reported availability.
 * No sessionStorage reads for results data.
 *
 * Route: /fund-model-results/:fundId
 *
 * @module client/pages/fund-model-results
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  FundResultsReadV1,
  ScorecardPayload,
  WaterfallSetupSection,
} from '@shared/contracts/fund-results-v1.contract';

// ============================================================================
// TYPES
// ============================================================================

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'data'; results: FundResultsReadV1 };

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fade-in effect triggered once when the element enters the viewport.
 * Uses IntersectionObserver with a 10% visibility threshold.
 */
function useFadeInOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

/** Wrapper div that fades in when scrolled into view */
function FadeInSection({ children }: { children: React.ReactNode }) {
  const { ref, isVisible } = useFadeInOnScroll();

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// DATA FETCHING
// ============================================================================

function useFundResults(fundId: string | null): FetchState {
  const [state, setState] = useState<FetchState>({ kind: 'loading' });

  const fetchResults = useCallback(async () => {
    if (!fundId || fundId === 'latest') return;
    try {
      const res = await fetch(`/api/funds/${fundId}/results`);
      if (res.status === 404) {
        setState({ kind: 'error', message: 'Fund not found' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error', message: `Server error (${res.status})` });
        return;
      }
      const data = (await res.json()) as FundResultsReadV1;
      setState({ kind: 'data', results: data });
    } catch {
      setState({ kind: 'error', message: 'Network error' });
    }
  }, [fundId]);

  useEffect(() => {
    if (!fundId || fundId === 'latest') {
      setState({ kind: 'error', message: 'No fund ID provided' });
      return;
    }
    void fetchResults();
  }, [fundId, fetchResults]);

  // Polling: refetch every 5s when status is pending or calculating
  useEffect(() => {
    if (state.kind !== 'data') return;
    const status = state.results.status;
    if (status !== 'pending' && status !== 'calculating') return;
    const timer = setInterval(() => void fetchResults(), 5000);
    return () => clearInterval(timer);
  }, [state, fetchResults]);

  return state;
}

// ============================================================================
// REASON CODE COPY
// ============================================================================

const REASON_COPY: Record<string, string> = {
  NO_PUBLISHED_CONFIG: 'Publish your fund configuration to see this section.',
  CALCULATION_PENDING: 'Results are being calculated. Check back shortly.',
  STALE_EVIDENCE: 'A newer configuration was published. Request recalculation to update.',
  INVALID_PUBLISHED_CONFIG: 'The published configuration has validation issues.',
  NO_AUTHORITATIVE_SOURCE: 'This section is not yet available for your fund.',
};

function reasonCopyFor(section: { [key: string]: unknown }): string {
  // Bracket notation required: TS4111 with noPropertyAccessFromIndexSignature
  const code = typeof section['reasonCode'] === 'string' ? section['reasonCode'] : undefined;
  const reason = typeof section['reason'] === 'string' ? section['reason'] : undefined;
  if (code && REASON_COPY[code]) {
    return REASON_COPY[code];
  }
  return reason ?? 'Not available';
}

// ============================================================================
// OVERVIEW (SCORECARD) CARD
// ============================================================================

function OverviewCard({ payload }: { payload: ScorecardPayload }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <FactTile label="Fund Size" value={`$${(payload.fundSize.value / 1_000_000).toFixed(0)}M`} />
      {payload.vintageYear && (
        <FactTile label="Vintage Year" value={String(payload.vintageYear.value)} />
      )}
      {payload.reserveRatio && (
        <FactTile
          label="Reserve Ratio"
          value={`${(payload.reserveRatio.value * 100).toFixed(1)}%`}
        />
      )}
      {payload.avgConfidence && (
        <FactTile
          label="Avg Confidence"
          value={`${(payload.avgConfidence.value * 100).toFixed(0)}%`}
        />
      )}
      {payload.yearsToFullDeploy && (
        <FactTile label="Years to Full Deploy" value={`${payload.yearsToFullDeploy.value} yrs`} />
      )}
      {payload.lastCalculatedAt && (
        <FactTile
          label="Last Calculated"
          value={new Date(payload.lastCalculatedAt.value).toLocaleDateString()}
        />
      )}
    </div>
  );
}

function WaterfallSetupCard({ payload }: { payload: WaterfallSetupSection }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FactTile label="Structure" value={capitalize(payload.type)} />
        <FactTile label="Tiers" value={String(payload.tierCount)} />
        <FactTile
          label="Recycling"
          value={
            payload.recyclingEnabled == null
              ? 'Not set'
              : payload.recyclingEnabled
                ? 'Enabled'
                : 'Disabled'
          }
        />
        <FactTile
          label="Recycling Type"
          value={payload.recyclingType ? capitalize(payload.recyclingType) : 'Not set'}
        />
      </div>

      <div className="space-y-3">
        {payload.tiers.map((tier, index) => (
          <div key={`${tier.name}-${index}`} className="rounded-md border border-beige-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-charcoal">{tier.name}</p>
                <p className="text-sm text-charcoal-500 font-poppins">
                  GP {tier.gpSplit}% / LP {tier.lpSplit}%
                </p>
              </div>
              {tier.condition && tier.condition !== 'none' && tier.conditionValue != null && (
                <p className="text-sm text-charcoal-500 font-poppins">
                  {tier.condition.toUpperCase()} hurdle {tier.conditionValue}
                </p>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <FactTile
                label="Preferred Return"
                value={tier.preferredReturn != null ? percent(tier.preferredReturn) : 'Not set'}
              />
              <FactTile
                label="Catch-up"
                value={tier.catchUp != null ? percent(tier.catchUp) : 'Not set'}
              />
              <FactTile
                label="Recycling Cap"
                value={
                  payload.recyclingCap != null ? percentPoints(payload.recyclingCap) : 'Not set'
                }
              />
              <FactTile
                label="Future Recycling"
                value={
                  payload.allowFutureRecycling == null
                    ? 'Not set'
                    : payload.allowFutureRecycling
                      ? 'Allowed'
                      : 'Not allowed'
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function percentPoints(value: number) {
  return `${value}%`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-beige-50 rounded-md p-3">
      <p className="text-xs text-charcoal-400 font-poppins">{label}</p>
      <p className="text-lg font-medium text-charcoal">{value}</p>
    </div>
  );
}

// ============================================================================
// SECTION RENDERER
// ============================================================================

interface SectionRendererProps {
  title: string;
  // Accept the Zod-inferred union types: each section is a discriminated union
  // of available/unavailable/pending/failed variants with different shapes
  section: {
    status: string;
    reason?: string | undefined;
    reasonCode?: string | undefined;
    payload?: unknown | undefined;
    legacyEvidence?: boolean | undefined;
    [key: string]: unknown;
  };
  renderPayload?: (payload: unknown) => React.ReactNode;
}

function SectionRenderer({ title, section, renderPayload }: SectionRendererProps) {
  if (section.status === 'available') {
    return (
      <div className="bg-white rounded-lg border border-beige-200 p-6">
        <h2 className="text-lg font-medium text-charcoal mb-4">{title}</h2>
        {section.legacyEvidence && (
          <p className="text-xs text-charcoal-400 mb-2">
            Based on previous calculation (legacy data)
          </p>
        )}
        {renderPayload ? (
          renderPayload(section.payload)
        ) : (
          <pre className="text-sm text-charcoal-600 whitespace-pre-wrap font-mono">
            {JSON.stringify(section.payload, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  const statusLabel =
    section.status === 'failed'
      ? section.reasonCode === 'INVALID_PUBLISHED_CONFIG'
        ? 'Configuration issue'
        : 'Calculation failed'
      : section.status === 'pending'
        ? 'Pending'
        : '';
  const copy = reasonCopyFor(section);

  return (
    <div className="bg-beige-50 rounded-lg border border-beige-200 p-6">
      <h2 className="text-lg font-medium text-charcoal-400 mb-2">{title}</h2>
      <p className="text-sm text-charcoal-500 font-poppins">
        {statusLabel ? `${statusLabel}: ` : ''}
        {copy}
      </p>
    </div>
  );
}

// ============================================================================
// STATE COMPONENTS
// ============================================================================

function LoadingState() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-24 text-center" role="status">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-beige-100 rounded w-1/3 mx-auto" />
        <div className="h-4 bg-beige-100 rounded w-1/2 mx-auto" />
        <div className="h-32 bg-beige-100 rounded" />
        <div className="h-32 bg-beige-100 rounded" />
      </div>
    </div>
  );
}

function LatestErrorState() {
  const [, navigate] = useLocation();
  return (
    <div className="max-w-xl mx-auto px-8 py-24 text-center">
      <Alert className="mb-8 border-beige-200">
        <AlertCircle className="h-5 w-5 text-charcoal-400" />
        <AlertTitle>Invalid results route</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">
          No fund ID specified. Please complete the modeling wizard to view results.
        </AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="border-charcoal-300 text-charcoal hover:bg-charcoal-50"
        onClick={() => navigate('/fund-setup')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Go to Fund Setup
      </Button>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="max-w-xl mx-auto px-8 py-24 text-center">
      <Alert className="mb-8 border-beige-200">
        <AlertCircle className="h-5 w-5 text-charcoal-400" />
        <AlertTitle>Error loading results</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">{message}</AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="border-charcoal-300 text-charcoal hover:bg-charcoal-50"
        onClick={() => navigate('/fund-setup')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Fund Setup
      </Button>
    </div>
  );
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

function FundModelResultsPage() {
  const [, params] = useRoute('/fund-model-results/:fundId');
  const fundId = params?.fundId ?? null;

  // Hook must be called unconditionally (React rules of hooks)
  const fetchState = useFundResults(fundId);

  // Handle /latest or missing fundId
  if (fundId === 'latest' || !fundId) {
    return <LatestErrorState />;
  }

  if (fetchState.kind === 'loading') {
    return <LoadingState />;
  }

  if (fetchState.kind === 'error') {
    return <ErrorState message={fetchState.message} />;
  }

  const { results } = fetchState;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Fund identity header */}
      <div>
        <h1 className="text-2xl font-semibold text-charcoal">{results.fund.name}</h1>
        <p className="text-charcoal-500 font-poppins">
          Vintage {results.fund.vintageYear} | Fund size: $
          {(results.fund.size / 1_000_000).toFixed(0)}M
        </p>
        {results.status !== 'ready' && (
          <p className="text-sm text-charcoal-400 mt-1">Status: {results.status}</p>
        )}
      </div>

      {/* Reserve section */}
      <FadeInSection>
        <SectionRenderer title="Reserve Allocation" section={results.sections.reserve} />
      </FadeInSection>

      {/* Pacing section */}
      <FadeInSection>
        <SectionRenderer title="Deployment Pacing" section={results.sections.pacing} />
      </FadeInSection>

      {/* Overview (scorecard) section */}
      <FadeInSection>
        <SectionRenderer
          title="Overview"
          section={results.sections.scorecard}
          renderPayload={(p) => <OverviewCard payload={p as ScorecardPayload} />}
        />
      </FadeInSection>

      {/* Scenarios section */}
      <FadeInSection>
        <SectionRenderer title="Scenario Analysis" section={results.sections.scenarios} />
      </FadeInSection>

      {/* Waterfall section */}
      <FadeInSection>
        <SectionRenderer
          title="Waterfall Setup"
          section={results.sections.waterfall}
          renderPayload={(p) => <WaterfallSetupCard payload={p as WaterfallSetupSection} />}
        />
      </FadeInSection>
    </div>
  );
}

export default FundModelResultsPage;
