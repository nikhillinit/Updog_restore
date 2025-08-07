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

  // Create octagonal clip path
  const octagonClipPath = "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";

  const getStateStyles = () => {
    switch (state) {
      case 'active':
        return {
          background: '#292929', // charcoal
          color: '#FFFFFF',
          border: '2px solid #292929'
        };
      case 'upcoming':
        return {
          background: '#E0D8D1', // beige
          color: '#292929',
          border: '2px solid #292929'
        };
      case 'completed':
        return {
          background: '#FFFFFF',
          color: '#292929',
          border: '2px solid #292929'
        };
      default:
        return {
          background: '#F2F2F2',
          color: '#808080',
          border: '2px solid #C0C0C0'
        };
    }
  };

  const styles = getStateStyles();

  return (
    <div 
      className={cn(
        "flex items-center justify-center font-inter font-bold text-sm transition-all duration-200",
        sizeClasses[size],
        className
      )}
      style={{
        ...styles,
        clipPath: octagonClipPath
      }}
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
