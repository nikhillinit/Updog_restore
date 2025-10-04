/**
 * Legacy Route Redirector
 *
 * Automatically redirects legacy routes to new IA when enable_new_ia flag is ON.
 * Mount once at app root inside router context.
 *
 * Features:
 * - Only active when enable_new_ia=true
 * - Uses replace: true for idempotent redirects (no history pollution)
 * - Logs redirects in development for debugging
 *
 * Usage:
 *   <BrowserRouter>
 *     <LegacyRouteRedirector />
 *     <Routes>...</Routes>
 *   </BrowserRouter>
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFlag } from '@/shared/useFlags';
import { LEGACY_ROUTE_MAP } from '@/config/routes';

export function LegacyRouteRedirector() {
  const isNewIA = useFlag('enable_new_ia');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Only redirect when flag is enabled
    if (!isNewIA) return;

    const currentPath = location.pathname;
    const newPath = LEGACY_ROUTE_MAP.get(currentPath);

    if (newPath && newPath !== currentPath) {
      // Preserve query strings and hash fragments to maintain deep links
      const target = `${newPath}${location.search}${location.hash}`;

      // Log in development
      if (import.meta.env?.DEV) {
        console.info(`[LegacyRouteRedirector] ${currentPath} → ${target}`);
      }

      // Idempotent redirect (replace: true prevents history pollution)
      navigate(target, { replace: true });
    }
  }, [isNewIA, location.pathname, location.search, location.hash, navigate]);

  // Renders nothing - pure side-effect component
  return null;
}
