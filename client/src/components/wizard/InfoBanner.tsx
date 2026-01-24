/**
 * InfoBanner - Dismissible info banner with expandable details
 *
 * Features:
 * - Collapsible content for additional context
 * - Dismissible with X button
 * - Smooth expand/collapse animations
 * - Uses Updog brand colors
 */

import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface InfoBannerProps {
  title: string;
  description?: string;
  defaultExpanded?: boolean;
  dismissible?: boolean;
  className?: string;
}

export function InfoBanner({
  title,
  description,
  defaultExpanded = false,
  dismissible = true,
  className,
}: InfoBannerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'bg-blue-50 border border-blue-100 rounded-lg p-3 mb-6',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div
              className={cn(
                'flex items-center gap-2',
                description && 'cursor-pointer'
              )}
              onClick={() => description && setIsExpanded(!isExpanded)}
            >
              <h3 className="text-sm font-medium text-blue-900 font-poppins">
                {title}
              </h3>
              {description && (
                isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-blue-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-blue-500" />
                )
              )}
            </div>

            <AnimatePresence>
              {isExpanded && description && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <p className="text-sm text-blue-700 mt-2 leading-relaxed">
                    {description}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        {dismissible && (
          <button
            onClick={() => setIsVisible(false)}
            className="text-blue-400 hover:text-blue-600 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default InfoBanner;
