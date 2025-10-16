import { useState } from "react";
import { useFundContext } from "@/contexts/FundContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Building2, Target } from "lucide-react";
import { DashboardTabs } from './components/DashboardTabs';
import { DashboardLoading } from './components/DashboardLoading';

/**
 * Main Dashboard Component - Refactored for better maintainability
 * 
 * This component has been broken down into smaller, focused components:
 * - DashboardMetrics: Handles metric calculations and display
 * - MetricCards: Individual metric card components
 * - DashboardTabs: Tab navigation and content
 * - DashboardLoading: Loading state
 */
export default function Dashboard() {
  const { currentFund, isLoading } = useFundContext();
  const [viewType, setViewType] = useState("construction"); // construction | current
  const [activeTab, setActiveTab] = useState("fund");

  // Early return for loading/empty state
  if (isLoading || !currentFund) {
    return <DashboardLoading />;
  }

  const handleViewTypeChange = (checked: boolean) => {
    setViewType(checked ? "current" : "construction");
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      {/* Fund Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <Building2 className="w-8 h-8 text-charcoal" />
            <div>
              <h1 className="text-2xl font-inter font-bold text-charcoal">
                {currentFund.name}
              </h1>
              <p className="text-charcoal/60 font-medium">
                Fund Performance Dashboard
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
            Active
          </Badge>
        </div>

        <div className="flex items-center space-x-3">
          <Button variant="outline" size="sm" className="text-charcoal border-charcoal/20">
            <TrendingUp className="w-4 h-4 mr-2" />
            Export Report
          </Button>
          <Button size="sm" className="bg-charcoal hover:bg-charcoal/90 text-white">
            <Target className="w-4 h-4 mr-2" />
            Update Targets
          </Button>
        </div>
      </div>

      {/* Tabs and Content */}
      <DashboardTabs
        fund={currentFund}
        viewType={viewType}
        onViewTypeChange={handleViewTypeChange}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
}