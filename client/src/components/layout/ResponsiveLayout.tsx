/**
 * ResponsiveLayout System
 *
 * Advanced breakpoint-specific layout optimization for executive dashboard.
 * Features:
 * - Content prioritization based on screen size
 * - Performance-first loading strategy
 * - Progressive enhancement patterns
 * - Accessibility compliance (WCAG 2.1)
 * - Touch-optimized spacing and targets
 */

import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Breakpoint definitions aligned with Tailwind CSS
export const BREAKPOINTS = {
  xs: 320,   // Small phones
  sm: 640,   // Large phones / small tablets
  md: 768,   // Tablets
  lg: 1024,  // Small desktops
  xl: 1280,  // Large desktops
  '2xl': 1536 // Very large screens
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;
export type ViewportSize = 'mobile' | 'tablet' | 'desktop';

// Content priority levels for responsive display
export type ContentPriority = 'critical' | 'important' | 'nice-to-have' | 'optional';

// Layout configuration for different screen sizes
export interface ResponsiveConfig {
  mobile: LayoutConfig;
  tablet: LayoutConfig;
  desktop: LayoutConfig;
}

export interface LayoutConfig {
  maxColumns: number;
  contentPriority: ContentPriority[];
  spacing: 'tight' | 'normal' | 'loose';
  cardSize: 'compact' | 'normal' | 'large';
  showSidebar: boolean;
  navigationStyle: 'tabs' | 'pills' | 'full';
}

// Default responsive configurations
const DEFAULT_CONFIG: ResponsiveConfig = {
  mobile: {
    maxColumns: 1,
    contentPriority: ['critical', 'important'],
    spacing: 'tight',
    cardSize: 'compact',
    showSidebar: false,
    navigationStyle: 'tabs'
  },
  tablet: {
    maxColumns: 2,
    contentPriority: ['critical', 'important', 'nice-to-have'],
    spacing: 'normal',
    cardSize: 'normal',
    showSidebar: false,
    navigationStyle: 'pills'
  },
  desktop: {
    maxColumns: 4,
    contentPriority: ['critical', 'important', 'nice-to-have', 'optional'],
    spacing: 'loose',
    cardSize: 'large',
    showSidebar: true,
    navigationStyle: 'full'
  }
};

// Hook to track viewport size and breakpoints
export function useResponsiveBreakpoint() {
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('lg');
  const [dimensions, setDimensions] = useState({ width: 1024, height: 768 });

  useEffect(() => {
    function updateBreakpoint() {
      const width = window.innerWidth;
      const height = window.innerHeight;

      setDimensions({ width, height });

      // Determine breakpoint
      if (width < BREAKPOINTS.sm) {
        setBreakpoint('xs');
        setViewport('mobile');
      } else if (width < BREAKPOINTS.md) {
        setBreakpoint('sm');
        setViewport('mobile');
      } else if (width < BREAKPOINTS.lg) {
        setBreakpoint('md');
        setViewport('tablet');
      } else if (width < BREAKPOINTS.xl) {
        setBreakpoint('lg');
        setViewport('desktop');
      } else if (width < BREAKPOINTS['2xl']) {
        setBreakpoint('xl');
        setViewport('desktop');
      } else {
        setBreakpoint('2xl');
        setViewport('desktop');
      }
    }

    // Initial check
    updateBreakpoint();

    // Listen for resize events with debouncing
    let timeoutId: NodeJS.Timeout;
    function handleResize() {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateBreakpoint, 150);
    }

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return {
    viewport,
    breakpoint,
    dimensions,
    isMobile: viewport === 'mobile',
    isTablet: viewport === 'tablet',
    isDesktop: viewport === 'desktop',
    isTouch: viewport === 'mobile' || viewport === 'tablet'
  };
}

// Content item with responsive configuration
export interface ResponsiveContentItem {
  id: string;
  priority: ContentPriority;
  component: ReactNode;
  mobileComponent?: ReactNode;
  tabletComponent?: ReactNode;
  desktopComponent?: ReactNode;
  span?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  className?: string;
  mobileClassName?: string;
  tabletClassName?: string;
  desktopClassName?: string;
}

// Responsive Grid Layout
interface ResponsiveGridProps {
  items: ResponsiveContentItem[];
  config?: Partial<ResponsiveConfig>;
  className?: string;
  gap?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  children?: ReactNode;
}

export function ResponsiveGrid({
  items,
  config,
  className,
  gap = 'md',
  children
}: ResponsiveGridProps) {
  const { viewport, isMobile, isTablet, isDesktop } = useResponsiveBreakpoint();
  const layoutConfig = { ...DEFAULT_CONFIG, ...config };
  const currentConfig = layoutConfig[viewport];

  // Filter items based on priority for current viewport
  const visibleItems = items.filter(item =>
    currentConfig.contentPriority.includes(item.priority)
  );

  // Spacing configuration
  const spacingClasses = {
    none: 'gap-0',
    sm: 'gap-2 md:gap-3',
    md: 'gap-3 md:gap-4 lg:gap-6',
    lg: 'gap-4 md:gap-6 lg:gap-8',
    xl: 'gap-6 md:gap-8 lg:gap-12'
  };

  // Grid column configuration
  const gridColsClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  };

  const gridClass = gridColsClasses[currentConfig.maxColumns as keyof typeof gridColsClasses] || 'grid-cols-1';

  return (
    <div
      className={cn(
        'grid w-full',
        gridClass,
        spacingClasses[gap],
        className
      )}
      style={{
        // Ensure proper touch targets on mobile
        minHeight: isMobile ? 'auto' : undefined
      }}
    >
      {visibleItems.map((item) => {
        // Select appropriate component for current viewport
        const Component = (() => {
          if (isMobile && item.mobileComponent) return item.mobileComponent;
          if (isTablet && item.tabletComponent) return item.tabletComponent;
          if (isDesktop && item.desktopComponent) return item.desktopComponent;
          return item.component;
        })();

        // Select appropriate className for current viewport
        const itemClassName = (() => {
          const base = item.className || '';
          if (isMobile && item.mobileClassName) return cn(base, item.mobileClassName);
          if (isTablet && item.tabletClassName) return cn(base, item.tabletClassName);
          if (isDesktop && item.desktopClassName) return cn(base, item.desktopClassName);
          return base;
        })();

        // Calculate grid span
        const span = item.span || {};
        const currentSpan = isMobile ? span.mobile : isTablet ? span.tablet : span.desktop;
        const spanClass = currentSpan ? `col-span-${currentSpan}` : '';

        return (
          <div
            key={item.id}
            className={cn(
              spanClass,
              itemClassName,
              // Ensure minimum touch targets on mobile
              isMobile && 'min-h-[44px]'
            )}
          >
            {Component}
          </div>
        );
      })}
      {children}
    </div>
  );
}

// Responsive Container with performance optimizations
interface ResponsiveContainerProps {
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  enableVirtualScrolling?: boolean;
  lazyLoadThreshold?: number;
}

export function ResponsiveContainer({
  children,
  maxWidth = 'xl',
  padding = 'md',
  className,
  enableVirtualScrolling = false,
  lazyLoadThreshold = 100
}: ResponsiveContainerProps) {
  const { isMobile, isTablet, dimensions } = useResponsiveBreakpoint();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Intersection Observer for performance optimization
  useEffect(() => {
    if (!enableVirtualScrolling || !containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry!.isIntersecting);
      },
      {
        threshold: 0.1,
        rootMargin: `${lazyLoadThreshold}px`
      }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [enableVirtualScrolling, lazyLoadThreshold]);

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full'
  };

  const paddingClasses = {
    none: 'p-0',
    sm: 'p-2 md:p-3',
    md: 'p-3 md:p-4 lg:p-6',
    lg: 'p-4 md:p-6 lg:p-8',
    xl: 'p-6 md:p-8 lg:p-12'
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'mx-auto w-full',
        maxWidthClasses[maxWidth],
        paddingClasses[padding],
        // Mobile-specific optimizations
        isMobile && 'overflow-x-hidden',
        // Performance optimizations
        enableVirtualScrolling && !isVisible && 'min-h-[200px]',
        className
      )}
      style={{
        // Optimize for mobile performance
        WebkitOverflowScrolling: 'touch',
        // Ensure content doesn't overflow on small screens
        maxWidth: isMobile ? `${dimensions.width}px` : undefined
      }}
    >
      {(!enableVirtualScrolling || isVisible) ? children : (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-pulse text-slate-400">Loading...</div>
        </div>
      )}
    </div>
  );
}

// Responsive Stack Layout for vertical content
interface ResponsiveStackProps {
  children: ReactNode;
  spacing?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  alignment?: 'start' | 'center' | 'end' | 'stretch';
  className?: string;
}

export function ResponsiveStack({
  children,
  spacing = 'md',
  alignment = 'stretch',
  className
}: ResponsiveStackProps) {
  const { isMobile } = useResponsiveBreakpoint();

  const spacingClasses = {
    none: 'space-y-0',
    xs: 'space-y-1 md:space-y-2',
    sm: 'space-y-2 md:space-y-3',
    md: 'space-y-3 md:space-y-4 lg:space-y-6',
    lg: 'space-y-4 md:space-y-6 lg:space-y-8',
    xl: 'space-y-6 md:space-y-8 lg:space-y-12'
  };

  const alignmentClasses = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch'
  };

  return (
    <div
      className={cn(
        'flex flex-col',
        spacingClasses[spacing],
        alignmentClasses[alignment],
        // Mobile-specific adjustments
        isMobile && 'w-full',
        className
      )}
    >
      {children}
    </div>
  );
}

// Responsive Flex Layout
interface ResponsiveFlexProps {
  children: ReactNode;
  direction?: 'row' | 'col' | 'row-mobile-col' | 'col-mobile-row';
  wrap?: boolean;
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  align?: 'start' | 'center' | 'end' | 'stretch';
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function ResponsiveFlex({
  children,
  direction = 'row',
  wrap = false,
  justify = 'start',
  align = 'stretch',
  gap = 'md',
  className
}: ResponsiveFlexProps) {
  const { isMobile } = useResponsiveBreakpoint();

  const directionClasses = {
    row: 'flex-row',
    col: 'flex-col',
    'row-mobile-col': isMobile ? 'flex-col' : 'flex-row',
    'col-mobile-row': isMobile ? 'flex-row' : 'flex-col'
  };

  const justifyClasses = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
    around: 'justify-around',
    evenly: 'justify-evenly'
  };

  const alignClasses = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch'
  };

  const gapClasses = {
    none: 'gap-0',
    xs: 'gap-1 md:gap-2',
    sm: 'gap-2 md:gap-3',
    md: 'gap-3 md:gap-4 lg:gap-6',
    lg: 'gap-4 md:gap-6 lg:gap-8',
    xl: 'gap-6 md:gap-8 lg:gap-12'
  };

  return (
    <div
      className={cn(
        'flex',
        directionClasses[direction],
        wrap && 'flex-wrap',
        justifyClasses[justify],
        alignClasses[align],
        gapClasses[gap],
        className
      )}
    >
      {children}
    </div>
  );
}

// Performance monitoring component
export function ResponsiveLayoutDebugger({ enabled = false }: { enabled?: boolean }) {
  const { viewport, breakpoint, dimensions } = useResponsiveBreakpoint();

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-2 rounded text-xs font-mono z-50">
      <div>Viewport: {viewport}</div>
      <div>Breakpoint: {breakpoint}</div>
      <div>Size: {dimensions.width}×{dimensions.height}</div>
    </div>
  );
}

export default {
  ResponsiveGrid,
  ResponsiveContainer,
  ResponsiveStack,
  ResponsiveFlex,
  ResponsiveLayoutDebugger,
  useResponsiveBreakpoint
};