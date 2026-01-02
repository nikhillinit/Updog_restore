/**
 * Mobile Executive Dashboard Page
 *
 * Dedicated page for Agent 2's mobile-first executive dashboard.
 * Optimized for C-level decision makers with performance targets:
 * - First Contentful Paint: <1.5s on 3G networks
 * - Lighthouse Mobile Score: >90
 * - Bundle impact: <200KB additional payload
 */

import React, { Suspense, useState, useEffect } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import { POVBrandHeader } from '@/components/ui/POVLogo';

// Lazy load the main dashboard component for optimal bundle splitting
const MobileExecutiveDashboardDemo = React.lazy(() =>
  import('@/components/dashboard/MobileExecutiveDashboardDemo').then(module => ({
    default: module.MobileExecutiveDashboardDemo
  }))
);

// Performance monitoring
function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState({
    fcpTime: 0,
    bundleSize: 0,
    loadTime: 0,
    isLoaded: false
  });

  useEffect(() => {
    const startTime = performance.now();

    // Monitor First Contentful Paint
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              setMetrics(prev => ({ ...prev, fcpTime: entry.startTime }));
            }
          }
        });
        observer.observe({ entryTypes: ['paint'] });
      } catch (e) {
        console.warn('Performance Observer not fully supported');
      }
    }

    // Monitor load time
    const handleLoad = () => {
      const loadTime = performance.now() - startTime;
      setMetrics(prev => ({
        ...prev,
        loadTime,
        isLoaded: true
      }));
    };

    // Check if already loaded
    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, []);

  return metrics;
}

// Loading skeleton optimized for mobile
function MobileDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50">
      <POVBrandHeader
        title="Executive Dashboard"
        subtitle="Loading mobile-optimized insights..."
        variant="light"
      />
      <div className="max-w-4xl mx-auto p-4 space-y-6 animate-pulse">
        {/* Header skeleton */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-6 bg-slate-200 rounded w-48"></div>
              <div className="h-4 bg-slate-200 rounded w-32"></div>
            </div>
            <div className="flex gap-2">
              <div className="h-6 bg-slate-200 rounded w-16"></div>
              <div className="h-6 bg-slate-200 rounded w-16"></div>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 bg-slate-200 rounded w-24 flex-shrink-0"></div>
            ))}
          </div>
        </div>

        {/* Metrics skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-lg"></div>
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="space-y-4">
          <div className="h-6 bg-slate-200 rounded w-32"></div>
          <div className="h-48 bg-slate-200 rounded-lg"></div>
        </div>

        {/* AI insights skeleton */}
        <div className="space-y-4">
          <div className="h-6 bg-slate-200 rounded w-24"></div>
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="h-5 bg-slate-200 rounded w-40"></div>
                  <div className="h-4 bg-slate-200 rounded w-16"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-full"></div>
                  <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                </div>
                <div className="h-4 bg-slate-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Error fallback for mobile
function MobileErrorFallback({ error }: { error: Error }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
        <div className="text-red-500 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Dashboard Unavailable
        </h2>
        <p className="text-slate-600 mb-4">
          There was an issue loading the executive dashboard. Please try refreshing the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Refresh Page
        </button>
        <details className="mt-4 text-left">
          <summary className="text-sm text-slate-500 cursor-pointer">Technical Details</summary>
          <pre className="text-xs text-slate-400 mt-2 p-2 bg-slate-100 rounded overflow-auto">
            {error.message}
          </pre>
        </details>
      </div>
    </div>
  );
}

export default function MobileExecutiveDashboardPage() {
  const { currentFund, isLoading } = useFundContext();
  const performanceMetrics = usePerformanceMetrics();
  const [enableDebugger, setEnableDebugger] = useState(false);

  // Enable debugger in development or with URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.get('debug') === 'true' || process.env['NODE_ENV'] === 'development';
    setEnableDebugger(debugMode);
  }, []);

  // Performance logging
  useEffect(() => {
    if (performanceMetrics.isLoaded) {
      console.log('📱 Mobile Executive Dashboard Performance:', {
        'First Contentful Paint': `${performanceMetrics.fcpTime.toFixed(1)}ms`,
        'Total Load Time': `${performanceMetrics.loadTime.toFixed(1)}ms`,
        'Target FCP': '<1500ms',
        'Performance': performanceMetrics.fcpTime < 1500 ? '✅ Excellent' : '⚠️ Needs Optimization'
      });

      // Track performance metrics for monitoring
      if (typeof window !== 'undefined' && 'gtag' in window) {
        // Example: Send to Google Analytics
        (window as any).gtag?.('event', 'mobile_dashboard_performance', {
          'custom_map': {
            'fcp_time': performanceMetrics.fcpTime,
            'load_time': performanceMetrics.loadTime
          }
        });
      }
    }
  }, [performanceMetrics]);

  if (isLoading) {
    return <MobileDashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* SEO optimizations for mobile */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Mobile-optimized executive dashboard for venture capital fund management" />
      <meta name="keywords" content="VC dashboard, mobile, executive, portfolio management" />

      {/* Progressive Web App hints */}
      <meta name="theme-color" content="#1e40af" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />

      <POVBrandHeader
        title="Executive Dashboard"
        subtitle="Mobile-first insights for decision makers"
        variant="light"
      />

      <Suspense fallback={<MobileDashboardSkeleton />}>
        <React.StrictMode>
          <ErrorBoundary fallback={MobileErrorFallback}>
            <MobileExecutiveDashboardDemo
              enableDebugger={enableDebugger}
              performanceMode="optimized"
            />
          </ErrorBoundary>
        </React.StrictMode>
      </Suspense>

      {/* Performance monitoring badge (development only) */}
      {enableDebugger && performanceMetrics.isLoaded && (
        <div className="fixed bottom-4 left-4 bg-black/80 text-white p-2 rounded text-xs font-mono z-50">
          <div>FCP: {performanceMetrics.fcpTime.toFixed(1)}ms</div>
          <div>Load: {performanceMetrics.loadTime.toFixed(1)}ms</div>
          <div className={performanceMetrics.fcpTime < 1500 ? 'text-green-400' : 'text-red-400'}>
            {performanceMetrics.fcpTime < 1500 ? '✅ Fast' : '⚠️ Slow'}
          </div>
        </div>
      )}
    </div>
  );
}

// Simple error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ComponentType<{ error: Error }> },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ComponentType<{ error: Error }> }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Mobile Dashboard Error:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback;
      return <FallbackComponent error={this.state.error} />;
    }

    return this.props.children;
  }
}