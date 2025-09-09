/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useFundContext } from "@/contexts/FundContext";
import { POVIcon } from "@/components/ui/POVLogo";
import { 
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
  Percent,
  DollarSign
} from "lucide-react";

interface SidebarProps {
  activeModule: string;
  onModuleChange: (_module: string) => void;
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
  const [isHovered, setIsHovered] = useState(false);
  const [_location, _setLocation] = useLocation();
  const { needsSetup, currentFund } = useFundContext();

  return (
    <aside
      className={`bg-white shadow-lg border-r border-gray-200 flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${
        isHovered ? 'w-64' : 'w-16'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-3 border-b border-gray-200 bg-slate-900">
        <div className="flex items-center mb-4">
          <div className="flex items-center justify-center w-10 h-10">
            <POVIcon variant="white" size="md" />
          </div>
          <div className={`ml-3 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'} overflow-hidden`}>
            <h1 className="font-inter font-bold text-lg text-white whitespace-nowrap">Updawg</h1>
            <p className="font-poppins text-xs text-slate-300 whitespace-nowrap">Fund Management</p>
          </div>
        </div>
        {currentFund && isHovered && (
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 transition-all duration-300">
            <p className="font-poppins font-medium text-sm text-white truncate">
              {currentFund.name}
            </p>
            <p className="font-mono text-xs text-slate-300 mt-1">
              ${(currentFund.size / 1000000).toFixed(0)}M Fund
            </p>
          </div>
        )}
      </div>
      
      <nav className="flex-1 p-2 overflow-y-auto custom-scrollbar bg-slate-50">
        {needsSetup && isHovered && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 transition-all duration-300">
            <div className="flex items-center space-x-2 mb-2">
              <Plus className="h-4 w-4 text-amber-700" />
              <span className="font-poppins text-sm font-medium text-amber-800">Setup Required</span>
            </div>
            <p className="font-poppins text-xs text-amber-600 mb-3">Configure your fund to access all features</p>
            <Link href="/fund-setup">
              <button className="w-full bg-amber-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-amber-700 transition-all duration-200">
                Start Fund Setup
              </button>
            </Link>
          </div>
        )}

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
                    title={!isHovered ? item.label : undefined}
                    className={cn(
                      "w-full flex items-center rounded-lg transition-all duration-200 font-poppins relative group",
                      isHovered ? "space-x-3 px-3 py-2.5" : "justify-center p-2.5",
                      isDisabled
                        ? "text-gray-400 cursor-not-allowed bg-gray-100"
                        : isActive
                          ? "bg-slate-900 text-white shadow-md"
                          : "text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {isHovered && (
                      <span className={cn("text-sm whitespace-nowrap", isActive && "font-medium")}>
                        {item.label}
                      </span>
                    )}

                    {/* Tooltip for collapsed state */}
                    {!isHovered && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                        {item.label}
                      </div>
                    )}
                  </button>
                </Link>
              </li>
            );
          })}
        </ul>

        {isHovered && (
          <div className="mt-6 pt-4 border-t border-gray-200">
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
                    <button className="w-full text-left px-2 py-1 text-sm text-gray-600 hover:text-slate-800 hover:bg-gray-50 rounded-md transition-colors">
                      {category.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </nav>
    </aside>
  );
}

