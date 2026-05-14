import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Calendar,
  DollarSign,
  PieChart,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
  white: 'bg-white border-charcoal-200',
  beige: 'bg-beige-50 border-beige-300',
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
      title={card.titleText}
    >
      <CardContent className="p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-xs ${LABEL_CLASS_NAMES[card.theme]} font-medium`}>{card.title}</p>
            <p
              className="truncate text-sm font-bold leading-tight text-charcoal-900 tabular-nums"
              title={card.titleText}
            >
              {card.displayValue}
            </p>
          </div>
          <Icon className={`h-4 w-4 flex-shrink-0 ${ICON_CLASS_NAMES[card.theme]}`} />
        </div>
      </CardContent>
    </Card>
  );
}
