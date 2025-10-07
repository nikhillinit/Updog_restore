import React from 'react';
import { CheckIcon } from 'lucide-react';
interface Step {
  id: number;
  name: string;
  status: 'complete' | 'current' | 'upcoming';
}
interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
}
export const StepIndicator = ({
  steps,
  currentStep
}: StepIndicatorProps) => {
  return <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center">
        {steps.map((step, stepIdx) => <li key={step.id} className={`relative ${stepIdx !== steps.length - 1 ? 'flex-1' : ''}`}>
            {step.status === 'complete' ? <div className="group flex items-center">
                <span className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-beige rounded-full">
                  <CheckIcon className="h-6 w-6 text-charcoal" aria-hidden="true" />
                </span>
                <span className="ml-3 text-sm font-medium text-charcoal">
                  {step.name}
                </span>
                {stepIdx !== steps.length - 1 && <div className="ml-4 flex-1 h-0.5 bg-beige"></div>}
              </div> : step.status === 'current' ? <div className="flex items-center" aria-current="step">
                <span className="flex-shrink-0 h-10 w-10 flex items-center justify-center border-2 border-beige rounded-full font-inter font-bold text-beige">
                  <span className="text-charcoal">{step.id}</span>
                </span>
                <span className="ml-3 text-sm font-medium text-charcoal">
                  {step.name}
                </span>
                {stepIdx !== steps.length - 1 && <div className="ml-4 flex-1 h-0.5 bg-lightGray"></div>}
              </div> : <div className="group flex items-center">
                <span className="flex-shrink-0 h-10 w-10 flex items-center justify-center border-2 border-lightGray rounded-full">
                  <span className="text-charcoal/50">{step.id}</span>
                </span>
                <span className="ml-3 text-sm font-medium text-charcoal/50">
                  {step.name}
                </span>
                {stepIdx !== steps.length - 1 && <div className="ml-4 flex-1 h-0.5 bg-lightGray"></div>}
              </div>}
          </li>)}
      </ol>
    </nav>;
};