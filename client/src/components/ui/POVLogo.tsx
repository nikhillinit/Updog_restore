import React from 'react';

interface POVLogoProps {
  variant?: 'dark' | 'light' | 'white';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function POVLogo({ 
  variant = 'dark', 
  size = 'md',
  className = ''
}: POVLogoProps) {
  const sizeClasses = {
    sm: 'h-8',
    md: 'h-12',
    lg: 'h-16',
    xl: 'h-20'
  };

  // For now, using the style guide image. In production, you'd use SVG versions
  const logoSrc = "https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2Fe1a58a42f58349eba6b0681054118e7a?format=webp&width=800";

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img 
        src={logoSrc}
        alt="Press On Ventures"
        className={`${sizeClasses[size]} object-contain transition-opacity duration-200 hover:opacity-90`}
      />
    </div>
  );
}

// Simplified icon version for smaller spaces
export function POVIcon({ 
  variant = 'dark',
  size = 'md',
  className = ''
}: POVLogoProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-12 h-12'
  };

  const colorClasses = {
    dark: 'text-pov-charcoal',
    light: 'text-gray-400',
    white: 'text-pov-white'
  };

  return (
    <div className={`${sizeClasses[size]} ${colorClasses[variant]} ${className}`}>
      {/* Simplified POV icon - letter U with arrows */}
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M12 2L9 5v6c0 1.66 1.34 3 3 3s3-1.34 3-3V5l-3-3z"/>
        <path d="M6 8v6c0 3.31 2.69 6 6 6s6-2.69 6-6V8l-2 2v4c0 2.21-1.79 4-4 4s-4-1.79-4-4v-4l-2-2z"/>
        <path d="M4 6l2 2M20 6l-2 2"/>
      </svg>
    </div>
  );
}

// Brand-compliant header component
export function POVBrandHeader({ 
  title, 
  subtitle,
  showLogo = true,
  variant = 'light' // light background by default
}: {
  title: string;
  subtitle?: string;
  showLogo?: boolean;
  variant?: 'light' | 'dark' | 'beige';
}) {
  const backgroundClasses = {
    light: 'bg-pov-white text-pov-charcoal border-pov-gray/30',
    dark: 'bg-pov-charcoal text-pov-white border-pov-charcoal',
    beige: 'bg-pov-beige text-pov-charcoal border-pov-beige'
  };

  const logoVariant = variant === 'dark' ? 'white' : 'dark';

  return (
    <div className={`border-b ${backgroundClasses[variant]}`}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center">
          {showLogo && (
            <div className="mb-8">
              <POVLogo variant={logoVariant} size="lg" />
            </div>
          )}
          <h1 className="font-inter font-bold text-4xl mb-4 tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="font-poppins text-xl max-w-3xl mx-auto leading-relaxed opacity-80">
              {subtitle}
            </p>
          )}
          <div className="mt-6 flex items-center justify-center space-x-2 text-sm opacity-60">
            <div className={`w-2 h-2 rounded-full ${variant === 'dark' ? 'bg-pov-beige' : 'bg-pov-beige'}`}></div>
            <span className="font-poppins">Powered by Press On Ventures</span>
            <div className={`w-2 h-2 rounded-full ${variant === 'dark' ? 'bg-pov-beige' : 'bg-pov-beige'}`}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
