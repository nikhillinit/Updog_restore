import { Button } from "@/components/ui/button";
import { Download, RefreshCw, DollarSign } from "lucide-react";
import { exportToExcel } from "@/utils/export-excel";
import { useFundContext } from "@/contexts/FundContext";
import { useState } from "react";

interface HeaderProps {
  currentModule: {
    title: string;
    description: string;
  };
}

const moduleConfig = {
  dashboard: {
    title: "Fund Dashboard",
    description: "Comprehensive overview of fund performance and metrics"
  },
  'fund-setup': {
    title: "Fund Setup",
    description: "Configure fund parameters and investment strategy"
  },
  portfolio: {
    title: "Portfolio Management", 
    description: "Manage portfolio companies and track performance"
  },
  'financial-modeling': {
    title: "Financial Modeling",
    description: "Cohort analysis and financial projections"
  },
  analytics: {
    title: "Analytics & Insights",
    description: "Advanced analytics and performance insights"
  },
  reports: {
    title: "Reports & Documentation", 
    description: "Generate comprehensive fund reports"
  }
};

export default function Header({ currentModule }: HeaderProps) {
  const { currentFund } = useFundContext();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleExport = () => {
    if (currentFund) {
      exportToExcel([currentFund], 'povc-fund-report');
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Add refresh logic here if needed
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                {currentModule.title}
              </h2>
              <p className="text-gray-600 mt-1">
                {currentModule.description}
              </p>
            </div>
            {currentFund && (
              <div className="flex items-center space-x-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                <DollarSign className="h-4 w-4 text-blue-600" />
                <div className="text-sm">
                  <div className="font-semibold text-blue-800">{currentFund.name}</div>
                  <div className="text-blue-600">${(currentFund.size / 1000000).toFixed(0)}M Fund</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <Button 
            onClick={handleExport}
            className="povc-bg-accent hover:bg-cyan-600 text-white"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 povc-bg-primary rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">PV</span>
            </div>
            <span className="text-gray-700 font-medium">Press Ventures</span>
          </div>
        </div>
      </div>
    </header>
  );
}
