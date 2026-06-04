import React, { Suspense, useEffect, useState } from 'react';
import { useRouteControlFlag } from '@/app/route-control-flags';

const DeferredToasterView = React.lazy(() =>
  import('@/components/ui/toaster').then((mod) => ({ default: mod.Toaster }))
);
const DeferredGuidedTourView = React.lazy(() =>
  import('@/components/onboarding/GuidedTour').then((mod) => ({ default: mod.GuidedTour }))
);
const DeferredDemoBannerView = React.lazy(() => import('@/components/demo/DemoBanner'));

const ONBOARDING_TOUR_STORAGE_KEY = 'onboarding_seen_gp_v1';

export function DeferredToaster() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShouldRender(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!shouldRender) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DeferredToasterView />
    </Suspense>
  );
}

export function DeferredGuidedTour() {
  const [shouldLoad, setShouldLoad] = useState(false);
  const onboardingTourEnabled = useRouteControlFlag('onboarding_tour');

  useEffect(() => {
    if (!onboardingTourEnabled) {
      return;
    }

    try {
      if (localStorage.getItem(ONBOARDING_TOUR_STORAGE_KEY) == null) {
        setShouldLoad(true);
      }
    } catch {
      setShouldLoad(true);
    }
  }, [onboardingTourEnabled]);

  if (!shouldLoad) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DeferredGuidedTourView />
    </Suspense>
  );
}

export function DeferredDemoBanner() {
  const [shouldLoad, setShouldLoad] = useState(import.meta.env.DEMO_MODE === 'true');

  useEffect(() => {
    if (import.meta.env.DEMO_MODE === 'true') {
      return;
    }

    if (typeof window !== 'undefined' && window.location.search.includes('DEMO_MODE')) {
      setShouldLoad(true);
    }
  }, []);

  if (!shouldLoad) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DeferredDemoBannerView />
    </Suspense>
  );
}
