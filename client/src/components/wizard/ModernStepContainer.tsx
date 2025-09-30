import React from 'react';
import { cn } from '@/lib/utils';

interface ModernStepContainerProps {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

export function ModernStepContainer({
  title,
  description,
  children,
  className
}: ModernStepContainerProps) {
  return (
    <div className={cn("min-h-screen bg-[#F2F2F2]", className)}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Step Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-inter font-bold text-[#292929] mb-3">
            {title}
          </h2>
          <p className="font-poppins text-[#292929]/70 text-lg leading-relaxed">
            {description}
          </p>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl shadow-md border border-[#E0D8D1] p-8">
          {children}
        </div>
      </div>
    </div>
  );
}