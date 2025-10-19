import type { ComponentType } from 'react';
import { lazy, memo } from 'react';

// A mock user object for demonstration. In a real app, this would come from an auth context.
interface User {
  hasFeature: (feature: 'basic' | 'analytics') => boolean;
}
const mockUser: User = {
  hasFeature: (feature) => {
    // For demo: enable 'basic' but not 'analytics'
    if (feature === 'basic') return true;
    return false;
  },
};

// Lazy-load and memoize tab panes for performance.
// The `memo` wrapper prevents re-renders when props haven't changed.
const OverviewPane = memo(lazy(() => import('./panes/OverviewPane')));
const AnalyticsPane = memo(lazy(() => import('./panes/AnalyticsPane')));
const SettingsPane = memo(lazy(() => import('./panes/SettingsPane')));

export const tabConfig = [
  {
    id: 'overview',
    label: 'Overview',
    component: OverviewPane as ComponentType<Record<string, never>>,
    isEnabled: (user: User) => user.hasFeature('basic'),
  },
  {
    id: 'analytics',
    label: 'Analytics',
    component: AnalyticsPane as ComponentType<Record<string, never>>,
    isEnabled: (user: User) => user.hasFeature('analytics'),
  },
  {
    id: 'settings',
    label: 'Settings',
    component: SettingsPane as ComponentType<Record<string, never>>,
    isEnabled: (_user: User) => true, // Always enabled
  },
] as const;

export type TabId = (typeof tabConfig)[number]['id'];

// Export a filtered list of tabs based on the user's permissions.
export const getEnabledTabs = (user: User = mockUser) =>
  tabConfig.filter((tab) => tab.isEnabled(user));
