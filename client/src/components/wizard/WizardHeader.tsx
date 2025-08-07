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

        {/* Centered wizard title */}
        <div className="text-center pb-2 font-normal text-4xl leading-10 tracking-tight font-inter">
          {title}
        </div>
      </div>
    </div>
  );
}
