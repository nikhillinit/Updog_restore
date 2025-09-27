import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
    direction: 'up' | 'down' | 'neutral';
  };
  badge?: {
    text: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  };
  className?: string;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  badge,
  className = "",
  loading = false
}: StatCardProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
              <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getTrendIcon = () => {
    switch (trend?.direction) {
      case 'up':
        return <TrendingUp className="w-4 h-4" />;
      case 'down':
        return <TrendingDown className="w-4 h-4" />;
      case 'neutral':
        return <Minus className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getTrendColor = () => {
    switch (trend?.direction) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      case 'neutral':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <Card className={cn("hover:shadow-md transition-shadow", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
        {Icon && (
          <div className="w-4 h-4 text-gray-400">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold text-gray-900">
            {typeof value === 'number' && value > 1000000
              ? `$${(value / 1000000).toFixed(1)}M`
              : typeof value === 'number' && value > 1000
              ? `$${(value / 1000).toFixed(1)}K`
              : value
            }
          </div>
          {badge && (
            <Badge variant={badge.variant || 'default'} className="ml-2">
              {badge.text}
            </Badge>
          )}
        </div>

        {trend && (
          <div className={cn("flex items-center space-x-1 text-sm", getTrendColor())}>
            {getTrendIcon()}
            <span className="font-medium">{trend.value > 0 ? '+' : ''}{trend.value}%</span>
            <span className="text-gray-500">{trend.label}</span>
          </div>
        )}

        {description && (
          <p className="text-xs text-gray-500">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function StatCardGrid({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {children}
    </div>
  );
}