import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardStep {
  id: string;
  number: number;
  title: string;
  description: string;
  completed?: boolean;
  current?: boolean;
}

interface ModernWizardProgressProps {
  steps: WizardStep[];
  currentStepId: string;
}

export function ModernWizardProgress({ steps, currentStepId }: ModernWizardProgressProps) {
  return (
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="text-2xl font-bold tracking-wider text-charcoal-900 mb-2">
            PRESS ON VENTURES
          </div>
          <h1 className="text-4xl font-light text-charcoal-800 tracking-tight">
            Fund Construction Wizard
          </h1>
        </div>

        {/* Progress Indicator */}
        <div className="mb-12">
          {/* Progress Bar */}
          <div className="relative mb-8">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2" />
            <div
              className="absolute top-1/2 left-0 h-0.5 bg-charcoal-700 -translate-y-1/2 transition-all duration-500"
              style={{
                width: `${((steps.findIndex(s => s.id === currentStepId) + 1) / steps.length) * 100}%`
              }}
            />
          </div>

          {/* Step Circles */}
          <div className="flex justify-between items-center">
            {steps.map((step, index) => {
              const isCompleted = step.completed || steps.findIndex(s => s.id === currentStepId) > index;
              const isCurrent = step.id === currentStepId;

              return (
                <div key={step.id} className="flex flex-col items-center relative">
                  {/* Circle */}
                  <div
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 relative z-10",
                      isCompleted
                        ? "bg-charcoal-800 text-white"
                        : isCurrent
                        ? "bg-charcoal-800 text-white ring-4 ring-charcoal-200"
                        : "bg-white border-2 border-gray-300 text-gray-500"
                    )}
                  >
                    {isCompleted && !isCurrent ? (
                      <Check className="w-6 h-6" />
                    ) : (
                      step.number
                    )}
                  </div>

                  {/* Step Info */}
                  <div className="mt-4 text-center max-w-32">
                    <div className={cn(
                      "font-medium text-sm uppercase tracking-wide",
                      isCurrent ? "text-charcoal-900" : "text-gray-500"
                    )}>
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 leading-tight">
                      {step.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}