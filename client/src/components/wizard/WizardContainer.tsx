/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { cn } from "@/lib/utils";

interface WizardContainerProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
  variant?: 'default' | 'collapsible';
}

export function WizardContainer({
  title,
  subtitle,
  children,
  className = '',
  headerActions,
  variant = 'default'
}: WizardContainerProps) {
  const containerClasses = cn(
    "bg-white rounded-2xl shadow-sm transition-all duration-200 ease-out",
    {
      'hover:bg-gradient-to-br hover:from-white hover:to-beige-50': variant === 'collapsible',
    },
    className
  );

  return (
    <div className={containerClasses}>
      {(title || subtitle || headerActions) && (
        <div className="px-8 py-6 pb-0 border-b border-charcoal-200/30">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              {title && (
                <h3 className="font-inter font-bold text-2xl text-pov-charcoal leading-tight">
                  {title}
                </h3>
              )}
              {subtitle && (
                <div className="h-px bg-charcoal-300 w-16 mb-3"></div>
              )}
              {subtitle && (
                <p className="font-poppins text-sm text-charcoal-600">
                  {subtitle}
                </p>
              )}
            </div>
            {headerActions && (
              <div className="flex items-center space-x-2">
                {headerActions}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-8 pb-8">
        <div className="font-poppins text-charcoal-700">
          {children}
        </div>
      </div>
    </div>
  );
}

// Section heading component with POV styling
export function WizardSectionHeading({ 
  title, 
  className = '' 
}: { 
  title: string; 
  className?: string; 
}) {
  return (
    <div className={cn("mb-6", className)}>
      <h4 className="font-inter font-bold text-2xl text-pov-charcoal mb-2">
        {title}
      </h4>
      <div className="h-px bg-charcoal-300 w-12"></div>
    </div>
  );
}

// Input label component with small-caps styling
export function WizardInputLabel({ 
  children, 
  required = false,
  className = '' 
}: { 
  children: React.ReactNode; 
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cn(
      "font-poppins text-sm font-medium text-charcoal-600 uppercase tracking-widest block mb-2",
      className
    )}>
      {children}
      {required && <span className="text-error ml-1">*</span>}
    </label>
  );
}

