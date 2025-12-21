 
 
 
 
 
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

  // Official Press On Ventures brand assets
  const logoVariants = {
    dark: "https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2F2e9c074662e8408c8bf0fd2e6f62254f?format=webp&width=800", // Black text logo
    light: "https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2Ff49ea40289bd4c9f935555b532cb6506?format=webp&width=800", // Beige text logo
    white: "https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2Fb3de3760e5924b7caf12011c893cbadd?format=webp&width=800" // White text logo
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src={logoVariants[variant]}
        alt="Press On Ventures"
        className={`${sizeClasses[size]} object-contain transition-opacity duration-200 hover:opacity-90`}
      />
    </div>
  );
}

// Icon-only version for smaller spaces
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

  // Official Press On Ventures icon assets
  const iconVariants = {
    dark: "https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2Fbe1ff0f489c346bb87e5a21a3de55ae4?format=webp&width=800", // Black icon
    light: "https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2Fa02554ba930546fa8bb20213ec027712?format=webp&width=800", // Beige icon
    white: "https://cdn.builder.io/api/v1/image/assets%2Fad9cb6f2f4a54f5aa9ea2c391202901f%2F832e7518a4a94541bf981160d3e94afd?format=webp&width=800" // White icon
  };

  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      <img
        src={iconVariants[variant]}
        alt="Press On Ventures"
        className="w-full h-full object-contain transition-opacity duration-200 hover:opacity-90"
      />
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
    light: 'bg-white text-slate-900 border-gray-300',
    dark: 'bg-slate-900 text-white border-slate-700',
    beige: 'bg-slate-50 text-slate-900 border-slate-300'
  };

  const logoVariant = variant === 'dark' ? 'white' : 'dark';

  return (
    <div className={`border-b-2 shadow-lg ${backgroundClasses[variant]}`}>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center">
          {showLogo && (
            <div className="mb-8">
              <POVLogo variant={logoVariant} size="lg" />
            </div>
          )}
          <h1 className="font-inter font-bold text-5xl mb-6 tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="font-poppins text-xl max-w-4xl mx-auto leading-relaxed text-slate-600">
              {subtitle}
            </p>
          )}
          <div className="mt-8 flex items-center justify-center space-x-3 text-sm text-slate-500">
            <div className="w-2 h-2 rounded-full bg-slate-400"></div>
            <span className="font-poppins">Powered by Press On Ventures</span>
            <div className="w-2 h-2 rounded-full bg-slate-400"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

