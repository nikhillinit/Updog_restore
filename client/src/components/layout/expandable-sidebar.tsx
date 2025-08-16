/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useFundContext } from "@/contexts/FundContext";
import { 
  LayoutDashboard, 
  Briefcase, 
  Calculator, 
  BarChart3, 
  FileText,
  Activity,
  ChevronRight,
  Building2,
  TrendingUp,
  Target,
  DollarSign,
  Settings,
  Clock,
  Globe,
  Users,
  HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ExpandableSidebarProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
}

const NAVIGATION_STRUCTURE = {
  fund: {
    title: "Fund",
    icon: LayoutDashboard,
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
      { id: 'construction', label: 'Construction', icon: Settings },
      { id: 'investments', label: 'Investments', icon: TrendingUp },
      { id: 'model-view', label: 'Model View', icon: Calculator }
    ]
  },
  reportsAndDocuments: {
    title: "Reports and Documents",
    icon: FileText,
    items: [
      { id: 'reports', label: 'Reports', icon: FileText },
      { id: 'documents', label: 'Documents', icon: FileText }
    ]
  },
  tools: {
    title: "Tools",
    icon: Settings,
    items: [
      { id: 'kpi-manager', label: 'KPI Manager', icon: Activity },
      { id: 'scenario-builder', label: 'Scenario Builder', icon: Target },
      { id: 'what-if-analysis', label: 'What-If Analysis', icon: TrendingUp },
      { id: 'cap-tables', label: 'Cap Tables', icon: Calculator }
    ]
  },
  administration: {
    title: "Administration",
    icon: Settings,
    items: [
      { id: 'history', label: 'History', icon: Clock },
      { id: 'publish', label: 'Publish', icon: Globe },
      { id: 'collaborate', label: 'Collaborate', icon: Users }
    ]
  }
};

export default function ExpandableSidebar({ activeModule, onModuleChange }: ExpandableSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    fund: true,
    tools: true
  });
  const [location, setLocation] = useLocation();
  const { needsSetup, currentFund } = useFundContext();

  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const handleMouseEnter = () => {
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    setIsExpanded(false);
  };

  return (
    <aside 
      className={cn(
        "bg-gray-900 text-white shadow-lg border-r border-gray-800 flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
        isExpanded ? "w-64" : "w-16"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <BarChart3 className="text-white h-5 w-5" />
          </div>
          {isExpanded && (
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-white">Tactyc</h1>
              {currentFund ? (
                <p className="text-sm text-gray-300 truncate">{currentFund.name}</p>
              ) : (
                <p className="text-sm text-gray-300">Venture Fund</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 overflow-y-auto">
        {/* Quick Access Items (always visible) */}
        <div className="space-y-1 mb-4">
          <Link href="/dashboard">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800",
                activeModule === 'dashboard' && "bg-gray-800 text-white",
                !isExpanded && "px-2"
              )}
              onClick={() => onModuleChange('dashboard')}
            >
              <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
              {isExpanded && <span className="ml-2">Home</span>}
            </Button>
          </Link>

          <div className="flex items-center space-x-2 px-2 py-1">
            <div className="w-6 h-6 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
              <Users className="h-3 w-3 text-gray-400" />
            </div>
            {isExpanded && <span className="text-sm text-gray-400">Account</span>}
          </div>

          <div className="flex items-center space-x-2 px-2 py-1">
            <div className="w-6 h-6 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
              <HelpCircle className="h-3 w-3 text-gray-400" />
            </div>
            {isExpanded && <span className="text-sm text-gray-400">Logout</span>}
          </div>
        </div>

        {isExpanded && <Separator className="bg-gray-800 mb-4" />}

        {/* Main Navigation Sections */}
        {Object.entries(NAVIGATION_STRUCTURE).map(([sectionKey, section]) => (
          <div key={sectionKey} className="mb-4">
            {isExpanded && (
              <button
                onClick={() => toggleSection(sectionKey)}
                className="w-full flex items-center justify-between px-2 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <section.icon className="h-4 w-4" />
                  <span>{section.title}</span>
                </div>
                <ChevronRight 
                  className={cn(
                    "h-3 w-3 transition-transform",
                    expandedSections[sectionKey] && "rotate-90"
                  )} 
                />
              </button>
            )}

            {/* Section Items */}
            {(isExpanded ? expandedSections[sectionKey] : true) && (
              <div className={cn("space-y-1", isExpanded && "ml-2")}>
                {section.items.map((item) => {
                  const isActive = activeModule === item.id;
                  const isDisabled = needsSetup && item.id !== 'fund-setup';
                  
                  return (
                    <Link key={item.id} href={`/${item.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isDisabled}
                        className={cn(
                          "w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800",
                          isActive && "bg-blue-600 text-white hover:bg-blue-700",
                          isDisabled && "text-gray-500 cursor-not-allowed",
                          !isExpanded && "px-2"
                        )}
                        onClick={() => !isDisabled && onModuleChange(item.id)}
                      >
                        <item.icon className="h-4 w-4 flex-shrink-0" />
                        {isExpanded && (
                          <div className="flex items-center justify-between w-full ml-2">
                            <span className="text-sm">{item.label}</span>
                            {item.id === 'scenario-builder' && isActive && (
                              <Badge variant="secondary" className="text-xs">
                                Active
                              </Badge>
                            )}
                          </div>
                        )}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Additional Tools */}
        {isExpanded && (
          <div className="space-y-1">
            <Separator className="bg-gray-800 mb-2" />
            
            {/* Sensitivity Analysis - New Addition */}
            <Link href="/sensitivity-analysis">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800",
                  activeModule === 'sensitivity-analysis' && "bg-blue-600 text-white hover:bg-blue-700"
                )}
                onClick={() => onModuleChange('sensitivity-analysis')}
              >
                <TrendingUp className="h-4 w-4" />
                <span className="ml-2 text-sm">Sensitivity Analysis</span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  New
                </Badge>
              </Button>
            </Link>

            {/* Cash Management */}
            <Link href="/cash-management">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800",
                  activeModule === 'cash-management' && "bg-blue-600 text-white hover:bg-blue-700"
                )}
                onClick={() => onModuleChange('cash-management')}
              >
                <DollarSign className="h-4 w-4" />
                <span className="ml-2 text-sm">Cash Management</span>
              </Button>
            </Link>

            {/* Portfolio Analytics */}
            <Link href="/portfolio-analytics">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800",
                  activeModule === 'portfolio-analytics' && "bg-blue-600 text-white hover:bg-blue-700"
                )}
                onClick={() => onModuleChange('portfolio-analytics')}
              >
                <Activity className="h-4 w-4" />
                <span className="ml-2 text-sm">Portfolio Analytics</span>
              </Button>
            </Link>
          </div>
        )}
      </nav>

      {/* Footer */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Connected</span>
          </div>
        </div>
      )}
    </aside>
  );
}
