import React from 'react';
interface PercentInputProps {
  id: string;
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  showSlider?: boolean;
}
export const PercentInput = ({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  error,
  helpText,
  required = false,
  disabled = false,
  className = '',
  showSlider = true
}: PercentInputProps) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue === '') {
      onChange(0);
    } else {
      const numValue = parseFloat(newValue);
      if (!isNaN(numValue)) {
        onChange(Math.min(Math.max(numValue, min), max));
      }
    }
  };
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };
  return <div className={`mb-4 ${className}`}>
      {label && <label htmlFor={id} className="block text-sm font-medium text-charcoal mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <input id={id} type="text" inputMode="decimal" value={value} onChange={handleInputChange} disabled={disabled} className={`
              w-full px-3 py-2 border rounded-md font-mono
              pr-8
              ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-lightGray focus:ring-beige focus:border-beige'}
              ${disabled ? 'bg-lightGray cursor-not-allowed' : 'bg-white'}
              focus:outline-none focus:ring-2 transition-colors
            `} />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-charcoal/70">
            %
          </div>
        </div>
        {showSlider && <div className="w-1/2">
            <input type="range" min={min} max={max} step={step} value={value} onChange={handleSliderChange} disabled={disabled} className="w-full h-2 bg-lightGray rounded-lg appearance-none cursor-pointer" />
          </div>}
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      {helpText && !error && <p className="mt-1 text-sm text-charcoal/70">{helpText}</p>}
    </div>;
};