import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer } from 'recharts/es6/component/ResponsiveContainer';
import type { Props as RechartsResponsiveContainerProps } from 'recharts/types/component/ResponsiveContainer';

type Dimension = number | `${number}%`;
type ContainerSize = {
  width: number;
  height: number;
};

interface LazyResponsiveContainerProps extends Omit<
  RechartsResponsiveContainerProps,
  'children' | 'height' | 'width'
> {
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
  // Historical name: this gates rendering on measured dimensions, not code loading.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<ContainerSize>({ width: 0, height: 0 });

  // Convert dimension to CSS-compatible string
  const toCss = (dim: Dimension): string => (typeof dim === 'number' ? `${dim}px` : dim);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    let animationFrame = 0;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const nextSize = {
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      };

      setContainerSize((currentSize) =>
        currentSize.width === nextSize.width && currentSize.height === nextSize.height
          ? currentSize
          : nextSize
      );
    };

    const scheduleMeasure = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', scheduleMeasure);
      return () => {
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
        }
        window.removeEventListener('resize', scheduleMeasure);
      };
    }

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(element);

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      observer.disconnect();
    };
  }, []);

  const fallback = (
    <div
      className="animate-pulse rounded bg-gray-100"
      style={{
        width: '100%',
        height: '100%',
      }}
    />
  );
  const hasRenderableSize = containerSize.width > 0 && containerSize.height > 0;

  return (
    <div
      ref={containerRef}
      className="min-w-0"
      style={{
        width: toCss(width),
        height: toCss(height),
      }}
    >
      {hasRenderableSize ? (
        <ResponsiveContainer
          {...props}
          width="100%"
          height="100%"
          minWidth={props.minWidth ?? 0}
          minHeight={props.minHeight ?? 0}
          initialDimension={containerSize}
        >
          {children}
        </ResponsiveContainer>
      ) : (
        fallback
      )}
    </div>
  );
}
