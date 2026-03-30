/**
 * Legacy Route Redirector
 *
 * Automatically redirects legacy routes to new IA when enable_new_ia flag is ON.
 * Mount once inside the main routing tree.
 *
 * Features:
 * - Only active when enable_new_ia=true
 * - Uses replace: true for idempotent redirects (no history pollution)
 * - Logs redirects in development for debugging
 *
 * Usage:
 *   <LegacyRouteRedirector />
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useFlag } from '@/shared/useFlags';
import { LEGACY_ROUTE_MAP } from '@/config/routes';

export function LegacyRouteRedirector() {
  const isNewIA = useFlag('enable_new_ia');
  const [location, navigate] = useLocation();

  useEffect(() => {
    // Only redirect when flag is enabled
    if (!isNewIA) return;

    const currentPath =
      typeof window !== 'undefined' ? window.location.pathname : location.split(/[?#]/)[0] ?? location;
    const newPath = LEGACY_ROUTE_MAP.get(currentPath);

    if (newPath && newPath !== currentPath) {
      // Preserve query strings and hash fragments to maintain deep links
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const target = `${newPath}${search}${hash}`;

      // Log in development
      if (import.meta.env?.DEV) {
        console.warn(`[LegacyRouteRedirector] ${currentPath} → ${target}`);
      }

      // Idempotent redirect (replace: true prevents history pollution)
      navigate(target, { replace: true });
    }
  }, [isNewIA, location, navigate]);

  // Renders nothing - pure side-effect component
  return null;
}
