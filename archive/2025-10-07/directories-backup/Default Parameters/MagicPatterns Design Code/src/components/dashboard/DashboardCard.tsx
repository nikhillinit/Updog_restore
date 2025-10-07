import React from 'react';
import { Card } from '../ui/Card';
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react';
interface DashboardCardProps {
  title: string;
  value: string | number;
  metric?: string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  className?: string;
}
export const DashboardCard = ({
  title,
  value,
  metric,
  change,
  changeLabel,
  icon,
  className = ''
}: DashboardCardProps) => {
  const isPositiveChange = change && change > 0;
  const isNegativeChange = change && change < 0;
  return <Card className={`h-full ${className}`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-sm font-medium text-charcoal/70">{title}</h3>
          <div className="mt-1 flex items-baseline">
            <p className="text-2xl font-inter font-bold text-charcoal">
              {value}
              {metric && <span className="ml-1 text-sm font-medium text-charcoal/70">
                  {metric}
                </span>}
            </p>
          </div>
          {typeof change !== 'undefined' && <div className="mt-2 flex items-center">
              {isPositiveChange && <ArrowUpIcon className="h-4 w-4 text-green-500 mr-1" />}
              {isNegativeChange && <ArrowDownIcon className="h-4 w-4 text-red-500 mr-1" />}
              <span className={`text-sm font-medium ${isPositiveChange ? 'text-green-500' : isNegativeChange ? 'text-red-500' : 'text-charcoal/50'}`}>
                {change > 0 ? '+' : ''}
                {change}%
              </span>
              {changeLabel && <span className="text-sm text-charcoal/50 ml-1">
                  {changeLabel}
                </span>}
            </div>}
        </div>
        {icon && <div className="p-2 bg-beige/20 rounded-full">{icon}</div>}
      </div>
    </Card>;
};