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
    light: 'bg-white text-slate-900 border-slate-200',
    dark: 'bg-slate-900 text-white border-slate-700',
    beige: 'bg-slate-50 text-slate-900 border-slate-200',
  };

  const subtitleClasses = {
    light: 'text-slate-600',
    dark: 'text-slate-300',
    beige: 'text-slate-600',
  };

  const iconFrameClasses = {
    light: 'border-slate-200 bg-slate-50',
    dark: 'border-white/15 bg-white/10',
    beige: 'border-slate-200 bg-white',
  };

  const logoVariant = variant === 'dark' ? 'white' : 'dark';

  return (
    <div className={`border-b shadow-sm ${backgroundClasses[variant]}`}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        {showLogo && (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${iconFrameClasses[variant]}`}
          >
            <POVIcon variant={logoVariant} size="sm" />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <h1 className="font-inter text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && (
            <p
              className={`max-w-5xl font-poppins text-sm leading-5 sm:truncate ${subtitleClasses[variant]}`}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
