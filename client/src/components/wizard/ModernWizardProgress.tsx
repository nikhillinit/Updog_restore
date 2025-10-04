import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

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
  enableNavigation?: boolean; // Allow clicking on steps to navigate
}

export function ModernWizardProgress({ steps, currentStepId, enableNavigation = true }: ModernWizardProgressProps) {
  const [, navigate] = useLocation();

  // Map step ID to step number for navigation
  const stepToNumber: Record<string, string> = {
    'fund-basics': '1',
    'investment-rounds': '2',
    'capital-structure': '3',
    'investment-strategy': '4',
    'distributions': '5',
    'cashflow-management': '6',
  };

  const handleStepClick = (stepId: string) => {
    if (!enableNavigation) return;

    const stepNumber = stepToNumber[stepId];
    if (stepNumber) {
      navigate(`/fund-setup?step=${stepNumber}`);
    }
  };

  return (
    <div className="bg-white border-b border-beige shadow-card">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="text-2xl font-inter font-bold tracking-wider text-charcoal mb-2">
            PRESS ON VENTURES
          </div>
          <h1 className="text-4xl font-poppins font-light text-charcoal tracking-tight">
            Fund Construction Wizard
          </h1>
        </div>

        {/* Progress Indicator */}
        <div className="mb-12">
          {/* Progress Bar */}
          <div className="relative mb-8">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-beige -translate-y-1/2" />
            <div
              className="absolute top-1/2 left-0 h-0.5 bg-charcoal -translate-y-1/2 transition-all duration-500"
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
              const isClickable = enableNavigation && stepToNumber[step.id];

              return (
                <div key={step.id} className="flex flex-col items-center relative">
                  {/* Circle */}
                  <button
                    type="button"
                    onClick={() => handleStepClick(step.id)}
                    disabled={!isClickable}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center font-inter font-semibold text-sm transition-all duration-300 relative z-10",
                      isCompleted
                        ? "bg-charcoal text-white"
                        : isCurrent
                        ? "bg-charcoal text-white ring-4 ring-beige"
                        : "bg-white border-2 border-beige text-charcoal/60",
                      isClickable && "hover:scale-110 cursor-pointer",
                      !isClickable && "cursor-default"
                    )}
                  >
                    {isCompleted && !isCurrent ? (
                      <Check className="w-6 h-6" />
                    ) : (
                      step.number
                    )}
                  </button>

                  {/* Step Info */}
                  <div className="mt-4 text-center max-w-32">
                    <div className={cn(
                      "font-poppins font-medium text-sm uppercase tracking-wide",
                      isCurrent ? "text-charcoal" : "text-charcoal/50"
                    )}>
                      {step.title}
                    </div>
                    <div className="font-poppins text-xs text-charcoal/40 mt-1 leading-tight">
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