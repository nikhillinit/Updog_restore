import React, { useState, useMemo, useCallback } from 'react';
import { useSearch, useLocation } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { OverviewTab } from './tabs/OverviewTab';
import { AllocationsTab } from './tabs/AllocationsTab';
import { ReallocationTab } from './tabs/ReallocationTab';

/**
 * Portfolio tabs: Companies | Reserve Planning
 * Codex-validated restructure - merged Reallocation into Reserve Planning as collapsible section
 */
export type PortfolioTabValue = 'companies' | 'reserve-planning';

// Backward compatibility mapping for existing URLs
const TAB_MIGRATION: Record<string, PortfolioTabValue> = {
  overview: 'companies',
  allocations: 'reserve-planning',
  reallocation: 'reserve-planning',
};

export interface PortfolioTabsProps {
  /**
   * Default tab to display on initial load
   * @default 'companies'
   */
  defaultTab?: PortfolioTabValue;

  /**
   * Callback fired when the active tab changes
   */
  onTabChange?: (tab: PortfolioTabValue) => void;

  /**
   * If true, sync active tab with URL query parameter (?tab=reserve-planning)
   * @default true
   */
  syncWithUrl?: boolean;
}

export function PortfolioTabs({
  defaultTab = 'companies',
  onTabChange,
  syncWithUrl = true,
}: PortfolioTabsProps) {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const [isReallocationExpanded, setIsReallocationExpanded] = useState(false);

  // Parse search params from wouter's search string
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);

  // Get active tab from URL or use default, with migration support
  const activeTab = useMemo(() => {
    if (!syncWithUrl) return defaultTab;

    const urlTab = searchParams.get('tab');
    if (!urlTab) return defaultTab;

    // Migrate old tab values to new ones
    const migrated = TAB_MIGRATION[urlTab];
    if (migrated) return migrated;

    // Return as-is if it's a valid new tab value
    if (urlTab === 'companies' || urlTab === 'reserve-planning') {
      return urlTab;
    }

    return defaultTab;
  }, [syncWithUrl, searchParams, defaultTab]);

  // Handle tab change
  const handleTabChange = useCallback(
    (value: string) => {
      const tabValue = value as PortfolioTabValue;

      // Update URL if syncing is enabled
      if (syncWithUrl) {
        setLocation(`/portfolio?tab=${tabValue}`, { replace: true });
      }

      // Fire callback
      onTabChange?.(tabValue);
    },
    [syncWithUrl, setLocation, onTabChange]
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full portfolio-tabs">
      <TabsList className="grid w-full grid-cols-2 bg-white border border-pov-beige h-12 rounded-lg p-1">
        <TabsTrigger
          value="companies"
          className="font-inter font-medium text-sm data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white transition-all duration-200"
        >
          Companies
        </TabsTrigger>
        <TabsTrigger
          value="reserve-planning"
          className="font-inter font-medium text-sm data-[state=active]:bg-pov-charcoal data-[state=active]:text-pov-white transition-all duration-200"
        >
          Reserve Planning
        </TabsTrigger>
      </TabsList>

      {/* Companies Tab (formerly Overview) */}
      <TabsContent value="companies" className="mt-6 portfolio-tab-content">
        <OverviewTab />
      </TabsContent>

      {/* Reserve Planning Tab (merged Allocations + Reallocation) */}
      <TabsContent value="reserve-planning" className="mt-6 portfolio-tab-content space-y-6">
        {/* Primary content: Allocations */}
        <AllocationsTab />

        {/* Collapsible: Reallocation Tools */}
        <Collapsible
          open={isReallocationExpanded}
          onOpenChange={setIsReallocationExpanded}
          className="border border-pov-beige rounded-lg bg-white"
        >
          <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors rounded-lg">
            <div className="flex items-center gap-3">
              {isReallocationExpanded ? (
                <ChevronDown className="h-5 w-5 text-pov-charcoal" />
              ) : (
                <ChevronRight className="h-5 w-5 text-pov-charcoal" />
              )}
              <div className="text-left">
                <h3 className="font-inter font-semibold text-sm text-pov-charcoal">
                  Reallocation Tools
                </h3>
                <p className="font-poppins text-xs text-gray-500">
                  Adjust reserve allocations across portfolio companies
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-pov-beige">
            <div className="p-4">
              <ReallocationTab />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </TabsContent>
    </Tabs>
  );
}
