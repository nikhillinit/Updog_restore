/**
 * AdminRoute - Protected route wrapper for admin/internal pages
 *
 * Security: Admin routes can only be accessed when:
 * 1. The corresponding feature flag is enabled via environment variable
 *    (localStorage overrides are NOT supported for admin flags)
 * 2. Optionally, only in development mode
 *
 * This prevents client-side bypass attacks where users could set
 * localStorage values to enable admin features.
 */

import { type ReactNode } from 'react';
import { Redirect } from 'wouter';
import { FLAGS } from '@/core/flags/featureFlags';

interface AdminRouteProps {
  /** The admin flag to check (must be an admin flag without localStorage override) */
  flag: keyof typeof FLAGS;
  /** The component to render if access is granted */
  children: ReactNode;
  /** Optional: only allow access in development mode */
  devOnly?: boolean;
  /** Optional: custom redirect path (default: /dashboard) */
  redirectTo?: string;
}

/**
 * Access Denied component shown when admin access is not granted
 */
function AccessDenied() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-presson-bg">
      <div className="text-center p-8 max-w-md">
        <div className="mb-4">
          <svg
            className="mx-auto h-16 w-16 text-presson-negative"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-presson-text mb-2">Access Denied</h1>
        <p className="text-presson-textMuted mb-6">
          This page is restricted to authorized administrators.
        </p>
        <a
          href="/dashboard"
          className="inline-flex items-center px-4 py-2 bg-presson-accent text-presson-accentOn rounded-md hover:opacity-90 transition-opacity"
        >
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}

export function AdminRoute({
  flag,
  children,
  devOnly = false,
  redirectTo,
}: AdminRouteProps) {
  const isDev = import.meta.env.DEV;
  const flagEnabled = FLAGS[flag];

  // Check dev-only restriction
  if (devOnly && !isDev) {
    if (redirectTo) {
      return <Redirect to={redirectTo} />;
    }
    return <AccessDenied />;
  }

  // Check feature flag (admin flags have no localStorage override)
  if (!flagEnabled) {
    if (redirectTo) {
      return <Redirect to={redirectTo} />;
    }
    return <AccessDenied />;
  }

  return <>{children}</>;
}

export default AdminRoute;
