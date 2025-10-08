/**
 * ProgressStepper Component
 *
 * Breadcrumb-style step indicator for wizard navigation.
 * Displays all steps with progress indication and clickable links.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressStep {
  id: string;
  label: string;
  href: string;
}

export interface ProgressStepperProps {
  current: number; // 1-indexed
  steps: ProgressStep[];
}

export function ProgressStepper({ current, steps }: ProgressStepperProps) {
  return (
    <nav className="flex items-center justify-center py-4" aria-label="Progress">
      <ol className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < current;
          const isCurrent = stepNumber === current;
          const isInactive = stepNumber > current;

          return (
            <li key={step.id} className="flex items-center">
              {/* Step Link */}
              <a
                href={step.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200',
                  'font-poppins text-sm font-medium',
                  isCurrent && 'bg-charcoal text-white',
                  isCompleted && 'bg-charcoal/90 text-white hover:bg-charcoal',
                  isInactive &&
                    'bg-lightGray text-charcoal/50 cursor-not-allowed pointer-events-none'
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {/* Step Number */}
                <span
                  className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full',
                    'font-inter text-xs font-semibold',
                    isCurrent && 'bg-white text-charcoal',
                    isCompleted && 'bg-white text-charcoal',
                    isInactive && 'bg-charcoal/10 text-charcoal/40'
                  )}
                >
                  {stepNumber}
                </span>
                {/* Step Label */}
                <span className="hidden sm:inline">{step.label}</span>
              </a>

              {/* Separator */}
              {index < steps.length - 1 && (
                <span
                  className={cn('mx-1 md:mx-2 text-charcoal/30 font-light', 'hidden sm:inline')}
                  aria-hidden="true"
                >
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
