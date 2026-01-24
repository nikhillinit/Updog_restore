/**
 * StageAccordionRow - Expandable accordion row for investment stage editing
 *
 * Features:
 * - Collapsed view shows core metrics (round size, valuation, grad rate, duration)
 * - Expanded view reveals advanced fields (ESOP, exit rate, failure rate)
 * - Framer Motion animations for smooth expand/collapse
 * - Pre/Post valuation toggle with sliding indicator
 * - Field-level validation with inline errors
 * - Keyboard accessible
 */

import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, RotateCcw, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface StageData {
  id: string;
  name: string;
  roundSize: number;
  valuation: number;
  valuationType: 'Pre' | 'Post';
  esop: number;
  gradRate: number;
  monthsToNext: number;
  exitRate: number;
}

interface StageAccordionRowProps {
  stage: StageData;
  onChange: (id: string, field: keyof StageData, value: StageData[keyof StageData]) => void;
  onReset?: (id: string) => void;
  hasError?: boolean;
  defaultExpanded?: boolean;
}

export function StageAccordionRow({
  stage,
  onChange,
  onReset,
  hasError = false,
  defaultExpanded = false,
}: StageAccordionRowProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [errors, setErrors] = useState<Partial<Record<keyof StageData, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof StageData, boolean>>>({});

  const validateField = useCallback((field: keyof StageData, value: number): string | null => {
    if (field === 'gradRate' || field === 'exitRate' || field === 'esop') {
      if (value < 0 || value > 100) {
        const fieldName = field === 'gradRate' ? 'Graduation rate' : field === 'exitRate' ? 'Exit rate' : 'ESOP';
        return `${fieldName} must be between 0-100%`;
      }
    }
    if (field === 'roundSize' && value <= 0) {
      return 'Round size must be greater than 0';
    }
    if (field === 'valuation' && value <= 0) {
      return 'Valuation must be greater than 0';
    }
    if (field === 'monthsToNext' && value <= 0) {
      return 'Duration must be greater than 0';
    }
    return null;
  }, []);

  const handleNumberChange = useCallback((field: keyof StageData, value: string) => {
    const numValue = parseFloat(value);
    setTouched((prev) => ({ ...prev, [field]: true }));

    if (value === '' || isNaN(numValue)) {
      setErrors((prev) => ({ ...prev, [field]: 'Required field' }));
      return;
    }

    const error = validateField(field, numValue);
    setErrors((prev) => ({ ...prev, [field]: error || undefined }));

    if (!error) {
      onChange(stage.id, field, numValue);
    }
  }, [onChange, stage.id, validateField]);

  const handleBlur = useCallback((field: keyof StageData) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const hasFieldError = (field: keyof StageData) => touched[field] && errors[field];
  const advancedFieldsCount = 3; // ESOP, Exit Rate, Failure Rate

  const toggleExpand = () => setIsExpanded(!isExpanded);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) {
      toggleExpand();
    }
  };

  const failureRate = Math.max(0, 100 - stage.gradRate - stage.exitRate);

  return (
    <div
      className={cn(
        'border rounded-lg bg-white transition-all duration-200',
        isExpanded
          ? 'ring-2 ring-[#292929] border-[#292929] shadow-lg'
          : 'border-[#E0D8D1] hover:border-[#292929]/50 hover:shadow-md',
        hasError && 'ring-2 ring-red-500 border-red-500',
        'focus-within:ring-2 focus-within:ring-[#292929] focus-within:border-[#292929]'
      )}
      onKeyDown={handleKeyDown}
    >
      {/* Summary Row (Always Visible) */}
      <div
        className="grid grid-cols-12 gap-6 p-6 items-center cursor-pointer group"
        onClick={toggleExpand}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        {/* Stage Name */}
        <div className="col-span-3 flex items-center gap-4">
          <div
            className={cn(
              'p-2 rounded-lg transition-all',
              isExpanded
                ? 'bg-[#292929] text-white shadow-sm'
                : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
            )}
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </div>
          <div>
            <span className="font-semibold text-base text-[#292929] block font-poppins">
              {stage.name}
            </span>
            {!isExpanded && (
              <span className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                <Plus className="w-3 h-3" />
                {advancedFieldsCount} more fields
              </span>
            )}
          </div>
        </div>

        {/* Round Size */}
        <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
          <label className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2 block">
            Round size
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">
              $
            </span>
            <Input
              type="number"
              step="0.1"
              value={stage.roundSize}
              onChange={(e) => handleNumberChange('roundSize', e.target.value)}
              onBlur={() => handleBlur('roundSize')}
              className={cn(
                'h-10 pl-6 pr-8 font-poppins',
                hasFieldError('roundSize') && 'border-red-300 focus:border-red-500'
              )}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">
              M
            </span>
          </div>
        </div>

        {/* Valuation */}
        <div className="col-span-3" onClick={(e) => e.stopPropagation()}>
          <label className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2 block">
            Valuation
          </label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">
                $
              </span>
              <Input
                type="number"
                step="0.1"
                value={stage.valuation}
                onChange={(e) => handleNumberChange('valuation', e.target.value)}
                onBlur={() => handleBlur('valuation')}
                className={cn(
                  'h-10 pl-6 pr-8 font-poppins',
                  hasFieldError('valuation') && 'border-red-300 focus:border-red-500'
                )}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">
                M
              </span>
            </div>
            {/* Pre/Post Toggle with sliding indicator */}
            <div className="relative flex bg-gray-100 rounded-lg p-1 border border-gray-200">
              <motion.div
                className="absolute inset-y-1 w-[calc(50%-4px)] bg-white rounded-md shadow-sm"
                initial={false}
                animate={{
                  x: stage.valuationType === 'Pre' ? 0 : 'calc(100% + 8px)',
                }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 30,
                }}
              />
              <button
                type="button"
                className={cn(
                  'relative z-10 px-3 py-1.5 text-xs font-semibold rounded transition-colors',
                  stage.valuationType === 'Pre'
                    ? 'text-[#292929]'
                    : 'text-gray-500 hover:text-gray-700'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(stage.id, 'valuationType', 'Pre');
                }}
              >
                Pre
              </button>
              <button
                type="button"
                className={cn(
                  'relative z-10 px-3 py-1.5 text-xs font-semibold rounded transition-colors',
                  stage.valuationType === 'Post'
                    ? 'text-[#292929]'
                    : 'text-gray-500 hover:text-gray-700'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(stage.id, 'valuationType', 'Post');
                }}
              >
                Post
              </button>
            </div>
          </div>
        </div>

        {/* Graduation Rate */}
        <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
          <label className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
            Grad rate
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Percentage of companies that successfully raise the next round</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </label>
          <div className="relative">
            <Input
              type="number"
              step="1"
              value={stage.gradRate}
              onChange={(e) => handleNumberChange('gradRate', e.target.value)}
              onBlur={() => handleBlur('gradRate')}
              className={cn(
                'h-10 pr-8 font-poppins',
                hasFieldError('gradRate') && 'border-red-300 focus:border-red-500'
              )}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">
              %
            </span>
          </div>
        </div>

        {/* Duration */}
        <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
          <label className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2 block">
            Duration
          </label>
          <div className="relative">
            <Input
              type="number"
              step="1"
              value={stage.monthsToNext}
              onChange={(e) => handleNumberChange('monthsToNext', e.target.value)}
              onBlur={() => handleBlur('monthsToNext')}
              className={cn(
                'h-10 pr-10 font-poppins',
                hasFieldError('monthsToNext') && 'border-red-300 focus:border-red-500'
              )}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">
              mo
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-gray-100 bg-gray-50/50"
          >
            <div className="p-6 grid grid-cols-12 gap-6">
              <div className="col-span-3">
                <h4 className="text-sm font-semibold text-[#292929] mb-1 font-poppins">
                  Advanced assumptions
                </h4>
                <p className="text-xs text-gray-500 mb-4">
                  Fine-tune exit and equity parameters
                </p>
                {onReset && (
                  <button
                    type="button"
                    onClick={() => onReset(stage.id)}
                    className="text-xs text-gray-500 hover:text-[#292929] flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#292929] focus:ring-offset-2 rounded px-2 py-1 -ml-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to defaults
                  </button>
                )}
              </div>

              <div className="col-span-9 grid grid-cols-3 gap-6">
                {/* ESOP Pool */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1.5">
                    ESOP pool
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Employee Stock Option Pool created at this round</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.1"
                      value={stage.esop}
                      onChange={(e) => handleNumberChange('esop', e.target.value)}
                      onBlur={() => handleBlur('esop')}
                      className={cn(
                        'h-10 pr-8 font-poppins',
                        hasFieldError('esop') && 'border-red-300 focus:border-red-500'
                      )}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">
                      %
                    </span>
                  </div>
                </div>

                {/* Exit Rate */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1.5">
                    Exit rate
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Percentage of companies that exit at this stage</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="1"
                      value={stage.exitRate}
                      onChange={(e) => handleNumberChange('exitRate', e.target.value)}
                      onBlur={() => handleBlur('exitRate')}
                      className={cn(
                        'h-10 pr-8 font-poppins',
                        hasFieldError('exitRate') && 'border-red-300 focus:border-red-500'
                      )}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium">
                      %
                    </span>
                  </div>
                </div>

                {/* Failure Rate (Computed) */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1.5">
                    Failure rate
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Implied failure rate (100% - graduation - exit)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </label>
                  <div className="h-10 flex items-center px-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-md border border-gray-200 font-poppins">
                    {failureRate.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default StageAccordionRow;
