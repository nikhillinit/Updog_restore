import React from 'react';
interface InputProps {
  id: string;
  label?: string;
  placeholder?: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
}
export const Input = ({
  id,
  label,
  placeholder,
  type = 'text',
  value,
  onChange,
  error,
  helpText,
  required = false,
  disabled = false,
  className = '',
  icon
}: InputProps) => {
  return <div className={`mb-4 ${className}`}>
      {label && <label htmlFor={id} className="block text-sm font-medium text-charcoal mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>}
      <div className="relative">
        {icon && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-charcoal/50">
            {icon}
          </div>}
        <input id={id} type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} className={`
            w-full px-3 py-2 border rounded-md
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-lightGray focus:ring-beige focus:border-beige'}
            ${disabled ? 'bg-lightGray cursor-not-allowed' : 'bg-white'}
            focus:outline-none focus:ring-2 transition-colors
          `} />
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      {helpText && !error && <p className="mt-1 text-sm text-charcoal/70">{helpText}</p>}
    </div>;
};