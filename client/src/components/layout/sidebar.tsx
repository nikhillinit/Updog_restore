import { useState } from "react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useFundContext } from "@/contexts/FundContext";
import { POVIcon } from "@/components/ui/POVLogo";
import { 
  LayoutDashboard, 
  Briefcase, 
  Calculator, 
  BarChart3, 
  FileText,
  Activity,
  ChevronDown,
  ChevronRight,
  Plus,
  TrendingUp,
  Building2,
  Target,
  Calendar,
  Percent,
  DollarSign
} from "lucide-react";

interface SidebarProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
}

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'design-system', label: 'Design System', icon: Activity },
  { id: 'portfolio', label: 'Portfolio', icon: Building2 },
  { id: 'investments', label: 'Investments', icon: TrendingUp },
  { id: 'investments-table', label: 'Investments Table', icon: TrendingUp },
  { id: 'cap-tables', label: 'Cap Tables', icon: Calculator },
  { id: 'kpi-manager', label: 'KPI Manager', icon: Activity },
  { id: 'allocation-manager', label: 'Allocation Manager', icon: Calculator },
  { id: 'planning', label: 'Planning', icon: Briefcase },
  { id: 'forecasting', label: 'Forecasting', icon: TrendingUp },
  { id: 'scenario-builder', label: 'Scenario Builder', icon: Target },
  { id: 'moic-analysis', label: 'MOIC Analysis', icon: Calculator },
  { id: 'return-the-fund', label: 'Return the Fund', icon: TrendingUp },
  { id: 'partial-sales', label: 'Partial Sales', icon: Percent },
  { id: 'financial-modeling', label: 'Financial Modeling', icon: Calculator },
  { id: 'performance', label: 'Performance', icon: TrendingUp },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'portfolio-analytics', label: 'Portfolio Analytics', icon: Activity },
  { id: 'cash-management', label: 'Cash Management', icon: DollarSign },
  { id: 'sensitivity-analysis', label: 'Sensitivity Analysis', icon: Target },
  { id: 'reports', label: 'Reports', icon: FileText },
];

const chartCategories = [
  { id: 'basic', label: 'Basic Charts' },
  { id: 'statistical', label: 'Statistical' },
  { id: 'hierarchical', label: 'Hierarchical' },
  { id: 'flow', label: 'Flow Charts' },
  { id: 'advanced', label: 'Advanced' },
];

export default function Sidebar({ activeModule, onModuleChange }: SidebarProps) {
  const [isChartsExpanded, setIsChartsExpanded] = useState(false);
  const [location, setLocation] = useLocation();
  const { needsSetup, currentFund } = useFundContext();

  return (
    <aside className="w-64 bg-pov-white shadow-elevated border-r border-pov-gray/20 flex-shrink-0 flex flex-col">
      <div className="p-6 border-b border-pov-gray/20">
        <div className="flex items-center space-x-3 mb-4">
          <POVIcon variant="dark" size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="font-inter font-bold text-lg text-pov-charcoal">Updawg</h1>
            <p className="font-poppins text-xs text-gray-500">Fund Management</p>
          </div>
        </div>
        {currentFund && (
          <div className="bg-pov-beige/20 rounded-lg p-3">
            <p className="font-poppins font-medium text-sm text-pov-charcoal truncate">
              {currentFund.name}
            </p>
            <p className="font-mono text-xs text-gray-600 mt-1">
              ${(currentFund.size / 1000000).toFixed(0)}M Fund
            </p>
          </div>
        )}
      </div>
      
      <nav className="flex-1 p-4 overflow-y-auto custom-scrollbar">
        {needsSetup ? (
          <div className="bg-pov-beige/30 border border-pov-beige rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2 mb-2">
              <Plus className="h-4 w-4 text-pov-charcoal" />
              <span className="font-poppins text-sm font-medium text-pov-charcoal">Setup Required</span>
            </div>
            <p className="font-poppins text-xs text-gray-600 mb-3">Configure your fund to access all features</p>
            <Link href="/fund-setup">
              <button className="w-full bg-pov-charcoal text-pov-white px-3 py-2 rounded-md text-sm font-medium hover:bg-pov-charcoal/90 transition-all duration-200">
                Start Fund Setup
              </button>
            </Link>
          </div>
        ) : null}

        <ul className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            const isDisabled = needsSetup && item.id !== 'fund-setup';

            return (
              <li key={item.id}>
                <Link href={`/${item.id}`}>
                  <button
                    disabled={isDisabled}
                    onClick={() => !isDisabled && onModuleChange(item.id)}
                    className={cn(
                      "w-full flex items-center space-x-3 px-3 py-2.5 text-left rounded-lg transition-all duration-200 font-poppins",
                      isDisabled
                        ? "text-gray-400 cursor-not-allowed bg-gray-50"
                        : isActive
                          ? "bg-pov-charcoal text-pov-white shadow-sm"
                          : "text-gray-700 hover:bg-pov-beige/20 hover:text-pov-charcoal"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className={cn("text-sm", isActive && "font-medium")}>
                      {item.label}
                    </span>
                  </button>
                </Link>
              </li>
            );
          })}
        </ul>
        
        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={() => setIsChartsExpanded(!isChartsExpanded)}
            className="w-full flex items-center justify-between px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
          >
            <span>Chart Types</span>
            {isChartsExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          
          {isChartsExpanded && (
            <ul className="mt-3 space-y-1">
              {chartCategories.map((category) => (
                <li key={category.id}>
                  <button className="w-full text-left px-2 py-1 text-sm text-gray-600 hover:text-blue-600 transition-colors">
                    {category.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    </aside>
  );
}
