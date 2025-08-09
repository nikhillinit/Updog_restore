import React, { useState, useEffect } from 'react';
import { Label } from "@/components/ui/label";

interface FinancialInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  prefix?: string;
  suffix?: string;
  type?: 'currency' | 'percentage' | 'number' | 'text';
  description?: string;
  error?: string;
  className?: string;
}

export function FinancialInput({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  prefix = '$',
  suffix,
  type = 'currency',
  description,
  error,
  className = ''
}: FinancialInputProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [focused, setFocused] = useState(false);

  // Format number with commas for display
  const formatNumber = (num: string) => {
    if (!num || num === '') return '';
    const number = parseFloat(num.replace(/,/g, ''));
    if (isNaN(number)) return num;
    return number.toLocaleString();
  };

  // Clean number for storage
  const cleanNumber = (num: string) => {
    return num.replace(/,/g, '');
  };

  useEffect(() => {
    if (!focused && type === 'currency') {
      setDisplayValue(formatNumber(value));
    } else {
      setDisplayValue(value);
    }
  }, [value, focused, type]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setDisplayValue(newValue);
    
    if (type === 'currency') {
      onChange(cleanNumber(newValue));
    } else {
      onChange(newValue);
    }
  };

  const handleFocus = () => {
    setFocused(true);
    if (type === 'currency') {
      setDisplayValue(cleanNumber(value));
    }
  };

  const handleBlur = () => {
    setFocused(false);
    if (type === 'currency') {
      setDisplayValue(formatNumber(value));
    }
  };

  const getPrefix = () => {
    if (type === 'currency') return '$';
    if (type === 'percentage') return '';
    return prefix;
  };

  const getSuffix = () => {
    if (type === 'percentage') return '%';
    return suffix;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="font-poppins font-medium text-sm text-pov-charcoal">
        {label}
        {required && <span className="text-pov-error ml-1">*</span>}
      </Label>
      
      <div className="relative">
        {getPrefix() && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">
            {getPrefix()}
          </span>
        )}
        
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`
            w-full h-11 rounded-md border border-pov-gray bg-pov-white font-mono text-sm
            transition-all duration-200 ease-out
            ${getPrefix() ? 'pl-8' : 'pl-4'}
            ${getSuffix() ? 'pr-8' : 'pr-4'}
            py-2
            focus:ring-2 focus:ring-pov-beige focus:border-transparent
            hover:border-gray-400
            placeholder:text-gray-400
            ${error ? 'border-pov-error focus:ring-pov-error/20' : ''}
            ${focused ? 'shadow-md' : 'shadow-sm'}
          `}
        />
        
        {getSuffix() && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">
            {getSuffix()}
          </span>
        )}
      </div>
      
      {description && !error && (
        <p className="font-poppins text-xs text-gray-600">
          {description}
        </p>
      )}
      
      {error && (
        <p className="font-poppins text-xs text-pov-error">
          {error}
        </p>
      )}
    </div>
  );
}
