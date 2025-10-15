import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DashboardMetrics } from './DashboardMetrics';
import PortfolioConcentration from "../portfolio-concentration";
import type { Fund } from '@/contexts/FundContext';

interface DashboardTabsProps {
  fund: Fund;
  viewType: string;
  onViewTypeChange: (checked: boolean) => void;
  activeTab: string;
  onTabChange: (value: string) => void;
}

/**
 * Dashboard tabs component - manages different views
 */
export function DashboardTabs({ 
  fund, 
  viewType, 
  onViewTypeChange, 
  activeTab, 
  onTabChange 
}: DashboardTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <div className="flex justify-between items-center mb-8">
        <TabsList className="grid w-full max-w-md grid-cols-3 bg-white border">
          <TabsTrigger value="fund" className="text-sm">Fund</TabsTrigger>
          <TabsTrigger value="portfolio" className="text-sm">Portfolio</TabsTrigger>
          <TabsTrigger value="projections" className="text-sm">Projections</TabsTrigger>
        </TabsList>

        <div className="flex items-center space-x-2">
          <Label htmlFor="view-toggle" className="text-sm font-medium text-charcoal/80">
            {viewType === "construction" ? "Construction View" : "Current View"}
          </Label>
          <Switch
            id="view-toggle"
            checked={viewType === "current"}
            onCheckedChange={onViewTypeChange}
          />
        </div>
      </div>

      <TabsContent value="fund" className="space-y-8">
        <DashboardMetrics fund={fund} />
      </TabsContent>

      <TabsContent value="portfolio" className="space-y-8">
        <PortfolioConcentration />
      </TabsContent>

      <TabsContent value="projections" className="space-y-8">
        {/* Projections content will be added here */}
        <div className="text-center py-12">
          <p className="text-charcoal/60">Projections view coming soon...</p>
        </div>
      </TabsContent>
    </Tabs>
  );
}