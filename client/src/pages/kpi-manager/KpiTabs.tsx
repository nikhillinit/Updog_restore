import { Suspense } from 'react';
import type { TabId } from './tabs-config';
import { getEnabledTabs } from './tabs-config';

// Assuming you have a shared Tabs component, like from shadcn/ui
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface KpiTabsProps {
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
  // The `tabContent` prop is no longer needed as it's derived from the config.
}

const TabContentLoader = () => <div className="p-4">Loading tab...</div>;

export function KpiTabs({ activeTab, onTabChange }: KpiTabsProps) {
  // Get the list of tabs the current user is allowed to see.
  const enabledTabs = getEnabledTabs();
  const ActiveTabComponent = enabledTabs.find((t) => t.id === activeTab)?.component;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as TabId)}
      className="w-full"
    >
      <TabsList>
        {enabledTabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* The content for the active tab */}
      <TabsContent value={activeTab} className="mt-4">
        <Suspense fallback={<TabContentLoader />}>
          {ActiveTabComponent ? <ActiveTabComponent /> : <div>Selected tab content not found.</div>}
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
