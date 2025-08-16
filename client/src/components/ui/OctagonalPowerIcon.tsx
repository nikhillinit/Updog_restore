/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { cn } from "@/lib/utils";

interface OctagonalPowerIconProps {
  state: 'active' | 'upcoming' | 'completed';
  number?: string | number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function OctagonalPowerIcon({ 
  state, 
  number, 
  className = '',
  size = 'md'
}: OctagonalPowerIconProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  const getStateClasses = () => {
    switch (state) {
      case 'active':
        return 'bg-pov-charcoal text-white border-2 border-pov-charcoal';
      case 'upcoming':
        return 'bg-pov-beige text-pov-charcoal border-2 border-pov-charcoal';
      case 'completed':
        return 'bg-white text-pov-charcoal border-2 border-pov-charcoal';
      default:
        return 'bg-pov-gray text-charcoal-500 border-2 border-charcoal-300';
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center font-inter font-bold text-sm transition-all duration-200 rounded-full",
        sizeClasses[size],
        getStateClasses(),
        className
      )}
    >
      {state === 'completed' ? (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <span>{number}</span>
      )}
    </div>
  );
}

