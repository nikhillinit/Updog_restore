import React from 'react';
interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
}
export function ProgressBar({
  currentStep,
  totalSteps
}: ProgressBarProps) {
  return <div className="w-full">
      <div className="flex justify-between mb-1">
        {Array.from({
        length: totalSteps
      }, (_, i) => i + 1).map(step => <div key={step} className="flex flex-col items-center">
            <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium 
                ${step <= currentStep ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {step}
            </div>
            <div className="text-xs mt-1 text-gray-500">Step {step}</div>
          </div>)}
      </div>
      <div className="overflow-hidden h-1 bg-gray-200 rounded">
        <div className="bg-blue-600 h-full" style={{
        width: `${currentStep / totalSteps * 100}%`
      }}></div>
      </div>
    </div>;
}