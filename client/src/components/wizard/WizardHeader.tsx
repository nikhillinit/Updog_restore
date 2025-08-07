import React from 'react';
import { POVLogo } from '@/components/ui/POVLogo';

interface WizardHeaderProps {
  title: string;
  subtitle: string;
}

export function WizardHeader({ title, subtitle }: WizardHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Centered logo at top */}
        <div className="text-center mb-8">
          <POVLogo variant="dark" size="lg" />
        </div>

        {/* Centered wizard title and subtitle */}
        <div className="text-center">
          <h1 className="font-inter font-bold text-4xl text-pov-charcoal mb-2 tracking-tight">
            {title}
          </h1>
          <p className="font-poppins text-base leading-relaxed text-charcoal-600 max-w-2xl mx-auto">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
