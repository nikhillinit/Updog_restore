/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { cn } from "@/lib/utils";

interface PremiumCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
  variant?: 'default' | 'highlight' | 'outlined';
  loading?: boolean;
}

export function PremiumCard({
  title,
  subtitle,
  children,
  className = '',
  headerActions,
  variant = 'default',
  loading = false
}: PremiumCardProps) {
  const cardClasses = cn(
    "bg-white rounded-xl transition-all duration-200 ease-out",
    {
      'shadow-lg hover:shadow-xl border border-gray-200/80': variant === 'default',
      'shadow-xl border-2 border-slate-300 bg-gradient-to-br from-white to-slate-50': variant === 'highlight',
      'border-2 border-gray-300 shadow-md hover:shadow-lg': variant === 'outlined',
    },
    className
  );

  if (loading) {
    return (
      <div className={cardClasses}>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-pov-gray rounded w-1/3"></div>
            <div className="space-y-2">
              <div className="h-3 bg-pov-gray rounded"></div>
              <div className="h-3 bg-pov-gray rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClasses}>
      {(title || subtitle || headerActions) && (
        <div className="px-6 py-4 border-b border-gray-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {title && (
                <h3 className="font-inter font-bold text-lg text-slate-900 leading-tight">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="font-poppins text-sm text-slate-600 mt-1">
                  {subtitle}
                </p>
              )}
            </div>
            {headerActions && (
              <div className="flex items-center space-x-2 ml-4">
                {headerActions}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-6">
        <div className="font-poppins text-slate-700">
          {children}
        </div>
      </div>
    </div>
  );
}

// Loading skeleton variant
export function PremiumCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={cn("bg-pov-white rounded-lg shadow-card border border-pov-gray/50 p-6", className)}>
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-pov-gray rounded w-1/3"></div>
        <div className="space-y-2">
          <div className="h-3 bg-pov-gray rounded"></div>
          <div className="h-3 bg-pov-gray rounded w-5/6"></div>
          <div className="h-3 bg-pov-gray rounded w-4/6"></div>
        </div>
      </div>
    </div>
  );
}

