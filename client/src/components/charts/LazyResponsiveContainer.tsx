import React, { Suspense } from 'react';

// Lazy load ResponsiveContainer only when needed
const ResponsiveContainer = React.lazy(() => 
  import('recharts/es6/component/ResponsiveContainer').then(module => ({
    default: module.ResponsiveContainer
  }))
);

interface LazyResponsiveContainerProps {
  width?: string | number;
  height?: string | number;
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
  width = "100%",
  ...props 
}: LazyResponsiveContainerProps) {
  return (
    <Suspense 
      fallback={
        <div 
          style={{ 
            width: typeof width === 'number' ? `${width}px` : width, 
            height: typeof height === 'number' ? `${height}px` : height 
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