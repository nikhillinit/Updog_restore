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
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';

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
// SECTION RENDERER
// ============================================================================

interface SectionRendererProps {
  title: string;
  section: { status: string; reason?: string; payload?: unknown; legacyEvidence?: boolean };
}

function SectionRenderer({ title, section }: SectionRendererProps) {
  if (section.status === 'available') {
    return (
      <div className="bg-white rounded-lg border border-beige-200 p-6">
        <h2 className="text-lg font-medium text-charcoal mb-4">{title}</h2>
        {section.legacyEvidence && (
          <p className="text-xs text-charcoal-400 mb-2">
            Based on previous calculation (legacy data)
          </p>
        )}
        <pre className="text-sm text-charcoal-600 whitespace-pre-wrap font-mono">
          {JSON.stringify(section.payload, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="bg-beige-50 rounded-lg border border-beige-200 p-6">
      <h2 className="text-lg font-medium text-charcoal-400 mb-2">{title}</h2>
      <p className="text-sm text-charcoal-500 font-poppins">
        {section.status === 'pending' ? 'Calculation in progress...' : ''}
        {section.status === 'unavailable' ? section.reason || 'Not available' : ''}
        {section.status === 'failed'
          ? `Calculation failed: ${section.reason || 'Unknown error'}`
          : ''}
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
  const [, navigate] = useLocation();
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

      {/* Scorecard section */}
      <FadeInSection>
        <SectionRenderer title="Fund Scorecard" section={results.sections.scorecard} />
      </FadeInSection>

      {/* Scenarios section */}
      <FadeInSection>
        <SectionRenderer title="Scenario Analysis" section={results.sections.scenarios} />
      </FadeInSection>

      {/* Waterfall section */}
      <FadeInSection>
        <SectionRenderer title="Waterfall Distribution" section={results.sections.waterfall} />
      </FadeInSection>
    </div>
  );
}

export default FundModelResultsPage;
