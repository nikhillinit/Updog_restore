import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Calendar,
  DollarSign,
  Info,
  PieChart,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { HeaderMetricIcon, HeaderMetricTheme } from '@/types/fund-header-metrics';

export interface HeaderMetricCardView {
  key: string;
  title: string;
  displayValue: string;
  titleText?: string | undefined;
  theme: HeaderMetricTheme;
  icon: HeaderMetricIcon;
}

const HEADER_ICON_COMPONENTS: Record<HeaderMetricIcon, LucideIcon> = {
  activity: Activity,
  'bar-chart': BarChart3,
  calendar: Calendar,
  dollar: DollarSign,
  'pie-chart': PieChart,
  target: Target,
  'trending-up': TrendingUp,
};

const CARD_CLASS_NAMES: Record<HeaderMetricTheme, string> = {
  white: 'bg-white border-beige-200',
  beige: 'bg-pov-gray/50 border-beige-200',
};

const LABEL_CLASS_NAMES: Record<HeaderMetricTheme, string> = {
  white: 'text-charcoal-600',
  beige: 'text-charcoal-700',
};

const ICON_CLASS_NAMES: Record<HeaderMetricTheme, string> = {
  white: 'text-charcoal-500',
  beige: 'text-charcoal-600',
};

export function HeaderMetricCard({
  card,
  testId,
}: {
  card: HeaderMetricCardView;
  testId?: string;
}) {
  const Icon = HEADER_ICON_COMPONENTS[card.icon];

  return (
    <Card
      className={`${CARD_CLASS_NAMES[card.theme]} shadow-sm hover:shadow-md transition-shadow`}
      data-testid={testId}
    >
      <CardContent className="p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className={`text-xs ${LABEL_CLASS_NAMES[card.theme]} font-medium`}>{card.title}</p>
              {card.titleText && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      aria-label={card.titleText}
                      className="flex-shrink-0 rounded text-charcoal-400 hover:text-charcoal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-400"
                    >
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>{card.titleText}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="truncate text-sm font-bold leading-tight text-pov-charcoal tabular-nums">
              {card.displayValue}
            </p>
          </div>
          <Icon className={`h-4 w-4 flex-shrink-0 ${ICON_CLASS_NAMES[card.theme]}`} />
        </div>
      </CardContent>
    </Card>
  );
}
