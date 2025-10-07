import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from './tabs/OverviewTab';
import { AllocationsTab } from './tabs/AllocationsTab';
import { ReallocationTab } from './tabs/ReallocationTab';

export type PortfolioTabValue = 'overview' | 'allocations' | 'reallocation';

export interface PortfolioTabsProps {
  /**
   * Default tab to display on initial load
   * @default 'overview'
   */
  defaultTab?: PortfolioTabValue;

  /**
   * Callback fired when the active tab changes
   */
  onTabChange?: (tab: PortfolioTabValue) => void;

  /**
   * If true, sync active tab with URL query parameter (?tab=allocations)
   * @default true
   */
  syncWithUrl?: boolean;
}

export function PortfolioTabs({
  defaultTab = 'overview',
  onTabChange,
  syncWithUrl = true
}: PortfolioTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Get active tab from URL or use default
  const activeTab = syncWithUrl
    ? (searchParams.get('tab') as PortfolioTabValue) || defaultTab
    : defaultTab;

  // Handle tab change
  const handleTabChange = (value: string) => {
    const tabValue = value as PortfolioTabValue;

    // Update URL if syncing is enabled
    if (syncWithUrl) {
      setSearchParams({ tab: tabValue }, { replace: true });
    }

    // Fire callback
    onTabChange?.(tabValue);
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="w-full portfolio-tabs"
    >
      <TabsList className="grid w-full grid-cols-3 bg-white border border-pov-beige h-12 rounded-lg p-1">
        <TabsTrigger
          value="overview"
          className="font-inter font-medium text-sm data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white transition-all duration-200"
        >
          Overview
        </TabsTrigger>
        <TabsTrigger
          value="allocations"
          className="font-inter font-medium text-sm data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white transition-all duration-200"
        >
          Allocations
        </TabsTrigger>
        <TabsTrigger
          value="reallocation"
          className="font-inter font-medium text-sm data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white transition-all duration-200"
        >
          Reallocation
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6 portfolio-tab-content">
        <OverviewTab />
      </TabsContent>

      <TabsContent value="allocations" className="mt-6 portfolio-tab-content">
        <AllocationsTab />
      </TabsContent>

      <TabsContent value="reallocation" className="mt-6 portfolio-tab-content">
        <ReallocationTab />
      </TabsContent>
    </Tabs>
  );
}
