import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FeatureFlagProvider } from '@/providers/FeatureFlagProvider';
import { StagingRibbon } from '@/components/StagingRibbon';
import { ErrorBoundary } from './components/ui/error-boundary';
import { BrandChartThemeProvider } from '@/lib/chart-theme/chart-theme-provider';
import { queryClient } from './lib/queryClient';
import { AppRouter } from '@/app/app-router';
import { DeferredDemoBanner, DeferredGuidedTour, DeferredToaster } from '@/app/deferred-shell';
import './styles/demo-animations.css';

export { AppRouter } from '@/app/app-router';
export { MobileNavigation } from '@/app/app-layout';
export type { AppRouteEntry, ArchivedPlaceholderRouteEntry, LPRouteEntry } from '@/app/app-routes';
export {
  ADMIN_GATED_ROUTES,
  APP_ROUTES,
  ARCHIVED_PLACEHOLDER_ROUTES,
  LEGACY_REDIRECT_ROUTES,
  LP_INDEX_REDIRECT_PATH,
  LP_INDEX_REDIRECT_TARGET,
  LP_ROUTES,
  PUBLIC_ENTRY_ROUTES,
} from '@/app/app-routes';

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <FeatureFlagProvider>
          <BrandChartThemeProvider>
            <StagingRibbon />
            <TooltipProvider>
              <DeferredDemoBanner />
              <DeferredToaster />
              <DeferredGuidedTour />
              <AppRouter />
            </TooltipProvider>
          </BrandChartThemeProvider>
        </FeatureFlagProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
