 
 
 
 
 
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface DashboardCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  metric?: string;
  icon?: React.ReactNode;
}

export const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  value,
  change,
  changeLabel,
  metric,
  icon
}) => {
  const changeColor = change && change > 0 ? 'text-green-600' : 'text-red-600';
  const changeIcon = change && change > 0 ? '↗' : '↘';

  return (
    <Card className="bg-white rounded-lg border border-lightGray shadow-card hover:shadow-elevated transition-all duration-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-charcoal/70 font-poppins">
                {title}
              </h3>
              {icon && (
                <div className="p-2 bg-beige/20 rounded-full text-charcoal">
                  {icon}
                </div>
              )}
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-charcoal font-inter">
                {value}
              </span>
              {metric && (
                <span className="text-sm font-medium text-charcoal/70">
                  {metric}
                </span>
              )}
            </div>
            {change !== undefined && changeLabel && (
              <div className="flex items-center mt-2">
                <span className={`text-sm font-medium ${changeColor} mr-1`}>
                  {changeIcon} {Math.abs(change)}%
                </span>
                <span className="text-xs text-charcoal/70">
                  {changeLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DashboardCard;
