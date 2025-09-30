/**
 * ProgressiveDisclosureContainer Component
 *
 * Implements Executive → Strategic → Analytical → Technical view hierarchy
 * for sophisticated financial data while maintaining intuitive navigation.
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Eye,
  Target,
  BarChart3,
  ChevronRight,
  Info,
  TrendingUp,
  PieChart,
  Calculator,
  Code2
} from 'lucide-react';

export type ViewLevel = 'executive' | 'strategic' | 'analytical' | 'technical';

export interface ViewConfig {
  level: ViewLevel;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  complexity: number; // 1-4 scale
  userTypes: string[];
}

export interface DataSection {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  complexity: number; // 1-4 scale
  category: 'performance' | 'risk' | 'allocation' | 'scenarios' | 'technical';
  executiveContent?: React.ReactNode;
  strategicContent?: React.ReactNode;
  analyticalContent?: React.ReactNode;
  technicalContent?: React.ReactNode;
}

interface ProgressiveDisclosureContainerProps {
  title?: string;
  subtitle?: string;
  sections: DataSection[];
  defaultView?: ViewLevel;
  showViewIndicator?: boolean;
  className?: string;
  onViewChange?: (view: ViewLevel) => void;
}

const VIEW_CONFIGS: Record<ViewLevel, ViewConfig> = {
  executive: {
    level: 'executive',
    title: 'Executive Overview',
    description: 'Key metrics and high-level insights',
    icon: Eye,
    complexity: 1,
    userTypes: ['LP', 'Limited Partner', 'Board Member', 'Executive']
  },
  strategic: {
    level: 'strategic',
    title: 'Strategic Analysis',
    description: 'Portfolio composition and scenario comparisons',
    icon: Target,
    complexity: 2,
    userTypes: ['GP', 'Investment Committee', 'Portfolio Manager']
  },
  analytical: {
    level: 'analytical',
    title: 'Analytical Deep Dive',
    description: 'Full Monte Carlo results and statistical analysis',
    icon: BarChart3,
    complexity: 3,
    userTypes: ['Analyst', 'Quantitative Researcher', 'Risk Manager']
  },
  technical: {
    level: 'technical',
    title: 'Technical Details',
    description: 'Raw data, calculations, and model parameters',
    icon: Code2,
    complexity: 4,
    userTypes: ['Data Scientist', 'Developer', 'Model Validator']
  }
};

const CATEGORY_ICONS = {
  performance: TrendingUp,
  risk: Eye,
  allocation: PieChart,
  scenarios: Target,
  technical: Calculator
};

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200'
};

function ViewLevelIndicator({
  currentView,
  onViewChange
}: {
  currentView: ViewLevel;
  onViewChange: (view: ViewLevel) => void;
}) {
  const viewOrder: ViewLevel[] = ['executive', 'strategic', 'analytical', 'technical'];
  const currentIndex = viewOrder.indexOf(currentView);

  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-slate-600">Complexity Level:</div>
          <Progress value={(currentIndex + 1) * 25} className="w-20 h-2" />
          <span className="text-sm font-semibold text-slate-700">
            {currentIndex + 1}/4
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {viewOrder.map((view, index) => {
          const config = VIEW_CONFIGS[view];
          const IconComponent = config.icon;
          const isActive = view === currentView;
          const isCompleted = index < currentIndex;

          return (
            <React.Fragment key={view}>
              <Button
                variant={isActive ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewChange(view)}
                className={cn(
                  "transition-all duration-200",
                  isActive && "bg-blue-600 text-white",
                  isCompleted && !isActive && "bg-green-100 text-green-700 hover:bg-green-200",
                  !isActive && !isCompleted && "text-slate-500 hover:text-slate-700"
                )}
              >
                <IconComponent className="w-4 h-4 mr-2" />
                {config.title.split(' ')[0]}
              </Button>
              {index < viewOrder.length - 1 && (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function SectionCard({
  section,
  currentView,
  isVisible
}: {
  section: DataSection;
  currentView: ViewLevel;
  isVisible: boolean;
}) {
  const CategoryIcon = CATEGORY_ICONS[section.category];

  if (!isVisible) return null;

  const content = (() => {
    switch (currentView) {
      case 'executive':
        return section.executiveContent;
      case 'strategic':
        return section.strategicContent || section.executiveContent;
      case 'analytical':
        return section.analyticalContent || section.strategicContent || section.executiveContent;
      case 'technical':
        return section.technicalContent || section.analyticalContent || section.strategicContent || section.executiveContent;
      default:
        return section.executiveContent;
    }
  })();

  if (!content) return null;

  return (
    <Card className="transition-all duration-300 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <CategoryIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold font-inter text-slate-900">
                {section.title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={cn("text-xs", PRIORITY_COLORS[section.priority])}
                >
                  {section.priority} priority
                </Badge>
                <span className="text-xs text-slate-500">
                  Complexity: {section.complexity}/4
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}

export function ProgressiveDisclosureContainer({
  title = "Portfolio Analysis",
  subtitle,
  sections,
  defaultView = 'executive',
  showViewIndicator = true,
  className,
  onViewChange
}: ProgressiveDisclosureContainerProps) {
  const [currentView, setCurrentView] = useState<ViewLevel>(defaultView);

  const handleViewChange = (view: ViewLevel) => {
    setCurrentView(view);
    onViewChange?.(view);
  };

  // Filter sections based on current view complexity and priority
  const visibleSections = useMemo(() => {
    const viewComplexity = VIEW_CONFIGS[currentView].complexity;

    return sections.filter(section => {
      // Always show high priority items
      if (section.priority === 'high') return true;

      // For executive view, only show simple, high-impact items
      if (currentView === 'executive') {
        return section.complexity <= 1 && section.priority !== 'low';
      }

      // For strategic view, include medium complexity items
      if (currentView === 'strategic') {
        return section.complexity <= 2;
      }

      // For analytical view, include most items
      if (currentView === 'analytical') {
        return section.complexity <= 3;
      }

      // Technical view shows everything
      return true;
    }).sort((a, b) => {
      // Sort by priority first, then complexity
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return a.complexity - b.complexity;
    });
  }, [sections, currentView]);

  const currentConfig = VIEW_CONFIGS[currentView];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold font-inter text-slate-900">
              {title}
            </h2>
            {subtitle && (
              <p className="text-slate-600 font-poppins mt-1">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              {currentConfig.title}
            </Badge>
            <div className="text-xs text-slate-500">
              for {currentConfig.userTypes.join(', ')}
            </div>
          </div>
        </div>

        {showViewIndicator && (
          <ViewLevelIndicator
            currentView={currentView}
            onViewChange={handleViewChange}
          />
        )}
      </div>

      {/* View Description */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-blue-800 font-medium font-poppins">
                {currentConfig.description}
              </p>
              <p className="text-blue-600 text-sm mt-1">
                Showing {visibleSections.length} of {sections.length} available sections
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Sections */}
      <div className="grid gap-6">
        {visibleSections.map(section => (
          <SectionCard
            key={section.id}
            section={section}
            currentView={currentView}
            isVisible={true}
          />
        ))}
      </div>

      {/* Navigation Helper */}
      {currentView !== 'technical' && (
        <Card className="border-dashed border-2 border-slate-200 bg-slate-50">
          <CardContent className="p-4 text-center">
            <p className="text-slate-600 font-poppins">
              Need more detail? Switch to{' '}
              <Button
                variant="link"
                className="p-0 h-auto text-blue-600 font-semibold"
                onClick={() => {
                  const nextView = currentView === 'executive' ? 'strategic' :
                                   currentView === 'strategic' ? 'analytical' : 'technical';
                  handleViewChange(nextView);
                }}
              >
                {currentView === 'executive' ? 'Strategic' :
                 currentView === 'strategic' ? 'Analytical' : 'Technical'} view
              </Button>
              {' '}for deeper insights
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ProgressiveDisclosureContainer;