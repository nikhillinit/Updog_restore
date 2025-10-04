/**
 * FlagGate Component
 *
 * Conditional rendering wrapper for feature-flagged UI.
 * Clean abstraction for if/else flag checks.
 *
 * Usage:
 *   <FlagGate enabled={flags.enable_new_ia} fallback={<OldUI />}>
 *     <NewUI />
 *   </FlagGate>
 */

import { PropsWithChildren, ReactNode } from 'react';

export interface FlagGateProps {
  /** Whether to render children (flag enabled) or fallback (flag disabled) */
  enabled: boolean;
  /** Rendered when enabled=false. Defaults to null (render nothing) */
  fallback?: ReactNode;
}

export function FlagGate({
  enabled,
  fallback = null,
  children,
}: PropsWithChildren<FlagGateProps>) {
  return enabled ? <>{children}</> : <>{fallback}</>;
}
