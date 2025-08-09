import React from 'react';
import { OctagonalPowerIcon } from '@/components/ui/OctagonalPowerIcon';

interface WizardStep {
  id: string;
  label: string;
  description: string;
  icon: string;
}

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: string;
  completedSteps: string[];
}

export function WizardProgressRedesigned({ steps, currentStep, completedSteps }: WizardProgressProps) {
  const currentIndex = steps.findIndex(step => step.id === currentStep);
  const progress = ((currentIndex + 1) / steps.length) * 100;

  return (
    <div className="bg-pov-gray px-6 py-6">
      {/* Progress Bar */}
      <div className="relative mb-6">
        <div className="h-2 bg-pov-gray rounded-full overflow-hidden">
          <div
            className="h-2 bg-pov-charcoal rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;
          const isUpcoming = index > currentIndex;
          
          let iconState: 'active' | 'upcoming' | 'completed';
          if (isCompleted) iconState = 'completed';
          else if (isCurrent) iconState = 'active';
          else iconState = 'upcoming';
          
          return (
            <div 
              key={step.id}
              className="flex flex-col items-center text-center transition-all duration-200"
            >
              {/* Octagonal Power Icon */}
              <div className="mb-3">
                <OctagonalPowerIcon 
                  state={iconState}
                  number={step.icon}
                  size="md"
                />
              </div>
              
              {/* Step Content */}
              <div className="min-h-[3rem] flex flex-col">
                <h4 className={`font-poppins font-medium text-xs uppercase tracking-widest mb-1 transition-colors duration-200 ${
                  isCurrent ? 'text-pov-charcoal' : 'text-charcoal-600'
                }`}>
                  {step.label}
                </h4>
                <p className={`font-poppins text-xs leading-tight transition-colors duration-200 ${
                  isCurrent ? 'text-charcoal-700' : 'text-charcoal-500'
                }`}>
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
