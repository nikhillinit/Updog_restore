import React, { Suspense } from 'react';
import type { Props as RechartsResponsiveContainerProps } from 'recharts/types/component/ResponsiveContainer';

// Lazy load ResponsiveContainer only when needed
type ResponsiveContainerModule = typeof import('recharts/es6/component/ResponsiveContainer');
type Dimension = number | `${number}%`;

const loadResponsiveContainer = async (): Promise<{
  default: ResponsiveContainerModule['ResponsiveContainer'];
}> => {
  const module: ResponsiveContainerModule = await import('recharts/es6/component/ResponsiveContainer');

  return {
    default: module.ResponsiveContainer,
  };
};

const ResponsiveContainer = React.lazy(loadResponsiveContainer);

interface LazyResponsiveContainerProps
  extends Omit<RechartsResponsiveContainerProps, 'children' | 'height' | 'width'> {
  width?: Dimension;
  height?: Dimension;
  children: React.ReactNode;
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
            height: toCss(height),
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
