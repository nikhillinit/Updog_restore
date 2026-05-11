import React from 'react';

import povIconSvg from '@/assets/brand/press-on-ventures-icon.svg?raw';
import povLogoSvg from '@/assets/brand/press-on-ventures-logo.svg?raw';
import { colors } from '@/lib/brand-tokens';

interface POVLogoProps {
  variant?: 'dark' | 'light' | 'white';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

type POVLogoVariant = NonNullable<POVLogoProps['variant']>;

const logoSizeClasses = {
  sm: 'h-8',
  md: 'h-12',
  lg: 'h-16',
  xl: 'h-20',
} satisfies Record<NonNullable<POVLogoProps['size']>, string>;

const iconSizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-12 h-12',
} satisfies Record<NonNullable<POVLogoProps['size']>, string>;

const variantMarkColors = {
  dark: colors.dark,
  light: colors.beige,
  white: colors.white,
} satisfies Record<POVLogoVariant, string>;

const sourceMarkColor = colors.dark;

function toSvgDataUri(svg: string, variant: POVLogoVariant): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    svg.replaceAll(sourceMarkColor, variantMarkColors[variant])
  )}`;
}

const logoSources = {
  dark: toSvgDataUri(povLogoSvg, 'dark'),
  light: toSvgDataUri(povLogoSvg, 'light'),
  white: toSvgDataUri(povLogoSvg, 'white'),
} satisfies Record<POVLogoVariant, string>;

const iconSources = {
  dark: toSvgDataUri(povIconSvg, 'dark'),
  light: toSvgDataUri(povIconSvg, 'light'),
  white: toSvgDataUri(povIconSvg, 'white'),
} satisfies Record<POVLogoVariant, string>;

export function POVLogo({ variant = 'dark', size = 'md', className = '' }: POVLogoProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src={logoSources[variant]}
        alt="Press On Ventures"
        className={`${logoSizeClasses[size]} object-contain transition-opacity duration-200 hover:opacity-90`}
        decoding="async"
      />
    </div>
  );
}

// Icon-only version for smaller spaces
export function POVIcon({ variant = 'dark', size = 'md', className = '' }: POVLogoProps) {
  return (
    <div className={`${iconSizeClasses[size]} ${className}`}>
      <img
        src={iconSources[variant]}
        alt="Press On Ventures"
        className="w-full h-full object-contain transition-opacity duration-200 hover:opacity-90"
        decoding="async"
      />
    </div>
  );
}

// Brand-compliant header component
export function POVBrandHeader({
  title,
  subtitle,
  showLogo = true,
  variant = 'light', // light background by default
}: {
  title: string;
  subtitle?: string;
  showLogo?: boolean;
  variant?: 'light' | 'dark' | 'beige';
}) {
  const backgroundClasses = {
    light: 'bg-white text-slate-900 border-gray-300',
    dark: 'bg-slate-900 text-white border-slate-700',
    beige: 'bg-slate-50 text-slate-900 border-slate-300',
  };

  const logoVariant = variant === 'dark' ? 'white' : 'dark';

  return (
    <div className={`border-b-2 shadow-lg ${backgroundClasses[variant]}`}>
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 sm:py-16">
        <div className="text-center">
          {showLogo && (
            <div className="mb-5 sm:mb-8">
              <POVLogo variant={logoVariant} size="lg" />
            </div>
          )}
          <h1 className="font-inter font-bold text-3xl mb-4 tracking-tight sm:text-5xl sm:mb-6">
            {title}
          </h1>
          {subtitle && (
            <p className="font-poppins text-base max-w-4xl mx-auto leading-relaxed text-slate-600 sm:text-xl">
              {subtitle}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-500 sm:mt-8">
            <div className="w-2 h-2 rounded-full bg-slate-400"></div>
            <span className="font-poppins">Powered by Press On Ventures</span>
            <div className="w-2 h-2 rounded-full bg-slate-400"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
