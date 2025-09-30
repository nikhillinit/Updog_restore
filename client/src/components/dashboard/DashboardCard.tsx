/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
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
    <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md hover:shadow-lg hover:border-[#292929] transition-all duration-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-[#292929]/70 font-poppins">
                {title}
              </h3>
              {icon && (
                <div className="text-[#292929]">
                  {icon}
                </div>
              )}
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-[#292929] font-inter">
                {value}
              </span>
              {metric && (
                <span className="text-sm font-medium text-[#292929]/60">
                  {metric}
                </span>
              )}
            </div>
            {change !== undefined && changeLabel && (
              <div className="flex items-center mt-2">
                <span className={`text-sm font-medium ${changeColor} mr-1`}>
                  {changeIcon} {Math.abs(change)}%
                </span>
                <span className="text-xs text-[#292929]/60">
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
