/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface PremiumSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  description?: string;
  error?: string;
  className?: string;
}

export function PremiumSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false,
  description,
  error,
  className = ''
}: PremiumSelectProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="font-poppins font-medium text-sm text-pov-charcoal">
        {label}
        {required && <span className="text-pov-error ml-1">*</span>}
      </Label>
      
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={`
          h-11 border border-pov-gray bg-pov-white font-poppins
          transition-all duration-200 ease-out
          focus:ring-2 focus:ring-pov-beige focus:border-transparent
          hover:border-gray-400
          ${error ? 'border-pov-error focus:ring-pov-error/20' : ''}
          shadow-sm hover:shadow-md
        `}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-pov-white border border-pov-gray shadow-elevated">
          {options.map((option) => (
            <SelectItem 
              key={option.value} 
              value={option.value}
              className="font-poppins text-sm hover:bg-pov-beige/20 focus:bg-pov-beige/30 transition-colors duration-150"
            >
              <div className="flex flex-col">
                <span className="font-medium text-pov-charcoal">{option.label}</span>
                {option.description && (
                  <span className="text-xs text-gray-600 mt-1">{option.description}</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
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

