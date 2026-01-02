import React, { Suspense } from 'react';

// Lazy load ResponsiveContainer only when needed
const ResponsiveContainer = React.lazy(() => 
  import('recharts/es6/component/ResponsiveContainer').then(module => ({
    default: module.ResponsiveContainer
  }))
);

// Recharts ResponsiveContainer expects number or percentage string
type Dimension = number | `${number}%`;

interface LazyResponsiveContainerProps {
  width?: Dimension;
  height?: Dimension;
  aspect?: number;
  minWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  children: React.ReactElement;
  className?: string;
}

export function LazyResponsiveContainer({
  children,
  height = 300,
  width = '100%' as const,
  ...props
}: LazyResponsiveContainerProps) {
  // Convert dimension to CSS-compatible string
  const toCss = (dim: Dimension): string =>
    typeof dim === 'number' ? `${dim}px` : dim;

  return (
    <Suspense
      fallback={
        <div
          style={{
            width: toCss(width),
            height: toCss(height)
          }}
          className="animate-pulse bg-gray-100 rounded"
        />
      }
    >
      <ResponsiveContainer width={width} height={height} {...props}>
        {children}
      </ResponsiveContainer>
    </Suspense>
  );
}