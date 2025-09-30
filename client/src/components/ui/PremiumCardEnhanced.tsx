/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { cn } from "@/lib/utils";

// Confidence level mapping for better UX
const confidenceConfig = {
  critical: {
    label: 'Critical',
    icon: '⚠️',
    description: 'Requires immediate attention',
    color: 'text-semantic-error-600'
  },
  low: {
    label: 'Low',
    icon: '⚡',
    description: 'Proceed with caution',
    color: 'text-semantic-warning-600'
  },
  medium: {
    label: 'Medium',
    icon: '📊',
    description: 'Standard confidence level',
    color: 'text-semantic-info-600'
  },
  high: {
    label: 'High',
    icon: '✅',
    description: 'Good confidence level',
    color: 'text-semantic-success-600'
  },
  excellent: {
    label: 'Excellent',
    icon: '🎯',
    description: 'Exceptional confidence',
    color: 'text-emerald-600'
  }
} as const;

interface PremiumCardEnhancedProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
  variant?: 'default' | 'highlight' | 'outlined' | 'ai-enhanced' | 'interactive';
  loading?: boolean;
  confidence?: 'critical' | 'low' | 'medium' | 'high' | 'excellent';
  onClick?: () => void;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  role?: string;
  isUpdating?: boolean;
}

export function PremiumCardEnhanced({
  title,
  subtitle,
  children,
  className = '',
  headerActions,
  variant = 'default',
  loading = false,
  confidence,
  onClick,
  disabled = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  role,
  isUpdating = false
}: PremiumCardEnhancedProps) {
  const isInteractive = onClick && !disabled;
  const confidenceInfo = confidence ? confidenceConfig[confidence] : null;

  const cardClasses = cn(
    "bg-white rounded-xl transition-all duration-300 ease-professional",
    "reduced-motion-safe high-contrast-border",
    {
      // Base variants
      'shadow-card hover:shadow-card-hover border border-gray-200': variant === 'default',
      'shadow-elevated border-2 border-slate-300 bg-gradient-to-br from-white to-slate-50': variant === 'highlight',
      'border-2 border-gray-300 shadow-card hover:shadow-card-hover': variant === 'outlined',

      // Enhanced variants
      'card-premium-enhanced ai-enhanced': variant === 'ai-enhanced',
      'card-premium-enhanced interactive': variant === 'interactive',

      // Interactive states
      'cursor-pointer focus-visible-ring': isInteractive,
      'cursor-not-allowed opacity-60': disabled,
      'hover:-translate-y-1': isInteractive && !loading,
      'active:translate-y-0 active:shadow-card-active': isInteractive,

      // Confidence level styling for AI variant
      'ai-confidence-indicator critical': confidence === 'critical',
      'ai-confidence-indicator low': confidence === 'low',
      'ai-confidence-indicator medium': confidence === 'medium',
      'ai-confidence-indicator high': confidence === 'high',
      'ai-confidence-indicator excellent': confidence === 'excellent',

      // Loading and updating states
      'loading pointer-events-none': loading,
      'updating': isUpdating,
    },
    className
  );

  if (loading) {
    return (
      <div
        className={cardClasses}
        aria-live="polite"
        aria-label="Loading content"
        role="status"
      >
        <div className="p-6">
          <div className="space-y-4">
            <div className="skeleton-enhanced title"></div>
            <div className="space-y-2">
              <div className="skeleton-enhanced text"></div>
              <div className="skeleton-enhanced text-sm"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cardClasses}
      onClick={isInteractive ? onClick : undefined}
      role={role || (isInteractive ? 'button' : undefined)}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-disabled={disabled}
      onKeyDown={isInteractive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      } : undefined}
    >
      {(title || subtitle || headerActions || confidence) && (
        <div className="px-6 py-4 border-b border-gray-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {title && (
                <h3 className="font-inter font-bold text-lg text-slate-900 leading-tight">
                  {title}
                  {isUpdating && (
                    <span className="ml-2 inline-block animate-ai-thinking">
                      🔄
                    </span>
                  )}
                </h3>
              )}
              {subtitle && (
                <p className="font-poppins text-sm text-slate-600 mt-1">
                  {subtitle}
                </p>
              )}
              {confidence && confidenceInfo && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Confidence:</span>
                  <div
                    className={`ai-confidence-badge ${confidence}`}
                    title={confidenceInfo.description}
                    aria-label={`Confidence level: ${confidenceInfo.label}. ${confidenceInfo.description}`}
                  >
                    <span className="mr-1">{confidenceInfo.icon}</span>
                    <span className="capitalize">{confidence}</span>
                  </div>
                  <div className="ai-confidence-progress flex-1 max-w-24">
                    <div
                      className={`progress-fill ${confidence}`}
                      role="progressbar"
                      aria-valuenow={
                        confidence === 'critical' ? 25 :
                        confidence === 'low' ? 50 :
                        confidence === 'medium' ? 70 :
                        confidence === 'high' ? 85 : 95
                      }
                      aria-valuemin={0}
                      aria-valuemax={100}
                    ></div>
                  </div>
                </div>
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

      <div className={cn(
        "p-6",
        isUpdating && "animate-metric-update"
      )}>
        <div className="font-poppins text-slate-700">
          {children}
        </div>
      </div>
    </div>
  );
}

// Enhanced loading skeleton variant
export function PremiumCardEnhancedSkeleton({
  className = '',
  hasHeader = false,
  hasConfidence = false
}: {
  className?: string;
  hasHeader?: boolean;
  hasConfidence?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl shadow-card border border-gray-200 overflow-hidden",
        "loading-shimmer-enhanced",
        className
      )}
      aria-label="Loading content"
      role="status"
    >
      {hasHeader && (
        <div className="px-6 py-4 border-b border-gray-200 bg-slate-50">
          <div className="space-y-2">
            <div className="skeleton-enhanced title"></div>
            <div className="skeleton-enhanced text-sm"></div>
            {hasConfidence && (
              <div className="flex items-center gap-2 mt-2">
                <div className="skeleton-enhanced w-4 h-4 rounded-full"></div>
                <div className="skeleton-enhanced w-16 h-4 rounded-full"></div>
                <div className="skeleton-enhanced w-24 h-2 rounded-full"></div>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="p-6">
        <div className="space-y-4">
          <div className="skeleton-enhanced text"></div>
          <div className="skeleton-enhanced text-sm"></div>
          <div className="skeleton-enhanced text w-4/6"></div>
        </div>
      </div>
    </div>
  );
}

// Enhanced Metric Card variant with professional micro-interactions
export function MetricCardEnhanced({
  title,
  value,
  change,
  trend,
  icon: Icon,
  onClick,
  className = '',
  isUpdating = false,
  confidence
}: {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'stable';
  icon?: React.ComponentType<any>;
  onClick?: () => void;
  className?: string;
  isUpdating?: boolean;
  confidence?: 'critical' | 'low' | 'medium' | 'high' | 'excellent';
}) {
  return (
    <PremiumCardEnhanced
      variant="interactive"
      className={cn("card-metric-enhanced", className)}
      onClick={onClick}
      isUpdating={isUpdating}
      confidence={confidence}
      aria-label={`${title}: ${value}${change ? `, ${change}` : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {Icon && (
              <Icon className="metric-icon text-gray-600" />
            )}
            <h4 className="text-sm font-medium text-gray-600">{title}</h4>
          </div>
          <div className={cn(
            "metric-value",
            isUpdating && "updating"
          )}>
            {value}
          </div>
          {change && (
            <div className={cn(
              "metric-trend mt-1",
              trend === 'up' && 'up',
              trend === 'down' && 'down',
              trend === 'stable' && 'stable'
            )}>
              {trend === 'up' && '↗️'}
              {trend === 'down' && '↘️'}
              {trend === 'stable' && '→'}
              <span className="ml-1">{change}</span>
            </div>
          )}
        </div>
      </div>
    </PremiumCardEnhanced>
  );
}

export default PremiumCardEnhanced;