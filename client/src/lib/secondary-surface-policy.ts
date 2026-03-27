import { FLAGS } from '@/core/flags/featureFlags';

export type SecondarySurfaceKey = 'planning' | 'kpi-manager' | 'kpi-submission';

type SecondarySurfacePolicy = {
  routePath: string;
  navId?: string;
  enabled: boolean;
  disabledRedirect: string;
};

const SECONDARY_SURFACE_POLICIES: Record<SecondarySurfaceKey, SecondarySurfacePolicy> = {
  planning: {
    routePath: '/planning',
    navId: 'planning',
    enabled: !FLAGS.HIDE_PLANNING_SURFACE,
    disabledRedirect: '/portfolio?tab=reserve-planning',
  },
  'kpi-manager': {
    routePath: '/kpi-manager',
    enabled: !FLAGS.HIDE_KPI_SURFACES,
    disabledRedirect: '/dashboard',
  },
  'kpi-submission': {
    routePath: '/kpi-submission',
    enabled: !FLAGS.HIDE_KPI_SURFACES,
    disabledRedirect: '/dashboard',
  },
};

export function getSecondarySurfacePolicy(key: SecondarySurfaceKey): SecondarySurfacePolicy {
  return SECONDARY_SURFACE_POLICIES[key];
}

export function isSecondarySurfaceNavVisible(navId: string): boolean {
  const policy = Object.values(SECONDARY_SURFACE_POLICIES).find((entry) => entry.navId === navId);
  return policy ? policy.enabled : true;
}

export function getSecondarySurfaceRedirect(routePath: string): string | null {
  const policy = Object.values(SECONDARY_SURFACE_POLICIES).find(
    (entry) => entry.routePath === routePath
  );
  return policy && !policy.enabled ? policy.disabledRedirect : null;
}
