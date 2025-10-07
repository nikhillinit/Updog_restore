import React from 'react';
interface NumericInputProps {
  id: string;
  label?: string;
  value: string | number;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}
export const NumericInput = ({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  step = 1,
  error,
  helpText,
  required = false,
  disabled = false,
  className = ''
}: NumericInputProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // Allow empty string, minus sign, or valid numbers
    if (newValue === '' || newValue === '-' || !isNaN(Number(newValue))) {
      onChange(newValue);
    }
  };
  return <div className={`mb-4 ${className}`}>
      {label && <label htmlFor={id} className="block text-sm font-medium text-charcoal mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>}
      <div className="relative">
        {prefix && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal/70">
            {prefix}
          </div>}
        <input id={id} type="text" inputMode="decimal" value={value} onChange={handleChange} min={min} max={max} step={step} disabled={disabled} className={`
            w-full px-3 py-2 border rounded-md font-mono
            ${prefix ? 'pl-8' : ''}
            ${suffix ? 'pr-8' : ''}
            ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-lightGray focus:ring-beige focus:border-beige'}
            ${disabled ? 'bg-lightGray cursor-not-allowed' : 'bg-white'}
            focus:outline-none focus:ring-2 transition-colors
          `} />
        {suffix && <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-charcoal/70">
            {suffix}
          </div>}
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      {helpText && !error && <p className="mt-1 text-sm text-charcoal/70">{helpText}</p>}
    </div>;
};