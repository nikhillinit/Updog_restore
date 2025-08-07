import React from 'react';
import { CheckCircle, Circle } from 'lucide-react';

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

export function WizardProgress({ steps, currentStep, completedSteps }: WizardProgressProps) {
  const currentIndex = steps.findIndex(step => step.id === currentStep);
  const progress = ((currentIndex + 1) / steps.length) * 100;

  return (
    <div className="bg-pov-white border-b border-pov-gray px-6 py-4">
      {/* Progress Bar */}
      <div className="relative mb-6">
        <div className="h-2 bg-pov-gray rounded-full overflow-hidden">
          <div 
            className="h-2 bg-gradient-to-r from-pov-beige to-pov-charcoal rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;
          const isPast = index < currentIndex;
          
          return (
            <div 
              key={step.id}
              className={`flex flex-col items-center text-center transition-all duration-200 ${
                isCurrent ? 'scale-105' : ''
              }`}
            >
              {/* Step Icon */}
              <div className={`
                relative w-12 h-12 rounded-full border-2 flex items-center justify-center mb-3 transition-all duration-200
                ${isCompleted 
                  ? 'bg-pov-success border-pov-success text-white' 
                  : isCurrent 
                    ? 'bg-pov-beige border-pov-charcoal text-pov-charcoal shadow-lg' 
                    : isPast
                      ? 'bg-pov-gray border-gray-300 text-gray-500'
                      : 'bg-pov-white border-gray-300 text-gray-400'
                }
              `}>
                {isCompleted ? (
                  <CheckCircle className="w-6 h-6" />
                ) : (
                  <span className="font-inter font-bold text-sm">{step.icon}</span>
                )}
                
                {/* Current step pulse animation */}
                {isCurrent && (
                  <div className="absolute inset-0 rounded-full border-2 border-pov-beige animate-pulse opacity-75" />
                )}
              </div>
              
              {/* Step Content */}
              <div className="min-h-[3rem] flex flex-col">
                <h4 className={`font-inter font-semibold text-xs mb-1 transition-colors duration-200 ${
                  isCurrent ? 'text-pov-charcoal' : 'text-gray-600'
                }`}>
                  {step.label}
                </h4>
                <p className={`font-poppins text-xs leading-tight transition-colors duration-200 ${
                  isCurrent ? 'text-gray-700' : 'text-gray-500'
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
