/**
 * InvestmentValidationCallout - Sticky bottom validation summary for investment rounds
 *
 * Features:
 * - Shows validation status (success/warning/error)
 * - Displays key metrics when valid (journey length, total capital, avg rates)
 * - Shows stage breakdown in grid
 * - Animated issue list when invalid
 * - Sticky positioning at bottom of viewport
 */

import React, { useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  Clock,
  DollarSign,
  Percent,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { StageData } from './StageAccordionRow';

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface InvestmentValidationCalloutProps {
  status?: 'success' | 'warning' | 'error';
  issues?: ValidationIssue[];
  stages?: StageData[];
  summary?: {
    journey: string;
    capital: string;
    graduation: string;
    exitRate: string;
  };
  className?: string;
}

export function InvestmentValidationCallout({
  status = 'success',
  issues = [],
  stages = [],
  summary: propSummary,
  className,
}: InvestmentValidationCalloutProps) {
  const styles = {
    success: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
      title: 'text-emerald-900',
      text: 'text-emerald-700',
      badge: 'bg-emerald-100 text-emerald-700',
      accent: 'text-emerald-600',
      cardBg: 'bg-white/60 border-emerald-100',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
      title: 'text-amber-900',
      text: 'text-amber-700',
      badge: 'bg-amber-100 text-amber-700',
      accent: 'text-amber-600',
      cardBg: 'bg-white/60 border-amber-100',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: <AlertCircle className="w-5 h-5 text-red-600" />,
      title: 'text-red-900',
      text: 'text-red-700',
      badge: 'bg-red-100 text-red-700',
      accent: 'text-red-600',
      cardBg: 'bg-white/60 border-red-100',
    },
  };

  const currentStyle = styles[status];
  const hasIssues = issues.length > 0;

  // Calculate metrics from stages if available
  const calculatedSummary = useMemo(() => {
    if (!stages.length) return propSummary;

    const totalCapital = stages.reduce((sum, stage) => sum + stage.roundSize, 0);
    const totalMonths = stages.reduce((sum, stage) => sum + stage.monthsToNext, 0);
    const avgGrad = stages.reduce((sum, stage) => sum + stage.gradRate, 0) / stages.length;
    const avgExit = stages.reduce((sum, stage) => sum + stage.exitRate, 0) / stages.length;

    return {
      journey: `${(totalMonths / 12).toFixed(1)}yr`,
      capital: `$${totalCapital.toFixed(1)}M`,
      graduation: `${avgGrad.toFixed(1)}%`,
      exitRate: `${avgExit.toFixed(1)}%`,
    };
  }, [stages, propSummary]);

  // Fallback if no calculation happened
  const displaySummary = calculatedSummary || {
    journey: '0yr',
    capital: '$0M',
    graduation: '0%',
    exitRate: '0%',
  };

  return (
    <motion.div
      className={cn(
        `${currentStyle.bg} border ${currentStyle.border} rounded-lg shadow-sm`,
        'sticky bottom-6 z-20 overflow-hidden',
        className
      )}
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-0.5">{currentStyle.icon}</div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-3">
              <h4
                className={cn(
                  'text-sm font-semibold flex items-center gap-2 font-poppins',
                  currentStyle.title
                )}
              >
                Investment rounds validation
                {status === 'success' && (
                  <span
                    className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                      currentStyle.badge
                    )}
                  >
                    All checks passed
                  </span>
                )}
                {hasIssues && (
                  <span
                    className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                      currentStyle.badge
                    )}
                  >
                    {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
                  </span>
                )}
              </h4>
            </div>

            {!hasIssues ? (
              <div className="space-y-4">
                {/* Key Metrics Grid */}
                <div
                  className={cn(
                    'grid grid-cols-4 gap-4 pb-4 border-b',
                    status === 'success' ? 'border-emerald-200/50' : 'border-gray-200/50'
                  )}
                >
                  <div>
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wider font-medium block mb-0.5',
                        currentStyle.accent
                      )}
                    >
                      Journey
                    </span>
                    <div
                      className={cn(
                        'flex items-center gap-1.5 font-bold text-lg font-poppins',
                        currentStyle.title
                      )}
                    >
                      <Clock className={cn('w-4 h-4 opacity-70', currentStyle.accent)} />
                      {displaySummary.journey}
                    </div>
                  </div>
                  <div>
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wider font-medium block mb-0.5',
                        currentStyle.accent
                      )}
                    >
                      Total Capital
                    </span>
                    <div
                      className={cn(
                        'flex items-center gap-1.5 font-bold text-lg font-poppins',
                        currentStyle.title
                      )}
                    >
                      <DollarSign className={cn('w-4 h-4 opacity-70', currentStyle.accent)} />
                      {displaySummary.capital}
                    </div>
                  </div>
                  <div>
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wider font-medium block mb-0.5',
                        currentStyle.accent
                      )}
                    >
                      Avg Grad Rate
                    </span>
                    <div
                      className={cn(
                        'flex items-center gap-1.5 font-bold text-lg font-poppins',
                        currentStyle.title
                      )}
                    >
                      <TrendingUp className={cn('w-4 h-4 opacity-70', currentStyle.accent)} />
                      {displaySummary.graduation}
                    </div>
                  </div>
                  <div>
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wider font-medium block mb-0.5',
                        currentStyle.accent
                      )}
                    >
                      Avg Exit Rate
                    </span>
                    <div
                      className={cn(
                        'flex items-center gap-1.5 font-bold text-lg font-poppins',
                        currentStyle.title
                      )}
                    >
                      <Percent className={cn('w-4 h-4 opacity-70', currentStyle.accent)} />
                      {displaySummary.exitRate}
                    </div>
                  </div>
                </div>

                {/* Stages Breakdown */}
                {stages.length > 0 && (
                  <div>
                    <h5
                      className={cn(
                        'text-[10px] uppercase tracking-wider font-semibold mb-2',
                        currentStyle.text
                      )}
                    >
                      Stage Breakdown
                    </h5>
                    <div className="grid grid-cols-5 gap-2">
                      {stages.map((stage) => (
                        <div key={stage.id} className={cn('rounded p-2 border', currentStyle.cardBg)}>
                          <div
                            className={cn(
                              'font-semibold text-xs mb-1 truncate font-poppins',
                              currentStyle.title
                            )}
                            title={stage.name}
                          >
                            {stage.name}
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex justify-between text-[10px]">
                              <span className={cn('opacity-70', currentStyle.text)}>Size</span>
                              <span className={cn('font-medium', currentStyle.title)}>
                                ${stage.roundSize}M
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className={cn('opacity-70', currentStyle.text)}>Grad</span>
                              <span className={cn('font-medium', currentStyle.title)}>
                                {stage.gradRate}%
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className={cn('opacity-70', currentStyle.text)}>Exit</span>
                              <span className={cn('font-medium', currentStyle.title)}>
                                {stage.exitRate}%
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {issues.map((issue, idx) => (
                    <motion.div
                      key={`${issue.field}-${idx}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2, delay: idx * 0.05 }}
                      className={cn('text-xs flex items-start gap-2', currentStyle.text)}
                    >
                      <span className="font-semibold mt-0.5">-</span>
                      <span>
                        <span className="font-semibold">{issue.field}:</span> {issue.message}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default InvestmentValidationCallout;
